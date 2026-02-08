import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Printer, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { IDCard } from '../components/IDCard';
import { useToast } from '../components/Toast';
import {
  claimNextPrintJob,
  completePrintJob,
  enqueuePrintJob,
  failPrintJob,
  getEventById,
  getGuestById,
  markGuestIdPrinted,
  PrintJob,
} from '../services/db';
import { Event, Guest } from '../types';

export const PrintStation: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { addToast } = useToast();

  const [event, setEvent] = useState<Event | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const [stationId, setStationId] = useState<string>(() => {
    const existing = sessionStorage.getItem('print_station_id');
    if (existing) return existing;
    const id = `station_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('print_station_id', id);
    return id;
  });

  const [running, setRunning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastJob, setLastJob] = useState<PrintJob | null>(null);
  const [lastError, setLastError] = useState<string>('');

  const [printingGuest, setPrintingGuest] = useState<Guest | null>(null);

  const title = useMemo(() => {
    const short = stationId.replace(/^station_/, '');
    return `Print Station (${short})`;
  }, [stationId]);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      try {
        const e = await getEventById(eventId);
        if (!cancelled) setEvent(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const doClaimAndPrint = async () => {
    if (!eventId) return;
    if (busy) return;

    setBusy(true);
    setLastError('');

    try {
      const job = await claimNextPrintJob(eventId, stationId);
      if (!job) return;

      setLastJob(job);

      const guest = await getGuestById(job.guestId);
      if (!guest) {
        await failPrintJob(eventId, job.id, stationId, 'Guest not found');
        setLastError('Guest not found for print job');
        return;
      }

      if (guest.eventId !== eventId) {
        await failPrintJob(eventId, job.id, stationId, 'Guest belongs to different event');
        setLastError('Guest belongs to different event');
        return;
      }

      // Render printable card
      setPrintingGuest(guest);

      // Allow DOM to paint before invoking print
      await new Promise((r) => setTimeout(r, 200));

      // Mark as printed (best effort) before calling print
      try {
        await markGuestIdPrinted(guest.id);
      } catch (_) {
        // ignore
      }

      // Trigger print dialog (operator should have this station set to correct printer)
      window.print();

      // Mark job done
      await completePrintJob(eventId, job.id, stationId);
      setPrintingGuest(null);
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : String(e);
      setLastError(msg);
      addToast(`Print station error: ${msg}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Main loop
  useEffect(() => {
    if (!running) return;
    if (!eventId) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (!busy) {
        await doClaimAndPrint();
      }
    };

    // quick tick on start
    tick();

    const interval = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [running, eventId, stationId, busy]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  if (!eventId || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center">
        <div>
          <div className="text-xl font-bold text-slate-900">Event Not Found</div>
          <div className="text-slate-500 mt-2">Check the print station link and try again.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Print-only badge area */}
      {printingGuest && <IDCard guest={printingGuest} event={event} />}

      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-sm text-slate-500">Print Station</div>
              <div className="text-2xl font-black text-slate-900">{event.name}</div>
              <div className="text-xs text-slate-500 mt-1">Station ID: <span className="font-mono">{stationId}</span></div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setRunning(v => !v)}
                className={`px-4 py-2 rounded-lg font-bold inline-flex items-center gap-2 ${running ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
              >
                <Printer size={16} /> {running ? 'Auto Print: ON' : 'Auto Print: OFF'}
              </button>

              <button
                onClick={doClaimAndPrint}
                disabled={busy}
                className="px-4 py-2 rounded-lg font-bold inline-flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {busy ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                Claim Next
              </button>

              <button
                onClick={async () => {
                  // quick helper for debugging: enqueue a job for last printed guest if any
                  if (!lastJob) {
                    addToast('No previous job to requeue', 'info');
                    return;
                  }
                  await enqueuePrintJob(eventId, lastJob.guestId, 'manual-requeue', stationId);
                  addToast('Requeued job', 'success');
                }}
                className="px-4 py-2 rounded-lg font-bold inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Requeue Last
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="text-sm font-bold text-slate-900 mb-2">Status</div>
              <div className="text-sm text-slate-700">
                <div>Auto: <span className="font-semibold">{running ? 'ON' : 'OFF'}</span></div>
                <div>Busy: <span className="font-semibold">{busy ? 'YES' : 'NO'}</span></div>
              </div>

              {lastError ? (
                <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5" /> {lastError}
                </div>
              ) : null}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="text-sm font-bold text-slate-900 mb-2">Last Job</div>
              {lastJob ? (
                <div className="text-sm text-slate-700 space-y-1">
                  <div className="flex items-center gap-2"><CheckCircle size={16} className="text-green-600" /> Job <span className="font-mono">{lastJob.id}</span></div>
                  <div>Guest: <span className="font-mono">{lastJob.guestId}</span></div>
                  <div>Source: <span className="font-semibold">{(lastJob as any).source || '-'}</span></div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">No jobs claimed yet.</div>
              )}
            </div>
          </div>

          <div className="mt-6 text-xs text-slate-500">
            Keep this page open on each printer PC/tablet. Set the browser to the correct printer. When a job is claimed, it will open the print dialog.
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Calendar, Check, ExternalLink, Loader2, MapPin, Search, UserCheck } from 'lucide-react';
import { useToast } from '../components/Toast';
import { enqueuePrintJob, getEventById, getGuestByPhoneForEvent, updateGuest } from '../services/db';
import { Event, Guest } from '../types';

export const GuestEntry: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { addToast } = useToast();

  const [event, setEvent] = useState<Event | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);

  const [foundGuest, setFoundGuest] = useState<Guest | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const registrationLink = useMemo(() => {
    if (!eventId) return '';
    const baseUrl = window.location.href.split('#')[0];
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${cleanBaseUrl}/#/register/${eventId}`;
  }, [eventId]);

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

  const handleLookup = async () => {
    if (!eventId) return;
    const raw = String(phone || '').trim();
    if (!raw) {
      addToast('Please enter your phone number.', 'warning');
      return;
    }

    setSearching(true);
    setFoundGuest(null);
    setNotFound(false);

    try {
      const g = await getGuestByPhoneForEvent(eventId, raw);
      if (g) {
        setFoundGuest(g);
        setNotFound(false);
      } else {
        setFoundGuest(null);
        setNotFound(true);
      }
    } catch (e) {
      setFoundGuest(null);
      setNotFound(false);
      addToast('Search failed. Please try again.', 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleConfirm = async () => {
    if (!eventId || !foundGuest) return;

    if (foundGuest.checkedIn) {
      addToast('You are already checked in.', 'info');
      return;
    }

    setConfirming(true);
    try {
      const checked = await updateGuest(foundGuest.id, {
        checkedIn: true,
        checkedInAt: new Date().toISOString(),
        verifiedBy: 'Self Check-in',
      } as any);

      try {
        await enqueuePrintJob(eventId, checked.id, 'self-checkin', 'Self Check-in');
      } catch (_) {
      }

      setFoundGuest(checked);
      addToast('Entry successful! Please collect your badge.', 'success');
    } catch (e) {
      addToast('Could not confirm entry. Please ask staff for help.', 'error');
    } finally {
      setConfirming(false);
    }
  };

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
          <div className="text-slate-500 mt-2">Please check the link and try again.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
        <div className="bg-indigo-600 p-8 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold mb-2">Self Check-in</h1>
              <p className="text-indigo-100 text-sm">{event.name}</p>
              <div className="flex flex-col gap-2 text-indigo-100 text-sm mt-4">
                <p className="flex items-center gap-2"><Calendar size={16} /> {event.date}</p>
                <p className="flex items-center gap-2"><MapPin size={16} /> {event.location}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-4">
          {!foundGuest ? (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Enter your phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleLookup();
                    }
                  }}
                />
                <div className="text-xs text-slate-500 mt-2">Use the same phone number you used during registration.</div>
              </div>

              <button
                onClick={handleLookup}
                disabled={searching}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {searching ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                Find My Details
              </button>

              {notFound ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800">
                  <div className="font-bold">Not registered yet</div>
                  <div className="text-sm mt-1">Please complete registration first. After registration, show your QR code to staff for scanning.</div>
                  <button
                    onClick={() => window.open(registrationLink, '_blank')}
                    className="mt-3 inline-flex items-center gap-2 px-3 py-2 bg-white border border-amber-300 text-amber-900 rounded-lg hover:bg-amber-50"
                  >
                    <ExternalLink size={16} /> Open Registration
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Name</span><span className="font-semibold text-slate-900">{foundGuest.name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="font-semibold text-slate-900">{foundGuest.phone || '-'}</span></div>
                {foundGuest.ticketCode ? (
                  <div className="flex justify-between"><span className="text-slate-500">Ticket</span><span className="font-semibold text-slate-900">{foundGuest.ticketCode}</span></div>
                ) : null}
                <div className="flex justify-between"><span className="text-slate-500">Status</span><span className={`font-semibold ${foundGuest.checkedIn ? 'text-green-700' : 'text-slate-900'}`}>{foundGuest.checkedIn ? 'Checked In' : 'Not Checked In'}</span></div>
              </div>

              {!foundGuest.checkedIn ? (
                <button
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  {confirming ? <Loader2 className="animate-spin" size={18} /> : <UserCheck size={18} />}
                  Confirm Entry
                </button>
              ) : (
                <div className="w-full bg-green-50 border border-green-200 rounded-xl p-4 text-green-800 inline-flex items-center gap-2">
                  <Check size={18} /> Entry Confirmed. Your badge is being printed.
                </div>
              )}

              <button
                onClick={() => {
                  setFoundGuest(null);
                  setNotFound(false);
                  setPhone('');
                }}
                className="w-full bg-white border border-slate-300 text-slate-700 font-bold py-3 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Next Guest
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

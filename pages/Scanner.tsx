
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRScanner } from '../components/QRScanner';
import { getEventById, getEventByVolunteerPassword, getGuestByQRCode, checkInGuest, getEventStats, getEventGuests, markGuestIdPrinted, updateVolunteerHeartbeat, updateGuest } from '../services/db';
import { Guest, Event } from '../types';
import { Check, Printer, X, ChevronLeft, User, BarChart, Scan, Search, UserCheck } from 'lucide-react';
import { IDCard } from '../components/IDCard';

export const Scanner: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | undefined>(undefined);
  const [lastScanned, setLastScanned] = useState<string>('');
  const [scannedGuest, setScannedGuest] = useState<Guest | null>(null);
  const [scanStatus, setScanStatus] = useState<'idle' | 'success' | 'error' | 'already_checked'>('idle');
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState({ total: 0, checkedIn: 0 });
  const [attendeesCheckedIn, setAttendeesCheckedIn] = useState(0);

  const [extraAdults, setExtraAdults] = useState<number>(0);
  const [extraChildren, setExtraChildren] = useState<number>(0);
  const [savingAttendance, setSavingAttendance] = useState(false);
  
  // Manual Check-in State
  const [showManual, setShowManual] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Guest[]>([]);
  const [manualGuestsCache, setManualGuestsCache] = useState<Guest[]>([]);
  const [manualGuestsLoaded, setManualGuestsLoaded] = useState(false);
  
  const volunteerName = sessionStorage.getItem('volunteer_name') || 'Unknown Volunteer';
  const volunteerSession = sessionStorage.getItem('volunteer_session') || '';
  const volunteerAccessCode = sessionStorage.getItem('volunteer_access_code') || '';

  useEffect(() => {
    const a = typeof scannedGuest?.extraAdults === 'number' ? scannedGuest!.extraAdults! : 0;
    const c = typeof scannedGuest?.extraChildren === 'number' ? scannedGuest!.extraChildren! : 0;
    setExtraAdults(a);
    setExtraChildren(c);
  }, [scannedGuest?.id]);

  useEffect(() => {
    if (eventId) {
        const init = async () => {
            const e = await getEventById(eventId);
            if (!e) {
              setEvent(undefined);
              return;
            }

            // Re-check access code so changing the code immediately invalidates old sessions
            const code = String(volunteerAccessCode || '').trim().toUpperCase();
            if (!code) {
              sessionStorage.removeItem('volunteer_name');
              sessionStorage.removeItem('volunteer_session');
              sessionStorage.removeItem('volunteer_access_code');
              navigate('/volunteer-login');
              return;
            }

            const evtByCode = await getEventByVolunteerPassword(code);
            if (!evtByCode || evtByCode.id !== eventId) {
              sessionStorage.removeItem('volunteer_name');
              sessionStorage.removeItem('volunteer_session');
              sessionStorage.removeItem('volunteer_access_code');
              navigate('/volunteer-login');
              return;
            }

            setEvent(e);
            await updateStats();
        };
        init();
    }
  }, [eventId]);

  // Heartbeat Effect
  useEffect(() => {
    if (eventId && volunteerName) {
        // Initial heartbeat
        updateVolunteerHeartbeat(eventId, volunteerName, volunteerSession);
        
        const interval = setInterval(() => {
            updateVolunteerHeartbeat(eventId, volunteerName, volunteerSession);
        }, 30000); // 30s
        return () => clearInterval(interval);
    }
  }, [eventId, volunteerName, volunteerSession]);

  useEffect(() => {
    if (!showManual || !eventId) return;
    if (manualGuestsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await getEventGuests(eventId);
        if (!cancelled) {
          setManualGuestsCache(all);
          setManualGuestsLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setManualGuestsCache([]);
          setManualGuestsLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showManual, eventId, manualGuestsLoaded]);

  const updateStats = async () => {
      if (eventId) {
        const s = await getEventStats(eventId);
        setStats({ total: s.total, checkedIn: s.checkedIn });
        setAttendeesCheckedIn((s as any).attendeesCheckedIn ?? s.checkedIn);
      }
  };

  const ensureAttendanceDefaults = async (guest: Guest) => {
    const hasAdults = typeof guest.extraAdults === 'number';
    const hasChildren = typeof guest.extraChildren === 'number';
    const hasTotal = typeof guest.totalAttendees === 'number';
    if (hasAdults && hasChildren && hasTotal) return;

    const adults = hasAdults ? Math.max(0, Math.trunc(guest.extraAdults as number)) : 0;
    const children = hasChildren ? Math.max(0, Math.trunc(guest.extraChildren as number)) : 0;
    const totalAttendees = hasTotal ? (guest.totalAttendees as number) : (1 + adults + children);
    try {
      await updateGuest(guest.id, {
        extraAdults: adults,
        extraChildren: children,
        totalAttendees,
      });
    } catch (e) {
      // best-effort; avoid blocking scanning
    }
  };

  const playSound = (type: 'success' | 'error') => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        if (type === 'success') {
          osc.frequency.setValueAtTime(880, ctx.currentTime); // High pitch A5
          osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); // Zip up
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
          osc.start();
          osc.stop(ctx.currentTime + 0.1);
        } else {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(150, ctx.currentTime); // Low pitch
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        }
    } catch (e) {
        console.error("Audio playback failed", e);
    }
  };

  const processCheckIn = async (guest: Guest) => {
    if (guest.checkedIn) {
        setScanStatus('already_checked');
        setMessage(`Already checked in at ${new Date(guest.checkedInAt!).toLocaleTimeString()}`);
        setScannedGuest(guest);
        await ensureAttendanceDefaults(guest);
        playSound('error');
    } else {
        try {
            const checked = await checkInGuest(guest.id, volunteerName);
            setScanStatus('success');
            setMessage('Check-in Successful!');
            setScannedGuest(checked);
            await ensureAttendanceDefaults(checked);
            await updateStats();
            playSound('success');
        } catch (e) {
            setScanStatus('error');
            setMessage('System error during check-in.');
            setScannedGuest(null);
            playSound('error');
        }
    }
  };

  const handleScan = async (decodedText: string) => {
    // Prevent immediate re-scan of the exact same code to avoid audio spam
    if (decodedText === lastScanned) return; 
    setLastScanned(decodedText);
    
    const guest = await getGuestByQRCode(decodedText, eventId);

    if (!guest) {
        setScanStatus('error');
        setMessage('Invalid QR Code. Guest not found.');
        setScannedGuest(null);
        playSound('error');
        return;
    }

    if (guest.eventId !== eventId) {
        setScanStatus('error');
        setMessage('Guest belongs to a different event.');
        setScannedGuest(null);
        playSound('error');
        return;
    }

    setShowManual(false); // Close manual mode if open
    processCheckIn(guest);
  };

  const handleManualSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.length > 2) {
      const q = query.toLowerCase();
      const results = manualGuestsCache.filter(g =>
        g.name.toLowerCase().includes(q) ||
        g.email.toLowerCase().includes(q)
      );
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const handlePrint = async (g?: Guest | null) => {
    const target = g ?? scannedGuest;
    if (target) {
      await markGuestIdPrinted(target.id);
      setScannedGuest(prev => prev ? ({ ...prev, idCardPrinted: true }) : ({ ...target, idCardPrinted: true } as Guest));
      window.print();
    }
  };

  const resetScan = () => {
    setLastScanned('');
    setScannedGuest(null);
    setScanStatus('idle');
    setMessage('');
    setExtraAdults(0);
    setExtraChildren(0);
    setSavingAttendance(false);
  };

  const saveAttendance = async () => {
    if (!scannedGuest) return;
    const adults = Number.isFinite(extraAdults) ? Math.max(0, Math.trunc(extraAdults)) : 0;
    const children = Number.isFinite(extraChildren) ? Math.max(0, Math.trunc(extraChildren)) : 0;
    const totalAttendees = 1 + adults + children;

    setSavingAttendance(true);
    try {
      await updateGuest(scannedGuest.id, {
        extraAdults: adults,
        extraChildren: children,
        totalAttendees,
      });
      setScannedGuest(prev => prev ? ({ ...prev, extraAdults: adults, extraChildren: children, totalAttendees }) : prev);
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleExit = () => {
    sessionStorage.removeItem('volunteer_name');
    navigate('/volunteer-login');
  };

  if (!event) return <div className="p-8 text-center text-white bg-slate-900 min-h-screen">Loading Event...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Printable area removed on scanner; printing handled by admin page */}

      {/* Header */}
      <div className="bg-slate-800 p-4 shadow-lg flex items-center justify-between z-10 sticky top-0">
        <button onClick={handleExit} className="text-slate-400 hover:text-white flex items-center gap-1">
            <ChevronLeft size={20} /> Exit
        </button>
        <div className="text-center">
            <h1 className="font-bold text-lg">{event.name}</h1>
            <p className="text-xs text-slate-400 flex items-center justify-center gap-1">
                <User size={10} /> {volunteerName}
            </p>
        </div>
        <div className="text-right text-xs text-slate-400">
            <div className="flex items-center gap-1 justify-end">
                <BarChart size={12} /> Progress
            </div>
            <span className="text-white font-bold text-sm">{stats.checkedIn}</span> / {stats.total}
            <div className="text-[10px] text-slate-500">Attendees: <span className="text-slate-200 font-semibold">{attendeesCheckedIn}</span></div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start p-4 pt-8 overflow-y-auto">
        
        {/* Manual Search Modal Overlay */}
        {showManual && !scannedGuest && (
             <div className="fixed inset-0 bg-slate-900/95 z-50 flex flex-col p-4 animate-in fade-in duration-200">
                 <div className="flex justify-between items-center mb-6">
                     <h2 className="text-xl font-bold">Manual Check-in</h2>
                     <button onClick={() => setShowManual(false)} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700">
                         <X size={24} />
                     </button>
                 </div>
                 
                 <div className="relative mb-6">
                     <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                     <input 
                        autoFocus
                        type="text" 
                        placeholder="Search name or email..." 
                        className="w-full pl-12 pr-4 py-4 bg-slate-800 rounded-xl border border-slate-700 text-lg text-white outline-none focus:border-indigo-500 placeholder:text-slate-500 caret-white"
                        style={{ color: 'white' }}
                        value={searchQuery}
                        onChange={handleManualSearch}
                     />
                 </div>

                 <div className="flex-1 overflow-y-auto space-y-3">
                     {searchResults.map(guest => (
                         <button 
                            key={guest.id}
                            onClick={() => {
                                setShowManual(false);
                                processCheckIn(guest);
                            }}
                            className="w-full bg-slate-800 p-4 rounded-xl flex items-center justify-between border border-slate-700 hover:border-indigo-500 transition-colors text-left group"
                         >
                             <div>
                                 <p className="font-bold text-lg text-white group-hover:text-indigo-400">{guest.name}</p>
                                 <p className="text-slate-400 text-sm">{guest.email}</p>
                             </div>
                             <div className="flex items-center gap-2">
                                 {guest.checkedIn ? (
                                     <span className="bg-yellow-900/50 text-yellow-500 px-3 py-1 rounded-full text-xs font-bold">Checked In</span>
                                 ) : (
                                     <span className="bg-green-900/50 text-green-500 px-3 py-1 rounded-full text-xs font-bold">Check In</span>
                                 )}
                             </div>
                         </button>
                     ))}
                     {searchQuery.length > 2 && searchResults.length === 0 && (
                         <div className="text-center text-slate-500 mt-8">
                             No guests found.
                         </div>
                     )}
                 </div>
             </div>
        )}

        {/* Main Content: Scanner or Success Message */}
        {scannedGuest ? (
            <div className="w-full max-w-md bg-slate-800 rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in duration-300 border border-slate-700">
                <div className={`p-6 text-center ${scanStatus === 'success' ? 'bg-green-600' : 'bg-yellow-600'}`}>
                     <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                        {scanStatus === 'success' ? <Check size={40} className="text-green-600" /> : <UserCheck size={40} className="text-yellow-600" />}
                     </div>
                     <h2 className="text-2xl font-bold text-white mb-1">{message}</h2>
                     <p className="text-white/80 text-sm">
                        {new Date().toLocaleTimeString()}
                     </p>
                </div>
                
                <div className="p-6 text-center">
                    <h3 className="text-2xl font-bold mb-1">{scannedGuest.name}</h3>
                    <div className="text-slate-400 mb-6 space-y-1">
                        <div>{scannedGuest.email}</div>
                        {scannedGuest.phone ? <div>{scannedGuest.phone}</div> : null}
                        {scannedGuest.ticketCode ? <div className="text-slate-500 text-sm">Ticket: {scannedGuest.ticketCode}</div> : null}
                    </div>
                    
                    {scannedGuest.customData && Object.keys(scannedGuest.customData).length > 0 && (
                      <div className="bg-slate-700/50 rounded-xl p-4 mb-6 text-left">
                        {Object.entries(scannedGuest.customData).map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between py-1">
                            <span className="text-indigo-300 font-bold uppercase tracking-wider text-[10px]">{k}</span>
                            <span className="text-sm text-white">{String(v || '')}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-4 mb-6 text-left">
                      <div className="text-xs text-slate-400 mb-3">Additional attendees with this guest</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Extra Adults</label>
                          <input
                            type="number"
                            min={0}
                            value={extraAdults}
                            onChange={(e) => setExtraAdults(Number(e.target.value || 0))}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Extra Children</label>
                          <input
                            type="number"
                            min={0}
                            value={extraChildren}
                            onChange={(e) => setExtraChildren(Number(e.target.value || 0))}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-slate-400">
                        Total attendees (including this guest): <span className="text-white font-bold">{1 + (Number(extraAdults) || 0) + (Number(extraChildren) || 0)}</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3">
                        <button
                            onClick={saveAttendance}
                            disabled={savingAttendance}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-70 disabled:cursor-wait text-white py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                        >
                            {savingAttendance ? 'Saving...' : 'Save Attendance'}
                        </button>
                        <button 
                            onClick={resetScan}
                            className="bg-slate-700 hover:bg-slate-600 text-white py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                        >
                            <Scan size={20} /> Next Guest
                        </button>
                    </div>
                </div>
            </div>
        ) : (
            <>
                {/* Scanner Component */}
                <div className="w-full max-w-md mb-6 relative">
                     <QRScanner 
                        onScan={handleScan} 
                        isPaused={!!scannedGuest}
                     />
                </div>

                <div className="w-full max-w-md">
                    <button 
                        onClick={() => setShowManual(true)}
                        className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white p-4 rounded-xl flex items-center justify-center gap-3 transition-all"
                    >
                        <Search size={20} className="text-indigo-400" />
                        <span className="font-medium">Search Guest Manually</span>
                    </button>
                </div>
                
                {message && scanStatus === 'error' && (
                    <div className="mt-4 p-4 bg-red-500/10 border border-red-500/50 text-red-200 rounded-xl max-w-md w-full text-center animate-in slide-in-from-bottom-5">
                        {message}
                    </div>
                )}
            </>
        )}
      </div>
    </div>
  );
};


import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRScanner } from '../components/QRScanner';
import { getEventById, getGuestByQRCode, checkInGuest, getEventStats, getEventGuests, markGuestIdPrinted, updateVolunteerHeartbeat } from '../services/db';
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
  
  // Manual Check-in State
  const [showManual, setShowManual] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Guest[]>([]);
  
  const volunteerName = sessionStorage.getItem('volunteer_name') || 'Unknown Volunteer';

  useEffect(() => {
    if (eventId) {
        const init = async () => {
            const e = await getEventById(eventId);
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
        updateVolunteerHeartbeat(eventId, volunteerName);
        
        const interval = setInterval(() => {
            updateVolunteerHeartbeat(eventId, volunteerName);
        }, 30000); // 30s
        return () => clearInterval(interval);
    }
  }, [eventId, volunteerName]);

  const updateStats = async () => {
      if (eventId) {
        const s = await getEventStats(eventId);
        setStats({ total: s.total, checkedIn: s.checkedIn });
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
        playSound('error');
    } else {
        try {
            await checkInGuest(guest.id, volunteerName);
            setScanStatus('success');
            setMessage('Check-in Successful!');
            setScannedGuest({...guest, checkedIn: true, checkedInAt: new Date().toISOString()});
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
    
    const guest = await getGuestByQRCode(decodedText);

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

  const handleManualSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value;
      setSearchQuery(query);
      if (query.length > 2 && eventId) {
          const allGuests = await getEventGuests(eventId);
          const results = allGuests.filter(g => 
              g.name.toLowerCase().includes(query.toLowerCase()) || 
              g.email.toLowerCase().includes(query.toLowerCase())
          );
          setSearchResults(results);
      } else {
          setSearchResults([]);
      }
  };

  const handlePrint = async () => {
    if (scannedGuest) {
      await markGuestIdPrinted(scannedGuest.id);
      setScannedGuest(prev => prev ? ({ ...prev, idCardPrinted: true }) : null);
      window.print();
    }
  };

  const resetScan = () => {
    setLastScanned('');
    setScannedGuest(null);
    setScanStatus('idle');
    setMessage('');
  };

  const handleExit = () => {
    sessionStorage.removeItem('volunteer_name');
    navigate('/volunteer-login');
  };

  if (!event) return <div className="p-8 text-center text-white bg-slate-900 min-h-screen">Loading Event...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Printable Area - Hidden normally, visible on print */}
      {scannedGuest && <IDCard guest={scannedGuest} event={event} />}

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
                    <p className="text-slate-400 mb-6">{scannedGuest.email}</p>
                    
                    {scannedGuest.customData && Object.values(scannedGuest.customData)[0] && (
                        <div className="bg-slate-700/50 rounded-lg p-3 mb-6 inline-block px-6">
                            <span className="text-indigo-400 font-bold uppercase tracking-wider text-xs block mb-1">
                                {Object.keys(scannedGuest.customData)[0]}
                            </span>
                            <span className="text-lg font-medium">{Object.values(scannedGuest.customData)[0]}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={handlePrint}
                            className={`py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${scannedGuest.idCardPrinted ? 'bg-slate-700 text-slate-300' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                        >
                            <Printer size={20} /> {scannedGuest.idCardPrinted ? 'Reprint Badge' : 'Print Badge'}
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

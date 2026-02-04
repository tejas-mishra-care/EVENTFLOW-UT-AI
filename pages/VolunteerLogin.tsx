
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEventByVolunteerPassword } from '../services/db';
import { Scan, ArrowRight, User, Loader2 } from 'lucide-react';
import { useToast } from '../components/Toast';

export const VolunteerLogin: React.FC = () => {
  const [accessCode, setAccessCode] = useState('');
  const [volunteerName, setVolunteerName] = useState('');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { addToast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
        const code = String(accessCode || '').trim().toUpperCase();
        const event = await getEventByVolunteerPassword(code);

        if (event) {
            // Store volunteer info in session storage
            sessionStorage.setItem('volunteer_name', String(volunteerName || '').trim());
            sessionStorage.setItem('volunteer_session', `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
            sessionStorage.setItem('volunteer_access_code', code);
            navigate(`/volunteer/${event.id}/scan`);
        } else {
            setError('Invalid access code. Please check with event organizer.');
        }
    } catch (e) {
        setError('Connection error. Please try again.');
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-800 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl p-8 w-full max-w-md shadow-2xl border border-slate-700 text-white">
        <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white mb-4 shadow-[0_0_20px_rgba(34,197,94,0.3)]">
                <Scan size={32} />
            </div>
            <h1 className="text-2xl font-bold">Volunteer Portal</h1>
            <p className="text-slate-400">Join event team & start scanning</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
            <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Your Name</label>
                <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                        type="text" 
                        className="w-full pl-10 pr-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none caret-white"
                        placeholder="e.g. Sarah Jones"
                        value={volunteerName}
                        onChange={(e) => setVolunteerName(e.target.value)}
                        required
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Event Access Code</label>
                <input 
                    type="text" 
                    className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none font-mono text-center tracking-[0.2em] uppercase caret-white"
                    placeholder="CODE123"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                    required
                />
            </div>
            
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
                {loading ? <Loader2 className="animate-spin" /> : <>Start Scanning <ArrowRight size={18} /></>}
            </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-700 text-center">
             <a href="#/" className="text-slate-400 hover:text-white text-sm">
                Back to Owner Login
             </a>
        </div>
      </div>
    </div>
  );
};

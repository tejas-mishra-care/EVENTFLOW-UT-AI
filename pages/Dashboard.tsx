
import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Link } from 'react-router-dom';
import { getEvents, getCurrentUser, getEventStats, loadDemoData } from '../services/db';
import { Event } from '../types';
import { Calendar, Users, ArrowRight, Plus, Scan, Database, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '../components/Toast';

export const Dashboard: React.FC = () => {
  const [events, setEvents] = useState<(Event & { stats: { total: number; checkedIn: number } })[]>([]);
  const [loading, setLoading] = useState(true);
  const user = getCurrentUser();
  const { addToast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        try {
            const myEvents = await getEvents(); // Async fetch
            
            // Map events to include their stats (also async now)
            const eventsWithStats = await Promise.all(myEvents.map(async (e) => {
                const stats = await getEventStats(e.id);
                return { ...e, stats };
            }));
            
            setEvents(eventsWithStats);
        } catch (e) {
            console.error(e);
            addToast("Failed to load events", "error");
        } finally {
            setLoading(false);
        }
      }
    };
    fetchData();
  }, [user?.id]);

  const calculatePercentage = (checkedIn: number, total: number) => {
      if (total === 0) return 0;
      return Math.round((checkedIn / total) * 100);
  };

  const handleLoadDemo = async () => {
    if (window.confirm("This will create a new Demo Event in your database. Continue?")) {
        setLoading(true);
        await loadDemoData();
    }
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
            <h2 className="text-3xl font-bold text-slate-900">Dashboard</h2>
            <p className="text-slate-500">Welcome back, {user?.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg text-xs font-medium border border-green-200">
                <Database size={14} /> <span>Connected to Firebase</span>
            </div>
            
            <button onClick={handleLoadDemo} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium text-sm">
                <Database size={16} /> Create Demo Event
            </button>
            <Link to="/volunteer-login" className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium">
                <Scan size={18} /> Join as Volunteer
            </Link>
            <Link to="/create-event" className="bg-primary hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium">
                <Plus size={18} /> New Event
            </Link>
        </div>
      </div>

      {/* Mobile DB Status */}
      <div className="md:hidden mb-6 flex items-center gap-2 px-4 py-3 bg-green-50 text-green-800 rounded-lg text-sm border border-green-200">
           <Database size={16} />
           <span>Firebase Online</span>
      </div>

      {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary" size={40} /></div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.length === 0 ? (
                <div className="col-span-full bg-white p-12 rounded-xl border-2 border-dashed border-slate-200 text-center">
                    <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Calendar size={32} />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 mb-2">No events yet</h3>
                    <p className="text-slate-500 mb-6">Create your first event to get started with guest management and check-ins.</p>
                    <div className="flex gap-4 justify-center">
                        <Link to="/create-event" className="text-primary font-medium hover:underline">Create Event &rarr;</Link>
                    </div>
                </div>
            ) : (
                events.map(event => {
                    const percent = calculatePercentage(event.stats.checkedIn, event.stats.total);
                    return (
                        <Link key={event.id} to={`/event/${event.id}`} className="group bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-300 transition-all flex flex-col h-full">
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center font-bold text-lg">
                                    {event.name.charAt(0)}
                                </div>
                                <span className={`px-2 py-1 text-xs rounded-full font-bold uppercase tracking-wider ${event.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {event.status}
                                </span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-primary transition-colors line-clamp-1">{event.name}</h3>
                            <p className="text-sm text-slate-500 mb-6 flex items-center gap-1">
                                <Calendar size={14} /> {event.date}
                            </p>
                            
                            <div className="mt-auto space-y-3">
                                {/* Progress Bar */}
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-slate-500 font-medium">Check-in Progress</span>
                                        <span className="text-slate-900 font-bold">{percent}%</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                        <div 
                                            className="bg-indigo-600 h-2 rounded-full transition-all duration-500" 
                                            style={{ width: `${percent}%` }}
                                        ></div>
                                    </div>
                                </div>
                                
                                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                    <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                                        <Users size={16} /> 
                                        <span>{event.stats.total} Guests</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-primary font-bold group-hover:translate-x-1 transition-transform">
                                        Manage <ArrowRight size={14} />
                                    </div>
                                </div>
                            </div>
                        </Link>
                    );
                })
            )}
          </div>
      )}
    </Layout>
  );
};

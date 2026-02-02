import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Calendar, Check, Loader2, MapPin } from 'lucide-react';
import { useToast } from '../components/Toast';
import { getEventById, addGuest, updateGuest } from '../services/db';
import { Event, Guest } from '../types';

export const SpotEntry: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { addToast } = useToast();

  const [event, setEvent] = useState<Event | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [checkedInGuest, setCheckedInGuest] = useState<Guest | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    extraAdults: 0,
    extraChildren: 0,
  });

  const totalAttendees = useMemo(() => {
    const a = Number.isFinite(Number(formData.extraAdults)) ? Number(formData.extraAdults) : 0;
    const c = Number.isFinite(Number(formData.extraChildren)) ? Number(formData.extraChildren) : 0;
    return Math.max(1, 1 + Math.max(0, a) + Math.max(0, c));
  }, [formData.extraAdults, formData.extraChildren]);

  useEffect(() => {
    if (!eventId) return;

    const fetchEvent = async () => {
      try {
        const evt = await getEventById(eventId);
        setEvent(evt);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [eventId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId || !event) return;

    setSubmitting(true);
    try {
      const newGuest = await addGuest({
        eventId,
        name: formData.name,
        email: '',
        phone: formData.phone,
        customData: {},
      });

      const checked = await updateGuest(newGuest.id, {
        checkedIn: true,
        checkedInAt: new Date().toISOString(),
        verifiedBy: 'Spot Entry',
        extraAdults: Math.max(0, Number(formData.extraAdults) || 0),
        extraChildren: Math.max(0, Number(formData.extraChildren) || 0),
        totalAttendees,
      } as any);

      setCheckedInGuest(checked);
      addToast('Entry successful!', 'success');
    } catch (e) {
      console.error(e);
      addToast('Spot entry failed. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Event Not Found</h1>
          <p className="text-slate-500">Please check the URL and try again.</p>
        </div>
      </div>
    );
  }

  if (checkedInGuest) {
    return (
      <div className="min-h-screen bg-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl text-center space-y-6 animate-in zoom-in duration-300">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
            <Check size={32} />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Entry Confirmed</h1>
            <p className="text-slate-500">Welcome to {event.name}</p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Name</span><span className="font-semibold text-slate-900">{checkedInGuest.name}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="font-semibold text-slate-900">{checkedInGuest.phone || '-'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Attendees</span><span className="font-semibold text-slate-900">{(checkedInGuest as any).totalAttendees ?? 1}</span></div>
          </div>

          <button
            onClick={() => {
              setCheckedInGuest(null);
              setFormData({ name: '', phone: '', extraAdults: 0, extraChildren: 0 });
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors"
          >
            Next Guest
          </button>
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
              <h1 className="text-2xl font-bold mb-2">Spot Entry</h1>
              <p className="text-indigo-100 text-sm">{event.name}</p>
              <div className="flex flex-col gap-2 text-indigo-100 text-sm mt-4">
                <p className="flex items-center gap-2"><Calendar size={16} /> {event.date}</p>
                <p className="flex items-center gap-2"><MapPin size={16} /> {event.location}</p>
              </div>
            </div>
            {event.logoUrl && (
              <img src={event.logoUrl} alt="Logo" className="h-12 w-12 object-contain bg-white rounded-lg p-1" />
            )}
          </div>
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input
                required
                type="text"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Guest name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone (Optional)</label>
              <input
                type="tel"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="+91..."
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Extra Adults</label>
                <input
                  type="number"
                  min={0}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formData.extraAdults}
                  onChange={(e) => setFormData({ ...formData, extraAdults: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Extra Children</label>
                <input
                  type="number"
                  min={0}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formData.extraChildren}
                  onChange={(e) => setFormData({ ...formData, extraChildren: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="text-xs text-slate-500">Total attendees: <span className="font-semibold text-slate-900">{totalAttendees}</span></div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 flex justify-center"
            >
              {submitting ? <Loader2 className="animate-spin" /> : 'Confirm Entry'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

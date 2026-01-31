
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getEventById, addGuest, updateGuest } from '../services/db';
import { sendEmail, generateEmailTemplate } from '../services/email';
import { Event, Guest } from '../types';
import SafeQRCode from '../components/SafeQRCode';
import { Check, Calendar, MapPin, Download, Mail, Loader2 } from 'lucide-react';
import { IDCard } from '../components/IDCard';
import { useToast } from '../components/Toast';

export const PublicRegistration: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<Event | undefined>(undefined);
  const [loading, setLoading] = useState(true); // Initial load
  const [submitting, setSubmitting] = useState(false); // Form submit
  const [registeredGuest, setRegisteredGuest] = useState<Guest | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const { addToast } = useToast();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: ''
  });
  
  // State for custom fields
  const [customData, setCustomData] = useState<Record<string, string>>({});

  useEffect(() => {
    if (eventId) {
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
    }
  }, [eventId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId || !event) return;
    
    setSubmitting(true);
    try {
        const newGuest = await addGuest({
            eventId,
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            customData
        });

        if (event.autoSendEmail) {
            // Send email with event owner's configured email service
            const html = generateEmailTemplate(event, newGuest);
            const emailResult = await sendEmail(
              newGuest.email,
              `Your ticket for ${event.name}`,
              html,
              event.ownerId,
              undefined,
              { eventId: event.id, guestId: newGuest.id, qrCode: newGuest.qrCode, flyerUrl: event.flyerUrl }
            );
            if (emailResult.success) {
              await updateGuest(newGuest.id, { inviteSent: true, inviteSentEmail: true });
              setEmailSent(true);
            } else {
              addToast(`Email status: ${emailResult.message}`, "warning");
              setEmailSent(false);
            }
        }

        setRegisteredGuest(newGuest);
        addToast("Registration successful!", "success");
    } catch (e) {
        console.error(e);
        addToast("Registration failed. Please try again.", "error");
    } finally {
        setSubmitting(false);
    }
  };

  if (loading) return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
  );

  if (!event) return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="text-center">
              <h1 className="text-2xl font-bold text-slate-900">Event Not Found</h1>
              <p className="text-slate-500">Please check the URL and try again.</p>
          </div>
      </div>
  );

  if (registeredGuest) {
      if (emailSent) {
          return (
            <div className="min-h-screen bg-indigo-900 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl text-center space-y-6 animate-in zoom-in duration-300">
                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                        <Mail size={32} />
                    </div>
                    
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 mb-2">Check Your Inbox!</h1>
                        <p className="text-slate-500">We've sent your ticket to <strong>{registeredGuest.email}</strong></p>
                    </div>
                    
                    <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-600">
                        Can't find it? Check your spam folder or contact the event organizer.
                    </div>
                    
                    <p className="text-sm text-slate-400">You can close this page now.</p>
                </div>
            </div>
          );
      }

      return (
        <div className="min-h-screen bg-indigo-900 flex items-center justify-center p-4">
            {/* Hidden IDCard component that appears only during print */}
            <IDCard guest={registeredGuest} event={event} />

            <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl text-center space-y-6 animate-in zoom-in duration-300">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                    <Check size={32} />
                </div>
                
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">You're Registered!</h1>
                    <p className="text-slate-500">See you at {event.name}</p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                    <p className="text-xs text-slate-400 uppercase tracking-widest mb-4">Your Ticket</p>
                    <div className="bg-white p-4 rounded-xl shadow-sm inline-block mb-4">
                                                {registeredGuest.qrCode && registeredGuest.qrCode.trim() ? (
                                                    <SafeQRCode 
                                                            id="guest-qr-code"
                                                            value={registeredGuest.qrCode} 
                                                            size={200} 
                                                            level="H"
                                                    />
                                                ) : (
                          <div className="w-[200px] h-[200px] bg-slate-100 flex items-center justify-center text-slate-400 text-sm">
                            Loading ticket...
                          </div>
                        )}
                    </div>
                    <p className="font-bold text-slate-900 text-lg">{registeredGuest.name}</p>
                    <p className="text-slate-500 text-sm">{registeredGuest.email}</p>
                </div>

                <button 
                    onClick={() => window.print()}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                    <Download size={18} /> Download / Print Ticket
                </button>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
            {event.flyerUrl && (
                <div className="h-48 w-full bg-slate-200 relative">
                     <img src={event.flyerUrl} alt="Event Flyer" className="w-full h-full object-cover" />
                     <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                </div>
            )}
            
            <div className={`bg-indigo-600 p-8 text-white ${event.flyerUrl ? '-mt-2 relative z-10 rounded-t-2xl' : ''}`}>
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold mb-2">{event.name}</h1>
                        <div className="flex flex-col gap-2 text-indigo-100 text-sm">
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
                <h2 className="text-xl font-semibold text-slate-900 mb-6">Guest Registration</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                        <input 
                            required
                            type="text" 
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="John Doe"
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                        <input 
                            required
                            type="email" 
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="john@example.com"
                            value={formData.email}
                            onChange={e => setFormData({...formData, email: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number (Optional)</label>
                        <input 
                            type="tel" 
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="+1 (555) 000-0000"
                            value={formData.phone}
                            onChange={e => setFormData({...formData, phone: e.target.value})}
                        />
                    </div>

                    {/* Dynamic Fields */}
                    {event.formFields?.map(field => (
                        <div key={field.id}>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                {field.label} {field.required && <span className="text-red-500">*</span>}
                            </label>
                            <input 
                                required={field.required}
                                type={field.type === 'number' ? 'number' : 'text'}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder={`Enter ${field.label}`}
                                value={customData[field.label] || ''}
                                onChange={e => setCustomData({...customData, [field.label]: e.target.value})}
                            />
                        </div>
                    ))}

                    <button 
                        type="submit" 
                        disabled={submitting}
                        className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 flex justify-center"
                    >
                        {submitting ? <Loader2 className="animate-spin" /> : 'Complete Registration'}
                    </button>
                </form>
            </div>
        </div>
    </div>
  );
};


import React, { useState } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { createEvent } from '../services/db';
import { fileToBase64 } from '../services/utils';
import { Calendar, MapPin, Type, Lock, Image as ImageIcon, LayoutTemplate } from 'lucide-react';
import { Event } from '../types';
import { useToast } from '../components/Toast';

export const CreateEvent: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Event>>({
    name: '',
    date: '',
    location: '',
    description: '',
    volunteerPassword: '',
    logoUrl: '',
    flyerUrl: '',
    idCardLayout: 'standard',
    idCardColor: '#4f46e5'
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'flyerUrl') => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) { // 500kb limit for localStorage demo
          addToast("File too large for demo storage (Limit: 500KB)", 'error');
          return;
      }
      try {
        const base64 = await fileToBase64(file);
        setFormData(prev => ({ ...prev, [field]: base64 }));
        addToast("Image uploaded successfully", 'success');
      } catch (err) {
        addToast("Failed to process image", 'error');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
        await createEvent({
            ...formData as any, // Type assertion for partial state
            status: 'active'
        });
        addToast("Event created successfully!", 'success');
        navigate('/dashboard');
    } catch (error) {
        console.error(error);
        addToast("Failed to create event", 'error');
    } finally {
        setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Create New Event</h2>
        <p className="text-slate-500 mb-8">Set up the details for your upcoming event.</p>

        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 space-y-6">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Event Name</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Type size={18} />
                    </div>
                    <input 
                        required
                        type="text" 
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="e.g., Annual Tech Conference 2024"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Calendar size={18} />
                        </div>
                        <input 
                            required
                            type="date" 
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            value={formData.date}
                            onChange={e => setFormData({...formData, date: e.target.value})}
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <MapPin size={18} />
                        </div>
                        <input 
                            required
                            type="text" 
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            placeholder="e.g., Grand Hall, NYC"
                            value={formData.location}
                            onChange={e => setFormData({...formData, location: e.target.value})}
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Logo Image</label>
                    <div className="relative border border-slate-300 rounded-lg p-2 flex items-center gap-2">
                        <ImageIcon size={18} className="text-slate-400 flex-shrink-0" />
                        <input 
                            type="file" 
                            accept="image/*"
                            onChange={(e) => handleFileChange(e, 'logoUrl')}
                            className="w-full text-sm text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                        />
                    </div>
                    {formData.logoUrl && <p className="text-xs text-green-600 mt-1">Image selected</p>}
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Flyer/Banner Image</label>
                    <div className="relative border border-slate-300 rounded-lg p-2 flex items-center gap-2">
                        <ImageIcon size={18} className="text-slate-400 flex-shrink-0" />
                        <input 
                            type="file" 
                            accept="image/*"
                            onChange={(e) => handleFileChange(e, 'flyerUrl')}
                            className="w-full text-sm text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                        />
                    </div>
                    {formData.flyerUrl && <p className="text-xs text-green-600 mt-1">Image selected</p>}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="col-span-full">
                    <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                        <LayoutTemplate size={16} /> Badge Design
                    </h3>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Layout Style</label>
                    <select 
                        value={formData.idCardLayout}
                        onChange={e => setFormData({...formData, idCardLayout: e.target.value as any})}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                        <option value="standard">Standard (Classic)</option>
                        <option value="modern">Modern (Sidebar)</option>
                        <option value="minimal">Minimal (Clean)</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Accent Color</label>
                    <div className="flex items-center gap-2">
                        <input 
                            type="color" 
                            value={formData.idCardColor}
                            onChange={e => setFormData({...formData, idCardColor: e.target.value})}
                            className="h-10 w-20 p-1 border border-slate-300 rounded-lg cursor-pointer"
                        />
                        <span className="text-sm text-slate-500">For badge branding</span>
                    </div>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea 
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none h-32"
                    placeholder="Event details..."
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                />
            </div>

            <div className="pt-4 border-t border-slate-100">
                <label className="block text-sm font-medium text-slate-700 mb-1">Volunteer Access Code</label>
                <p className="text-xs text-slate-500 mb-2">Share this code with volunteers to let them scan tickets.</p>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Lock size={18} />
                    </div>
                    <input 
                        required
                        type="text" 
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono tracking-widest"
                        placeholder="SECRET123"
                        value={formData.volunteerPassword}
                        onChange={e => setFormData({...formData, volunteerPassword: e.target.value})}
                    />
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <button 
                    type="submit" 
                    disabled={loading}
                    className="bg-primary hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                    {loading ? 'Creating...' : 'Create Event'}
                </button>
            </div>
        </form>
      </div>
    </Layout>
  );
};


import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useParams, useNavigate } from 'react-router-dom';
import { getEventById, getEventGuests, addGuestsBulk, getEventStats, updateGuest, updateEvent, deleteEvent, deleteGuest, clearEventGuests, markGuestIdPrinted, getActiveVolunteers } from '../services/db';
import { sendEmail, generateEmailTemplate } from '../services/email';
import { fileToBase64 } from '../services/utils';
import { Event, Guest, FormField } from '../types';
import { IDCard } from '../components/IDCard';
import { EmailSettings } from '../components/EmailSettings';
import Papa from 'papaparse';
import SafeQRCode from '../components/SafeQRCode';
import { Upload, Download, Mail, Search, CheckCircle, Copy, ExternalLink, Send, Settings, Save, Trash2, Image as ImageIcon, Plus, X, Activity, ArrowRight, Eye, LayoutTemplate, Printer, Edit2, RotateCcw, Filter, UserCheck, CircleDashed, CheckSquare, Square, QrCode } from 'lucide-react';
import { useToast } from '../components/Toast';
import { getCurrentUser } from '../services/db';

export const EventDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [event, setEvent] = useState<Event | undefined>(undefined);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [stats, setStats] = useState({ total: 0, checkedIn: 0, remaining: 0 });
  const [activeTab, setActiveTab] = useState<'list' | 'import' | 'settings'>('list');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  
  // Filters & Selection
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'checked-in' | 'pending'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [sendingInvites, setSendingInvites] = useState(false);
  
  // Guest Detail Modal State
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [isEditingGuest, setIsEditingGuest] = useState(false);
  const [guestEditForm, setGuestEditForm] = useState<Partial<Guest>>({});

  // Printing State
  const [printingGuest, setPrintingGuest] = useState<Guest | null>(null);

  // CSV Mapping State
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState({
      name: '',
      email: '',
      phone: ''
  });
  const [customFieldMapping, setCustomFieldMapping] = useState<Record<string, string>>({});
  
  // Settings Form State
  const [editForm, setEditForm] = useState<Partial<Event>>({});
  const [isSaving, setIsSaving] = useState(false);

  // New Field State
  const [newFieldLabel, setNewFieldLabel] = useState('');

  // Volunteer Stats
  const [volunteerStats, setVolunteerStats] = useState<Record<string, number>>({});
  const [activeVolunteers, setActiveVolunteers] = useState<string[]>([]);
  const [showQrModal, setShowQrModal] = useState(false);
  
  // Email Settings Modal
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  const user = getCurrentUser();

  useEffect(() => {
    if (id) {
        // Load event initially
        const loadEvent = async () => {
             const evt = await getEventById(id);
             if (evt) {
                setEvent(evt);
                setEditForm(evt);
                await refreshData(id);
             }
        };
        loadEvent();

        // Poll for updates (live feed & active volunteers)
        const interval = setInterval(() => refreshData(id), 10000); // 10s poll to be nice to Firestore quotas
        return () => clearInterval(interval);
    }
  }, [id]);

  const refreshData = async (eventId: string) => {
    const eventGuests = await getEventGuests(eventId);
    setGuests(eventGuests);
    
    const s = await getEventStats(eventId);
    setStats(s);
    
    const v = await getActiveVolunteers(eventId);
    setActiveVolunteers(v);

    // Calculate Volunteer Stats
    const vStats: Record<string, number> = {};
    eventGuests.forEach(g => {
        if (g.checkedIn && g.verifiedBy) {
            vStats[g.verifiedBy] = (vStats[g.verifiedBy] || 0) + 1;
        }
    });
    setVolunteerStats(vStats);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        setCsvFile(file);
        setUploadStatus('');
        setCsvPreview([]);
        setCustomFieldMapping({});
        
        // Initial parse for preview
        Papa.parse(file, {
            header: true,
            preview: 5,
            complete: (results) => {
                if (results.meta.fields) {
                    const fields = results.meta.fields;
                    setCsvHeaders(fields);
                    setCsvPreview(results.data);
                    
                    // Auto-detect core columns
                    setColumnMapping({
                        name: fields.find(f => f.toLowerCase().includes('name')) || '',
                        email: fields.find(f => f.toLowerCase().includes('email')) || '',
                        phone: fields.find(f => f.toLowerCase().includes('phone')) || ''
                    });

                    // Auto-detect custom fields
                    if (event?.formFields) {
                        const newMapping: Record<string, string> = {};
                        event.formFields.forEach(ff => {
                            const match = fields.find(f => f.toLowerCase() === ff.label.toLowerCase());
                            if (match) newMapping[ff.id] = match;
                        });
                        setCustomFieldMapping(newMapping);
                    }
                }
            }
        });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'flyerUrl') => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) { // 500kb limit
          addToast("File too large for demo (Limit: 500KB)", 'error');
          return;
      }
      try {
        const base64 = await fileToBase64(file);
        setEditForm(prev => ({ ...prev, [field]: base64 }));
        addToast("Image uploaded", 'success');
      } catch (err) {
        addToast("Failed to process image", 'error');
      }
    }
  };

  const executeImport = () => {
    if (!csvFile || !event || !columnMapping.name) {
        setUploadStatus('Please select a CSV file and map the Name column.');
        return;
    }
    
    setUploadStatus('Processing...');
    
    Papa.parse(csvFile, {
        header: true,
        complete: async (results) => {
            try {
                const processedGuests = results.data.map((row: any) => {
                    if (!row[columnMapping.name]) return null;

                    // Extract custom fields based on mapping
                    const customData: Record<string, string> = {};
                    if (event.formFields) {
                        event.formFields.forEach(field => {
                            const mappedHeader = customFieldMapping[field.id];
                            if (mappedHeader && row[mappedHeader]) {
                                customData[field.label] = row[mappedHeader];
                            }
                        });
                    }

                    return {
                        name: row[columnMapping.name],
                        email: columnMapping.email ? row[columnMapping.email] : 'no-email',
                        phone: columnMapping.phone ? row[columnMapping.phone] : '',
                        customData
                    };
                }).filter(g => g !== null);

                if (processedGuests.length > 0) {
                    await addGuestsBulk(event.id, processedGuests);
                    await refreshData(event.id);
                    setUploadStatus(`Successfully imported ${processedGuests.length} guests.`);
                    setCsvFile(null);
                    setCsvPreview([]);
                    addToast(`Imported ${processedGuests.length} guests successfully`, 'success');
                    setTimeout(() => setActiveTab('list'), 1500);
                } else {
                    setUploadStatus('No valid guest data found.');
                    addToast('No valid data found in CSV', 'error');
                }
            } catch (err) {
                setUploadStatus('Error processing file.');
                console.error(err);
                addToast('Failed to process CSV file', 'error');
            }
        },
        error: () => setUploadStatus('Failed to parse CSV.')
    });
  };

  const handleExport = () => {
    if (guests.length === 0) return;

    // Flatten guest object for CSV
    const csvData = guests.map(g => ({
        Name: g.name,
        Email: g.email,
        Phone: g.phone || '',
        Status: g.checkedIn ? 'Checked In' : 'Pending',
        CheckedInAt: g.checkedInAt || '',
        VerifiedBy: g.verifiedBy || '',
        InviteSent: g.inviteSent ? 'Yes' : 'No',
        BadgePrinted: g.idCardPrinted ? 'Yes' : 'No',
        ...g.customData // Spread custom fields into columns
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${event?.name.replace(/\s+/g, '_')}_guests.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSendInvites = async () => {
    if (!guests.length || !event) return;
    const guestsToInvite = guests.filter(g => !g.inviteSent);
    
    if (guestsToInvite.length === 0) {
        addToast("All guests have already received invitations.", 'info');
        return;
    }

    if (!window.confirm(`Send email invitations to ${guestsToInvite.length} uninvited guests?`)) return;

    setSendingInvites(true);
    
    try {
        for (const guest of guestsToInvite) {
            const html = generateEmailTemplate(event, guest);
            if (user) {
                            const res = await sendEmail(guest.email, `You're invited to ${event.name}!`, html, user.id, undefined, { eventId: event.id, guestId: guest.id, qrCode: guest.qrCode, flyerUrl: event.flyerUrl });
                            if (res.success) {
                                await updateGuest(guest.id, { inviteSent: true });
                            } else {
                                // leave inviteSent false; record message logged in sendEmail
                                console.warn('Email not sent for', guest.email, res.message);
                            }
            }
        }
                await refreshData(event.id);
                addToast(`Invitations processed for ${guestsToInvite.length} guests. Check failedEmails in Firestore for errors.`, 'info');
    } catch (e) {
        addToast("Error queueing emails. Check Firebase connection.", 'error');
    } finally {
        setSendingInvites(false);
    }
  };

  const handleResendSingleInvite = async (guest: Guest) => {
    if (!event) return;
    if (!window.confirm(`Resend ticket email to ${guest.email}?`)) return;

    try {
        const html = generateEmailTemplate(event, guest);
                if (user) {
                    const res = await sendEmail(guest.email, `Ticket for ${event.name}`, html, user.id, undefined, { eventId: event.id, guestId: guest.id, qrCode: guest.qrCode, flyerUrl: event.flyerUrl });
                    if (res.success) {
                        await updateGuest(guest.id, { inviteSent: true });
                    } else {
                        console.warn('Resend failed for single resend:', res.message);
                    }
                }
        
                // Refresh data to reflect any DB updates (inviteSent etc.)
                if (event) await refreshData(event.id);
                addToast(`Resend processed for ${guest.email}`, 'info');
    } catch (e) {
        addToast("Failed to queue email", 'error');
    }
  };

  const handleDeleteGuest = async (guestId: string, guestName: string) => {
      if (window.confirm(`Are you sure you want to remove ${guestName} from the guest list?`)) {
          await deleteGuest(guestId);
          if (event) await refreshData(event.id);
          if (selectedGuest?.id === guestId) setSelectedGuest(null);
          addToast("Guest removed", 'success');
      }
  };
  
  const handleToggleCheckIn = async (guest: Guest, e: React.MouseEvent) => {
      e.stopPropagation();
      const newStatus = !guest.checkedIn;
      
      try {
          if (newStatus) {
               await updateGuest(guest.id, { 
                   checkedIn: true, 
                   checkedInAt: new Date().toISOString(),
                   verifiedBy: 'Admin'
               });
               addToast("Guest checked in", 'success');
          } else {
               await updateGuest(guest.id, { 
                   checkedIn: false, 
                   checkedInAt: undefined,
                   verifiedBy: undefined
               });
               addToast("Check-in undone", 'info');
          }
          if (event) await refreshData(event.id);
          // Also update selectedGuest if it's the one we're toggling
          if (selectedGuest && selectedGuest.id === guest.id) {
              setSelectedGuest(prev => prev ? ({ ...prev, checkedIn: newStatus }) : null);
          }
      } catch (err) {
          addToast("Failed to update status", 'error');
      }
  };

  const handlePrintBadge = async (guest: Guest) => {
      setPrintingGuest(guest);
      await markGuestIdPrinted(guest.id);
      if (event) await refreshData(event.id);
      if (selectedGuest && selectedGuest.id === guest.id) {
          setSelectedGuest(prev => prev ? ({ ...prev, idCardPrinted: true }) : null);
      }
      setTimeout(() => {
          window.print();
      }, 200);
  };

  const handleEditGuest = (guest: Guest) => {
      setGuestEditForm(guest);
      setIsEditingGuest(true);
  };

  const saveGuestChanges = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedGuest) return;
      
      try {
          await updateGuest(selectedGuest.id, guestEditForm);
          if (event) await refreshData(event.id);
          setSelectedGuest({ ...selectedGuest, ...guestEditForm } as Guest);
          setIsEditingGuest(false);
          addToast("Guest details updated", 'success');
      } catch (err) {
          addToast("Failed to update guest", 'error');
      }
  };

  const downloadQrCode = (qrCode: string, name: string) => {
      const svg = document.getElementById(`qr-${qrCode}`);
      if (!svg) return;
      
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      
      img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          if (ctx) {
             ctx.drawImage(img, 0, 0);
             const pngFile = canvas.toDataURL("image/png");
             const downloadLink = document.createElement("a");
             downloadLink.download = `${name.replace(/\s+/g, '_')}_QR.png`;
             downloadLink.href = pngFile;
             downloadLink.click();
          }
      };
      
      img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    setIsSaving(true);
    try {
        const updated = await updateEvent(event.id, editForm);
        setEvent(updated);
        addToast('Event settings updated successfully!', 'success');
    } catch (e) {
        addToast('Failed to update event', 'error');
    } finally {
        setIsSaving(false);
    }
  };

  const addFormField = () => {
    if (!newFieldLabel) return;
    const newField: FormField = {
        id: Math.random().toString(36).substring(2, 9),
        label: newFieldLabel,
        type: 'text',
        required: false
    };
    setEditForm(prev => ({
        ...prev,
        formFields: [...(prev.formFields || []), newField]
    }));
    setNewFieldLabel('');
  };

  const removeFormField = (id: string) => {
      setEditForm(prev => ({
          ...prev,
          formFields: (prev.formFields || []).filter(f => f.id !== id)
      }));
  };

  const handleDeleteEvent = async () => {
      if (!event) return;
      const confirmName = prompt(`To delete this event, please type "${event.name}"`);
      if (confirmName === event.name) {
          await deleteEvent(event.id);
          navigate('/dashboard');
      } else {
          addToast('Delete cancelled. Name did not match.', 'info');
      }
  };
  
  const handleClearGuests = async () => {
      if (!event) return;
      const count = guests.length;
      if (count === 0) return;
      
      if (window.confirm(`Are you sure you want to delete ALL ${count} guests? This action cannot be undone.`)) {
          await clearEventGuests(event.id);
          await refreshData(event.id);
          addToast(`Deleted ${count} guests.`, 'success');
      }
  };

  // Bulk Selection Logic
  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredGuests.length && filteredGuests.length > 0) {
        setSelectedIds(new Set());
    } else {
        const newSet = new Set<string>();
        filteredGuests.forEach(g => newSet.add(g.id));
        setSelectedIds(newSet);
    }
  };

  const handleToggleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
        newSet.delete(id);
    } else {
        newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBulkDelete = async () => {
    if (!event || selectedIds.size === 0) return;
    if (window.confirm(`Delete ${selectedIds.size} selected guests?`)) {
        for (const id of selectedIds) {
            await deleteGuest(id);
        }
        setSelectedIds(new Set());
        await refreshData(event.id);
        addToast('Selected guests deleted', 'success');
    }
  };

  const handleBulkCheckIn = async () => {
    if (!event || selectedIds.size === 0) return;
    if (window.confirm(`Mark ${selectedIds.size} guests as checked in?`)) {
        for (const id of selectedIds) {
            await updateGuest(id, { 
                checkedIn: true, 
                checkedInAt: new Date().toISOString(),
                verifiedBy: 'Admin'
            });
        }
        setSelectedIds(new Set());
        await refreshData(event.id);
        addToast('Selected guests checked in', 'success');
    }
  };

  const handleBulkEmail = async () => {
    if (!event || selectedIds.size === 0) return;
    if (window.confirm(`Send email invitation to ${selectedIds.size} selected guests?`)) {
        setSendingInvites(true);
        try {
            for (const id of selectedIds) {
                const guest = guests.find(g => g.id === id);
                                        if (guest) {
                                        const html = generateEmailTemplate(event, guest);
                                        const res = await sendEmail(guest.email, `You're invited to ${event.name}!`, html, user?.id || '', undefined, { eventId: event.id, guestId: guest.id, qrCode: guest.qrCode, flyerUrl: event.flyerUrl });
                                        if (res.success) {
                                            await updateGuest(guest.id, { inviteSent: true });
                                        } else {
                                            console.warn('Bulk email failed for', guest.email, res.message);
                                        }
                                }
            }
            setSelectedIds(new Set());
            await refreshData(event.id);
            addToast("Emails queued successfully!", 'success');
        } catch (e) {
            addToast("Error queueing emails.", 'error');
        } finally {
            setSendingInvites(false);
        }
    }
  };

  // Helper to safely render QR codes
  const isValidQRValue = (value: string | undefined): boolean => {
    return typeof value === 'string' && value.trim().length > 0;
  };

  const getRegistrationLink = () => {
    if (!event?.id) return ''; // Return empty string if no event ID
    const baseUrl = window.location.href.split('#')[0];
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${cleanBaseUrl}/#/register/${event.id}`;
  };

  const copyRegistrationLink = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(getRegistrationLink()).then(() => {
          addToast("Registration link copied!", 'success');
        }).catch(() => {
          // Fallback for clipboard API
          const input = document.createElement('textarea');
          input.value = getRegistrationLink();
          document.body.appendChild(input);
          input.select();
          document.execCommand('copy');
          document.body.removeChild(input);
          addToast("Registration link copied!", 'success');
        });
      } else {
        throw new Error('Clipboard API not available');
      }
    } catch (e) {
      addToast("Could not copy link. Please copy manually: " + getRegistrationLink(), 'warning');
    }
  };

  const filteredGuests = guests.filter(g => {
    const matchesSearch = g.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          g.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'checked-in') return matchesSearch && g.checkedIn;
    if (statusFilter === 'pending') return matchesSearch && !g.checkedIn;
    return matchesSearch;
  });

  const recentActivity = guests
    .filter(g => g.checkedIn && g.checkedInAt)
    .sort((a, b) => new Date(b.checkedInAt!).getTime() - new Date(a.checkedInAt!).getTime())
    .slice(0, 5);

  if (!event) return <Layout><div>Loading...</div></Layout>;

  return (
    <Layout>
      {/* Hidden ID Card for Printing */}
      {printingGuest && event && printingGuest.qrCode && <IDCard guest={printingGuest} event={event} />}

      {/* Registration QR Modal */}
      {showQrModal && event && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center relative animate-in zoom-in duration-200">
                <button onClick={() => setShowQrModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                    <X size={24} />
                </button>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Scan to Register</h3>
                <p className="text-slate-500 text-sm mb-6">Guests can scan this to open the registration form.</p>
                {isValidQRValue(getRegistrationLink()) ? (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 inline-block mb-4 shadow-sm">
                    {/* Ensure QR code uses absolute URL */}
                    <SafeQRCode value={getRegistrationLink()} size={200} />
                  </div>
                ) : (
                  <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 inline-block mb-4 text-slate-500 text-sm">
                    Loading QR code...
                  </div>
                )}
                <div className="flex gap-2 justify-center">
                    <button onClick={copyRegistrationLink} className="text-indigo-600 text-sm font-medium hover:underline">Copy Link</button>
                    <span className="text-slate-300">|</span>
                    <button onClick={() => window.open(getRegistrationLink(), '_blank')} className="text-indigo-600 text-sm font-medium hover:underline">Open Form</button>
                </div>
            </div>
        </div>
      )}

      {/* Header Stats */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
                <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">{event.name}</h1>
                    {event.status === 'completed' && (
                        <span className="px-3 py-1 bg-slate-200 text-slate-600 rounded-full text-xs font-bold uppercase">Completed</span>
                    )}
                </div>
                <p className="text-slate-500 flex items-center gap-2 text-sm">
                    {event.date} • {event.location}
                </p>
            </div>
            <div className="flex gap-3">
                 <button 
                    onClick={() => setShowQrModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white border border-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                 >
                    <QrCode size={16} /> Show QR
                 </button>
                 <button 
                    onClick={copyRegistrationLink}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                 >
                    <Copy size={16} /> Copy Reg. Link
                 </button>
                 <button 
                    onClick={() => window.open(getRegistrationLink(), '_blank')}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                 >
                    <ExternalLink size={16} /> Open Form
                 </button>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-sm text-slate-500 uppercase font-semibold">Total Guests</p>
                <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-sm text-green-600 uppercase font-semibold">Checked In</p>
                <p className="text-3xl font-bold text-green-700">{stats.checkedIn}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-sm text-slate-500 uppercase font-semibold">Remaining</p>
                <p className="text-3xl font-bold text-slate-900">{stats.remaining}</p>
            </div>
            
            {/* Volunteer Activity Stats */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                <p className="text-sm text-slate-500 uppercase font-semibold mb-2 flex items-center gap-2">
                    <UserCheck size={14} /> Volunteer Activity
                </p>
                <div className="flex-1 overflow-auto space-y-2 max-h-24 scrollbar-thin">
                    {Object.keys(volunteerStats).length > 0 ? (
                        Object.entries(volunteerStats).map(([name, count]) => (
                            <div key={name} className="flex justify-between items-center text-xs p-1">
                                <span className="font-medium text-slate-700 flex items-center gap-1">
                                    {activeVolunteers.includes(name) && (
                                        <span className="w-2 h-2 bg-green-500 rounded-full inline-block animate-pulse" title="Online now"></span>
                                    )}
                                    {name}
                                </span>
                                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">{count}</span>
                            </div>
                        ))
                    ) : (
                        <p className="text-xs text-slate-400 italic">No activity yet.</p>
                    )}
                </div>
            </div>
        </div>
      </div>
      
      {/* Live Activity Feed - New Section */}
      <div className="mb-8">
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        <Activity size={18} className="text-indigo-600" /> 
                        Live Check-in Feed
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        <span className="text-xs text-slate-500">Auto-updating</span>
                    </div>
                </div>
                <div className="divide-y divide-slate-100">
                    {recentActivity.length > 0 ? recentActivity.map(guest => (
                        <div key={guest.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold">
                                    {guest.name.charAt(0)}
                                </div>
                                <div>
                                    <p className="font-medium text-slate-900">{guest.name}</p>
                                    <p className="text-xs text-slate-500">{guest.email}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                 <p className="text-xs font-bold text-slate-700">
                                    {guest.checkedInAt ? new Date(guest.checkedInAt).toLocaleTimeString() : ''}
                                 </p>
                                 <p className="text-[10px] text-slate-400 uppercase tracking-wide flex items-center justify-end gap-1">
                                    <UserCheck size={10} />
                                    {guest.verifiedBy || 'Admin'}
                                 </p>
                            </div>
                        </div>
                    )) : (
                        <div className="p-8 text-center text-slate-500 text-sm flex flex-col items-center">
                            <CircleDashed size={32} className="text-slate-300 mb-2" />
                            <p>No check-ins yet. Waiting for guests...</p>
                        </div>
                    )}
                </div>
            </div>
      </div>

      {/* Guest Details Modal & Tabs */}
      {selectedGuest && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                <div className="bg-indigo-600 p-6 text-white flex justify-between items-start flex-shrink-0">
                    <div>
                        <h2 className="text-xl font-bold">{isEditingGuest ? 'Edit Guest' : selectedGuest.name}</h2>
                        <p className="text-indigo-200 text-sm">{isEditingGuest ? 'Update information' : selectedGuest.email}</p>
                    </div>
                    <button onClick={() => { setSelectedGuest(null); setIsEditingGuest(false); }} className="text-white/80 hover:text-white">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto">
                    {isEditingGuest ? (
                        <form onSubmit={saveGuestChanges} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={guestEditForm.name || ''}
                                    onChange={e => setGuestEditForm({...guestEditForm, name: e.target.value})}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                <input 
                                    type="email" 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={guestEditForm.email || ''}
                                    onChange={e => setGuestEditForm({...guestEditForm, email: e.target.value})}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={guestEditForm.phone || ''}
                                    onChange={e => setGuestEditForm({...guestEditForm, phone: e.target.value})}
                                />
                            </div>
                            {/* Edit Custom Fields */}
                            {event.formFields?.map(field => (
                                <div key={field.id}>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{field.label}</label>
                                    <input 
                                        type="text"
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={guestEditForm.customData?.[field.label] || ''}
                                        onChange={e => setGuestEditForm({
                                            ...guestEditForm, 
                                            customData: {
                                                ...guestEditForm.customData,
                                                [field.label]: e.target.value
                                            }
                                        })}
                                    />
                                </div>
                            ))}
                            <div className="flex gap-2 pt-4">
                                <button type="button" onClick={() => setIsEditingGuest(false)} className="flex-1 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50">Cancel</button>
                                <button type="submit" className="flex-1 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Save Changes</button>
                            </div>
                        </form>
                    ) : (
                        <div className="space-y-4">
                             <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <span className="text-sm text-slate-500">Status</span>
                                {selectedGuest.checkedIn ? (
                                    <span className="text-green-600 font-bold text-sm flex items-center gap-1">
                                        <CheckCircle size={14} /> Checked In
                                        <span className="text-slate-400 font-normal text-xs ml-1">by {selectedGuest.verifiedBy}</span>
                                    </span>
                                ) : (
                                    <span className="text-yellow-600 font-bold text-sm">Pending</span>
                                )}
                            </div>

                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <span className="text-sm text-slate-500">Invite Status</span>
                                {selectedGuest.inviteSent ? (
                                    <span className="text-green-600 font-bold text-sm flex items-center gap-1">
                                        <Mail size={14} /> Sent
                                    </span>
                                ) : (
                                    <span className="text-slate-400 font-bold text-sm">Not Sent</span>
                                )}
                            </div>
                            
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <span className="text-sm text-slate-500">Badge Status</span>
                                {selectedGuest.idCardPrinted ? (
                                    <span className="text-indigo-600 font-bold text-sm flex items-center gap-1">
                                        <Printer size={14} /> Printed
                                    </span>
                                ) : (
                                    <span className="text-slate-400 font-bold text-sm">Not Printed</span>
                                )}
                            </div>
                            
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <p className="text-xs font-bold uppercase text-slate-400">Registration Details</p>
                                    <button 
                                        onClick={() => handleEditGuest(selectedGuest)}
                                        className="text-indigo-600 text-xs flex items-center gap-1 hover:underline"
                                    >
                                        <Edit2 size={12} /> Edit
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="text-slate-500">Phone:</div>
                                    <div className="font-medium">{selectedGuest.phone || '-'}</div>
                                    
                                    {selectedGuest.customData && Object.entries(selectedGuest.customData).map(([key, val]) => (
                                        <React.Fragment key={key}>
                                            <div className="text-slate-500">{key}:</div>
                                            <div className="font-medium">{val}</div>
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {!isEditingGuest && (
                    <div className="p-6 bg-slate-50 border-t border-slate-200 grid grid-cols-2 gap-3">
                         <button 
                             onClick={() => handleResendSingleInvite(selectedGuest)}
                             className="py-2 text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                         >
                             <RotateCcw size={16} /> Resend Email
                         </button>
                         <button 
                             onClick={() => handlePrintBadge(selectedGuest)}
                             className={`py-2 text-white ${selectedGuest.idCardPrinted ? 'bg-indigo-800' : 'bg-indigo-600 hover:bg-indigo-700'} rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2`}
                         >
                             <Printer size={16} /> {selectedGuest.idCardPrinted ? 'Reprint Badge' : 'Print Badge'}
                         </button>
                         <button 
                             onClick={() => {
                                 downloadQrCode(selectedGuest.qrCode, selectedGuest.name);
                             }}
                             className="py-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                         >
                             <Download size={16} /> Save QR
                         </button>
                         <button 
                             onClick={() => {
                                 const guest = selectedGuest;
                                 setSelectedGuest(null);
                                 handleDeleteGuest(guest.id, guest.name);
                             }}
                             className="py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                         >
                             <Trash2 size={16} /> Delete
                         </button>
                    </div>
                )}
            </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200 flex">
            <button 
                onClick={() => setActiveTab('list')}
                className={`px-6 py-4 text-sm font-medium transition-colors ${activeTab === 'list' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
                Guest List
            </button>
            <button 
                onClick={() => setActiveTab('import')}
                className={`px-6 py-4 text-sm font-medium transition-colors ${activeTab === 'import' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
                Import CSV
            </button>
            <button 
                onClick={() => setActiveTab('settings')}
                className={`px-6 py-4 text-sm font-medium transition-colors ${activeTab === 'settings' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
                Settings
            </button>
        </div>

        <div className="p-6">
            {activeTab === 'list' && (
                <>
                    <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                        <div className="flex-1 flex gap-4">
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input 
                                    type="text" 
                                    placeholder="Search guests..." 
                                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="relative w-40">
                                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <select 
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as any)}
                                    className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 appearance-none bg-white"
                                >
                                    <option value="all">All Status</option>
                                    <option value="checked-in">Checked In</option>
                                    <option value="pending">Pending</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-2">
                             <button 
                                onClick={handleExport}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium"
                             >
                                <Download size={16} /> Export CSV
                             </button>
                             <button 
                                onClick={handleSendInvites}
                                disabled={sendingInvites}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-70 disabled:cursor-wait"
                             >
                                {sendingInvites ? 'Sending...' : <><Send size={16} /> Send Invites</>}
                             </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-xs text-slate-500 uppercase bg-slate-50 border-y border-slate-200">
                                    <th className="px-4 py-3 w-10">
                                        <button 
                                            onClick={handleToggleSelectAll} 
                                            className="text-slate-400 hover:text-indigo-600"
                                        >
                                            {selectedIds.size > 0 && selectedIds.size === filteredGuests.length ? <CheckSquare size={20} /> : <Square size={20} />}
                                        </button>
                                    </th>
                                    <th className="px-4 py-3 font-semibold">Name</th>
                                    <th className="px-4 py-3 font-semibold">Email</th>
                                    <th className="px-4 py-3 font-semibold">Status</th>
                                    <th className="px-4 py-3 font-semibold">Volunteer</th>
                                    <th className="px-4 py-3 font-semibold">Badge</th>
                                    <th className="px-4 py-3 font-semibold">Invite</th>
                                    <th className="px-4 py-3 font-semibold text-center">QR Code</th>
                                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredGuests.length > 0 ? filteredGuests.map(guest => (
                                    <tr key={guest.id} className={`hover:bg-slate-50 cursor-pointer ${selectedIds.has(guest.id) ? 'bg-indigo-50/50' : ''}`} onClick={() => setSelectedGuest(guest)}>
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <button 
                                                onClick={() => handleToggleSelectOne(guest.id)} 
                                                className={`transition-colors ${selectedIds.has(guest.id) ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}
                                            >
                                                {selectedIds.has(guest.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 font-medium text-slate-900">{guest.name}</td>
                                        <td className="px-4 py-3 text-slate-600">{guest.email}</td>
                                        <td className="px-4 py-3">
                                            {guest.checkedIn ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                                                    <CheckCircle size={12} /> Checked In
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium">
                                                    Pending
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-500">
                                            {guest.verifiedBy ? (
                                                <span className="flex items-center gap-1">
                                                    <UserCheck size={14} /> {guest.verifiedBy}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            {guest.idCardPrinted ? (
                                                <span className="text-indigo-600" title="Badge Printed"><Printer size={16} /></span>
                                            ) : (
                                                <span className="text-slate-300">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {guest.inviteSent ? (
                                                <span className="text-xs text-green-600 font-medium flex items-center gap-1"><Mail size={12}/> Sent</span>
                                            ) : (
                                                <span className="text-xs text-slate-400">Not sent</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                            {/* Small QR Preview */}
                                            {isValidQRValue(guest.qrCode) ? (
                                              <div className="inline-block p-1 bg-white border rounded group relative">
                                                                 <SafeQRCode 
                                                                     id={`qr-${guest.qrCode}`}
                                                                     value={guest.qrCode} 
                                                                     size={32} 
                                                                 />
                                                 {/* Hover for larger view */}
                                                 <div className="hidden group-hover:block absolute right-full top-0 mr-2 p-2 bg-white shadow-xl border rounded-lg z-10 w-32">
                                                    <SafeQRCode value={guest.qrCode} size={120} />
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            downloadQrCode(guest.qrCode, guest.name);
                                                        }}
                                                        className="mt-2 w-full text-xs bg-indigo-50 text-indigo-600 py-1 rounded hover:bg-indigo-100"
                                                    >
                                                        Download PNG
                                                    </button>
                                                 </div>
                                              </div>
                                            ) : (
                                              <div className="inline-block w-8 h-8 bg-slate-100 rounded flex items-center justify-center text-xs text-slate-400">
                                                —
                                              </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex justify-end gap-1">
                                                <button 
                                                    onClick={(e) => handleToggleCheckIn(guest, e)}
                                                    className={`p-1 rounded transition-colors ${guest.checkedIn ? 'text-yellow-600 hover:bg-yellow-50' : 'text-green-600 hover:bg-green-50'}`}
                                                    title={guest.checkedIn ? "Undo Check-in" : "Check In Manual"}
                                                >
                                                    {guest.checkedIn ? <RotateCcw size={16} /> : <CheckCircle size={16} />}
                                                </button>
                                                <button 
                                                    onClick={() => setSelectedGuest(guest)}
                                                    className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                                    title="View Details"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteGuest(guest.id, guest.name)}
                                                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                    title="Delete Guest"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                                            No guests found matching filters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    
                    {/* Bulk Action Toolbar - Floats at bottom */}
                    {selectedIds.size > 0 && (
                        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white shadow-2xl border border-slate-200 p-4 rounded-xl flex items-center gap-4 z-40 animate-in slide-in-from-bottom-10 fade-in duration-300">
                            <span className="font-bold text-slate-700">{selectedIds.size} Selected</span>
                            <div className="h-6 w-px bg-slate-200"></div>
                            <button 
                                onClick={handleBulkCheckIn}
                                className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-sm font-medium"
                            >
                                <CheckCircle size={16} /> Check In
                            </button>
                            <button 
                                onClick={handleBulkEmail}
                                className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium"
                            >
                                <Mail size={16} /> Invite
                            </button>
                            <button 
                                onClick={handleBulkDelete}
                                className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-sm font-medium"
                            >
                                <Trash2 size={16} /> Delete
                            </button>
                            <button 
                                onClick={() => setSelectedIds(new Set())}
                                className="ml-2 p-2 text-slate-400 hover:text-slate-600 rounded-full"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    )}
                </>
            )}

            {activeTab === 'import' && (
                <div className="max-w-xl mx-auto py-8">
                    {/* ... (Existing Import JSX - Logic is updated in functions above) ... */}
                    {!csvPreview.length ? (
                        <div className="text-center">
                            <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Upload size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-2">Upload Guest List</h3>
                            <p className="text-slate-500 mb-6 text-sm">Upload a CSV file. We'll help you map the columns.</p>
                            
                            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 hover:bg-slate-50 transition-colors mb-6 cursor-pointer relative">
                                <input 
                                    type="file" 
                                    accept=".csv"
                                    onChange={handleFileUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <div className="text-center">
                                    <span className="text-indigo-600 font-medium">Click to upload</span> or drag and drop
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-bold">Map Columns</h3>
                                <button onClick={() => {setCsvFile(null); setCsvPreview([]);}} className="text-sm text-red-500">Cancel</button>
                            </div>
                            
                            <div className="bg-slate-50 p-4 rounded-lg space-y-4 border border-slate-200">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Name Column <span className="text-red-500">*</span></label>
                                    <select 
                                        className="w-full p-2 border border-slate-300 rounded-md"
                                        value={columnMapping.name}
                                        onChange={e => setColumnMapping({...columnMapping, name: e.target.value})}
                                    >
                                        <option value="">Select Column...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email Column</label>
                                    <select 
                                        className="w-full p-2 border border-slate-300 rounded-md"
                                        value={columnMapping.email}
                                        onChange={e => setColumnMapping({...columnMapping, email: e.target.value})}
                                    >
                                        <option value="">Select Column (Optional)...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone Column</label>
                                    <select 
                                        className="w-full p-2 border border-slate-300 rounded-md"
                                        value={columnMapping.phone}
                                        onChange={e => setColumnMapping({...columnMapping, phone: e.target.value})}
                                    >
                                        <option value="">Select Column (Optional)...</option>
                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                                
                                {event.formFields && event.formFields.length > 0 && (
                                    <div className="pt-2 border-t border-slate-200 mt-2">
                                        <p className="text-xs font-bold text-slate-500 uppercase mb-3">Custom Fields</p>
                                        <div className="space-y-3">
                                            {event.formFields.map(field => (
                                                <div key={field.id}>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">{field.label}</label>
                                                    <select 
                                                        className="w-full p-2 border border-slate-300 rounded-md"
                                                        value={customFieldMapping[field.id] || ''}
                                                        onChange={e => setCustomFieldMapping({...customFieldMapping, [field.id]: e.target.value})}
                                                    >
                                                        <option value="">Ignore Column...</option>
                                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                                <div className="bg-slate-100 px-4 py-2 text-xs font-semibold uppercase text-slate-500">Preview (First 5 Rows)</div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-white border-b border-slate-200">
                                            <tr>
                                                {csvHeaders.map(h => <th key={h} className="px-4 py-2 text-left text-slate-500 font-medium">{h}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {csvPreview.map((row, i) => (
                                                <tr key={i} className="border-b border-slate-100 last:border-0">
                                                    {csvHeaders.map(h => <td key={h} className="px-4 py-2 text-slate-700">{row[h]}</td>)}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            
                            <button 
                                onClick={executeImport}
                                disabled={!columnMapping.name}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ArrowRight size={18} /> Import Guests
                            </button>
                        </div>
                    )}
                    
                    {uploadStatus && (
                        <p className={`mt-4 text-sm font-medium text-center ${uploadStatus.includes('Error') || uploadStatus.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
                            {uploadStatus}
                        </p>
                    )}
                </div>
            )}

            {activeTab === 'settings' && (
                <div className="max-w-3xl mx-auto">
                     {/* Settings form JSX remains mostly unchanged, relies on async handleUpdateEvent */}
                     <form onSubmit={handleUpdateEvent} className="space-y-6">
                        <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <Settings size={20} /> Event Details
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Event Name</label>
                                    <input 
                                        type="text" 
                                        value={editForm.name || ''} 
                                        onChange={e => setEditForm({...editForm, name: e.target.value})}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                                    <input 
                                        type="date" 
                                        value={editForm.date || ''} 
                                        onChange={e => setEditForm({...editForm, date: e.target.value})}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                                <input 
                                    type="text" 
                                    value={editForm.location || ''} 
                                    onChange={e => setEditForm({...editForm, location: e.target.value})}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500"
                                />
                            </div>
                            
                            <div className="mt-4 pt-4 border-t border-slate-200">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Event Status</label>
                                <select 
                                    value={editForm.status || 'active'}
                                    onChange={e => setEditForm({...editForm, status: e.target.value as 'active' | 'completed'})}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 bg-white"
                                >
                                    <option value="active">Active (Ongoing)</option>
                                    <option value="completed">Completed (Archived)</option>
                                </select>
                            </div>
                        </div>

                        {/* ... (Other settings sections: Branding, Form Builder, Email, Volunteer Access, Danger Zone) ... */}
                        {/* They bind to `editForm` state which is populated async, so no major JSX change needed except ensuring logic handles it */}
                        <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <ImageIcon size={20} /> Branding & Design
                            </h3>
                            {/* ... (Existing branding inputs) ... */}
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Logo</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="file" 
                                            accept="image/*"
                                            onChange={(e) => handleImageUpload(e, 'logoUrl')}
                                            className="w-full text-sm text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                        />
                                        {editForm.logoUrl && <img src={editForm.logoUrl} alt="Preview" className="h-8 w-8 object-contain" />}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Flyer/Banner</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="file" 
                                            accept="image/*"
                                            onChange={(e) => handleImageUpload(e, 'flyerUrl')}
                                            className="w-full text-sm text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                        />
                                        {editForm.flyerUrl && <img src={editForm.flyerUrl} alt="Preview" className="h-8 w-8 object-cover" />}
                                    </div>
                                </div>
                            </div>
                            {/* ... (Rest of branding) ... */}
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Badge Layout</label>
                                    <select 
                                        value={editForm.idCardLayout || 'standard'}
                                        onChange={e => setEditForm({...editForm, idCardLayout: e.target.value as any})}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 bg-white"
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
                                            value={editForm.idCardColor || '#000000'}
                                            onChange={e => setEditForm({...editForm, idCardColor: e.target.value})}
                                            className="h-10 w-20 p-1 border border-slate-300 rounded-lg cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                         <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900 mb-4">Registration Form Builder</h3>
                             <div className="space-y-3 mb-4">
                                {editForm.formFields?.map((field) => (
                                    <div key={field.id} className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200">
                                        <div className="flex-1 font-medium">{field.label}</div>
                                        <div className="text-xs text-slate-500 uppercase">{field.type}</div>
                                        <button 
                                            type="button"
                                            onClick={() => removeFormField(field.id)}
                                            className="text-red-500 hover:bg-red-50 p-1 rounded"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}
                                {(!editForm.formFields || editForm.formFields.length === 0) && (
                                    <p className="text-sm text-slate-500 italic">No custom fields added. Default fields (Name, Email) are always included.</p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="Field Label (e.g. Company)"
                                    value={newFieldLabel}
                                    onChange={e => setNewFieldLabel(e.target.value)}
                                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500"
                                />
                                <button 
                                    type="button"
                                    onClick={addFormField}
                                    disabled={!newFieldLabel}
                                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-medium disabled:opacity-50"
                                >
                                    <Plus size={18} /> Add
                                </button>
                            </div>
                        </div>

                        {/* Email Invite Section */}
                         <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-lg font-bold text-slate-900">Email Invitation</h3>
                              <button
                                type="button"
                                onClick={() => setShowEmailSettings(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                              >
                                <Mail size={16} />
                                Configure Email Service
                              </button>
                            </div>
                            
                            <div className="mb-4">
                                <label className="flex items-center gap-3 p-3 bg-white border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                                    <input 
                                        type="checkbox"
                                        checked={editForm.autoSendEmail || false}
                                        onChange={e => setEditForm({...editForm, autoSendEmail: e.target.checked})}
                                        className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                                    />
                                    <div>
                                        <span className="block text-sm font-medium text-slate-900">Auto-send Ticket Email</span>
                                        <span className="block text-xs text-slate-500">Automatically send ticket to guests upon public registration</span>
                                    </div>
                                </label>
                            </div>

                            <label className="block text-sm font-medium text-slate-700 mb-1">Custom Message</label>
                            <textarea 
                                value={editForm.emailMessage || ''}
                                onChange={e => setEditForm({...editForm, emailMessage: e.target.value})}
                                placeholder="We are excited to see you..."
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 h-24"
                            />

                            <div className="mt-4 flex items-center gap-3">
                              <input
                                id="autoPrintOnScan"
                                type="checkbox"
                                checked={!!editForm.autoPrintOnScan}
                                onChange={e => setEditForm({ ...editForm, autoPrintOnScan: e.target.checked })}
                                className="w-4 h-4 border border-slate-300 rounded"
                              />
                              <label htmlFor="autoPrintOnScan" className="text-sm text-slate-700">Auto print ID card after successful scan</label>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                              <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg">
                                <input
                                  type="checkbox"
                                  checked={!!editForm.idCardShowEmail}
                                  onChange={e => setEditForm({ ...editForm, idCardShowEmail: e.target.checked })}
                                  className="w-4 h-4 border border-slate-300 rounded"
                                />
                                <span className="text-sm text-slate-700">Show guest email on ID card</span>
                              </label>
                              <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg">
                                <input
                                  type="checkbox"
                                  checked={editForm.idCardShowEventDate !== false}
                                  onChange={e => setEditForm({ ...editForm, idCardShowEventDate: e.target.checked })}
                                  className="w-4 h-4 border border-slate-300 rounded"
                                />
                                <span className="text-sm text-slate-700">Show event date on ID card</span>
                              </label>
                            </div>

                            <div className="mt-6">
                              <label className="block text-sm font-medium text-slate-700 mb-1">Advanced: Email Template (HTML)</label>
                              <textarea
                                value={editForm.emailTemplateHtml || ''}
                                onChange={e => setEditForm({ ...editForm, emailTemplateHtml: e.target.value })}
                                placeholder="Paste full HTML. Supported placeholders: {{guest.name}}, {{guest.email}}, {{event.name}}, {{event.date}}, {{event.location}}, {{event.description}}, {{event.logoUrl}}, {{event.flyerUrl}}, {{message}}, {{qrCode}}, {{qrImage}}"
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 h-40 font-mono text-xs"
                              />
                              <p className="text-xs text-slate-500 mt-1">Leave blank to use the default template.</p>
                            </div>
                        </div>

                         <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900 mb-4">Volunteer Access</h3>
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Access Code</label>
                                    <input 
                                        type="text" 
                                        value={editForm.volunteerPassword || ''} 
                                        onChange={e => setEditForm({...editForm, volunteerPassword: e.target.value})}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 font-mono"
                                    />
                                </div>
                                <div className="flex-1 text-sm text-slate-500 pt-6">
                                    This code is required for volunteers to log in to the scanner app.
                                </div>
                            </div>
                        </div>

                        {/* Danger Zone */}
                        <div className="bg-red-50 p-6 rounded-lg border border-red-200 mt-8">
                             <h3 className="text-lg font-bold text-red-900 mb-4 flex items-center gap-2">
                                <Activity size={20} /> Danger Zone
                            </h3>
                             <div className="flex flex-col gap-3">
                                <div className="flex justify-between items-center bg-white p-3 rounded border border-red-100">
                                    <div>
                                        <p className="font-medium text-red-900">Clear Guest List</p>
                                        <p className="text-xs text-red-600">Remove all guests but keep event details.</p>
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={handleClearGuests}
                                        className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium text-sm"
                                    >
                                        Clear Guests
                                    </button>
                                </div>
                                
                                <div className="flex justify-between items-center bg-white p-3 rounded border border-red-100">
                                    <div>
                                        <p className="font-medium text-red-900">Delete Event</p>
                                        <p className="text-xs text-red-600">Permanently remove this event and all data.</p>
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={handleDeleteEvent}
                                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-medium text-sm"
                                    >
                                        Delete Event
                                    </button>
                                </div>
                             </div>
                        </div>

                        <div className="flex justify-end pt-4">
                             <button 
                                type="submit" 
                                disabled={isSaving}
                                className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex items-center gap-2"
                             >
                                {isSaving ? 'Saving...' : <><Save size={18} /> Save Changes</>}
                             </button>
                        </div>
                     </form>
                </div>
            )}
        </div>
      </div>
      
      <EmailSettings 
        isOpen={showEmailSettings} 
        onClose={() => setShowEmailSettings(false)} 
      />
    </Layout>
  );
};
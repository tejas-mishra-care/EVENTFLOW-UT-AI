
import React from 'react';
import SafeQRCode from './SafeQRCode';
import { Guest, Event } from '../types';

interface IDCardProps {
  guest: Guest;
  event: Event;
}

export const IDCard: React.FC<IDCardProps> = ({ guest, event }) => {
  const accentColor = event.idCardColor || '#000000';
  const layout = event.idCardLayout || 'standard';
  const showEmail = !!event.idCardShowEmail;
  const showEventDate = event.idCardShowEventDate !== false;

  // Helper to validate QR code values
  const isValidQRValue = (value: string | undefined): boolean => {
    return typeof value === 'string' && value.trim().length > 0;
  };

  // Safety check - don't render if qrCode is missing
  if (!isValidQRValue(guest.qrCode)) {
    return <div className="print-only hidden flex items-center justify-center h-screen bg-gray-100 p-4 text-gray-600">Missing guest ID data</div>;
  }

  // Template helpers for custom HTML
  const escapeHtml = (input: string | undefined | null) => {
    const s = String(input ?? '');
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const renderCustomTemplate = (tpl: string) => {
    const qrImg = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
      guest.qrCode
    )}" alt="QR Code" style="width: 150px; height: 150px;" />`;

    let html = tpl
      .replace(/{{\s*guest\.name\s*}}/g, escapeHtml(guest.name))
      .replace(/{{\s*guest\.email\s*}}/g, escapeHtml(guest.email))
      .replace(/{{\s*guest\.phone\s*}}/g, escapeHtml(guest.phone || ''))
      .replace(/{{\s*guest\.id\s*}}/g, escapeHtml(guest.id || ''))
      .replace(/{{\s*event\.name\s*}}/g, escapeHtml(event.name))
      .replace(/{{\s*event\.date\s*}}/g, escapeHtml(event.date))
      .replace(/{{\s*event\.location\s*}}/g, escapeHtml(event.location))
      .replace(/{{\s*event\.description\s*}}/g, escapeHtml(event.description))
      .replace(/{{\s*event\.logoUrl\s*}}/g, escapeHtml(event.logoUrl || ''))
      .replace(/{{\s*event\.flyerUrl\s*}}/g, escapeHtml(event.flyerUrl || ''))
      .replace(/{{\s*qrCode\s*}}/g, escapeHtml(guest.qrCode))
      .replace(/{{\s*qrImage\s*}}/g, qrImg)
      .replace(/{{\s*message\s*}}/g, escapeHtml((event as any).emailMessage || ''));

    // Dynamic custom fields: {{custom.<Label>}}
    html = html.replace(/{{\s*custom\.([^}]+)\s*}}/g, (_m, keyRaw) => {
      const key = String(keyRaw || '').trim();
      const val = (guest.customData && guest.customData[key]) ? guest.customData[key] : '';
      return escapeHtml(val || '');
    });

    return html;
  };

  // If a custom HTML template is provided for ID cards, use it
  if ((event as any).idCardTemplateHtml && (event as any).idCardTemplateHtml.trim()) {
    const html = renderCustomTemplate((event as any).idCardTemplateHtml);
    return (
      <div className="print-only hidden flex items-center justify-center h-screen bg-gray-100">
        <div className="shadow-none" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    );
  }

  // Common hole punch
  const HolePunch = () => (
    <div className="w-4 h-4 rounded-full bg-gray-200 border border-gray-400 absolute top-4 left-1/2 -translate-x-1/2 z-10"></div>
  );

  if (layout === 'modern') {
    return (
        <div className="print-only hidden flex items-center justify-center h-screen bg-gray-100">
            <div className="w-[300px] h-[450px] border border-gray-300 bg-white relative flex shadow-none overflow-hidden">
                <HolePunch />
                {/* Sidebar */}
                <div className="w-16 h-full flex flex-col items-center py-6 text-white" style={{ backgroundColor: accentColor }}>
                     <div className="mt-8 mb-auto text-xl font-bold rotate-180" style={{ writingMode: 'vertical-rl' }}>
                        {event.name}
                     </div>
                     {showEventDate && (
                       <div className="text-xs rotate-180 mt-4 opacity-75" style={{ writingMode: 'vertical-rl' }}>
                          {event.date}
                       </div>
                     )}
                </div>
                
                {/* Main Content */}
                <div className="flex-1 flex flex-col items-center p-4 pt-12 text-center relative">
                    {event.logoUrl && (
                        <img src={event.logoUrl} alt="Logo" className="h-16 w-16 object-contain mb-6" />
                    )}
                    
                    <div className="flex-1 flex flex-col justify-center">
                        <h1 className="text-2xl font-black text-slate-900 mb-1 leading-tight break-words">
                            {guest.name}
                        </h1>
                        <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Guest</p>
                        {showEmail && (
                          <p className="text-xs text-slate-500 mt-1 break-words">{guest.email}</p>
                        )}
                        
                        {guest.customData && Object.values(guest.customData)[0] && (
                           <div className="mt-4 pt-4 border-t border-gray-100">
                                <p className="text-sm font-bold text-slate-700">{Object.values(guest.customData)[0]}</p>
                           </div>
                        )}
                    </div>

                    <div className="mt-auto pt-4">
                        {isValidQRValue(guest.qrCode) && (
                          <SafeQRCode value={guest.qrCode} size={90} />
                        )}
                        <p className="text-[9px] text-gray-400 mt-1 font-mono">{guest.id}</p>
                    </div>
                </div>
            </div>
        </div>
    );
  }

  if (layout === 'minimal') {
    return (
        <div className="print-only hidden flex items-center justify-center h-screen bg-gray-100">
             <div className="w-[300px] h-[450px] border-4 bg-white relative flex flex-col items-center p-8 shadow-none" style={{ borderColor: accentColor }}>
                <HolePunch />
                
                <div className="mt-8 text-center border-b-2 pb-4 w-full" style={{ borderColor: accentColor }}>
                    <h2 className="text-lg font-bold uppercase tracking-tight leading-none">{event.name}</h2>
                </div>

                <div className="flex-1 flex flex-col justify-center text-center w-full">
                    <h1 className="text-4xl font-black text-slate-900 mb-2 break-words">
                        {guest.name.split(' ')[0]}
                    </h1>
                    <h2 className="text-xl text-slate-600 mb-6">
                        {guest.name.split(' ').slice(1).join(' ')}
                    </h2>
                    
                    <div className="px-4 py-1 bg-gray-100 rounded-full inline-block mx-auto text-xs font-bold uppercase tracking-widest text-gray-600">
                        Verified Guest
                    </div>
                    {showEmail && (
                      <p className="text-[10px] text-gray-500 mt-2 break-words">{guest.email}</p>
                    )}
                </div>

                <div className="mt-auto">
                    {isValidQRValue(guest.qrCode) && (
                      <SafeQRCode value={guest.qrCode} size={100} />
                    )}
                </div>
             </div>
        </div>
    );
  }

  // Standard Layout (Default)
  return (
    <div className="print-only hidden flex items-center justify-center h-screen bg-gray-100">
      <div className="w-[300px] h-[450px] border-2 border-black bg-white relative flex flex-col items-center text-center p-6 shadow-none">
        <HolePunch />
        
        <div className="mt-8 mb-4">
             {event.logoUrl ? (
                 <img src={event.logoUrl} alt="Logo" className="h-16 object-contain" />
             ) : (
                <div 
                  className="h-16 w-16 rounded-full flex items-center justify-center text-white font-bold text-xl"
                  style={{ backgroundColor: accentColor }}
                >
                    {event.name.substring(0,2).toUpperCase()}
                </div>
             )}
        </div>

        <h2 className="text-xl font-bold uppercase tracking-wide mb-1 leading-tight">{event.name}</h2>
        {showEventDate && (
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-8">{event.date}</p>
        )}

        <div className="flex-1 flex flex-col justify-center w-full">
            <h1 className="text-3xl font-black text-slate-900 mb-2 break-words leading-tight">
                {guest.name}
            </h1>
            <span 
              className="inline-block text-white px-4 py-1 text-sm font-bold uppercase tracking-wider rounded-full mx-auto"
              style={{ backgroundColor: accentColor }}
            >
                Guest
            </span>
            {guest.customData && Object.values(guest.customData)[0] && (
               <p className="text-sm text-gray-500 mt-2 font-medium">{Object.values(guest.customData)[0]}</p>
            )}
            {showEmail && (
              <p className="text-xs text-gray-500 mt-2 break-words">{guest.email}</p>
            )}
        </div>

        <div className="mt-auto mb-4">
             <div className="p-2 bg-white border border-gray-200 rounded-lg">
                {isValidQRValue(guest.qrCode) && (
                  <SafeQRCode value={guest.qrCode} size={80} />
                )}
             </div>
             <p className="text-[10px] text-gray-400 mt-2 font-mono">{guest.id}</p>
        </div>
      </div>
    </div>
  );
};

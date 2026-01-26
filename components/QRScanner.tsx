
import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { AlertCircle, CheckCircle, Lock } from 'lucide-react';

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  isPaused: boolean;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScan, isPaused }) => {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const divId = "reader";
  const [isSecure, setIsSecure] = useState(true);

  useEffect(() => {
    // Check for HTTPS
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        setIsSecure(false);
        setError("Camera requires HTTPS. Please deploy to a secure host.");
        return;
    }

    // Small timeout to ensure DOM is ready and prevent double-init in Strict Mode
    const initTimer = setTimeout(() => {
        if (!scannerRef.current) {
          try {
            const scanner = new Html5QrcodeScanner(
                divId,
                { 
                  fps: 10, 
                  qrbox: { width: 250, height: 250 },
                  aspectRatio: 1.0,
                  showTorchButtonIfSupported: true,
                  disableFlip: false, 
                },
                false // verbose
            );
            
            scanner.render((decodedText) => {
                if (decodedText) {
                    onScan(decodedText);
                }
            }, (errorMessage) => {
                // Ignore parse errors
            });
    
            scannerRef.current = scanner;
          } catch (e) {
            console.error("Scanner init error", e);
            setError("Could not initialize camera. Ensure permissions are granted.");
          }
        }
    }, 100);

    return () => {
      clearTimeout(initTimer);
      if (scannerRef.current) {
        try {
            scannerRef.current.clear().catch(err => console.warn("Scanner clear error", err));
        } catch (e) {
            // ignore cleanup errors
        }
        scannerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  return (
    <div className="w-full max-w-md mx-auto bg-black rounded-xl overflow-hidden shadow-2xl relative">
      <div id={divId} className="w-full h-auto bg-gray-900 min-h-[300px]"></div>
      
      {!isSecure && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-white p-6 text-center z-20">
            <Lock size={48} className="text-red-500 mb-4" />
            <h3 className="text-xl font-bold mb-2">HTTPS Required</h3>
            <p className="text-sm text-gray-300">Modern browsers block camera access on insecure connections. Please deploy to Firebase Hosting or Netlify.</p>
        </div>
      )}

      {error && isSecure && (
        <div className="absolute top-0 left-0 w-full bg-red-500 text-white p-2 text-center text-sm flex items-center justify-center gap-2 z-10">
            <AlertCircle size={16} /> {error}
        </div>
      )}
      
      <div className="bg-gray-800 p-4 text-center">
        <p className="text-gray-400 text-sm">
            {isPaused 
                ? <span className="text-yellow-400 flex items-center justify-center gap-2"><CheckCircle size={16}/> Processing Scan...</span> 
                : "Point camera at a Guest QR Code"}
        </p>
      </div>
    </div>
  );
};

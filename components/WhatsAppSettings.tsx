import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Eye, EyeOff, Loader2, MessageCircle, Save } from 'lucide-react';
import { getCurrentUser } from '../services/db';
import { connectWhatsAppEmbeddedSignup, disconnectWhatsApp, getWhatsAppConfig, saveWhatsAppConfig, WhatsAppConfig } from '../services/whatsapp';
import { useToast } from './Toast';

const DEFAULT_FACEBOOK_APP_ID = '886335484250614';
const DEFAULT_FACEBOOK_CONFIG_ID = '894629519760688';

interface WhatsAppSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppSettings: React.FC<WhatsAppSettingsProps> = ({ isOpen, onClose }) => {
  const { addToast } = useToast();
  const user = getCurrentUser();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const editingRef = useRef(false);

  const [config, setConfig] = useState<WhatsAppConfig>({
    provider: 'none',
    phoneNumberId: '',
    accessToken: '',
    businessAccountId: '',
  });

  const fbSdkLoadingRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (isOpen && user) {
      editingRef.current = false;
      loadConfig();
    }
  }, [isOpen, user]);

  const loadConfig = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const saved = await getWhatsAppConfig(user.id);
      if (saved && !editingRef.current) {
        setConfig({
          provider: saved.provider || 'none',
          phoneNumberId: saved.phoneNumberId || '',
          accessToken: saved.accessToken || '',
          businessAccountId: saved.businessAccountId || '',
          whatsappName: (saved as any).whatsappName || '',
          displayPhoneNumber: (saved as any).displayPhoneNumber || '',
        });
      }
    } catch (e) {
      console.error('Failed to load WhatsApp config:', e);
    } finally {
      setLoading(false);
    }
  };

  const ensureFacebookSdk = async () => {
    const w = window as any;
    if (w.FB && typeof w.FB.init === 'function') return;

    if (fbSdkLoadingRef.current) {
      await fbSdkLoadingRef.current;
      return;
    }

    fbSdkLoadingRef.current = new Promise<void>((resolve, reject) => {
      try {
        const existing = document.getElementById('facebook-jssdk');
        if (existing) {
          resolve();
          return;
        }

        w.fbAsyncInit = function () {
          try {
            w.FB.init({
              appId: String(import.meta.env.VITE_FACEBOOK_APP_ID || DEFAULT_FACEBOOK_APP_ID),
              cookie: true,
              xfbml: false,
              version: 'v22.0',
            });
            resolve();
          } catch (e) {
            reject(e);
          }
        };

        const js = document.createElement('script');
        js.id = 'facebook-jssdk';
        js.src = 'https://connect.facebook.net/en_US/sdk.js';
        js.async = true;
        js.defer = true;
        js.onerror = () => reject(new Error('Failed to load Facebook SDK'));
        document.body.appendChild(js);
      } catch (e) {
        reject(e);
      }
    });

    await fbSdkLoadingRef.current;
  };

  const handleConnectEmbeddedSignup = async () => {
    if (!user) return;
    const appId = String(import.meta.env.VITE_FACEBOOK_APP_ID || DEFAULT_FACEBOOK_APP_ID).trim();
    const configId = String(import.meta.env.VITE_FACEBOOK_CONFIG_ID || DEFAULT_FACEBOOK_CONFIG_ID).trim();
    if (!appId || !configId) {
      addToast('Missing WhatsApp connect configuration (VITE_FACEBOOK_APP_ID / VITE_FACEBOOK_CONFIG_ID).', 'error');
      return;
    }

    setConnecting(true);
    try {
      await ensureFacebookSdk();
      const w = window as any;
      const resp: any = await new Promise((resolve) => {
        w.FB.login(
          (r: any) => resolve(r),
          {
            config_id: configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: { setup: { feature: 'whatsapp_embedded_signup' } },
          }
        );
      });

      const code = String(resp?.authResponse?.code || '').trim();
      if (!code) {
        addToast('WhatsApp connection was cancelled or no code was returned.', 'error');
        return;
      }

      const res = await connectWhatsAppEmbeddedSignup(code);
      if (!res.success) {
        addToast(res.message || 'Failed to connect WhatsApp', 'error');
        return;
      }

      if (res.config) {
        setConfig({
          provider: res.config.provider || 'meta',
          phoneNumberId: res.config.phoneNumberId || '',
          accessToken: res.config.accessToken || '',
          businessAccountId: res.config.businessAccountId || '',
          whatsappName: (res.config as any).whatsappName || '',
          displayPhoneNumber: (res.config as any).displayPhoneNumber || '',
        });
      } else {
        await loadConfig();
      }

      editingRef.current = false;
      addToast('WhatsApp connected successfully!', 'success');
    } catch (e: any) {
      console.error('Embedded signup connect failed:', e);
      addToast(e?.message || 'Failed to connect WhatsApp', 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user) return;
    if (!window.confirm('Disconnect WhatsApp for this account?')) return;
    setConnecting(true);
    try {
      await disconnectWhatsApp(user.id);
      await loadConfig();
      addToast('WhatsApp disconnected.', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Failed to disconnect WhatsApp', 'error');
    } finally {
      setConnecting(false);
    }
  };

  const isMetaConfigured =
    config.provider === 'meta' &&
    !!(config.phoneNumberId || '').trim() &&
    !!(config.accessToken || '').trim() &&
    !!(config.businessAccountId || '').trim();

  const statusText =
    config.provider === 'none'
      ? 'Disabled'
      : isMetaConfigured
        ? 'Connected'
        : 'Not Configured';

  const connectedSubtext =
    isMetaConfigured && (config.whatsappName || config.displayPhoneNumber)
      ? `Connected to ${String(config.whatsappName || 'WhatsApp').trim()}${config.displayPhoneNumber ? ` (${String(config.displayPhoneNumber).trim()})` : ''}`
      : null;

  const handleSave = async () => {
    if (!user) return;

    if (config.provider === 'meta') {
      if (!config.phoneNumberId || !config.phoneNumberId.trim()) {
        addToast('Please enter your Meta Phone Number ID', 'error');
        return;
      }
      if (!config.accessToken || !config.accessToken.trim()) {
        addToast('Please enter your Meta Permanent Access Token', 'error');
        return;
      }
      if (!config.businessAccountId || !config.businessAccountId.trim()) {
        addToast('Please enter your Meta Business Account ID', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      const cleaned: WhatsAppConfig = {
        ...config,
        phoneNumberId: (config.phoneNumberId || '').trim(),
        accessToken: (config.accessToken || '').trim(),
        businessAccountId: (config.businessAccountId || '').trim(),
      };
      await saveWhatsAppConfig(user.id, cleaned);
      editingRef.current = false;
      addToast('WhatsApp settings saved successfully!', 'success');
      onClose();
    } catch (e: any) {
      addToast(e.message || 'Failed to save WhatsApp settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center">
              <MessageCircle size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">WhatsApp Configuration</h2>
              <p className="text-xs text-slate-500">Send event updates and tickets directly to mobile.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl">
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center justify-between">
            <div className="text-sm text-slate-700">
              <div className="font-semibold text-slate-900">Status</div>
              <div className="text-xs text-slate-600">{connectedSubtext || statusText}</div>
            </div>
            <div className="flex items-center gap-2">
              {config.provider !== 'none' && isMetaConfigured ? (
                <>
                  <CheckCircle size={18} className="text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">Connected</span>
                </>
              ) : (
                <>
                  <AlertCircle size={18} className="text-red-600" />
                  <span className="text-sm font-medium text-red-700">
                    {config.provider === 'none' ? 'Disabled' : 'Not Configured'}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleConnectEmbeddedSignup}
              disabled={connecting}
              className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold transition-colors disabled:opacity-50"
            >
              {connecting ? 'Connecting...' : 'Connect WhatsApp (Embedded Signup)'}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={connecting || !isMetaConfigured}
              className="px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 font-semibold transition-colors disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-3">Provider</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() => setConfig({ ...config, provider: 'meta' })}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  config.provider === 'meta'
                    ? 'border-emerald-600 bg-emerald-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className="font-semibold text-slate-900">Meta Cloud API</p>
                <p className="text-xs text-slate-600 mt-1">Lowest cost</p>
                <p className="text-xs text-emerald-700 font-medium mt-1">Recommended</p>
              </button>

              <button
                onClick={() => setConfig({ ...config, provider: 'twilio' })}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  config.provider === 'twilio'
                    ? 'border-emerald-600 bg-emerald-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className="font-semibold text-slate-900">Twilio</p>
                <p className="text-xs text-slate-600 mt-1">Easier setup, higher cost</p>
                <p className="text-xs text-amber-600 font-medium mt-1">Not Implemented</p>
              </button>

              <button
                onClick={() => setConfig({ ...config, provider: 'none' })}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  config.provider === 'none'
                    ? 'border-emerald-600 bg-emerald-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className="font-semibold text-slate-900">Disabled</p>
                <p className="text-xs text-slate-600 mt-1">No WhatsApp messages sent</p>
              </button>
            </div>
          </div>

          {config.provider === 'meta' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number ID *</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  placeholder="Enter ID from Meta Dashboard"
                  autoComplete="off"
                  value={config.phoneNumberId || ''}
                  onChange={(e) => {
                    editingRef.current = true;
                    setConfig({ ...config, phoneNumberId: e.target.value });
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Permanent Access Token *</label>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-mono text-sm"
                    placeholder="Enter Token"
                    autoComplete="new-password"
                    value={config.accessToken || ''}
                    onChange={(e) => {
                      editingRef.current = true;
                      setConfig({ ...config, accessToken: e.target.value });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Business Account ID *</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  placeholder="Enter Business ID"
                  autoComplete="off"
                  value={config.businessAccountId || ''}
                  onChange={(e) => {
                    editingRef.current = true;
                    setConfig({ ...config, businessAccountId: e.target.value });
                  }}
                />
              </div>
            </div>
          )}

          {config.provider === 'twilio' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
              <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold mb-1">Twilio is not implemented yet</p>
                <p>Select Meta Cloud API to send WhatsApp invites.</p>
              </div>
            </div>
          )}

          {config.provider === 'none' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
              <p className="text-slate-600">WhatsApp sending is disabled.</p>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              Loading...
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 p-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

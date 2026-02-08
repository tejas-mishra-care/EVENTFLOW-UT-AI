import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Eye, EyeOff, Loader2, MessageSquare, Save } from 'lucide-react';
import { getCurrentUser } from '../services/db';
import { getSmsConfig, saveSmsConfig, SmsConfig } from '../services/sms';
import { useToast } from './Toast';

interface SmsSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SmsSettings: React.FC<SmsSettingsProps> = ({ isOpen, onClose }) => {
  const { addToast } = useToast();
  const user = getCurrentUser();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const editingRef = useRef(false);

  const [config, setConfig] = useState<SmsConfig>({
    provider: 'none',
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioFromNumber: '',
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    awsRegion: '',
    awsSenderId: '',
  });

  useEffect(() => {
    if (isOpen && user) {
      editingRef.current = false;
      load();
    }
  }, [isOpen, user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const saved = await getSmsConfig(user.id);
      if (saved && !editingRef.current) {
        setConfig({
          provider: saved.provider || 'none',
          twilioAccountSid: saved.twilioAccountSid || '',
          twilioAuthToken: saved.twilioAuthToken || '',
          twilioFromNumber: saved.twilioFromNumber || '',
          awsAccessKeyId: saved.awsAccessKeyId || '',
          awsSecretAccessKey: saved.awsSecretAccessKey || '',
          awsRegion: saved.awsRegion || '',
          awsSenderId: saved.awsSenderId || '',
        });
      }
    } catch (e) {
      console.error('Failed to load SMS config:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    if (config.provider === 'twilio') {
      if (!config.twilioAccountSid || !config.twilioAccountSid.trim()) {
        addToast('Please enter Twilio Account SID', 'error');
        return;
      }
      if (!config.twilioAuthToken || !config.twilioAuthToken.trim()) {
        addToast('Please enter Twilio Auth Token', 'error');
        return;
      }
      if (!config.twilioFromNumber || !config.twilioFromNumber.trim()) {
        addToast('Please enter Twilio From Number', 'error');
        return;
      }
    }

    if (config.provider === 'aws_sns') {
      if (!config.awsAccessKeyId || !config.awsAccessKeyId.trim()) {
        addToast('Please enter AWS Access Key ID', 'error');
        return;
      }
      if (!config.awsSecretAccessKey || !config.awsSecretAccessKey.trim()) {
        addToast('Please enter AWS Secret Access Key', 'error');
        return;
      }
      if (!config.awsRegion || !config.awsRegion.trim()) {
        addToast('Please enter AWS Region (e.g. ap-south-1)', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      const cleaned: SmsConfig = {
        provider: config.provider,
        twilioAccountSid: (config.twilioAccountSid || '').trim(),
        twilioAuthToken: (config.twilioAuthToken || '').trim(),
        twilioFromNumber: (config.twilioFromNumber || '').trim(),
        awsAccessKeyId: (config.awsAccessKeyId || '').trim(),
        awsSecretAccessKey: (config.awsSecretAccessKey || '').trim(),
        awsRegion: (config.awsRegion || '').trim(),
        awsSenderId: (config.awsSenderId || '').trim(),
      };
      await saveSmsConfig(user.id, cleaned);
      editingRef.current = false;
      addToast('SMS settings saved successfully!', 'success');
      onClose();
    } catch (e: any) {
      addToast(e?.message || 'Failed to save SMS settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const isTwilioConfigured =
    config.provider === 'twilio' &&
    !!(config.twilioAccountSid || '').trim() &&
    !!(config.twilioAuthToken || '').trim() &&
    !!(config.twilioFromNumber || '').trim();

  const isAwsConfigured =
    config.provider === 'aws_sns' &&
    !!(config.awsAccessKeyId || '').trim() &&
    !!(config.awsSecretAccessKey || '').trim() &&
    !!(config.awsRegion || '').trim();

  const statusText =
    config.provider === 'none'
      ? 'Disabled'
      : config.provider === 'twilio'
        ? (isTwilioConfigured ? 'Configured' : 'Not Configured')
        : (isAwsConfigured ? 'Configured' : 'Not Configured');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 text-white rounded-lg flex items-center justify-center">
              <MessageSquare size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">SMS Configuration</h2>
              <p className="text-xs text-slate-500">Configure an SMS provider to message guests by phone.</p>
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
              <div className="text-xs text-slate-600">{statusText}</div>
            </div>
            <div className="flex items-center gap-2">
              {config.provider !== 'none' && (isTwilioConfigured || isAwsConfigured) ? (
                <>
                  <CheckCircle size={18} className="text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">Configured</span>
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

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-3">Provider</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() => setConfig({ ...config, provider: 'twilio' })}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  config.provider === 'twilio'
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className="font-semibold text-slate-900">Twilio</p>
                <p className="text-xs text-slate-600 mt-1">Fastest setup</p>
              </button>

              <button
                onClick={() => setConfig({ ...config, provider: 'aws_sns' })}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  config.provider === 'aws_sns'
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className="font-semibold text-slate-900">AWS SNS</p>
                <p className="text-xs text-slate-600 mt-1">Lower cost at scale</p>
              </button>

              <button
                onClick={() => setConfig({ ...config, provider: 'none' })}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  config.provider === 'none'
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className="font-semibold text-slate-900">Disabled</p>
                <p className="text-xs text-slate-600 mt-1">No SMS will be sent</p>
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowSecrets(!showSecrets)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              {showSecrets ? <EyeOff size={16} /> : <Eye size={16} />}
              {showSecrets ? 'Hide secrets' : 'Show secrets'}
            </button>
          </div>

          {config.provider === 'twilio' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Account SID *</label>
                <input
                  type="text"
                  value={config.twilioAccountSid || ''}
                  onChange={(e) => {
                    editingRef.current = true;
                    setConfig({ ...config, twilioAccountSid: e.target.value });
                  }}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-slate-900"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Auth Token *</label>
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={config.twilioAuthToken || ''}
                  onChange={(e) => {
                    editingRef.current = true;
                    setConfig({ ...config, twilioAuthToken: e.target.value });
                  }}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-slate-900 font-mono text-sm"
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">From Number *</label>
                <input
                  type="text"
                  value={config.twilioFromNumber || ''}
                  onChange={(e) => {
                    editingRef.current = true;
                    setConfig({ ...config, twilioFromNumber: e.target.value });
                  }}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-slate-900"
                  placeholder="+1xxxxxxxxxx"
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          {config.provider === 'aws_sns' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Access Key ID *</label>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={config.awsAccessKeyId || ''}
                    onChange={(e) => {
                      editingRef.current = true;
                      setConfig({ ...config, awsAccessKeyId: e.target.value });
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-slate-900 font-mono text-sm"
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Secret Access Key *</label>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={config.awsSecretAccessKey || ''}
                    onChange={(e) => {
                      editingRef.current = true;
                      setConfig({ ...config, awsSecretAccessKey: e.target.value });
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-slate-900 font-mono text-sm"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Region *</label>
                  <input
                    type="text"
                    value={config.awsRegion || ''}
                    onChange={(e) => {
                      editingRef.current = true;
                      setConfig({ ...config, awsRegion: e.target.value });
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-slate-900"
                    placeholder="ap-south-1"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sender ID (optional)</label>
                  <input
                    type="text"
                    value={config.awsSenderId || ''}
                    onChange={(e) => {
                      editingRef.current = true;
                      setConfig({ ...config, awsSenderId: e.target.value });
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:border-slate-900"
                    placeholder="EVENTFLOW"
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          )}

          {config.provider === 'none' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
              <p className="text-slate-600">SMS sending is disabled.</p>
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
            className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-black font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
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

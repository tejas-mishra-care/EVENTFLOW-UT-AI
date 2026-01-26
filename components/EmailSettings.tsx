import React, { useState, useEffect, useRef } from 'react';
import { getEmailConfig, saveEmailConfig, EmailConfig, sendEmail } from '../services/email';
import { getCurrentUser } from '../services/db';
import { Mail, Save, AlertCircle, CheckCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useToast } from './Toast';

interface EmailSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EmailSettings: React.FC<EmailSettingsProps> = ({ isOpen, onClose }) => {
  const { addToast } = useToast();
  const user = getCurrentUser();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const editingRef = useRef(false);
  const [testEmail, setTestEmail] = useState(user?.email || '');
  const [sendingTest, setSendingTest] = useState(false);
  const [config, setConfig] = useState<EmailConfig>({
    provider: 'none',
    apiKey: '',
    fromEmail: '',
    smtpHost: '',
    smtpPort: 587,
    smtpUsername: '',
    smtpPassword: '',
    useTLS: true,
  });

  useEffect(() => {
    if (isOpen && user) {
      // reset edit flag at open to allow one fresh load
      editingRef.current = false;
      loadConfig();
    }
  }, [isOpen, user]);

  const loadConfig = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const savedConfig = await getEmailConfig(user.id);
      if (savedConfig && !editingRef.current) {
        setConfig(savedConfig);
      }
    } catch (error) {
      console.error('Failed to load email config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    if (config.provider === 'resend' && !config.apiKey) {
      addToast('Please enter your Resend API key', 'error');
      return;
    }

    if (config.provider === 'smtp' && (!config.smtpHost || !config.smtpPort)) {
      addToast('Please enter SMTP server details', 'error');
      return;
    }

    if (!config.fromEmail) {
      addToast('Please enter a "From" email address', 'error');
      return;
    }

    setSaving(true);
    try {
      const cleaned: EmailConfig = {
        ...config,
        fromEmail: (config.fromEmail || '').trim(),
        smtpHost: (config.smtpHost || '').trim(),
        smtpUsername: (config.smtpUsername || '').trim(),
        apiKey: (config.apiKey || '').trim(),
      };
      await saveEmailConfig(user.id, cleaned);
      editingRef.current = false;
      addToast('Email settings saved successfully!', 'success');
      onClose();
    } catch (error: any) {
      addToast(error.message || 'Failed to save email settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!user) return;

    // Basic validation
    if (config.provider === 'resend' && !config.apiKey) {
      addToast('Resend API key is required to send test emails', 'error');
      return;
    }

    if (!config.fromEmail) {
      addToast('Please enter a valid "From" email before testing', 'error');
      return;
    }

    if (!testEmail || !testEmail.includes('@')) {
      addToast('Please enter a valid recipient email for the test', 'error');
      return;
    }

    setSendingTest(true);
    try {
      const subject = 'EventFlow — Test Email';
      const html = `<p>This is a test email from EventFlow to verify your email settings.</p><p>If you received this, your settings are correct.</p>`;

      const result = await sendEmail(testEmail, subject, html, user.id, config.fromEmail);

      if (result.success) {
        addToast(`Test email sent: ${result.message}`, 'success');
      } else {
        addToast(`Test failed: ${result.message}`, 'error');
      }
    } catch (e: any) {
      console.error('Test send error:', e);
      addToast(e?.message || 'Unexpected error while sending test email', 'error');
    } finally {
      setSendingTest(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
              <Mail size={20} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Email Configuration</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
            <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">No Email Service Configured</p>
              <p>Choose an email provider below. Your guests won't receive invites until you set this up.</p>
            </div>
          </div>

          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-3">
              Email Provider
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() => setConfig({ ...config, provider: 'resend' })}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  config.provider === 'resend'
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className="font-semibold text-slate-900">Resend</p>
                <p className="text-xs text-slate-600 mt-1">100/day limit</p>
                <p className="text-xs text-green-600 font-medium mt-1">Recommended</p>
              </button>

              <button
                onClick={() => setConfig({ ...config, provider: 'smtp' })}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  config.provider === 'smtp'
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className="font-semibold text-slate-900">SMTP</p>
                <p className="text-xs text-slate-600 mt-1">Gmail, Outlook, etc.</p>
                <p className="text-xs text-amber-600 font-medium mt-1">Standard</p>
              </button>

              <button
                onClick={() => setConfig({ ...config, provider: 'none' })}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  config.provider === 'none'
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className="font-semibold text-slate-900">Disabled</p>
                <p className="text-xs text-slate-600 mt-1">No emails sent</p>
              </button>
            </div>
          </div>

          {/* From Email (Always Required) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              "From" Email Address *
            </label>
            <input
              type="email"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="noreply@yourcompany.com"
              autoComplete="off"
              value={config.fromEmail}
              onChange={(e) => { editingRef.current = true; setConfig({ ...config, fromEmail: e.target.value }); }}
            />
            <p className="text-xs text-slate-500 mt-1">This will appear as the sender in guest emails. Use a sender like <span className="font-medium">name@eventflow.bharatsdev.com</span>.</p>
          </div>

          {/* Resend Configuration */}
          {config.provider === 'resend' && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle size={20} className="text-green-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-slate-900">Getting Started with Resend</p>
                  <ol className="text-slate-700 mt-2 space-y-1 ml-4">
                    <li>1. Sign up at <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">resend.com</a></li>
                    <li>2. Go to API Keys section</li>
                    <li>3. Create a new API key</li>
                    <li>4. Paste it below</li>
                  </ol>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Resend API Key *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono text-sm"
                    placeholder="re_xxxxxxxxxxxxxxxxxx"
                    autoComplete="new-password"
                    value={config.apiKey || ''}
                    onChange={(e) => { editingRef.current = true; setConfig({ ...config, apiKey: e.target.value }); }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">Your API key is stored securely in your database</p>
              </div>
            </div>
          )}

          {/* SMTP Configuration */}
          {config.provider === 'smtp' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4">
              <div className="flex items-start gap-3 mb-4">
                <AlertCircle size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-slate-900">SMTP Setup Examples</p>
                  <ul className="text-slate-700 mt-2 space-y-1 text-xs ml-4">
                    <li><strong>Gmail:</strong> smtp.gmail.com:587 (App Password required)</li>
                    <li><strong>Outlook:</strong> smtp-mail.outlook.com:587</li>
                    <li><strong>Custom:</strong> Your email provider's SMTP server</li>
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    SMTP Host *
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    placeholder="smtp.gmail.com"
                    value={config.smtpHost || ''}
                    onChange={(e) => { editingRef.current = true; setConfig({ ...config, smtpHost: e.target.value }); }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Port *
                  </label>
                  <input
                    type="number"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    placeholder="587"
                    value={config.smtpPort || 587}
                    onChange={(e) => { editingRef.current = true; setConfig({ ...config, smtpPort: parseInt(e.target.value) }); }}
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-3">
                  <input
                    type="checkbox"
                    checked={config.useTLS || false}
                    onChange={(e) => { editingRef.current = true; setConfig({ ...config, useTLS: e.target.checked }); }}
                    className="w-4 h-4 border border-slate-300 rounded"
                  />
                  Use TLS Encryption (Recommended)
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Username/Email *
                </label>
                <input
                  type="email"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  placeholder="your-email@gmail.com"
                  autoComplete="username"
                  value={config.smtpUsername || ''}
                  onChange={(e) => { editingRef.current = true; setConfig({ ...config, smtpUsername: e.target.value }); }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Password/App Password *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    value={config.smtpPassword || ''}
                    onChange={(e) => { editingRef.current = true; setConfig({ ...config, smtpPassword: e.target.value }); }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Disabled State */}
          {config.provider === 'none' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
              <p className="text-slate-600">Email sending is disabled. Guests won't receive automatic invitations.</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 p-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="recipient@example.com"
              className="px-3 py-2 border border-slate-300 rounded-lg outline-none w-64 text-sm"
            />
            <button
              onClick={handleSendTest}
              disabled={sendingTest}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {sendingTest ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Test Email'
              )}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
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
    </div>
  );
};

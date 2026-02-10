
import { db, functions } from './firebase';
import { addDoc, collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

export interface WhatsAppConfig {
  provider: 'meta' | 'twilio' | 'none';
  phoneNumberId?: string;
  accessToken?: string;
  businessAccountId?: string;
  whatsappName?: string;
  displayPhoneNumber?: string;
}

export const connectWhatsAppEmbeddedSignup = async (
  code: string
): Promise<{ success: boolean; message: string; config?: WhatsAppConfig }> => {
  try {
    const fn = httpsCallable(functions, 'connectWhatsAppEmbeddedSignup');
    const res = await fn({ code: String(code || '').trim() });
    const data = (res.data || {}) as any;

    if (!data || data.success !== true) {
      return { success: false, message: String(data?.message || 'Failed to connect WhatsApp') };
    }

    return {
      success: true,
      message: String(data?.message || 'WhatsApp connected'),
      config: data?.config || undefined,
    };
  } catch (e: any) {
    console.error('connectWhatsAppEmbeddedSignup failed:', e);
    return { success: false, message: e?.message || 'Failed to connect WhatsApp' };
  }
};

export const disconnectWhatsApp = async (userId: string): Promise<void> => {
  const configRef = doc(db, 'whatsappSettings', userId);
  await setDoc(
    configRef,
    {
      provider: 'none',
      phoneNumberId: '',
      accessToken: '',
      businessAccountId: '',
      whatsappName: '',
      displayPhoneNumber: '',
      disconnectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
};

const normalizePhoneNumber = (raw: string): { ok: true; value: string } | { ok: false; error: string } => {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, error: 'Missing phone number' };

  // Keep leading + if present, strip everything else to digits
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/[^0-9]/g, '');
  if (!digits) return { ok: false, error: 'Invalid phone number' };

  // If user already provided E.164, keep it
  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) return { ok: false, error: 'Invalid E.164 phone number' };
    return { ok: true, value: `+${digits}` };
  }

  // Heuristic default: if 10 digits, assume India (+91). Otherwise treat as missing country code.
  if (digits.length === 10) {
    return { ok: true, value: `+91${digits}` };
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return { ok: true, value: `+${digits}` };
  }

  return { ok: false, error: 'Phone number must include country code (e.g. +91...)' };
};

export const getWhatsAppConfig = async (userId: string): Promise<WhatsAppConfig | null> => {
  try {
    const configRef = doc(db, 'whatsappSettings', userId);
    const snap = await getDoc(configRef);
    if (snap.exists()) {
      return snap.data() as WhatsAppConfig;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch WhatsApp config:', error);
    return null;
  }
};

export const saveWhatsAppConfig = async (userId: string, config: WhatsAppConfig): Promise<void> => {
  try {
    const configRef = doc(db, 'whatsappSettings', userId);
    await setDoc(configRef, {
      ...config,
      updatedAt: new Date().toISOString(),
    });
    console.log('WhatsApp config saved successfully');
  } catch (error) {
    console.error('Failed to save WhatsApp config:', error);
    throw new Error('Failed to save WhatsApp configuration');
  }
};

export const sendWhatsAppInvite = async (
  to: string,
  guestName: string,
  eventName: string,
  ticketCode: string,
  userId: string,
  options?: { eventId?: string; guestId?: string }
): Promise<{ success: boolean; message: string }> => {
  try {
    const normalized = normalizePhoneNumber(to);
    if ('error' in normalized) {
      return { success: false, message: normalized.error };
    }

    const config = await getWhatsAppConfig(userId);

    if (!config || config.provider === 'none') {
      return {
        success: false,
        message: 'WhatsApp service not configured. Please set up WhatsApp in Event Settings.',
      };
    }

    if (config.provider === 'meta') {
      if (!config.phoneNumberId || !config.accessToken || !config.businessAccountId) {
        return {
          success: false,
          message: 'Meta Cloud API credentials are incomplete. Please update WhatsApp settings.',
        };
      }

      const params = [guestName, eventName, ticketCode].map((v) => String(v ?? '').trim());

      await addDoc(collection(db, 'queuedWhatsApps'), {
        to: normalized.value,
        originalTo: String(to || ''),
        userId,
        provider: 'meta',
        createdAt: new Date().toISOString(),
        status: 'queued',
        retries: 0,
        templateName: 'event_invite_v1',
        languageCode: 'en',
        parameters: params,
        eventId: options?.eventId || null,
        guestId: options?.guestId || null,
      });

      return {
        success: true,
        message: 'WhatsApp queued for server-side delivery via Meta Cloud API',
      };
    }

    return {
      success: false,
      message: 'WhatsApp provider is not supported yet. Please select Meta Cloud API or disable.',
    };
  } catch (error: any) {
    console.error('Failed to queue WhatsApp:', error);
    return {
      success: false,
      message: error.message || 'Failed to send WhatsApp',
    };
  }
};

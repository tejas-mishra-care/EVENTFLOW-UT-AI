import { db } from './firebase';
import { addDoc, collection, doc, getDoc, setDoc } from 'firebase/firestore';

export interface SmsConfig {
  provider: 'none' | 'twilio' | 'aws_sns';

  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;

  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  awsSenderId?: string;
}

export const getSmsConfig = async (userId: string): Promise<SmsConfig | null> => {
  try {
    const ref = doc(db, 'smsSettings', userId);
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data() as SmsConfig;
    return null;
  } catch (e) {
    console.error('Failed to fetch SMS config:', e);
    return null;
  }
};

export const saveSmsConfig = async (userId: string, config: SmsConfig): Promise<void> => {
  try {
    const ref = doc(db, 'smsSettings', userId);
    await setDoc(ref, {
      ...config,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Failed to save SMS config:', e);
    throw new Error('Failed to save SMS configuration');
  }
};

const normalizePhoneNumber = (raw: string): { ok: true; value: string } | { ok: false; error: string } => {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, error: 'Missing phone number' };

  const hasPlus = s.startsWith('+');
  const digits = s.replace(/[^0-9]/g, '');
  if (!digits) return { ok: false, error: 'Invalid phone number' };

  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) return { ok: false, error: 'Invalid E.164 phone number' };
    return { ok: true, value: `+${digits}` };
  }

  if (digits.length === 10) {
    return { ok: true, value: `+91${digits}` };
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return { ok: true, value: `+${digits}` };
  }

  return { ok: false, error: 'Phone number must include country code (e.g. +91...)' };
};

export const queueSmsInvite = async (
  to: string,
  message: string,
  userId: string,
  options?: { eventId?: string; guestId?: string }
): Promise<{ success: boolean; message: string }> => {
  try {
    const normalized = normalizePhoneNumber(to);
    if ('error' in normalized) {
      return { success: false, message: normalized.error };
    }

    const config = await getSmsConfig(userId);
    if (!config || config.provider === 'none') {
      return {
        success: false,
        message: 'SMS service not configured. Please set up SMS in Event Settings.',
      };
    }

    await addDoc(collection(db, 'queuedSms'), {
      to: normalized.value,
      originalTo: String(to || ''),
      message: String(message || ''),
      userId,
      provider: config.provider,
      createdAt: new Date().toISOString(),
      status: 'queued',
      retries: 0,
      eventId: options?.eventId || null,
      guestId: options?.guestId || null,
    });

    return {
      success: true,
      message: 'SMS queued for server-side delivery',
    };
  } catch (e: any) {
    console.error('Failed to queue SMS:', e);
    return { success: false, message: e?.message || 'Failed to queue SMS' };
  }
};

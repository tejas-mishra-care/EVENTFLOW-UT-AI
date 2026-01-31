
import { db } from './firebase';
import { addDoc, collection, doc, getDoc, setDoc } from 'firebase/firestore';

export interface WhatsAppConfig {
  provider: 'meta' | 'twilio' | 'none';
  phoneNumberId?: string;
  accessToken?: string;
  businessAccountId?: string;
}

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
    if (!to || !to.trim()) {
      return { success: false, message: 'Missing phone number' };
    }

    const config = await getWhatsAppConfig(userId);

    if (!config || config.provider === 'none') {
      await addDoc(collection(db, 'pendingWhatsApps'), {
        to,
        userId,
        createdAt: new Date().toISOString(),
        status: 'pending_config',
        message: 'WhatsApp queued - please configure WhatsApp service in settings',
        eventId: options?.eventId || null,
        guestId: options?.guestId || null,
      });

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

      await addDoc(collection(db, 'queuedWhatsApps'), {
        to: to.trim(),
        userId,
        provider: 'meta',
        createdAt: new Date().toISOString(),
        status: 'queued',
        retries: 0,
        templateName: 'event_invite_v1',
        languageCode: 'en',
        parameters: [guestName, eventName, ticketCode],
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

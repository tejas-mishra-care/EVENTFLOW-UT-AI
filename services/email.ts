
import { Event, Guest } from '../types';
import { db } from './firebase';
import { collection, addDoc, doc, getDoc, setDoc } from 'firebase/firestore';

export interface EmailConfig {
  provider: 'resend' | 'smtp' | 'none';
  apiKey?: string;
  fromEmail: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
  useTLS?: boolean;
}

// Store email config in Firestore under emailSettings collection
export const getEmailConfig = async (userId: string): Promise<EmailConfig | null> => {
  try {
    const configRef = doc(db, 'emailSettings', userId);
    const snap = await getDoc(configRef);
    if (snap.exists()) {
      return snap.data() as EmailConfig;
    }
    return null;
  } catch (error) {
    console.error("Failed to fetch email config:", error);
    return null;
  }
};

export const saveEmailConfig = async (userId: string, config: EmailConfig): Promise<void> => {
  try {
    const configRef = doc(db, 'emailSettings', userId);
    await setDoc(configRef, {
      ...config,
      updatedAt: new Date().toISOString()
    });
    console.log("Email config saved successfully");
  } catch (error) {
    console.error("Failed to save email config:", error);
    throw new Error("Failed to save email configuration");
  }
};

export const generateEmailTemplate = (event: Event, guest: Guest) => {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      ${event.logoUrl ? `<img src="${event.logoUrl}" alt="Logo" style="height: 50px; display: block; margin: 0 auto 20px;" />` : ''}
      
      ${event.flyerUrl ? `<img src="${event.flyerUrl}" alt="Event Banner" style="width: 100%; border-radius: 8px; margin-bottom: 20px;" />` : ''}
      
      <h1 style="color: #333; text-align: center;">You're Invited!</h1>
      
      <p>Hi ${guest.name},</p>
      
      <p>${event.emailMessage || `You have been registered for <strong>${event.name}</strong>.`}</p>
      
      <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>📅 Date:</strong> ${event.date}</p>
        <p style="margin: 5px 0;"><strong>📍 Location:</strong> ${event.location}</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <p style="font-size: 12px; color: #666; margin-bottom: 10px;">Present this QR code at the entrance:</p>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${guest.qrCode}" alt="QR Code" style="width: 150px; height: 150px; border: 4px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" />
        <p style="font-family: monospace; color: #999; font-size: 10px; margin-top: 5px;">${guest.qrCode}</p>
      </div>

      <p style="text-align: center; color: #888; font-size: 12px;">Sent via EventFlow</p>
    </div>
  `;
};

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  userId: string,
  fromEmail?: string
): Promise<{ success: boolean; message: string }> => {
  try {
    // Get user's email configuration
    const config = await getEmailConfig(userId);

    if (!config || config.provider === 'none') {
      // Queue to mail collection for manual setup
      await addDoc(collection(db, 'pendingEmails'), {
        to,
        subject,
        html,
        userId,
        createdAt: new Date().toISOString(),
        status: 'pending_config',
        message: 'Email queued - please configure email service in settings'
      });

      return {
        success: false,
        message:
          'Email service not configured. Please set up email in Event Settings.',
      };
    }

    // Send via Resend API (free tier: 100 emails/day)
    // For security and CORS reasons we queue Resend sends server-side.
    // A Cloud Function (functions/processQueuedEmail) will read the stored apiKey
    // from `emailSettings/{userId}` and perform the actual POST to Resend.
    if (config.provider === 'resend') {
      await addDoc(collection(db, 'queuedEmails'), {
        to,
        subject,
        html,
        userId,
        fromEmail: config.fromEmail,
        provider: 'resend',
        createdAt: new Date().toISOString(),
        status: 'queued',
        retries: 0,
      });

      console.log(`Email queued for ${to} via resend (server-side worker)`);
      return {
        success: true,
        message: 'Email queued for server-side delivery via Resend',
      };
    }

    // Queue for Firebase Cloud Function (requires backend setup)
    // For now, we'll store in Firestore for user to implement their own backend
    await addDoc(collection(db, 'queuedEmails'), {
      to,
      subject,
      html,
      userId,
      fromEmail: config.fromEmail,
      provider: config.provider,
      createdAt: new Date().toISOString(),
      status: 'queued',
      retries: 0,
    });

    console.log(`Email queued for ${to} via ${config.provider}`);
    return {
      success: true,
      message: `Email queued for delivery via ${config.provider}`,
    };
  } catch (error: any) {
    console.error('Failed to send email:', error);
    return {
      success: false,
      message: error.message || 'Failed to send email',
    };
  }
};

// Send via Resend API (Free tier: 100/day, then $0.20 per 1000)
const sendViaResend = async (
  to: string,
  subject: string,
  html: string,
  apiKey: string,
  fromEmail: string
): Promise<{ success: boolean; message: string }> => {
  try {
    if (!fromEmail || !fromEmail.includes('@')) {
      const msg = 'Invalid or missing fromEmail for Resend provider. Please set a valid From address in Email Settings.';
      console.error(msg);
      return { success: false, message: msg };
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: to,
        subject: subject,
        html: html,
      }),
    });

    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { raw: text };
    }

    // Log the response to Firestore for debugging/delivery tracking
    try {
      await addDoc(collection(db, 'sentEmails'), {
        to,
        subject,
        userFrom: fromEmail,
        provider: 'resend',
        responseStatus: response.status,
        responseBody: data,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Failed to log sent email to Firestore:', e);
    }

    if (!response.ok) {
      const errMessage = (data && (data.error || data.message)) ? (data.error || data.message) : (data && data.raw) ? data.raw : text;
      console.error('Resend API returned error:', response.status, errMessage);
      return {
        success: false,
        message: `Resend API error (status ${response.status}): ${errMessage}`,
      };
    }

    console.log(`Email sent successfully via Resend: ${data?.id || JSON.stringify(data)}`);

    return {
      success: true,
      message: `Email sent (resend id: ${data?.id || 'unknown'})`,
    };
  } catch (error: any) {
    console.error('Resend API error:', error);
    // Log failure to Firestore for operator inspection
    try {
      await addDoc(collection(db, 'failedEmails'), {
        to,
        subject,
        userFrom: fromEmail,
        provider: 'resend',
        error: (error && error.message) ? error.message : String(error),
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Failed to log failed email to Firestore:', e);
    }

    return {
      success: false,
      message: `Failed to send via Resend: ${error.message}`,
    };
  }
};

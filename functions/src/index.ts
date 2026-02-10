import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

admin.initializeApp();
const db = admin.firestore();

interface QueuedEmail {
  to: string;
  subject: string;
  html: string;
  userId: string;
  fromEmail?: string;
  provider?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
  useTLS?: boolean;
  qrCode?: string | null;
  flyerUrl?: string | null;
  eventId?: string | null;
  guestId?: string | null;
  status?: string;
  retries?: number;
}

 interface QueuedWhatsApp {
   to: string;
   originalTo?: string;
   userId: string;
   provider?: string;
   templateName?: string;
   languageCode?: string;
   parameters?: string[];
   eventId?: string | null;
   guestId?: string | null;
   status?: string;
   retries?: number;
 }

interface QueuedSms {
  to: string;
  originalTo?: string;
  message: string;
  userId: string;
  provider?: string;
  eventId?: string | null;
  guestId?: string | null;
  status?: string;
  retries?: number;
}

const asNonNegativeInt = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
};

const normalizeE164 = (raw: unknown): { ok: true; value: string } | { ok: false; error: string } => {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: false, error: 'Missing phone number' };
  const digits = s.replace(/[^0-9]/g, '');
  if (!digits) return { ok: false, error: 'Invalid phone number' };
  const value = s.startsWith('+') ? `+${digits}` : `+${digits}`;
  if (digits.length < 8 || digits.length > 15) return { ok: false, error: 'Invalid E.164 phone number' };
  return { ok: true, value };
};

const getMetaConfig = () => {
  const cfg = functions.config() as any;
  const appId = String(cfg?.meta?.app_id || '').trim();
  const appSecret = String(cfg?.meta?.app_secret || '').trim();
  const redirectUri = String(cfg?.meta?.redirect_uri || 'https://www.facebook.com/connect/login_success.html').trim();
  const apiVersion = String(cfg?.meta?.api_version || 'v22.0').trim();
  return { appId, appSecret, redirectUri, apiVersion };
};

const graphFetchJson = async (url: string) => {
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const text = await resp.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch (_e) {
    json = { raw: text };
  }
  if (!resp.ok) {
    throw new Error(`Meta Graph API error (${resp.status}): ${JSON.stringify(json)}`);
  }
  return json;
};

export const connectWhatsAppEmbeddedSignup = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
  }

  const code = String(data?.code || '').trim();
  if (!code) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing OAuth code.');
  }

  const meta = getMetaConfig();
  if (!meta.appId || !meta.appSecret) {
    throw new functions.https.HttpsError('failed-precondition', 'Meta app config missing on server.');
  }

  const userId = context.auth.uid;

  try {
    const tokenUrl = `https://graph.facebook.com/${encodeURIComponent(meta.apiVersion)}/oauth/access_token` +
      `?client_id=${encodeURIComponent(meta.appId)}` +
      `&client_secret=${encodeURIComponent(meta.appSecret)}` +
      `&redirect_uri=${encodeURIComponent(meta.redirectUri)}` +
      `&code=${encodeURIComponent(code)}`;

    const shortTokenRes = await graphFetchJson(tokenUrl);
    const shortToken = String(shortTokenRes?.access_token || '').trim();
    if (!shortToken) {
      throw new Error('No access_token returned from code exchange');
    }

    let finalToken = shortToken;
    try {
      const longUrl = `https://graph.facebook.com/${encodeURIComponent(meta.apiVersion)}/oauth/access_token` +
        `?grant_type=fb_exchange_token` +
        `&client_id=${encodeURIComponent(meta.appId)}` +
        `&client_secret=${encodeURIComponent(meta.appSecret)}` +
        `&fb_exchange_token=${encodeURIComponent(shortToken)}`;
      const longRes = await graphFetchJson(longUrl);
      const longToken = String(longRes?.access_token || '').trim();
      if (longToken) {
        finalToken = longToken;
      }
    } catch (e) {
      // continue with short-lived if long-lived exchange fails
    }

    const discoveryUrl = `https://graph.facebook.com/${encodeURIComponent(meta.apiVersion)}/me` +
      `?fields=id,name,businesses{owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}}` +
      `&access_token=${encodeURIComponent(finalToken)}`;
    const me = await graphFetchJson(discoveryUrl);

    const businesses = Array.isArray(me?.businesses?.data) ? me.businesses.data : [];
    let waba: any = null;
    let phone: any = null;
    for (const b of businesses) {
      const wabas = Array.isArray(b?.owned_whatsapp_business_accounts?.data)
        ? b.owned_whatsapp_business_accounts.data
        : [];
      if (!wabas.length) continue;
      waba = wabas[0];
      const phones = Array.isArray(waba?.phone_numbers?.data) ? waba.phone_numbers.data : [];
      if (phones.length) {
        phone = phones[0];
      }
      break;
    }

    const wabaId = String(waba?.id || '').trim();
    const phoneNumberId = String(phone?.id || '').trim();
    const displayPhoneNumber = String(phone?.display_phone_number || '').trim();
    const whatsappName = String(phone?.verified_name || waba?.name || '').trim();

    if (!wabaId || !phoneNumberId) {
      throw new Error('Could not discover WhatsApp Business Account / Phone Number from Meta response');
    }

    const configDoc = {
      provider: 'meta',
      accessToken: finalToken,
      businessAccountId: wabaId,
      phoneNumberId,
      whatsappName,
      displayPhoneNumber,
      connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('whatsappSettings').doc(userId).set(configDoc, { merge: true });

    return {
      success: true,
      message: 'WhatsApp connected',
      config: {
        provider: 'meta',
        phoneNumberId,
        accessToken: finalToken,
        businessAccountId: wabaId,
        whatsappName,
        displayPhoneNumber,
      },
    };
  } catch (e: any) {
    console.error('connectWhatsAppEmbeddedSignup failed', e);
    throw new functions.https.HttpsError('internal', e?.message || 'Failed to connect WhatsApp');
  }
});

const getTotalAttendees = (g: any) => {
  const n = typeof g?.totalAttendees === 'number' ? g.totalAttendees : 1;
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.trunc(n));
};

const applyStatsDelta = async (eventId: string, delta: { totalGuests?: number; checkedInGuests?: number; attendeesTotal?: number; attendeesCheckedIn?: number }) => {
  const ref = db.collection('eventStats').doc(eventId);
  const update: any = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (delta.totalGuests) update.totalGuests = admin.firestore.FieldValue.increment(delta.totalGuests);
  if (delta.checkedInGuests) update.checkedInGuests = admin.firestore.FieldValue.increment(delta.checkedInGuests);
  if (delta.attendeesTotal) update.attendeesTotal = admin.firestore.FieldValue.increment(delta.attendeesTotal);
  if (delta.attendeesCheckedIn) update.attendeesCheckedIn = admin.firestore.FieldValue.increment(delta.attendeesCheckedIn);
  await ref.set(update, { merge: true });
};

export const processQueuedEmail = functions.firestore
  .document('queuedEmails/{docId}')
  .onCreate(async (snap, ctx) => {
    const data = snap.data() as QueuedEmail;
    const docId = ctx.params.docId;
    console.log('Processing queuedEmail', {
      docId,
      to: data.to,
      subject: data.subject,
      userId: data.userId,
      provider: data.provider,
      eventId: data.eventId || null,
      guestId: data.guestId || null,
    });

    try {
      const locked = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(snap.ref);
        const cur: any = fresh.data() || {};
        const status = String(cur.status || 'queued');
        if (status !== 'queued') return false;
        tx.update(snap.ref, {
          status: 'processing',
          processingAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return true;
      });
      if (!locked) return;
    } catch (e) {
      return;
    }

    // Fetch user's saved email config if available
    let configDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    const attachmentsResend: any[] = [];
    const attachmentsSmtp: Array<{ filename: string; content: Buffer }> = [];
    const fetchAsBase64 = async (url: string) => {
      const r = await fetch(url);
      const ab = await r.arrayBuffer();
      return Buffer.from(ab).toString('base64');
    };
    try {
      if (data.qrCode && typeof data.qrCode === 'string' && data.qrCode.trim().length > 0) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(data.qrCode)}`;
        try {
          const b64 = await fetchAsBase64(qrUrl);
          attachmentsResend.push({ filename: 'ticket-qr.png', content: b64 });
          attachmentsSmtp.push({ filename: 'ticket-qr.png', content: Buffer.from(b64, 'base64') });
        } catch (e) {
          console.warn('Failed to attach QR image', e);
        }
      }

      if (data.flyerUrl && typeof data.flyerUrl === 'string' && data.flyerUrl.trim().length > 0) {
        try {
          if (data.flyerUrl.startsWith('data:')) {
            const parts = data.flyerUrl.split(',');
            const b64 = parts.length > 1 ? parts[1] : '';
            if (b64) {
              attachmentsResend.push({ filename: 'flyer.png', content: b64 });
              attachmentsSmtp.push({ filename: 'flyer.png', content: Buffer.from(b64, 'base64') });
            }
          } else {
            const b64 = await fetchAsBase64(data.flyerUrl);
            attachmentsResend.push({ filename: 'flyer.png', content: b64 });
            attachmentsSmtp.push({ filename: 'flyer.png', content: Buffer.from(b64, 'base64') });
          }
        } catch (e) {
          console.warn('Failed to attach flyer image', e);
        }
      }
      configDoc = await db.collection('emailSettings').doc(data.userId).get();
    } catch (e) {
      console.warn('Failed to fetch emailSettings', e);
    }

    const cfg = configDoc && configDoc.exists ? (configDoc.data() as any) : null;
    const plainText = `Ticket: ${data.qrCode || ''}\n${data.subject || ''}`;

    try {
      if (cfg && cfg.provider === 'resend' && cfg.apiKey) {
        // Send via Resend API server-side
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: cfg.fromEmail || data.fromEmail,
            to: data.to,
            subject: data.subject,
            html: data.html,
            text: plainText,
            attachments: attachmentsResend,
          }),
        });

        const text = await resp.text();
        let json: any = null;
        try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }

        await db.collection('sentEmails').add({
          queuedId: docId,
          to: data.to,
          subject: data.subject,
          provider: 'resend',
          responseStatus: resp.status,
          responseBody: json,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          eventId: data.eventId || null,
          guestId: data.guestId || null,
        });

        if (!resp.ok) {
          throw new Error('Resend API error: ' + JSON.stringify(json));
        }

      } else if (cfg && cfg.provider === 'smtp' && cfg.smtpHost && cfg.smtpUsername && cfg.smtpPassword) {
        const port = Number(cfg.smtpPort || 587);
        const secure = port === 465;
        const transporter = nodemailer.createTransport({
          host: cfg.smtpHost,
          port,
          secure,
          auth: {
            user: cfg.smtpUsername,
            pass: cfg.smtpPassword,
          },
          requireTLS: port === 587 ? !!cfg.useTLS : undefined,
        });

        const info = await transporter.sendMail({
          from: cfg.fromEmail || data.fromEmail,
          to: data.to,
          subject: data.subject,
          html: data.html,
          text: plainText,
          attachments: attachmentsSmtp,
        });

        await db.collection('sentEmails').add({
          queuedId: docId,
          to: data.to,
          subject: data.subject,
          provider: 'smtp',
          response: info,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          eventId: data.eventId || null,
          guestId: data.guestId || null,
        });

      } else {
        // No usable config - mark as failed
        await db.collection('failedEmails').add({
          queuedId: docId,
          to: data.to,
          subject: data.subject,
          reason: 'No email configuration available for user',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          eventId: data.eventId || null,
          guestId: data.guestId || null,
        });
        console.warn('No email configuration for user', data.userId);
        await snap.ref.update({ status: 'failed', error: 'No email configuration available for user' });
        return;
      }

      // mark queued email as processed
      await snap.ref.update({ status: 'sent', processedAt: admin.firestore.FieldValue.serverTimestamp() });

    } catch (err: any) {
      console.error('Failed to send queued email', err);
      await db.collection('failedEmails').add({
        queuedId: docId,
        to: data.to,
        subject: data.subject,
        error: err && err.message ? err.message : String(err),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        eventId: data.eventId || null,
        guestId: data.guestId || null,
      });
      const prevRetries = asNonNegativeInt((data as any).retries, 0);
      await snap.ref.update({
        status: 'failed',
        error: err && err.message ? err.message : String(err),
        retries: prevRetries + 1,
      });
    }
  });

export const processQueuedSms = functions.firestore
  .document('queuedSms/{docId}')
  .onCreate(async (snap, ctx) => {
    const data = snap.data() as QueuedSms;
    const docId = ctx.params.docId;

    const normalizedTo = normalizeE164(data.to);
    if (!normalizedTo.ok) {
      await snap.ref.update({ status: 'failed', error: normalizedTo.error });
      await db.collection('failedSms').add({
        queuedId: docId,
        to: String(data.to || ''),
        originalTo: data.originalTo || null,
        message: String((data as any).message || ''),
        error: normalizedTo.error,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        eventId: data.eventId || null,
        guestId: data.guestId || null,
      });
      return;
    }

    console.log('Processing queuedSms', {
      docId,
      to: normalizedTo.value,
      userId: data.userId,
      provider: data.provider,
      eventId: data.eventId || null,
      guestId: data.guestId || null,
    });

    try {
      const locked = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(snap.ref);
        const cur: any = fresh.data() || {};
        const status = String(cur.status || 'queued');
        if (status !== 'queued') return false;
        tx.update(snap.ref, {
          status: 'processing',
          processingAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return true;
      });
      if (!locked) return;
    } catch (e) {
      return;
    }

    // If this invite is tied to a guest, avoid double-sending if already sent.
    if (data.guestId) {
      try {
        const guestRef = db.collection('guests').doc(String(data.guestId));
        const gs = await guestRef.get();
        if (gs.exists) {
          const g: any = gs.data() || {};
          if (String(g.inviteSmsStatus || '') === 'sent') {
            await snap.ref.update({ status: 'skipped', skippedAt: admin.firestore.FieldValue.serverTimestamp(), error: 'Already sent' });
            return;
          }
          await guestRef.set(
            {
              inviteSmsStatus: 'sending',
            },
            { merge: true }
          );
        }
      } catch (e) {
        // ignore
      }
    }

    let cfgDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    try {
      cfgDoc = await db.collection('smsSettings').doc(data.userId).get();
    } catch (e) {
      console.warn('Failed to fetch smsSettings', e);
    }

    const cfg = cfgDoc && cfgDoc.exists ? (cfgDoc.data() as any) : null;

    try {
      if (!cfg || !cfg.provider || cfg.provider === 'none') {
        await db.collection('failedSms').add({
          queuedId: docId,
          to: normalizedTo.value,
          originalTo: data.originalTo || null,
          message: String((data as any).message || ''),
          reason: 'No SMS configuration available for user',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          eventId: data.eventId || null,
          guestId: data.guestId || null,
        });
        console.warn('No SMS configuration for user', data.userId);
        await snap.ref.update({ status: 'failed', error: 'No SMS configuration available for user' });
        return;
      }

      const provider = String(cfg.provider || data.provider || '').trim();
      const body = String((data as any).message || '');
      if (!body.trim()) throw new Error('Missing SMS message body');

      let messageId: string | null = null;

      if (provider === 'twilio') {
        if (!cfg.twilioAccountSid || !cfg.twilioAuthToken || !cfg.twilioFromNumber) {
          throw new Error('Twilio SMS config incomplete');
        }
        const client = twilio(String(cfg.twilioAccountSid), String(cfg.twilioAuthToken));
        const resp = await client.messages.create({
          to: normalizedTo.value,
          from: String(cfg.twilioFromNumber),
          body,
        });
        messageId = resp && resp.sid ? String(resp.sid) : null;

        await db.collection('sentSms').add({
          queuedId: docId,
          to: normalizedTo.value,
          originalTo: data.originalTo || null,
          message: body,
          provider: 'twilio',
          responseBody: resp,
          messageId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          eventId: data.eventId || null,
          guestId: data.guestId || null,
        });
      } else if (provider === 'aws_sns') {
        if (!cfg.awsAccessKeyId || !cfg.awsSecretAccessKey || !cfg.awsRegion) {
          throw new Error('AWS SNS SMS config incomplete');
        }

        const client = new SNSClient({
          region: String(cfg.awsRegion),
          credentials: {
            accessKeyId: String(cfg.awsAccessKeyId),
            secretAccessKey: String(cfg.awsSecretAccessKey),
          },
        });

        const attrs: any = {};
        if (cfg.awsSenderId) {
          attrs.AWS.SNS.SMS.SenderID = { DataType: 'String', StringValue: String(cfg.awsSenderId) };
        }

        const cmd = new PublishCommand({
          PhoneNumber: normalizedTo.value,
          Message: body,
          MessageAttributes: Object.keys(attrs).length ? attrs : undefined,
        });
        const resp = await client.send(cmd);
        messageId = resp && resp.MessageId ? String(resp.MessageId) : null;

        await db.collection('sentSms').add({
          queuedId: docId,
          to: normalizedTo.value,
          originalTo: data.originalTo || null,
          message: body,
          provider: 'aws_sns',
          responseBody: resp,
          messageId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          eventId: data.eventId || null,
          guestId: data.guestId || null,
        });
      } else {
        throw new Error(`Unsupported SMS provider: ${provider}`);
      }

      await snap.ref.update({ status: 'sent', processedAt: admin.firestore.FieldValue.serverTimestamp() });

      if (data.guestId) {
        try {
          await db.collection('guests').doc(String(data.guestId)).set(
            {
              inviteSmsStatus: 'sent',
              inviteSmsSentAt: new Date().toISOString(),
              inviteSmsMessageId: messageId,
              inviteSmsLastError: null,
              inviteSent: true,
            },
            { merge: true }
          );
        } catch (e) {
          // ignore
        }
      }
    } catch (err: any) {
      console.error('Failed to send queued SMS', err);
      await db.collection('failedSms').add({
        queuedId: docId,
        to: normalizedTo.value,
        originalTo: data.originalTo || null,
        message: String((data as any).message || ''),
        error: err && err.message ? err.message : String(err),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        eventId: data.eventId || null,
        guestId: data.guestId || null,
      });
      const prevRetries = asNonNegativeInt((data as any).retries, 0);
      await snap.ref.update({
        status: 'failed',
        error: err && err.message ? err.message : String(err),
        retries: prevRetries + 1,
      });

      if (data.guestId) {
        try {
          await db.collection('guests').doc(String(data.guestId)).set(
            {
              inviteSmsStatus: 'failed',
              inviteSmsFailedAt: new Date().toISOString(),
              inviteSmsLastError: err && err.message ? err.message : String(err),
            },
            { merge: true }
          );
        } catch (e) {
          // ignore
        }
      }
    }
  });

 export const processQueuedWhatsApp = functions.firestore
   .document('queuedWhatsApps/{docId}')
   .onCreate(async (snap, ctx) => {
     const data = snap.data() as QueuedWhatsApp;
     const docId = ctx.params.docId;

     const normalizedTo = normalizeE164(data.to);
     if (!normalizedTo.ok) {
       await snap.ref.update({ status: 'failed', error: normalizedTo.error });
       await db.collection('failedWhatsApps').add({
         queuedId: docId,
         to: String(data.to || ''),
         originalTo: data.originalTo || null,
         error: normalizedTo.error,
         createdAt: admin.firestore.FieldValue.serverTimestamp(),
         eventId: data.eventId || null,
         guestId: data.guestId || null,
       });
       return;
     }

     console.log('Processing queuedWhatsApp', {
       docId,
       to: normalizedTo.value,
       userId: data.userId,
       provider: data.provider,
       eventId: data.eventId || null,
       guestId: data.guestId || null,
     });

     try {
       const locked = await db.runTransaction(async (tx) => {
         const fresh = await tx.get(snap.ref);
         const cur: any = fresh.data() || {};
         const status = String(cur.status || 'queued');
         if (status !== 'queued') return false;
         tx.update(snap.ref, {
           status: 'processing',
           processingAt: admin.firestore.FieldValue.serverTimestamp(),
         });
         return true;
       });
       if (!locked) return;
     } catch (e) {
       return;
     }

     // If this invite is tied to a guest, avoid double-sending if already sent.
     if (data.guestId) {
       try {
         const guestRef = db.collection('guests').doc(String(data.guestId));
         const gs = await guestRef.get();
         if (gs.exists) {
           const g: any = gs.data() || {};
           if (String(g.inviteWhatsAppStatus || '') === 'sent' || !!g.inviteSentWhatsApp) {
             await snap.ref.update({ status: 'skipped', skippedAt: admin.firestore.FieldValue.serverTimestamp(), error: 'Already sent' });
             return;
           }
           await guestRef.set(
             {
               inviteWhatsAppStatus: 'sending',
             },
             { merge: true }
           );
         }
       } catch (e) {
         // do not fail processing just because guest update failed
       }
     }

     let cfgDoc: FirebaseFirestore.DocumentSnapshot | null = null;
     try {
       cfgDoc = await db.collection('whatsappSettings').doc(data.userId).get();
     } catch (e) {
       console.warn('Failed to fetch whatsappSettings', e);
     }

     const cfg = cfgDoc && cfgDoc.exists ? (cfgDoc.data() as any) : null;

     try {
       if (!cfg || cfg.provider !== 'meta' || !cfg.phoneNumberId || !cfg.accessToken) {
         await db.collection('failedWhatsApps').add({
           queuedId: docId,
           to: data.to,
           reason: 'No WhatsApp configuration available for user',
           createdAt: admin.firestore.FieldValue.serverTimestamp(),
           eventId: data.eventId || null,
           guestId: data.guestId || null,
         });
         console.warn('No WhatsApp configuration for user', data.userId);
         await snap.ref.update({ status: 'failed', error: 'No WhatsApp configuration available for user' });
         return;
       }

       const templateName = (data.templateName || 'event_invite_v1').trim();
       const languageCode = (data.languageCode || 'en').trim();
       const params = Array.isArray(data.parameters) ? data.parameters : [];

       const payload = {
         messaging_product: 'whatsapp',
         to: normalizedTo.value,
         type: 'template',
         template: {
           name: templateName,
           language: { code: languageCode },
           components: [
             {
               type: 'body',
               parameters: params.map((t) => ({ type: 'text', text: String(t ?? '') })),
             },
           ],
         },
       };

       const url = `https://graph.facebook.com/v17.0/${encodeURIComponent(String(cfg.phoneNumberId))}/messages`;
       const resp = await fetch(url, {
         method: 'POST',
         headers: {
           Authorization: `Bearer ${cfg.accessToken}`,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify(payload),
       });

       const text = await resp.text();
       let json: any = null;
       try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }

       const messageId = Array.isArray(json?.messages) && json.messages.length > 0 ? String(json.messages[0]?.id || '') : '';

       await db.collection('sentWhatsApps').add({
         queuedId: docId,
         to: normalizedTo.value,
         originalTo: data.originalTo || null,
         provider: 'meta',
         responseStatus: resp.status,
         responseBody: json,
         messageId: messageId || null,
         createdAt: admin.firestore.FieldValue.serverTimestamp(),
         eventId: data.eventId || null,
         guestId: data.guestId || null,
       });

       if (!resp.ok) {
         throw new Error('Meta Cloud API error: ' + JSON.stringify(json));
       }

       await snap.ref.update({ status: 'sent', processedAt: admin.firestore.FieldValue.serverTimestamp() });

       if (data.guestId) {
         try {
           await db.collection('guests').doc(String(data.guestId)).set(
             {
               inviteWhatsAppStatus: 'sent',
               inviteWhatsAppSentAt: new Date().toISOString(),
               inviteWhatsAppMessageId: messageId || null,
               inviteWhatsAppLastError: null,
               inviteSentWhatsApp: true,
               inviteSent: true,
             },
             { merge: true }
           );
         } catch (e) {
           // ignore
         }
       }

     } catch (err: any) {
       console.error('Failed to send queued WhatsApp', err);
       await db.collection('failedWhatsApps').add({
         queuedId: docId,
         to: normalizedTo.value,
         originalTo: data.originalTo || null,
         error: err && err.message ? err.message : String(err),
         createdAt: admin.firestore.FieldValue.serverTimestamp(),
         eventId: data.eventId || null,
         guestId: data.guestId || null,
       });
       const prevRetries = asNonNegativeInt((data as any).retries, 0);
       await snap.ref.update({
         status: 'failed',
         error: err && err.message ? err.message : String(err),
         retries: prevRetries + 1,
       });

       if (data.guestId) {
         try {
           await db.collection('guests').doc(String(data.guestId)).set(
             {
               inviteWhatsAppStatus: 'failed',
               inviteWhatsAppFailedAt: new Date().toISOString(),
               inviteWhatsAppLastError: err && err.message ? err.message : String(err),
             },
             { merge: true }
           );
         } catch (e) {
           // ignore
         }
       }
     }
   });

export const syncEventStatsOnGuestWrite = functions.firestore
  .document('guests/{guestId}')
  .onWrite(async (change) => {
    const before = change.before.exists ? (change.before.data() as any) : null;
    const after = change.after.exists ? (change.after.data() as any) : null;
    const beforeEventId = before?.eventId ? String(before.eventId) : null;
    const afterEventId = after?.eventId ? String(after.eventId) : null;

    const beforeCheckedIn = !!before?.checkedIn;
    const afterCheckedIn = !!after?.checkedIn;
    const beforeAttendees = before ? getTotalAttendees(before) : 0;
    const afterAttendees = after ? getTotalAttendees(after) : 0;

    if (!before && after && afterEventId) {
      await applyStatsDelta(afterEventId, {
        totalGuests: 1,
        checkedInGuests: afterCheckedIn ? 1 : 0,
        attendeesTotal: afterAttendees,
        attendeesCheckedIn: afterCheckedIn ? afterAttendees : 0,
      });
      return;
    }

    if (before && !after && beforeEventId) {
      await applyStatsDelta(beforeEventId, {
        totalGuests: -1,
        checkedInGuests: beforeCheckedIn ? -1 : 0,
        attendeesTotal: -beforeAttendees,
        attendeesCheckedIn: beforeCheckedIn ? -beforeAttendees : 0,
      });
      return;
    }

    if (before && after) {
      if (beforeEventId && afterEventId && beforeEventId !== afterEventId) {
        await applyStatsDelta(beforeEventId, {
          totalGuests: -1,
          checkedInGuests: beforeCheckedIn ? -1 : 0,
          attendeesTotal: -beforeAttendees,
          attendeesCheckedIn: beforeCheckedIn ? -beforeAttendees : 0,
        });
        await applyStatsDelta(afterEventId, {
          totalGuests: 1,
          checkedInGuests: afterCheckedIn ? 1 : 0,
          attendeesTotal: afterAttendees,
          attendeesCheckedIn: afterCheckedIn ? afterAttendees : 0,
        });
        return;
      }

      const eventId = afterEventId || beforeEventId;
      if (!eventId) return;

      const checkedInDelta = (afterCheckedIn ? 1 : 0) - (beforeCheckedIn ? 1 : 0);
      const attendeesDelta = afterAttendees - beforeAttendees;
      const attendeesCheckedInDelta = (afterCheckedIn ? afterAttendees : 0) - (beforeCheckedIn ? beforeAttendees : 0);

      if (checkedInDelta || attendeesDelta || attendeesCheckedInDelta) {
        await applyStatsDelta(eventId, {
          checkedInGuests: checkedInDelta || 0,
          attendeesTotal: attendeesDelta || 0,
          attendeesCheckedIn: attendeesCheckedInDelta || 0,
        });
      }
    }
  });

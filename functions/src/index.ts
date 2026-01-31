import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import nodemailer from 'nodemailer';

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

const asNonNegativeInt = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
};

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

 export const processQueuedWhatsApp = functions.firestore
   .document('queuedWhatsApps/{docId}')
   .onCreate(async (snap, ctx) => {
     const data = snap.data() as QueuedWhatsApp;
     const docId = ctx.params.docId;
     console.log('Processing queuedWhatsApp', {
       docId,
       to: data.to,
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
         to: data.to,
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

       await db.collection('sentWhatsApps').add({
         queuedId: docId,
         to: data.to,
         provider: 'meta',
         responseStatus: resp.status,
         responseBody: json,
         createdAt: admin.firestore.FieldValue.serverTimestamp(),
         eventId: data.eventId || null,
         guestId: data.guestId || null,
       });

       if (!resp.ok) {
         throw new Error('Meta Cloud API error: ' + JSON.stringify(json));
       }

       await snap.ref.update({ status: 'sent', processedAt: admin.firestore.FieldValue.serverTimestamp() });

     } catch (err: any) {
       console.error('Failed to send queued WhatsApp', err);
       await db.collection('failedWhatsApps').add({
         queuedId: docId,
         to: data.to,
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

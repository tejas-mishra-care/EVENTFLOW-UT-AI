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
}

export const processQueuedEmail = functions.firestore
  .document('queuedEmails/{docId}')
  .onCreate(async (snap, ctx) => {
    const data = snap.data() as QueuedEmail;
    const docId = ctx.params.docId;
    console.log('Processing queuedEmail', docId, data);

    // Fetch user's saved email config if available
    let configDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    try {
      configDoc = await db.collection('emailSettings').doc(data.userId).get();
    } catch (e) {
      console.warn('Failed to fetch emailSettings', e);
    }

    const cfg = configDoc && configDoc.exists ? (configDoc.data() as any) : null;

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
        });

        await db.collection('sentEmails').add({
          queuedId: docId,
          to: data.to,
          subject: data.subject,
          provider: 'smtp',
          response: info,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      } else {
        // No usable config - mark as failed
        await db.collection('failedEmails').add({
          queuedId: docId,
          to: data.to,
          subject: data.subject,
          reason: 'No email configuration available for user',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.warn('No email configuration for user', data.userId);
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
      });
      await snap.ref.update({ status: 'failed', error: err && err.message ? err.message : String(err) });
    }
  });

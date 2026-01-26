"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processQueuedEmail = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const nodemailer_1 = __importDefault(require("nodemailer"));
admin.initializeApp();
const db = admin.firestore();
exports.processQueuedEmail = functions.firestore
    .document('queuedEmails/{docId}')
    .onCreate(async (snap, ctx) => {
    const data = snap.data();
    const docId = ctx.params.docId;
    console.log('Processing queuedEmail', docId, data);
    // Fetch user's saved email config if available
    let configDoc = null;
    const attachmentsResend = [];
    const attachmentsSmtp = [];
    const fetchAsBase64 = async (url) => {
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
            }
            catch (e) {
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
                }
                else {
                    const b64 = await fetchAsBase64(data.flyerUrl);
                    attachmentsResend.push({ filename: 'flyer.png', content: b64 });
                    attachmentsSmtp.push({ filename: 'flyer.png', content: Buffer.from(b64, 'base64') });
                }
            }
            catch (e) {
                console.warn('Failed to attach flyer image', e);
            }
        }
        configDoc = await db.collection('emailSettings').doc(data.userId).get();
    }
    catch (e) {
        console.warn('Failed to fetch emailSettings', e);
    }
    const cfg = configDoc && configDoc.exists ? configDoc.data() : null;
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
                    attachments: attachmentsResend,
                }),
            });
            const text = await resp.text();
            let json = null;
            try {
                json = JSON.parse(text);
            }
            catch (e) {
                json = { raw: text };
            }
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
        }
        else if (cfg && cfg.provider === 'smtp' && cfg.smtpHost && cfg.smtpUsername && cfg.smtpPassword) {
            const port = Number(cfg.smtpPort || 587);
            const secure = port === 465;
            const transporter = nodemailer_1.default.createTransport({
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
                attachments: attachmentsSmtp,
            });
            await db.collection('sentEmails').add({
                queuedId: docId,
                to: data.to,
                subject: data.subject,
                provider: 'smtp',
                response: info,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        else {
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
    }
    catch (err) {
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

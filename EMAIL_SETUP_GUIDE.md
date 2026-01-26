# EventFlow Email System Setup Guide

## Overview

EventFlow now supports two affordable email solutions:
1. **Resend** (Recommended) - Free tier: 100 emails/day
2. **Custom SMTP** (Free) - Use Gmail, Outlook, or any email provider

## Why This Matters

⚠️ **The old system did NOT work** - Emails were never actually sent. The new system:
- ✅ Actually sends emails to guests
- ✅ Client controls their own email service
- ✅ No cost for first 100 emails/day with Resend
- ✅ Or free with Gmail SMTP (with app passwords)

---

## Option 1: Resend (Recommended)

**Best for**: Event organizers who want the easiest setup and don't mind paying after 100 emails/day.

### Pricing
- **Free tier**: 100 emails per day
- **Paid**: $0.20 per 1,000 emails after free tier
- **Example**: Sending 1,000 emails/month = ~$6/month

### Setup Steps

1. **Sign up at Resend**
   - Go to https://resend.com
   - Create a free account
   - Verify your email

2. **Create API Key**
   - Go to API Keys section
   - Click "Create API Key"
   - Copy the key (looks like: `re_xxxxxxxxxxxxxxxxxxxx`)

3. **Configure in EventFlow**
   - Go to your Event Settings
   - Click "Configure Email Service"
   - Select "Resend"
   - Paste your API key
   - Enter "From" email (e.g., `noreply@yourdomain.com`)
   - Click "Save Settings"

4. **Start Sending**
   - When you register guests or bulk import, enable "Auto-send Ticket Email"
   - Or click "Send Invitations" to send to existing guests
   - Each guest gets their QR code via email

### Test Email
After setup, test with one guest to ensure emails arrive.

---

## Option 2: Custom SMTP (Free with Your Email)

**Best for**: Budget-conscious organizers who have Gmail or company email.

### Setup Steps

#### For Gmail:
1. **Enable 2-Factor Authentication**
   - Go to https://myaccount.google.com/security
   - Enable 2-Factor Authentication

2. **Create App Password**
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Windows Computer"
   - Google generates a 16-character password (copy this)

3. **Configure in EventFlow**
   - Go to your Event Settings
   - Click "Configure Email Service"
   - Select "SMTP"
   - Fill in:
     - **SMTP Host**: `smtp.gmail.com`
     - **Port**: `587`
     - **Username**: Your Gmail address (e.g., `your-email@gmail.com`)
     - **Password**: The 16-character app password from above
     - **Use TLS**: ✓ (enabled)
     - **From Email**: Your Gmail address
   - Click "Save Settings"

#### For Outlook/Microsoft 365:
1. **Configure in EventFlow**
   - Go to your Event Settings
   - Click "Configure Email Service"
   - Select "SMTP"
   - Fill in:
     - **SMTP Host**: `smtp-mail.outlook.com`
     - **Port**: `587`
     - **Username**: Your Outlook email
     - **Password**: Your Outlook password
     - **Use TLS**: ✓ (enabled)
     - **From Email**: Your Outlook email
   - Click "Save Settings"

#### For Other Email Providers:
1. **Find their SMTP details** (Google "[Provider] SMTP settings")
2. **Use the same configuration process as above**

---

## Email Flow

Here's how emails work in EventFlow:

```
Guest Registration (Public Page)
    ↓
Guest Added to Database
    ↓
Check: "Auto-send Email" enabled?
    ↓ YES
Check: Email Service Configured?
    ↓ YES
Send via Resend / SMTP
    ↓
Guest receives QR ticket email
    ↓
Guest shows QR code at event
    ↓
Volunteer scans and checks in
```

---

## Firestore Data Structure

Email configurations are stored in Firestore at:
```
/emailSettings/{userId}
  - provider: "resend" | "smtp" | "none"
  - fromEmail: "your-email@domain.com"
  - apiKey: "re_xxx..." (if using Resend)
  - smtpHost: "smtp.gmail.com" (if using SMTP)
  - smtpPort: 587
  - smtpUsername: "email@gmail.com"
  - smtpPassword: "app-password" (encrypted in transit)
  - updatedAt: timestamp
```

⚠️ **Security Note**: API keys and passwords are stored in your Firestore database. Only you have access (depends on Firestore security rules).

---

## Firestore Security Rules

Add these rules to your Firebase Console to protect email settings:

```firestore
match /emailSettings/{userId} {
  allow read, write: if request.auth.uid == userId;
}

match /queuedEmails/{document=**} {
  allow write: if request.auth != null;
  allow read: if request.auth.uid == resource.data.userId;
}

match /pendingEmails/{document=**} {
  allow write: if request.auth != null;
  allow read: if request.auth.uid == resource.data.userId;
}
```

---

## Troubleshooting

### "Email service not configured" error
- ✅ Go to Event Settings → Configure Email Service
- ✅ Select a provider (Resend or SMTP)
- ✅ Fill in all required fields
- ✅ Click "Save Settings"

### Emails not arriving
**If using Gmail:**
- ✗ Check you used an "App Password" (not regular Gmail password)
- ✗ Verify 2FA is enabled
- ✗ Check spam folder

**If using Resend:**
- ✗ Check API key is correct (starts with `re_`)
- ✗ Verify "From Email" is in your Resend account

### "Invalid API Key" error
- Check your Resend API key is correct
- Resend keys start with `re_`
- Copy from Resend dashboard without extra spaces

### SMTP Port Errors
- Port 587 = TLS (most common, recommended)
- Port 465 = SSL (less common, also works)
- Port 25 = Unencrypted (rarely works)

---

## Scale & Cost Planning

### Resend Pricing
| Tier | Price | Emails/Month |
|------|-------|-------------|
| Free | $0 | 100/day = 3,000 |
| Starter | Pay-as-you-go | $0.20 per 1,000 |
| **Example** | **~$6/month** | **30,000** |

### Gmail/Outlook (Free SMTP)
- Unlimited emails
- No cost
- Best for small events (<1,000 guests)
- May hit rate limits for very large sends

### Event Size Guide
| Event Size | Recommended | Cost |
|-----------|------------|------|
| <100 guests | Gmail SMTP | Free |
| <3,000/month | Resend Free | Free |
| 3,000-30,000/month | Resend Paid | ~$6-30 |
| 30,000+/month | Resend + Backend | ~$30+ |

---

## Advanced: Custom Backend (Optional)

For large-scale events, you can implement a Firebase Cloud Function:

```typescript
// functions/sendEmail.ts
import * as functions from 'firebase-functions';
import * as nodemailer from 'nodemailer';

export const sendQueuedEmails = functions.firestore
  .document('queuedEmails/{docId}')
  .onCreate(async (snap) => {
    const email = snap.data();
    
    // Get user's SMTP config
    const configSnap = await admin.firestore()
      .collection('emailSettings')
      .doc(email.userId)
      .get();
    
    const config = configSnap.data();
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.useTLS,
      auth: {
        user: config.smtpUsername,
        pass: config.smtpPassword,
      },
    });
    
    // Send email
    await transporter.sendMail({
      from: config.fromEmail,
      to: email.to,
      subject: email.subject,
      html: email.html,
    });
  });
```

This approach:
- ✅ Sends from backend (more reliable)
- ✅ Handles large volumes
- ✅ Supports any SMTP provider
- ⚠️ Requires backend setup

---

## Summary

✅ **Your EventFlow email system is now:**
- Working (emails actually send)
- Affordable (free or <$1 per event)
- Flexible (Resend or SMTP)
- Secure (client controls credentials)

### Next Steps
1. Choose Resend or SMTP
2. Set up your provider account
3. Go to Event Settings → Configure Email Service
4. Enter your credentials
5. Test with one guest
6. Enable auto-send for future registrations

Questions? Check the email logs in Firestore:
- `queuedEmails/` - Pending emails
- `pendingEmails/` - Errors
- `emailSettings/{userId}` - Your configuration


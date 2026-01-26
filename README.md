<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# EventFlow - QR Event Management System

Professional event management with QR code check-ins, guest registration, and automated email tickets.

## Features

✅ **Event Management** - Create and manage multiple events  
✅ **Guest Registration** - Public registration page, bulk CSV import  
✅ **QR Check-ins** - Volunteer scanning with real-time stats  
✅ **Email Tickets** - Automated guest invitations with QR codes  
✅ **ID Badges** - Multiple layouts, customizable colors, print support  
✅ **Custom Forms** - Add custom fields to registration  
✅ **Firebase Backend** - Secure, scalable cloud infrastructure  

## Quick Start

### 1. Prerequisites
- Node.js 16+
- Firebase account (free tier works)

### 2. Install & Run
```bash
npm install
npm run dev
```

### 3. Setup Email (Important!)
See **[QUICK_EMAIL_SETUP.txt](QUICK_EMAIL_SETUP.txt)** for 2-minute email configuration.

Options:
- **Resend**: Free 100 emails/day, then $0.20 per 1,000
- **Gmail SMTP**: Completely free (unlimited)

## Documentation

- [**QUICK_EMAIL_SETUP.txt**](QUICK_EMAIL_SETUP.txt) - Email setup in 2 minutes
- [**EMAIL_SETUP_GUIDE.md**](EMAIL_SETUP_GUIDE.md) - Complete email documentation
- [**EMAIL_IMPLEMENTATION_SUMMARY.md**](EMAIL_IMPLEMENTATION_SUMMARY.md) - Technical details

## Key Pages

| Page | Purpose | Access |
|------|---------|--------|
| **Dashboard** | View all events & stats | Event organizers |
| **Create Event** | Set up new event | Event organizers |
| **Event Details** | Manage guests, send invites, configure email | Event organizers |
| **Scanner** | Live QR code check-in | Volunteers |
| **Public Registration** | Guest self-registration | Public (link from event) |

## Email System

**IMPORTANT**: The old email system didn't work. The new one actually sends emails!

### How It Works
1. Event organizer configures email in Event Settings (Resend or Gmail SMTP)
2. Guest registers → Email automatically sent with QR code
3. Or organizer clicks "Send Invitations" for batch sending
4. Guest receives branded email ticket
5. Guest shows QR at entrance → Volunteer scans → Checked in!

### Setup (2 minutes)
See [QUICK_EMAIL_SETUP.txt](QUICK_EMAIL_SETUP.txt) for step-by-step instructions.

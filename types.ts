
export interface User {
  id: string;
  name: string;
  email: string;
}

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select';
  required: boolean;
  options?: string[]; // for select types
}

export interface Event {
  id: string;
  ownerId: string;
  name: string;
  date: string;
  location: string;
  description: string;
  volunteerPassword: string; // In real app, store hash
  logoUrl?: string;
  flyerUrl?: string;
  status: 'active' | 'completed';
  formFields?: FormField[]; // Custom registration fields
  idCardColor?: string; // Hex color for badge branding
  idCardLayout?: 'standard' | 'modern' | 'minimal'; // New field
  emailMessage?: string; // Custom message for invites
  autoSendEmail?: boolean; // If true, email ticket automatically on registration
  emailTemplateHtml?: string; // Optional custom HTML template with placeholders
  idCardTemplateHtml?: string; // Optional custom HTML ID card template
  autoPrintOnScan?: boolean; // Auto print ID card after successful scan
  idCardShowEmail?: boolean; // Show guest email on badge
  idCardShowEventDate?: boolean; // Show event date on badge
}

export interface Guest {
  id: string;
  eventId: string;
  name: string;
  email: string;
  phone?: string;
  qrCode: string; // UUID
  checkedIn: boolean;
  checkedInAt?: string;
  verifiedBy?: string;
  inviteSent?: boolean;
  idCardPrinted?: boolean; // Track if badge has been printed
  customData?: Record<string, string>; // Store answers to custom form fields
}

export interface ScanResult {
  success: boolean;
  message: string;
  guest?: Guest;
}

export interface DashboardStats {
  totalEvents: number;
  totalGuests: number;
  totalCheckedIn: number;
}

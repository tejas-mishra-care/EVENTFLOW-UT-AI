
import { Event, Guest, User } from '../types';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  writeBatch,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { db, auth } from './firebase';

// Helper to generate UUIDs locally if needed (though Firestore handles IDs)
const generateId = () => Math.random().toString(36).substring(2, 11);

// --- User Auth ---

export const loginUser = async (email: string, password?: string): Promise<User> => {
  // Use a default password for the demo if none provided, 
  // though in a real UI you should add a password field.
  const pass = password || 'password123'; 
  
  const userCredential = await signInWithEmailAndPassword(auth, email, pass);
  return {
    id: userCredential.user.uid,
    name: userCredential.user.displayName || email.split('@')[0],
    email: userCredential.user.email || ''
  };
};

export const registerUser = async (email: string, name: string, password?: string): Promise<User> => {
  const pass = password || 'password123';
  const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
  
  // Create a user profile doc in Firestore (optional but good practice)
  await setDoc(doc(db, 'users', userCredential.user.uid), {
    name,
    email,
    createdAt: serverTimestamp()
  });

  return {
    id: userCredential.user.uid,
    name: name,
    email: email
  };
};

export const getCurrentUser = (): User | null => {
  const user = auth.currentUser;
  if (!user) return null;
  return {
    id: user.uid,
    name: user.displayName || user.email?.split('@')[0] || 'User',
    email: user.email || ''
  };
};

export const logoutUser = async () => {
  await signOut(auth);
  sessionStorage.removeItem('volunteer_name');
};

// --- Events ---

export const createEvent = async (eventData: Omit<Event, 'id' | 'ownerId'>): Promise<Event> => {
  const user = getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const docRef = await addDoc(collection(db, 'events'), {
    ...eventData,
    ticketPrefix: (eventData as any).ticketPrefix ?? 'G-',
    nextTicketNumber: (eventData as any).nextTicketNumber ?? 151,
    useTicketCodeInQR: (eventData as any).useTicketCodeInQR ?? true,
    ownerId: user.id,
    createdAt: serverTimestamp()
  });

  return {
    ...eventData,
    id: docRef.id,
    ownerId: user.id
  };
};

export const updateEvent = async (eventId: string, updates: Partial<Event>): Promise<Event> => {
  const docRef = doc(db, 'events', eventId);
  await updateDoc(docRef, updates);
  
  // Return the updated object (fetching it fresh or merging)
  const snap = await getDoc(docRef);
  const data = (snap.data() as any) || {};
  return { id: snap.id, ...(data as object) } as Event;
};

export const deleteEvent = async (eventId: string): Promise<void> => {
  await deleteDoc(doc(db, 'events', eventId));
  
  // Cleanup guests for this event
  const guests = await getEventGuests(eventId);
  const batch = writeBatch(db);
  guests.forEach(g => {
    const guestRef = doc(db, 'guests', g.id);
    batch.delete(guestRef);
  });
  await batch.commit();
};

export const getEvents = async (): Promise<Event[]> => {
  // If we are logged in, fetch events for this user. 
  // For volunteer login, we might need a different strategy or allow reading all events with a specific code.
  // For now, let's fetch all events and filter client side if specific queries aren't set up, 
  // or simple query by owner if user is logged in.
  
  const user = getCurrentUser();
  let q;
  
  if (user) {
    q = query(collection(db, 'events'), where("ownerId", "==", user.id));
  } else {
    // For volunteer login, we need to find the event by password, so we initially fetch all 
    // (Note: In production, use specific query or Edge Function)
    q = query(collection(db, 'events')); 
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => {
    const data = (d.data() as any) || {};
    return { id: d.id, ...(data as object) } as Event;
  });
};

export const getEventById = async (id: string): Promise<Event | undefined> => {
  const docRef = doc(db, 'events', id);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() } as Event;
  }
  return undefined;
};

// --- Guests ---

export const addGuest = async (guestData: Omit<Guest, 'id' | 'qrCode' | 'checkedIn'>): Promise<Guest> => {
  const docRef = doc(collection(db, 'guests'));
  // fetch event config to compute ticket code
  let prefix = 'G-';
  let nextNum = 151;
  let useTicket = true;
  try {
    const evtSnap = await getDoc(doc(db, 'events', guestData.eventId));
    if (evtSnap.exists()) {
      const evt = evtSnap.data() as any;
      prefix = evt.ticketPrefix || prefix;
      nextNum = typeof evt.nextTicketNumber === 'number' ? evt.nextTicketNumber : nextNum;
      useTicket = (typeof evt.useTicketCodeInQR === 'boolean') ? !!evt.useTicketCodeInQR : true;
    }
  } catch {}
  const ticketCode = `${prefix}${nextNum}`;
  const qrValue = useTicket ? ticketCode : docRef.id;
  const newGuestData = {
    ...guestData,
    qrCode: qrValue,
    ticketCode,
    checkedIn: false,
    inviteSent: false,
    idCardPrinted: false,
    createdAt: serverTimestamp()
  };

  await setDoc(docRef, newGuestData);
  // bump nextTicketNumber
  try {
    await updateDoc(doc(db, 'events', guestData.eventId), { nextTicketNumber: nextNum + 1 });
  } catch {}
  
  return {
    id: docRef.id,
    ...newGuestData
  } as Guest;
};

export const updateGuest = async (guestId: string, updates: Partial<Guest>): Promise<Guest> => {
  const docRef = doc(db, 'guests', guestId);
  await updateDoc(docRef, updates);
  const snap = await getDoc(docRef);
  return { id: snap.id, ...snap.data() } as Guest;
};

export const deleteGuest = async (guestId: string): Promise<void> => {
  await deleteDoc(doc(db, 'guests', guestId));
};

export const clearEventGuests = async (eventId: string): Promise<void> => {
  const guests = await getEventGuests(eventId);
  const batch = writeBatch(db);
  guests.forEach(g => {
    batch.delete(doc(db, 'guests', g.id));
  });
  await batch.commit();
};

export const addGuestsBulk = async (eventId: string, guestsData: any[]): Promise<void> => {
  const batch = writeBatch(db);
  // load event settings once
  let prefix = 'G-';
  let nextNum = 151;
  let useTicket = true;
  try {
    const evtSnap = await getDoc(doc(db, 'events', eventId));
    if (evtSnap.exists()) {
      const evt = evtSnap.data() as any;
      prefix = evt.ticketPrefix || prefix;
      nextNum = typeof evt.nextTicketNumber === 'number' ? evt.nextTicketNumber : nextNum;
      useTicket = !!evt.useTicketCodeInQR;
    }
  } catch {}
  let assigned = 0;
  
  guestsData.forEach(g => {
    const docRef = doc(collection(db, 'guests')); // Auto-ID
    const ticketCode = `${prefix}${nextNum + assigned}`;
    const qrValue = useTicket ? ticketCode : docRef.id;
    batch.set(docRef, {
      eventId,
      name: g.name,
      email: g.email,
      phone: g.phone || '',
      customData: g.customData || {},
      qrCode: qrValue,
      ticketCode,
      checkedIn: false,
      inviteSent: false,
      idCardPrinted: false,
      createdAt: serverTimestamp()
    });
    assigned += 1;
  });

  await batch.commit();
  // bump nextTicketNumber by assigned
  try { await updateDoc(doc(db, 'events', eventId), { nextTicketNumber: nextNum + assigned }); } catch {}
};

export const getEventGuests = async (eventId: string): Promise<Guest[]> => {
  const q = query(collection(db, 'guests'), where("eventId", "==", eventId));
  const snapshot = await getDocs(q);
  const guests = snapshot.docs.map(docSnap => {
    const data = (docSnap.data() as any) || {};
    return { id: docSnap.id, ...(data as object) } as Guest;
  });
  // Load event config to handle ticket codes
  let prefix = 'G-';
  let nextNum = 151;
  let useTicket = true;
  try {
    const evtSnap = await getDoc(doc(db, 'events', eventId));
    if (evtSnap.exists()) {
      const evt = evtSnap.data() as any;
      prefix = evt.ticketPrefix || prefix;
      nextNum = typeof evt.nextTicketNumber === 'number' ? evt.nextTicketNumber : nextNum;
      useTicket = !!evt.useTicketCodeInQR;
    }
  } catch {}

  // Backfill missing ticket codes; optionally align qrCode to ticket code
  let assigned = 0;
  for (const g of guests) {
    try {
      const docRef = doc(db, 'guests', g.id);
      const updates: any = {};
      if (!g.ticketCode) {
        const t = `${prefix}${nextNum + assigned}`;
        updates.ticketCode = t;
        assigned += 1;
        if (useTicket) updates.qrCode = t;
      } else if (useTicket && g.qrCode !== g.ticketCode) {
        updates.qrCode = g.ticketCode;
      } else if (!useTicket && (!g.qrCode || g.qrCode !== g.id)) {
        // ensure qrCode is doc id when not using ticket code
        updates.qrCode = g.id;
      }
      if (Object.keys(updates).length) {
        await updateDoc(docRef, updates);
        Object.assign(g, updates);
      }
    } catch (e) {
      console.warn('Ticket backfill failed for guest', g.id, e);
    }
  }
  if (assigned > 0) {
    try { await updateDoc(doc(db, 'events', eventId), { nextTicketNumber: nextNum + assigned }); } catch {}
  }

  return guests;
};

export const getGuestByQRCode = async (qrCode: string): Promise<Guest | undefined> => {
  // Queries in Firestore require an index for optimal performance, but simple where clauses work
  const q = query(collection(db, 'guests'), where("qrCode", "==", qrCode));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    const data = (doc.data() as any) || {};
    return { id: doc.id, ...(data as object) } as Guest;
  }
  // Backward-compatibility: if no match, the scanned value might be the document ID
  try {
    const direct = await getDoc(doc(db, 'guests', qrCode));
    if (direct.exists()) {
      const data = (direct.data() as any) || {};
      return { id: direct.id, ...(data as object) } as Guest;
    }
  } catch (_) {
    // ignore
  }
  return undefined;
};

export const checkInGuest = async (guestId: string, volunteerId: string): Promise<Guest> => {
  const docRef = doc(db, 'guests', guestId);
  const updates = {
    checkedIn: true,
    checkedInAt: new Date().toISOString(),
    verifiedBy: volunteerId
  };
  await updateDoc(docRef, updates);
  const snap = await getDoc(docRef);
  return { id: snap.id, ...snap.data() } as Guest;
};

export const markGuestIdPrinted = async (guestId: string): Promise<Guest> => {
  const docRef = doc(db, 'guests', guestId);
  await updateDoc(docRef, { idCardPrinted: true });
  const snap = await getDoc(docRef);
  return { id: snap.id, ...snap.data() } as Guest;
};

// --- Stats ---
// Note: In Firestore, getting counts usually means reading all docs or using aggregation queries.
// For this simple app, reading all event guests is fine for small events.
export const getEventStats = async (eventId: string) => {
  const guests = await getEventGuests(eventId);
  return {
    total: guests.length,
    checkedIn: guests.filter(g => g.checkedIn).length,
    remaining: guests.filter(g => !g.checkedIn).length
  };
};

// --- Volunteer Activity ---
export const updateVolunteerHeartbeat = async (eventId: string, volunteerName: string) => {
  // Using a separate collection for sessions
  const sessionRef = doc(db, `events/${eventId}/sessions/${volunteerName}`);
  await setDoc(sessionRef, {
    lastSeen: serverTimestamp(),
    name: volunteerName
  }, { merge: true });
};

export const getActiveVolunteers = async (eventId: string): Promise<string[]> => {
  const q = query(collection(db, `events/${eventId}/sessions`));
  const snapshot = await getDocs(q);
  const now = Date.now();
  
  return snapshot.docs
    .map(d => ({ name: d.id, ...d.data() } as any))
    .filter(s => {
       // Check if timestamp is within last 2 minutes (Firestore timestamp to millis)
       const lastSeen = s.lastSeen?.toMillis?.() || 0;
       return now - lastSeen < 2 * 60 * 1000;
    })
    .map(s => s.name);
};

// --- DEMO DATA GENERATOR ---
export const loadDemoData = async () => {
  // This is a heavy operation in Firebase, usually you wouldn't "reset" the DB like localStorage.
  // Instead, let's just create a new Demo Event for the current user.
  
  const user = getCurrentUser();
  if (!user) return;

  const demoEvent: Omit<Event, 'id' | 'ownerId'> = {
    name: 'Tech Summit 2024 (Demo)',
    date: '2024-11-15',
    location: 'Convention Center, SF',
    description: 'Annual technology summit.',
    volunteerPassword: '123',
    status: 'active',
    idCardLayout: 'modern',
    idCardColor: '#4f46e5',
    autoSendEmail: true,
    formFields: [{ id: 'company', label: 'Company', type: 'text', required: true }]
  };

  const newEvent = await createEvent(demoEvent);

  const guests = [
    { name: 'Alice Johnson', email: 'alice@test.com', phone: '555-0101', customData: { Company: 'Google' } },
    { name: 'Tejas Mishra', email: 'tejas.mishra.care@gmail.com', phone: '555-9999', customData: { Company: 'Vip Guest' } },
    { name: 'Charlie Brown', email: 'charlie@test.com', phone: '555-0103', customData: { Company: 'Startup Inc' } },
  ];

  await addGuestsBulk(newEvent.id, guests);
  window.location.href = '#/dashboard';
  window.location.reload();
};

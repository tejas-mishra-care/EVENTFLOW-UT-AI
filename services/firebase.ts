
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// ------------------------------------------------------------------
// FIREBASE CONFIGURATION
// ------------------------------------------------------------------

const firebaseConfig = {
  apiKey: "AIzaSyA0ICfwLIXCgoih6O6BizRuhUSX9XvI8Dg",
  authDomain: "studio-5378802467-a9dc7.firebaseapp.com",
  projectId: "studio-5378802467-a9dc7",
  storageBucket: "studio-5378802467-a9dc7.firebasestorage.app",
  messagingSenderId: "733550212693",
  appId: "1:733550212693:web:237f50a52cd089565fc6dc"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

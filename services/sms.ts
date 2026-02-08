import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface SmsConfig {
  provider: 'none' | 'twilio' | 'aws_sns';

  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;

  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  awsSenderId?: string;
}

export const getSmsConfig = async (userId: string): Promise<SmsConfig | null> => {
  try {
    const ref = doc(db, 'smsSettings', userId);
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data() as SmsConfig;
    return null;
  } catch (e) {
    console.error('Failed to fetch SMS config:', e);
    return null;
  }
};

export const saveSmsConfig = async (userId: string, config: SmsConfig): Promise<void> => {
  try {
    const ref = doc(db, 'smsSettings', userId);
    await setDoc(ref, {
      ...config,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Failed to save SMS config:', e);
    throw new Error('Failed to save SMS configuration');
  }
};

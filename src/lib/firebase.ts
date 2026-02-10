import admin from "firebase-admin";

/**
 * Initialize Firebase Admin SDK.
 * In production, this uses Application Default Credentials.
 * For now, this is a stub that will be replaced when the host repo
 * integration is complete.
 */
if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = admin.firestore();

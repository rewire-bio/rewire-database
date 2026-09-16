import { getApp, initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export function firebase() {
  const app = getApps().length
    ? getApp()
    : initializeApp({
        projectId:
          process.env.GCLOUD_PROJECT ||
          process.env.GOOGLE_CLOUD_PROJECT ||
          "demo-rewire-omics",
      });
  if (
    process.env.NODE_ENV === "production" &&
    (process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      process.env.FIRESTORE_EMULATOR_HOST)
  ) {
    throw new Error("Production must not trust Firebase emulators");
  }
  return { auth: getAuth(app), db: getFirestore(app) };
}

// =============================================================================
// firebase_setup.ts
// Firebase initialisation helper for OPENY-DOCS
//
// This module owns:
//   • The typed Firebase Web-app configuration
//   • A factory that initialises the SDK once and returns the shared instances
//     of FirebaseApp, Auth and Firestore
//
// Usage (ESM – browser or bundler):
//   import { initFirebase, FIREBASE_WEB_CONFIG } from "./firebase_setup.js";
//   const { app, auth, db } = await initFirebase();
//
// Security note:
//   Only Web SDK ("client") credentials are stored here.
//   Never place Admin SDK private keys or service-account JSON in this file.
// =============================================================================

import { initializeApp, FirebaseApp, FirebaseOptions } from "firebase/app";
import {
    getAuth,
    Auth,
    setPersistence,
    browserLocalPersistence,
    signInAnonymously,
} from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

/**
 * Firebase Web App configuration.
 *
 * Fill in the values from:
 *   Firebase Console → Project Settings → General → Your apps → Web app
 *
 * After filling in real values, set FIREBASE_ENABLED to `true` (or keep the
 * guard below – it auto-detects whether the config is populated).
 *
 * Security note on API key visibility:
 *   Firebase Web SDK ("client") credentials are intentionally public – the API
 *   key merely identifies the Firebase project and is not a secret.  Access
 *   control is enforced exclusively via Firebase Security Rules
 *   (Firestore: `allow read, write: if request.auth != null`).
 *   See: https://firebase.google.com/docs/projects/api-keys
 *
 *   If this project is later bundled with a tool that supports it (Vite,
 *   webpack, etc.) you can replace the literal values below with environment
 *   variables such as `import.meta.env.VITE_FIREBASE_API_KEY` and document
 *   them in a `.env.example` file.
 */
export const FIREBASE_WEB_CONFIG: FirebaseOptions = {
    apiKey:            "AIzaSyAhXa5gLCMIIxuFIAj0RFeFEvAcE5TiilY",
    authDomain:        "openy-suite.firebaseapp.com",
    projectId:         "openy-suite",
    storageBucket:     "openy-suite.firebasestorage.app",
    messagingSenderId: "735713304757",
    appId:             "1:735713304757:web:d7c006022e4c0e8fa2defc",
    measurementId:     "G-TWZQ62R09M",
};

/**
 * `true` once real credentials have been supplied.
 * Guards against accidental initialisation with placeholder values.
 */
export const FIREBASE_ENABLED: boolean =
    FIREBASE_WEB_CONFIG.apiKey !== "YOUR_API_KEY";

// ---------------------------------------------------------------------------
// 2. Shared instances (lazily initialised)
// ---------------------------------------------------------------------------

interface FirebaseServices {
    app:  FirebaseApp;
    auth: Auth;
    db:   Firestore;
}

let _services: FirebaseServices | null = null;

// ---------------------------------------------------------------------------
// 3. Public API
// ---------------------------------------------------------------------------

/**
 * Initialise Firebase exactly once, persist the Auth session across page
 * reloads, and sign in anonymously so that Firestore security rules can
 * evaluate `request.auth != null`.
 *
 * Subsequent calls return the already-initialised services without
 * re-creating them.
 *
 * @throws {Error} If called when `FIREBASE_ENABLED` is `false`.
 */
export async function initFirebase(): Promise<FirebaseServices> {
    if (!FIREBASE_ENABLED) {
        throw new Error(
            "Firebase is not enabled. Populate FIREBASE_WEB_CONFIG in firebase_setup.ts first."
        );
    }

    if (_services) {
        return _services;
    }

    const app  = initializeApp(FIREBASE_WEB_CONFIG);
    const auth = getAuth(app);
    const db   = getFirestore(app);

    // Persist the anonymous session across hard reloads on the same browser.
    try {
        await setPersistence(auth, browserLocalPersistence);
    } catch (e) {
        // Non-fatal: persistence may be blocked in private-browsing mode.
        console.warn("[firebase_setup] Auth persistence unavailable:", e);
    }

    await signInAnonymously(auth);

    _services = { app, auth, db };
    return _services;
}

/**
 * Return the already-initialised services, or `null` if `initFirebase()`
 * has not been called yet.
 *
 * Useful when you need synchronous access after the initial `await initFirebase()`.
 */
export function getFirebaseServices(): FirebaseServices | null {
    return _services;
}

/**
 * All Firestore collection / store names used by the application.
 *
 * Extend this array whenever a new document type is added.
 */
export const ALL_STORES: readonly string[] = [
    "quotations",
    "invoices",
    "clientContracts",
    "hrContracts",
    "employees",
    "salaryHistory",
    "activityLogs",
    "acctLedger",
    "acctExpenses",
    // Legacy stores kept for backward-compatibility (data-migration safety).
    "acctClientCollections",
    "acctEgyptCollections",
    "acctCaptainCollections",
] as const;

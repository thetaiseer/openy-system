// =============================================================================
// firebase.js  —  Single Firebase source for OPENY-DOCS (browser / CDN ESM)
//
// Initialises Firebase App, Auth, Firestore, and Storage exactly once.
// Exposes all needed SDK helpers on window.FB and dispatches 'firebaseLoaded'
// so that script.js can start its cloud operations.
//
// Import this module via:
//   <script type="module" src="firebase.js" defer></script>
// =============================================================================

import { initializeApp }               from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    signInWithCustomToken,
    signInAnonymously,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence,
}                                       from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    getDocs,
    deleteDoc,
    onSnapshot,
}                                       from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
    getStorage,
    ref          as storageRef,
    uploadBytes,
    getDownloadURL,
}                                       from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// ---------------------------------------------------------------------------
// Firebase Web App configuration
// ---------------------------------------------------------------------------
const FIREBASE_WEB_CONFIG = {
    apiKey:            "AIzaSyAhXa5gLCMIIxuFIAj0RFeFEvAcE5TiilY",
    authDomain:        "openy-suite.firebaseapp.com",
    projectId:         "openy-suite",
    storageBucket:     "openy-suite.firebasestorage.app",
    messagingSenderId: "735713304757",
    appId:             "1:735713304757:web:d7c006022e4c0e8fa2defc",
    measurementId:     "G-TWZQ62R09M",
};

// ---------------------------------------------------------------------------
// Expose helpers on window.FB and signal readiness
// ---------------------------------------------------------------------------
window.FB = {
    // App
    initializeApp,
    FIREBASE_WEB_CONFIG,

    // Auth
    getAuth,
    signInWithCustomToken,
    signInAnonymously,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence,

    // Firestore
    getFirestore,
    collection,
    doc,
    setDoc,
    getDocs,
    deleteDoc,
    onSnapshot,

    // Storage
    getStorage,
    storageRef,
    uploadBytes,
    getDownloadURL,
};

window.dispatchEvent(new Event("firebaseLoaded"));

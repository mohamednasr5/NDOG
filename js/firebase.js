// firebase.js - تهيئة Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

const firebaseConfig = {
  apiKey: "AIzaSyAwvOJCX4qSAtqcF_fcnHtQgsTArnIrrhc",
  authDomain: "ndog-a3265.firebaseapp.com",
  databaseURL: "https://ndog-a3265-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ndog-a3265",
  storageBucket: "ndog-a3265.firebasestorage.app",
  messagingSenderId: "829364393352",
  appId: "1:829364393352:web:82d0d0a99a3b3f2200163d"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const provider = new GoogleAuthProvider();
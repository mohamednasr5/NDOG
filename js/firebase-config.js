// ========== FIREBASE CONFIGURATION ==========
// NileDogs (NDOG) - Firebase Realtime Database

const firebaseConfig = {
  apiKey: "AIzaSyAwvOJCX4qSAtqcF_fcnHtQgsTArnIrrhc",
  authDomain: "ndog-a3265.firebaseapp.com",
  databaseURL: "https://ndog-a3265-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ndog-a3265",
  storageBucket: "ndog-a3265.firebasestorage.app",
  messagingSenderId: "829364393352",
  appId: "1:829364393352:web:82d0d0a99a3b3f2200163d",
  measurementId: "G-YF7HC7T8M0"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.database();

// Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');

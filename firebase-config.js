import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAKDBcIshZ4tObZNtRFZv2IL2xK4iAd3Y8",
  authDomain: "neu-moa-bfe17.firebaseapp.com",
  projectId: "neu-moa-bfe17",
  storageBucket: "neu-moa-bfe17.firebasestorage.app",
  messagingSenderId: "494429027099",
  appId: "1:494429027099:web:f79a463cc2f609c91831be",
  measurementId: "G-M6J494CMBC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
const db = getFirestore(app);

export { auth, provider, db };
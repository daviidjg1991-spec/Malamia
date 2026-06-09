import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDpD1KonSR6qWsUX2EbLeDnu2K-ubZeWh4",
  authDomain: "malamia-919bf.firebaseapp.com",
  projectId: "malamia-919bf",
  storageBucket: "malamia-919bf.firebasestorage.app",
  messagingSenderId: "375662292908",
  appId: "1:375662292908:web:4050135354a8d0c3ec1409",
  measurementId: "G-645WGM8SH2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

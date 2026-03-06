import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBrSc-rRGqnU6nDNHNavdEUl3sj-NOacjI",
  authDomain: "templates-v3.firebaseapp.com",
  projectId: "templates-v3",
  storageBucket: "templates-v3.firebasestorage.app",
  messagingSenderId: "427261164988",
  appId: "1:427261164988:web:b4dcf3bc94f354bf78bfb9",
  measurementId: "G-9CL44RLVZM"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc };

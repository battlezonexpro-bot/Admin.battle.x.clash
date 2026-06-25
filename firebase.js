import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
  initializeFirestore, collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, getDoc, query, where, orderBy, setDoc 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { firebaseConfig, BACKEND_URL } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { experimentalForceLongPolling: true, useFetchStreams: false });

export { db, auth, signInWithEmailAndPassword, onAuthStateChanged, signOut };

// --- User Services ---
export const listenUsers = (cb) => onSnapshot(collection(db, "Users"), snap => cb(snap.docs.map(d => ({id: d.id, ...d.data()}))), err => console.error("Firestore User Error:", err));
export const getUser = (uid) => getDoc(doc(db, "Users", uid));
export const updateUser = (uid, data) => updateDoc(doc(db, "Users", uid), data);

// --- Match Services ---
export const listenMatches = (cb) => onSnapshot(query(collection(db, "Matches"), orderBy("time", "desc")), snap => cb(snap.docs.map(d => ({id: d.id, ...d.data()}))), err => console.error("Firestore Match Error:", err));
export const createMatch = (data) => addDoc(collection(db, "Matches"), data);
export const updateMatch = (id, data) => updateDoc(doc(db, "Matches", id), data);
export const deleteMatch = (id) => deleteDoc(doc(db, "Matches", id));

// --- Wallet & Transaction Services ---
export const listenDeposits = (cb) => onSnapshot(query(collection(db, "Deposits"), orderBy("timestamp", "desc")), snap => cb(snap.docs.map(d => ({id: d.id, ...d.data()}))), err => console.error("Firestore Deposit Error:", err));
export const listenWithdrawals = (cb) => onSnapshot(query(collection(db, "Withdrawals"), orderBy("timestamp", "desc")), snap => cb(snap.docs.map(d => ({id: d.id, ...d.data()}))), err => console.error("Firestore Withdrawal Error:", err));
export const updateDeposit = (id, data) => updateDoc(doc(db, "Deposits", id), data);
export const createDeposit = (data) => addDoc(collection(db, "Deposits"), data);
export const deleteDeposit = (id) => deleteDoc(doc(db, "Deposits", id));
export const updateWithdrawal = (id, data) => updateDoc(doc(db, "Withdrawals", id), data);
export const deleteWithdrawal = (id) => deleteDoc(doc(db, "Withdrawals", id));

// --- Support Ticket Services ---
export const listenTickets = (cb) => onSnapshot(query(collection(db, "SupportTickets"), orderBy("createdAt", "desc")), snap => cb(snap.docs.map(d => ({id: d.id, ...d.data()}))), err => console.error("Firestore Ticket Error:", err));
export const updateTicket = (id, data) => updateDoc(doc(db, "SupportTickets", id), data);
export const listenMessages = (ticketId, cb) => onSnapshot(query(collection(db, "SupportTickets", ticketId, "Messages"), orderBy("timestamp", "asc")), snap => cb(snap.docs.map(d => ({id: d.id, ...d.data()}))), err => console.error("Firestore Msg Error:", err));
export const sendMessage = async (ticketId, msg) => {
  const res = await fetch(`${BACKEND_URL}/send-support-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticketId, msg })
  });
  if (!res.ok) throw new Error("Failed to send message: " + res.status);
  return await res.json();
};

// --- Backend Health Check ---
export const pingBackend = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BACKEND_URL}/`);
      if (res.ok) {
        console.log("✅ Backend is Awake");
        return true;
      }
    } catch (e) {
      console.log(`⏳ Backend waking up... Attempt ${i+1}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return false;
};

// --- Notification Services (Via Backend & DB) ---
export const addNotification = (data) => addDoc(collection(db, "Notifications"), data);
export const sendPush = async (title, message, uids = null, options = {}) => {
  const body = { 
    title, 
    message,
    priority: 10,
    ...options
  };
  
  // Align keys for backend to OneSignal
  if (body.image) {
    body.big_picture = body.image;
    delete body.image;
  }
  if (uids) body.uids = uids;

  try {
    const res = await fetch(`${BACKEND_URL}/send-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (!res.ok || json.status === false) throw new Error(json.message || `Backend Error: ${res.status}`);
    return json;
  } catch (err) {
    console.error("Push Error:", err.message, err.stack || err);
    throw err;
  }
};

// --- App Settings ---
export const listenAppConfig = (cb) => onSnapshot(doc(db, "Settings", "AppConfig"), snap => cb(snap.data()), err => console.error("Firestore Config Error:", err));
export const updateAppConfig = async (data) => {
  try {
    await updateDoc(doc(db, "Settings", "AppConfig"), data);
  } catch (e) {
    if (e.code === 'not-found') await setDoc(doc(db, "Settings", "AppConfig"), data);
    else throw e;
  }
};

// --- Staff Services ---
export const listenStaff = (cb) => onSnapshot(collection(db, "Staff"), snap => cb(snap.docs.map(d => ({id: d.id, ...d.data()}))), err => console.error("Firestore Staff Error:", err));
export const createStaff = (data) => setDoc(doc(db, "Staff", data.username), data);
export const deleteStaff = (id) => deleteDoc(doc(db, "Staff", id));
export const updateStaff = (id, data) => updateDoc(doc(db, "Staff", id), data);

// --- Staff Withdrawal Services ---
export const createStaffWithdrawal = (data) => addDoc(collection(db, "StaffWithdrawals"), data);
export const listenStaffWithdrawals = (staffUsername, cb) => onSnapshot(query(collection(db, "StaffWithdrawals"), where("staffUsername", "==", staffUsername), orderBy("timestamp", "desc")), snap => cb(snap.docs.map(d => ({id: d.id, ...d.data()}))), err => console.error("Staff Withdrawal Error:", err));

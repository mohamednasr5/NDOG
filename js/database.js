// database.js - عمليات قاعدة البيانات الموحدة
import { db } from './firebase.js';
import { ref, get, set, update, push, remove, onValue, query, orderByChild, limitToLast, equalTo } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

export function getRef(path) { return ref(db, path); }

export async function readData(path) {
  const snap = await get(ref(db, path));
  return snap.val();
}

export async function writeData(path, data) {
  await set(ref(db, path), data);
}

export async function updateData(path, data) {
  await update(ref(db, path), data);
}

export async function pushData(path, data) {
  const newRef = push(ref(db, path));
  await set(newRef, { ...data, id: newRef.key });
  return newRef.key;
}

export async function deleteData(path) {
  await remove(ref(db, path));
}

export function listenData(path, callback) {
  return onValue(ref(db, path), (snap) => callback(snap.val()));
}

// دوال متقدمة
export function queryOrdered(path, orderBy, limit = 100) {
  return query(ref(db, path), orderByChild(orderBy), limitToLast(limit));
}
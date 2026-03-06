import { db } from './firebase-config.js';
import { 
    collection, 
    getDocs, 
    doc, 
    query, 
    where, 
    Timestamp,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const moaCol = collection(db, "moas");
const auditCol = collection(db, "audit_logs");

export async function saveMoa(data, id = null, currentUser) {
    const batch = writeBatch(db);
    let moaRef;
    let actionType;

    data.effectiveDate = Timestamp.fromDate(new Date(data.effectiveDate));
    data.isDeleted = false;

    if (id) {
        moaRef = doc(db, "moas", id);
        batch.update(moaRef, data);
        actionType = "Edit";
    } else {
        moaRef = doc(collection(db, "moas"));
        batch.set(moaRef, data);
        actionType = "Insert";
    }

    const auditRef = doc(collection(db, "audit_logs"));
    batch.set(auditRef, {
        moaId: moaRef.id,
        companyName: data.companyName,
        userId: currentUser.uid,
        userName: currentUser.displayName,
        action: actionType,
        timestamp: serverTimestamp()
    });

    return await batch.commit();
}

export async function softDeleteMoa(id, companyName, currentUser) {
    const batch = writeBatch(db);
    const moaRef = doc(db, "moas", id);
    batch.update(moaRef, { isDeleted: true });

    const auditRef = doc(collection(db, "audit_logs"));
    batch.set(auditRef, {
        moaId: id,
        companyName: companyName,
        userId: currentUser.uid,
        userName: currentUser.displayName,
        action: "Soft-Delete",
        timestamp: serverTimestamp()
    });

    return await batch.commit();
}

export async function recoverMoa(id, companyName, currentUser) {
    const batch = writeBatch(db);
    const moaRef = doc(db, "moas", id);
    batch.update(moaRef, { isDeleted: false });

    const auditRef = doc(collection(db, "audit_logs"));
    batch.set(auditRef, {
        moaId: id,
        companyName: companyName,
        userId: currentUser.uid,
        userName: currentUser.displayName,
        action: "Recover",
        timestamp: serverTimestamp()
    });

    return await batch.commit();
}

// Returns only active (non-deleted) MOAs — used for stats, edit, delete, student view
export async function getAllMoas() {
    const q = query(moaCol, where("isDeleted", "==", false));
    const snapshot = await getDocs(q);
    let moas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    moas.sort((a, b) => a.companyName.localeCompare(b.companyName));
    return moas;
}

// Returns ALL MOAs including soft-deleted — admin main list view only (req #11)
export async function getAllMoasAdmin() {
    const snapshot = await getDocs(moaCol);
    let moas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Sort: active first, then deleted; alphabetical within each group
    moas.sort((a, b) => {
        if (a.isDeleted !== b.isDeleted) return a.isDeleted ? 1 : -1;
        return a.companyName.localeCompare(b.companyName);
    });
    return moas;
}

// Returns only soft-deleted MOAs — Trash view
export async function getDeletedMoas() {
    const q = query(moaCol, where("isDeleted", "==", true));
    const snapshot = await getDocs(q);
    let moas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    moas.sort((a, b) => a.companyName.localeCompare(b.companyName));
    return moas;
}

export async function getAuditLogs() {
    const q = query(auditCol);
    const snapshot = await getDocs(q);
    let logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    logs.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
    return logs;
}

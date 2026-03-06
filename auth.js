import { auth, provider, db } from './firebase-config.js';
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export async function loginWithGoogle() {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        if (!user.email.endsWith('@neu.edu.ph')) {
            await signOut(auth);
            throw new Error("Access Denied: Please use your institutional (@neu.edu.ph) email.");
        }

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            await setDoc(userRef, {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                role: 'student',
                maintainAccess: false,
                isBlocked: false,
                createdAt: serverTimestamp()
            });
        } else if (userSnap.data().isBlocked) {
            await signOut(auth);
            throw new Error("Your account has been blocked. Please contact the administrator.");
        }

        return user;
    } catch (error) {
        throw error;
    }
}

export function logout() {
    return signOut(auth);
}

export function observeAuth(callback) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userSnap = await getDoc(doc(db, "users", user.uid));
            callback(user, userSnap.exists() ? userSnap.data() : null);
        } else {
            callback(null, null);
        }
    });
}

// --- USER MANAGEMENT FUNCTIONS ---
export async function getAllUsers() {
    const snapshot = await getDocs(collection(db, "users"));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function updateUserRecord(userId, data) {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, data);
}
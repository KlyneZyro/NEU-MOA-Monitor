# 📋 NEU MOA Monitoring System

A web-based Memorandum of Agreement (MOA) management platform for New Era University. Streamlines the tracking, monitoring, and management of institutional partnerships and agreements with industry partners for student OJT placements.

---

## 🔗 Live Demo
> https://klynezyro.github.io/NEU-MOA-Monitor/

---

## ✨ Features

### For Students
- **Browse Available Companies** — View active partnerships available for OJT placements
- **Company Details** — See partnership information and requirements
- **MOA Status Tracking** — Know which agreements are active or pending

### For Faculty / Coordinators
- **Dashboard Analytics** — Overview of active, processing, and expiring MOAs
- **MOA Management** — Create, edit, and soft-delete agreements
- **Expiry Tracking** — Automatic warnings for agreements expiring within 60 or 180 days
- **Date Range Filtering** — Filter MOAs by effective date range
- **CSV Export** — Download filtered MOA data

### For Administrators
- **Full Control** — Complete CRUD operations on MOAs
- **User Management** — Manage user accounts and roles
- **Audit Trail** — Complete log of all system actions with timestamps
- **Trash & Recovery** — Soft-delete MOAs with ability to restore
- **Faculty Access Control** — Grant/revoke edit access to faculty members
- **Search & Filter** — Advanced filtering by college, date, and status

### Automatic
- **Real-time Role-Based UI** — Interface adapts based on user role (student/faculty/admin)
- **Soft-Delete Protection** — MOAs never permanently deleted, can be recovered
- **Audit Logging** — Every action tracked with user, timestamp, and details
- **Expiry Color Indicators** — Visual warnings (green/yellow/red) for agreement status

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, Tailwind CSS, Vanilla JavaScript (ES Modules) |
| UI Components | SweetAlert2, Flatpickr (date picker) |
| Authentication | Firebase Authentication (Google OAuth) |
| Database | Firebase Firestore (real-time, NoSQL) |
| Hosting | GitHub Pages |

---

## 🚀 Setup & Deployment

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/NEU-MOA-System.git
cd NEU-MOA-System
```

### 2. Firebase Configuration
The app uses Firebase. Your config is in `firebase-config.js` with your project credentials from [Firebase Console](https://console.firebase.google.com).

**Your current config is already set:**
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAKDBcIshZ4tObZNtRFZv2IL2xK4iAd3Y8",
  authDomain: "neu-moa-bfe17.firebaseapp.com",
  projectId: "neu-moa-bfe17",
  // ... rest of config
};
```

### 3. Firestore Security Rules
In Firebase Console → Firestore → **Rules**, paste:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      allow read: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    match /moas/{moaId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'faculty'];
    }

    match /audit_logs/{logId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

### 4. Set Admin Account
In Firebase Console → Firestore → `users` collection:
1. Find your user document
2. Set field `role: "admin"`

### 5. Deploy to GitHub Pages
- **Go to:** Repository → Settings → Pages
- **Source:** `Deploy from a branch`
- **Branch:** `main`, Folder: `/root`
- **Site will be live at:** `https://your-username.github.io/NEU-MOA-System`

---

## 📁 Project Structure

```
NEU-MOA-System/
├── index.html              # All views (login, dashboard, MOA list, audit, trash, users)
├── app.js                  # Core logic, UI controllers, event handlers
├── auth.js                 # Firebase authentication & user management
├── firebase-config.js      # Firebase project credentials
├── moa-service.js          # MOA CRUD operations & audit logging
├── style.css               # Custom styling & animations
├── README.md               # Project documentation
├── QUICKSTART.md           # Fast setup checklist
├── SETUP.md                # Detailed setup guide
├── CONTRIBUTING.md         # Contribution guidelines
├── GITHUB_REFERENCE.md     # Git workflow guide
├── .gitignore              # Git exclusion patterns
└── LICENSE                 # MIT License
```

---

## 🔐 Security Notes
- Email domain enforcement — only `@neu.edu.ph` accounts can sign in
- Admin & Faculty roles set **only** via Firebase Console — users cannot self-elevate
- Firestore rules restrict write access — students cannot edit MOAs
- Audit logging tracks all write operations
- Soft-delete pattern protects data — no permanent deletions

---

## 📊 Database Schema

### Collections

**users**
- `uid` (string) — Firebase auth ID
- `email` (string) — User email (@neu.edu.ph)
- `displayName` (string) — Full name
- `role` (string) — 'student', 'faculty', 'admin'
- `maintainAccess` (boolean) — Faculty edit permissions
- `isBlocked` (boolean) — Ban status
- `createdAt` (timestamp)

**moas**
- `companyName` (string) — Partner company name
- `effectiveDate` (timestamp) — MOA start date
- `isDeleted` (boolean) — Soft-delete flag
- Additional fields for specific MOA details

**audit_logs**
- `moaId` (string) — Reference to MOA
- `companyName` (string) — Company name for context
- `userId` (string) — Who performed action
- `userName` (string) — User's display name
- `action` (string) — 'Insert', 'Edit', 'Soft-Delete', 'Recover'
- `timestamp` (timestamp) — When action occurred

---

## 🔧 Development

### Local Testing
```bash
# Start HTTP server
python -m http.server 8000    # Python 3
npx serve                      # Node.js

# Visit
http://localhost:8000
```

### Module System
This project uses ES Modules. All imports must include `.js` extension:
```javascript
import { saveMoa, getAllMoas } from './moa-service.js';
```

### Code Organization
- **app.js** — All UI logic and event handlers (~850 lines)
- **auth.js** — Authentication and user management (~60 lines)
- **moa-service.js** — MOA database operations (~120 lines)
- **firebase-config.js** — Firebase initialization (~20 lines)

---

## 👤 Author
**Klyne Zyro Reyes**  
Bachelor of Science in Computer Science  
New Era University

---

## 📄 License
This project was developed as an academic requirement.  
© 2026 New Era University — All rights reserved.

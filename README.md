# CONNECTLY — Modern Real-Time Messaging & Social Platform
> Inspired by WhatsApp, engineered for privacy, personalization, and real-time interaction.

Version: **1.0.0**  
Product Type: **Social Messaging Web Application + PWA**

---

## 🚀 Quick Start (Two Ways to Run)

### Option 1: Run with Local Node.js Server (Recommended for multi-client & network)
1. Double-click **`start.bat`** (or open terminal in this folder and run `npm start` / `node server.js`).
2. Open your web browser at **`http://localhost:3000`**.
3. Real-time messaging uses native **WebSocket (`/ws`)** and **Server-Sent Events (`/api/events`)**.

### Option 2: Open Directly as HTML File (Zero installation needed)
1. Double-click **`index.html`** or **`public/index.html`** directly in Chrome, Edge, Safari, or Firefox.
2. The application will run in standalone mode with complete multi-tab real-time sync powered by `BroadcastChannel` and `localStorage`!

---

## 👥 Demo Accounts (1-Click Login Ready)

You can click any of the quick login chips on the sign-in screen or register your own unique Connectly ID:

| User | Connectly ID | Email | Password | Bio |
| :--- | :--- | :--- | :--- | :--- |
| **Faraz Ahmed** | `@faraz123` | `faraz@connectly.app` | `Password123!` | Product Designer & Tech Explorer 🚀 |
| **Ahmed Khan** | `@ahmed456` | `ahmed@connectly.app` | `Password123!` | Full Stack Engineer \| Coffee lover ☕ |
| **Sarah Connor** | `@sarah_dev` | `sarah@connectly.app` | `Password123!` | UI/UX enthusiast & open-source advocate ✨ |

---

## ✨ Features Implemented (PRD Compliance Matrix)

| Section | Feature | Implementation Details |
| :--- | :--- | :--- |
| **3. Auth** | Register & Login | Full validation, duplicate checks, persistent sessions, password hashing (PBKDF2/SHA-512). |
| **4. Dashboard** | Responsive Layout | WhatsApp-style 3-column / 2-column desktop layout, mobile view sliding with back navigation. |
| **5. User Search** | Connectly ID Search | Instant search by unique ID (e.g. `ahmed456`), live search suggestions, profile previews, 1-click message creation. |
| **6. Real-Time Chat** | Core Messaging | Instant bi-directional messaging, Sent (`✓`), Delivered/Read (`✓✓` blue), typing indicators, timestamps, date dividers. |
| **6.2 Actions** | Replies, Edit, Delete | Quoted reply preview bubbles, inline message editing, deletion ("This message was deleted"), copy text. |
| **6.3 Stickers** | Stickers & Emojis | Full categorized emoji picker, custom animated-style vector sticker library (Cat, Blob, Rocket, Fire, Party). |
| **7. Media** | Camera Access | Live webcam viewfinder (`getUserMedia`), snapshot capture, photo review, and send. |
| **7.2 Gallery** | Media & Documents | Upload and share images, videos, audio voice notes, and documents (PDF, DOCX, TXT) with download links. |
| **7.4 Voice Notes** | Audio Recorder | Microphone recording (`MediaRecorder`), live status, and custom waveform player bubble. |
| **9. Stories** | 24-Hour Status | Upload image/video or custom gradient text status. Segmented progress bars with auto-advance, tap prev/next. |
| **10. Privacy** | Chat Lock (PIN) | Lock any individual conversation with a 4-digit PIN. Unlock modal with custom on-screen numeric keypad. |
| **11. Audio** | Audio Synthesizer | Web Audio API sound synthesis for sent/received message chimes and call ringing without external assets. |
| **12. Settings** | Personalization | Light Mode, Dark Mode, System Default theme switch, profile editing, bio character counter, sound toggles. |
| **PWA** | Progressive Web App | `manifest.json` and `sw.js` service worker for installable desktop & mobile experience. |

---

## 📁 Project Structure

```
connectly/
├── server.js              # High-performance Node.js HTTP, REST API & WebSocket server
├── package.json           # Project manifest and start scripts
├── start.bat              # One-click Windows launcher
├── data/
│   └── connectly-db.json  # Persistent JSON database (Users, Chats, Messages, Stories)
├── public/
│   ├── index.html         # Main application interface
│   ├── styles.css         # Modern styling, responsive layout, animations, Dark/Light theme
│   ├── app.js             # Client app logic, WebSockets, WebRTC camera, audio recorder, stories
│   ├── manifest.json      # Progressive Web App manifest
│   ├── sw.js              # Offline caching service worker
│   └── uploads/           # Media storage directory
└── README.md              # Documentation
```

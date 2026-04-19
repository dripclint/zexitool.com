import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// --- Firebase Config ---
const firebaseConfig = {
    apiKey: "AIzaSyA1gJbICweCK_K5xQQK6iIrfEWfwqatytU",
    authDomain: "hackmode-2e1b1.firebaseapp.com",
    projectId: "hackmode-2e1b1",
    storageBucket: "hackmode-2e1b1.firebasestorage.app",
    messagingSenderId: "961579533174",
    appId: "1:961579533174:web:f59b6a7e1bf7616aed7057"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- High Performance Toast Service ---
class ToastService {
    static container = document.getElementById('toast-container');
    
    static show(message, type = 'error') {
        if (!this.container) return;
        const toast = document.createElement('div');
        const isError = type === 'error';
        const colorClass = isError ? 'text-game-red border-game-red bg-game-red/10' : 'text-green-400 border-green-500 bg-green-500/10';
        
        toast.className = `toast-enter flex items-center gap-3 py-2.5 px-4 rounded-lg border border-b-2 ${colorClass} bg-black/90 shadow-2xl backdrop-blur-md`;
        toast.innerHTML = `<span class="font-black uppercase text-[10px] tracking-[0.2em]">${message}</span>`;
        
        this.container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => toast.remove(), 300)
        }, 2000);
    }
}

// --- DOM & State Manager ---
class UIManager {
    constructor() {
        this.mode = 'login';
        this.dom = {
            tabs: document.querySelectorAll('.tab-btn'),
            confirmWrapper: document.getElementById('confirm-wrapper'),
            confirmInput: document.getElementById('confirm-password'),
            passwordInput: document.getElementById('password'),
            submitText: document.getElementById('submit-text'),
            submitBtn: document.getElementById('submit-btn'),
            tabContainer: document.getElementById('tab-container')
        };
        this.init();
    }

    init() {
        this.dom.tabContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.tab-btn');
            if (btn) this.setTab(btn.dataset.target);
        });
    }

    setTab(newMode) {
        if (this.mode === newMode) return;
        this.mode = newMode;
        
        this.dom.tabs.forEach(tab => {
            const isActive = tab.dataset.target === newMode;
            tab.classList.toggle('active', isActive);
            tab.classList.toggle('text-neutral-500', !isActive);
        });

        const isLogin = newMode === 'login';
        this.dom.confirmWrapper.dataset.state = isLogin ? 'collapsed' : 'expanded';
        this.dom.confirmInput.required = !isLogin;
        this.dom.submitText.innerText = isLogin ? "Enter Panel" : "Register Account";
    }

    setLoading(isLoading) {
        this.dom.submitBtn.disabled = isLoading;
        this.dom.submitText.innerText = isLoading ? "Authorizing..." : (this.mode === 'login' ? "Enter Panel" : "Register Account");
    }
}

// --- Auth Controller ---
class AuthController {
    constructor(ui) {
        this.ui = ui;
        this.form = document.getElementById('auth-form');
        this.inputs = {
            email: document.getElementById('email'),
            password: document.getElementById('password'),
            confirm: document.getElementById('confirm-password')
        };
        this.isProcessing = false;
        this.init();
    }

    init() {
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!this.isProcessing) this.processAuth();
        });

        onAuthStateChanged(auth, (user) => {
            const loader = document.getElementById('app-loader');
            if (user) window.location.replace("dashboard.html");
            else if (loader) loader.classList.add('opacity-0'), setTimeout(() => loader.remove(), 300);
        });
    }

    async processAuth() {
        const email = this.inputs.email.value.trim();
        const password = this.inputs.password.value;
        const confirm = this.inputs.confirm.value;

        if (!this.validate(email, password, confirm)) return;

        this.isProcessing = true;
        this.ui.setLoading(true);

        try {
            if (this.ui.mode === 'login') {
                const cred = await signInWithEmailAndPassword(auth, email, password);
                await updateDoc(doc(db, "users", cred.user.uid), { online: true, lastLogin: serverTimestamp() }).catch(() => {});
            } else {
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, "users", cred.user.uid), {
                    email: cred.user.email, uid: cred.user.uid, wallet: 0, role: "user",
                    createdAt: serverTimestamp(), online: true, lastLogin: serverTimestamp()
                });
            }
            window.location.replace("dashboard.html");
        } catch (err) {
            this.handleError(err);
            this.isProcessing = false;
            this.ui.setLoading(false);
        }
    }

    validate(email, password, confirm) {
        if (!email) return ToastService.show("Email Required", "error"), false;
        if (password.length < 6) return ToastService.show("Password 6+ Chars", "error"), false;
        if (this.ui.mode === 'register' && password !== confirm) return ToastService.show("Mismatch Passwords", "error"), false;
        return true;
    }

    handleError(err) {
        const codes = {
            'auth/invalid-credential': "Wrong Details",
            'auth/email-already-in-use': "Email Taken",
            'auth/too-many-requests': "Slow Down",
            'auth/network-request-failed': "Offline"
        };
        ToastService.show(codes[err.code] || "Auth Error", "error");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AuthController(new UIManager());
});

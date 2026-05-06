/**
 * ZEXI TOOL - REAL-TIME LIVE APPLICATION LOGIC
 * Architecture: Firebase v10 Modular SDK (Live Mode)
 * Features: Direct Wallet Purchase, Live Status Dot, Ban Protection, Video Player, Telegram Alerts
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, getDocs, updateDoc,
    query, where, serverTimestamp, doc, setDoc, increment
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// --- 1. REAL FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyA1gJbICweCK_K5xQQK6iIrfEWfwqatytU",
    authDomain: "hackmode-2e1b1.firebaseapp.com",
    projectId: "hackmode-2e1b1",
    storageBucket: "hackmode-2e1b1.firebasestorage.app",
    messagingSenderId: "961579533174",
    appId: "1:961579533174:web:f59b6a7e1bf7616aed7057"
};

// 📢 CONFIGURATION
const TELEGRAM_WORKER_URL = "https://lingering-water-7c0a.admin-zexitool.workers.dev";
const SITE_NAME = "ZEXITOOL"; // ✅ Fixed Website Name

const appInstance = initializeApp(firebaseConfig);
const auth = getAuth(appInstance);
const db = getFirestore(appInstance);

const STATE = {
    currentUser: null,
    balance: 0,
    unsubscribers: [],
    products: [],
    selectedProduct: null,
    selectedDuration: null,
    selectedPrice: 0,
    currentDepositTab: 'upi',
    depositHistoryHtml: '',
    ordersHistoryHtml: ''
};

// --- TELEGRAM HELPER FUNCTION ---
async function sendTelegramAlert(msg) {
    try {
        await fetch(TELEGRAM_WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: msg,
                site: SITE_NAME // Pass site name to worker
            })
        });
    } catch (e) { console.error("Telegram Alert Error:", e); }
}

// Helper function to handle local timestamp sorting (including pending nulls)
const sortByDateDesc = (a, b) => {
    const timeA = a.createdAt ? (a.createdAt.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime()) : Date.now();
    const timeB = b.createdAt ? (b.createdAt.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime()) : Date.now();
    return timeB - timeA;
};

// --- 2. UI CONTROLLER ---
const UI = {
    showToast(message, type = 'accent') {
        const container = document.getElementById('toast-container');
        if(!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.style.borderLeftColor = `var(--${type}, #ffb703)`;
        toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-check' : type === 'danger' ? 'fa-xmark' : 'fa-circle-info'}"></i> ${message}`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },

    setLoading(btnId, isLoading, originalText = '') {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        if (isLoading) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> WAIT...';
        } else {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    },

    formatDate(timestamp) {
        if (!timestamp) return 'Just now';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    },

    switchDepositTab(method) {
        STATE.currentDepositTab = method;
        
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.remove('active');
            const onclickAttr = t.getAttribute('onclick') || '';
            if (onclickAttr.includes(method)) {
                t.classList.add('active');
            }
        });
        
        const qrImg = document.getElementById('deposit-qr');
        const desc = document.getElementById('deposit-method-desc');
        const lblUtr = document.getElementById('lbl-utr');
        const inputUtr = document.getElementById('dep-utr');

        if(qrImg && desc && lblUtr && inputUtr) {
            if (method === 'upi') {
                qrImg.src = "https://i.ibb.co/DHsfsL3d/qr.png"; 
                desc.innerText = "Scan to pay via UPI";
                lblUtr.innerText = "UTR / Transaction ID (12 Digits)";
                inputUtr.placeholder = "Enter 12-digit UTR...";
                inputUtr.setAttribute('maxlength', '12');
                inputUtr.value = ''; 
            } else {
                qrImg.src = "https://i.ibb.co/5gVVk8jq/qr.png";
                desc.innerText = "Scan to pay via Binance Pay";
                lblUtr.innerText = "Binance Order ID";
                inputUtr.placeholder = "Enter Binance Order ID...";
                inputUtr.removeAttribute('maxlength');
                inputUtr.value = ''; 
            }
        }
    },

    openPurchaseModal(productId) {
        const product = STATE.products.find(p => p.id === productId);
        if (!product) {
            return UI.showToast('Product data not found.', 'danger');
        }

        STATE.selectedProduct = product;
        const nameEl = document.getElementById('modal-product-name');
        if (nameEl) nameEl.innerText = product.name;
        
        const pricingGrid = document.getElementById('modal-pricing-options');
        if (!pricingGrid) return;
        
        pricingGrid.innerHTML = '';
        
        Object.entries(product.prices).sort((a,b) => Number(a[0]) - Number(b[0])).forEach(([days, price], index) => {
            const div = document.createElement('div');
            div.className = `price-option ${index === 0 ? 'selected' : ''}`;
            div.innerHTML = `<strong>${days} Days</strong>₹${price}`;
            
            div.onclick = () => UI.selectDuration(days, price, div); 
            pricingGrid.appendChild(div);

            if(index === 0) UI.selectDuration(days, price, div); 
        });

        const modal = document.getElementById('purchase-modal');
        if (modal) modal.classList.add('active');
    },

    selectDuration(days, price, element) {
        STATE.selectedDuration = days;
        STATE.selectedPrice = Number(price);
        
        document.querySelectorAll('.price-option').forEach(el => el.classList.remove('selected'));
        if(element) element.classList.add('selected');
        
        const totalEl = document.getElementById('modal-total-price');
        if (totalEl) totalEl.innerText = STATE.selectedPrice;
    },

    closePurchaseModal() {
        const modal = document.getElementById('purchase-modal');
        if(modal) modal.classList.remove('active');
        STATE.selectedProduct = null;
        STATE.selectedDuration = null;
        STATE.selectedPrice = 0;
    }
};

// --- 3. DATA LAYER ---
const DataLayer = {
    async fetchProducts() {
        try {
            const snapshot = await getDocs(collection(db, 'products'));
            STATE.products = [];
            snapshot.forEach(doc => STATE.products.push({ id: doc.id, ...doc.data() }));
            
            const container = document.getElementById('product-list');
            if(!container) return;

            if(STATE.products.length === 0) {
                container.innerHTML = '<p class="text-muted" style="text-align:center; margin-top:2rem;">Store is empty. Please add products via Admin Panel.</p>';
            } else {
                DataLayer.renderProducts();
            }
        } catch (error) {
            UI.showToast("Failed to load store. Check Firebase rules.", "danger");
        }
    },

    renderProducts() {
        const container = document.getElementById('product-list');
        if(!container) return;
        
        container.innerHTML = STATE.products.map(p => {
            const hasValidVideo = p.videoUrl && p.videoUrl !== '#' && p.videoUrl.trim() !== '';
            
            const mediaContent = hasValidVideo 
                ? `<video controls preload="metadata" src="${p.videoUrl}" style="width: 100%; height: 150px; background: #000; display: block; object-fit: cover;"></video>`
                : `<div style="width: 100%; height: 150px; background: #222; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.3); font-size: 0.9rem;">
                       <i class="fa-solid fa-video-slash" style="margin-right: 8px;"></i> No preview available
                   </div>`;

            return `
            <div class="product-card" style="background: var(--surface, #121212); border: 1px solid var(--border, #2a2a2a); border-radius: 8px; margin-bottom: 1rem; overflow: hidden;">
                ${mediaContent}
                <div class="product-info" style="padding: 1rem;">
                    <h3 style="font-size: 1.3rem; margin-bottom: 0.5rem; color: #fff; font-weight: bold;">${p.name} <i class="fa-solid fa-crown text-accent" style="font-size:0.8rem; color:#ffb703;"></i></h3>
                    <p style="color: #888; font-size: 0.85rem; margin-bottom: 1rem;">Multiple durations available</p>
                    <button class="btn btn-primary btn-block ripple" style="width: 100%; padding: 1rem; background: #ffb703; color: #000; border: none; border-radius: 8px; font-weight: 700; font-size: 1rem; cursor: pointer;" onclick="app.openModal('${p.id}')">
                        PURCHASE NOW
                    </button>
                </div>
            </div>
            `;
        }).join('');
    },


    async processDeposit() {
        const amountEl = document.getElementById('dep-amount');
        const utrEl = document.getElementById('dep-utr');
        
        if (!amountEl || !utrEl) return;
        const amount = Number(amountEl.value);
        const utr = utrEl.value.trim();

        if (!amount || amount < 1) return UI.showToast('Minimum deposit is ₹1', 'danger');
        if (amount > 10000) return UI.showToast('Maximum deposit is ₹10000', 'danger');
        
        if (STATE.currentDepositTab === 'upi' && utr.length !== 12) {
            return UI.showToast('UTR must be exactly 12 characters', 'danger');
        } else if (STATE.currentDepositTab === 'binance' && utr.length < 5) {
            return UI.showToast('Please enter a valid Binance Order ID', 'danger');
        }

        UI.setLoading('btn-submit-deposit', true);

        try {
            await addDoc(collection(db, 'deposits'), {
                uid: STATE.currentUser.uid,
                email: STATE.currentUser.email || "Anonymous",
                method: STATE.currentDepositTab.toUpperCase(),
                amount: amount,
                utr: utr,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            // ✅ TELEGRAM NOTIFICATION FOR DEPOSIT
            const depositMsg = `💰 <b>Deposit Alert (${SITE_NAME})</b>\n\n👤 User: ${STATE.currentUser.email || 'Guest'}\n💵 Amount: ₹${amount}\n🔢 UTR/ID: <code>${utr}</code>\n🏦 Method: ${STATE.currentDepositTab.toUpperCase()}`;
            sendTelegramAlert(depositMsg);

            UI.showToast('Deposit request sent to admin!', 'success');
            amountEl.value = '';
            utrEl.value = '';
            Router.navigate('history');
        } catch (error) {
            UI.showToast('Database Error', 'danger');
        } finally {
            UI.setLoading('btn-submit-deposit', false, 'SUBMIT REQUEST');
        }
    },

    async processPurchase() {
        if (!STATE.selectedProduct) return UI.showToast('Error: No product selected.', 'danger');
        if (!STATE.selectedDuration) return UI.showToast('Error: Please select a duration.', 'danger');
        
        if (STATE.balance < STATE.selectedPrice) {
            return UI.showToast('Insufficient wallet balance.', 'danger');
        }

        UI.setLoading('btn-confirm-purchase', true);

        try {
            const userRef = doc(db, 'users', STATE.currentUser.uid);
            await updateDoc(userRef, {
                balance: increment(-STATE.selectedPrice)
            });

            await addDoc(collection(db, 'orders'), {
                uid: STATE.currentUser.uid,
                email: STATE.currentUser.email || "Anonymous",
                productId: STATE.selectedProduct.id,
                productName: STATE.selectedProduct.name,
                price: STATE.selectedPrice,
                duration: `${STATE.selectedDuration} Days`,
                paymentMethod: "WALLET",
                status: 'pending',
                key: null,
                createdAt: serverTimestamp()
            });

            // ✅ TELEGRAM NOTIFICATION FOR PURCHASE
            const orderMsg = `🔑 <b>New Order (${SITE_NAME})</b>\n\n👤 User: ${STATE.currentUser.email || 'Guest'}\n📦 Item: ${STATE.selectedProduct.name}\n⏳ Time: ${STATE.selectedDuration} Days\n💰 Paid: ₹${STATE.selectedPrice}`;
            sendTelegramAlert(orderMsg);
            
            UI.showToast('Order placed successfully!', 'success');
            UI.closePurchaseModal();
            Router.navigate('keys');
        } catch (error) {
            UI.showToast('Failed to place order.', 'danger');
        } finally {
            UI.setLoading('btn-confirm-purchase', false, 'PAY FROM WALLET');
        }
    },

    listenToUserData() {
        STATE.unsubscribers.forEach(u => u());
        STATE.unsubscribers = [];
        const uid = STATE.currentUser.uid;
        const statusDot = document.getElementById('login-status-dot');

        const unsubWallet = onSnapshot(doc(db, 'users', uid), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                
                if (data.isBanned) {
                    if(statusDot) {
                        statusDot.style.background = '#e63946';
                        statusDot.style.boxShadow = '0 0 8px #e63946';
                    }
                    const authGuard = document.getElementById('auth-guard');
                    const authStatus = document.getElementById('auth-status-text');
                    if (authGuard) authGuard.style.display = 'flex';
                    if (authStatus) authStatus.innerHTML = `<span class="text-danger" style="font-size:2rem;"><i class="fa-solid fa-ban"></i> ACCOUNT BANNED</span><p style="font-size:1rem; color:#888; margin-top:10px;">Contact Admin for support.</p>`;
                    return; 
                } else {
                    if(statusDot) {
                        statusDot.style.background = '#2a9d8f';
                        statusDot.style.boxShadow = '0 0 8px #2a9d8f';
                    }
                    const authGuard = document.getElementById('auth-guard');
                    if (authGuard) authGuard.style.display = 'none';
                }

                STATE.balance = data.balance || 0;
                const walletElement = document.getElementById('wallet-balance');
                if(walletElement) walletElement.innerText = STATE.balance.toFixed(2);
            } else {
                setDoc(doc(db, 'users', uid), { email: STATE.currentUser.email || "Anon", balance: 0, isBanned: false });
            }
        });

        const depQ = query(collection(db, 'deposits'), where('uid', '==', uid));
        const unsubDep = onSnapshot(depQ, (snapshot) => {
            let depHtml = '';
            let historyHtml = '';
            
            const deposits = [];
            snapshot.forEach(doc => deposits.push({ id: doc.id, ...doc.data() }));
            deposits.sort(sortByDateDesc);
            
            deposits.forEach(data => {
                const statusColor = data.status === 'success' ? 'success' : data.status === 'failed' ? 'failed' : 'pending';
                const itemHtml = `
                    <div class="list-item">
                        <div class="details">
                            <h4>Deposit (${data.method}) - ₹${data.amount}</h4>
                            <p>ID: ${data.utr} • ${UI.formatDate(data.createdAt)}</p>
                        </div>
                        <span class="badge ${statusColor}" style="border:1px solid currentColor; padding:4px 8px; border-radius:4px; font-size:0.8rem;">${data.status.toUpperCase()}</span>
                    </div>`;
                if (data.status === 'pending') depHtml += itemHtml;
                historyHtml += itemHtml;
            });
            
            const depListEl = document.getElementById('deposit-list');
            if (depListEl) depListEl.innerHTML = depHtml || '<p class="text-muted">No pending deposits.</p>';
            
            STATE.depositHistoryHtml = historyHtml; 
            DataLayer.updateHistoryPage(); 
        });

        const ordQ = query(collection(db, 'orders'), where('uid', '==', uid));
        const unsubOrd = onSnapshot(ordQ, (snapshot) => {
            const orders = [];
            snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
            orders.sort(sortByDateDesc);

            let keysHtml = '';
            let historyHtml = '';
            let recentHtml = '';

            orders.forEach((data, index) => {
                const statusColor = data.status === 'success' ? 'success' : data.status === 'failed' ? 'failed' : 'pending';
                
                let keySection = data.status === 'success' && data.key 
                    ? `<div style="margin-top:10px; background:#000; padding:8px; border-radius:4px; display:flex; justify-content:space-between; align-items:center;">
                        <code style="color:#ffb703;">${data.key}</code>
                        <button class="btn btn-outline" style="padding:4px 10px; font-size:0.8rem; border:1px solid #ffb703; background:none; color:#ffb703; border-radius:4px; cursor:pointer;" onclick="app.copy('${data.key}')">COPY</button>
                       </div>`
                    : data.status === 'pending' 
                        ? `<p style="color:#888; font-size:0.8rem; margin-top:8px;"><i class="fa-solid fa-spinner fa-spin"></i> Awaiting Admin Delivery</p>` : '';

                const cardHtml = `
                    <div class="card" style="background:#121212; border:1px solid #2a2a2a; padding:15px; border-radius:8px; margin-bottom:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h3 style="color:#ffb703; margin:0; font-size:1.2rem;">${data.productName}</h3>
                            <span class="badge ${statusColor}" style="border:1px solid currentColor; padding:4px 8px; border-radius:4px; font-size:0.8rem;">${data.status.toUpperCase()}</span>
                        </div>
                        <p style="color:#888; font-size:0.85rem; margin-top:5px;">${data.duration} • ₹${data.price} • ${UI.formatDate(data.createdAt)}</p>
                        ${keySection}
                    </div>`;
                
                keysHtml += cardHtml;
                if (index < 3) recentHtml += cardHtml;

                historyHtml += `
                    <div class="list-item">
                        <div class="details">
                            <h4>Order - ${data.productName}</h4>
                            <p>₹${data.price} • ${UI.formatDate(data.createdAt)}</p>
                        </div>
                        <span class="badge ${statusColor}" style="border:1px solid currentColor; padding:4px 8px; border-radius:4px; font-size:0.8rem;">${data.status.toUpperCase()}</span>
                    </div>`;
            });

            const keysListEl = document.getElementById('keys-list');
            if (keysListEl) keysListEl.innerHTML = keysHtml || '<p class="text-muted">No keys purchased yet.</p>';
            
            STATE.ordersHistoryHtml = historyHtml;
            DataLayer.updateHistoryPage(); 
            
            const recentActEl = document.getElementById('home-recent-activity');
            if (recentActEl) {
                recentActEl.innerHTML = recentHtml || '<p class="text-muted">No recent activity.</p>';
                recentActEl.classList.remove('skeleton-container');
            }
        });

        STATE.unsubscribers.push(unsubWallet, unsubDep, unsubOrd);
    },

    updateHistoryPage() {
        const content = (STATE.depositHistoryHtml || '') + (STATE.ordersHistoryHtml || '');
        const historyEl = document.getElementById('history-list');
        if (historyEl) historyEl.innerHTML = content || '<p class="text-muted">No transactions found.</p>';
    }
};

// --- 4. ROUTER & GLOBAL EVENT EXPOSURE ---
const Router = {
    navigate(pageId) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const targetPage = document.getElementById(`page-${pageId}`);
        if(targetPage) targetPage.classList.add('active');
        
        document.querySelectorAll('.nav-item').forEach(n => {
            n.classList.remove('active');
            const targetAttr = n.getAttribute('data-target') || '';
            const onclickAttr = n.getAttribute('onclick') || '';
            if (targetAttr === pageId || onclickAttr.includes(pageId)) {
                n.classList.add('active');
            }
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

// CRITICAL FIX: Expose global functions
window.app = {
    navigate: (pageId) => Router.navigate(pageId),
    switchDepositTab: (method) => UI.switchDepositTab(method),
    openModal: (id) => UI.openPurchaseModal(id),
    closePurchaseModal: () => UI.closePurchaseModal(),
    closeVideoModal: () => {
        const modal = document.getElementById('video-modal');
        const videoElement = document.getElementById('preview-video');
        if(modal) modal.classList.remove('active');
        if(videoElement) {
            videoElement.pause();
            videoElement.src = ""; 
        }
    },
    playVideo: (url) => { 
        const modal = document.getElementById('video-modal');
        const videoElement = document.getElementById('preview-video');
        
        if(url && url !== "#" && videoElement) {
            videoElement.src = url;
            videoElement.play().catch(e => console.log("Video Play Error:", e));
        } else {
            UI.showToast('No preview available', 'danger');
            return;
        }
        if(modal) modal.classList.add('active'); 
    },
    copy: (txt) => { navigator.clipboard.writeText(txt); UI.showToast('Key copied!', 'success'); }
};

// --- 5. INITIALIZATION ---
function initApp() {
    UI.switchDepositTab('upi');

    const btnSubmitDeposit = document.getElementById('btn-submit-deposit');
    if (btnSubmitDeposit) btnSubmitDeposit.addEventListener('click', () => DataLayer.processDeposit());
    
    const btnConfirmPurchase = document.getElementById('btn-confirm-purchase');
    if (btnConfirmPurchase) btnConfirmPurchase.addEventListener('click', () => DataLayer.processPurchase());
    
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) btnLogout.addEventListener('click', () => {
        signOut(auth).then(() => {
            window.location.href = 'index.html'; 
        });
    });

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const navElement = e.target.closest('.nav-item');
            if (navElement) {
                const targetPage = navElement.getAttribute('data-target');
                if (targetPage) Router.navigate(targetPage);
            }
        });
    });

    const nav = document.querySelector('.bottom-nav');
    if (nav && window.visualViewport) {
        let baseHeight = window.visualViewport.height;
        window.visualViewport.addEventListener('resize', () => {
            const currentHeight = window.visualViewport.height;
            const offset = baseHeight - currentHeight;
            if (offset > 100) {
                nav.style.transform = `translateY(${offset}px)`;
            } else {
                nav.style.transform = 'translateY(0)';
                baseHeight = currentHeight; 
            }
        });
    }

    onAuthStateChanged(auth, async (user) => {
        const dot = document.getElementById('login-status-dot');
        if (user) {
            if (STATE.currentUser && STATE.currentUser.uid === user.uid) return;
            STATE.currentUser = user;
            const emailEl = document.getElementById('display-user-email');
            if(emailEl) emailEl.innerText = user.email || "Guest User";
            if(dot) {
                dot.style.background = '#2a9d8f'; 
                dot.style.boxShadow = '0 0 8px #2a9d8f';
            }
            document.getElementById('auth-guard').style.display = 'none';
            DataLayer.fetchProducts();
            DataLayer.listenToUserData();
        } else {
            if(dot) {
                dot.style.background = '#e63946'; 
                dot.style.boxShadow = '0 0 8px #e63946';
            }
            signInAnonymously(auth).catch(err => {
                const statusText = document.getElementById('auth-status-text');
                if(statusText) statusText.innerHTML = `<span class="text-danger">AUTH FAILED</span>`;
            });
        }
    });
}

document.addEventListener('DOMContentLoaded', initApp);

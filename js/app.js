/**
 * app.js - 접속자 페이지 게임 플로우
 * 흐름: 랜딩(intro) → 스캔(scan) → 결과 공개(reveal) → 교훈(lesson)
 */

// ── Collector 선택 ──
const mockCollector = {
  async collect() {
    return [
      { id: 'ip', category: 'network', label: 'IP 주소', value: '203.0.113.42', shockLevel: 4 },
      { id: 'location', category: 'network', label: '위치', value: '서울특별시 강남구', shockLevel: 4 },
      { id: 'isp', category: 'network', label: 'ISP', value: 'SK Broadband', shockLevel: 3 },
      { id: 'browser', category: 'system', label: '브라우저', value: 'Chrome 120', shockLevel: 2 },
      { id: 'os', category: 'system', label: 'OS', value: 'macOS 14.2', shockLevel: 2 },
      { id: 'resolution', category: 'display', label: '화면 해상도', value: '1920 x 1080', shockLevel: 1 },
      { id: 'language', category: 'locale', label: '언어 설정', value: 'ko-KR', shockLevel: 1 },
      { id: 'timezone', category: 'locale', label: '시간대', value: 'Asia/Seoul (UTC+9)', shockLevel: 2 },
      { id: 'battery', category: 'hardware', label: '배터리 잔량', value: '73%', shockLevel: 3 },
      { id: 'ram', category: 'hardware', label: '기기 메모리', value: '8 GB', shockLevel: 3 },
      { id: 'cpu', category: 'hardware', label: 'CPU 코어 수', value: '8코어', shockLevel: 2 },
      { id: 'gpu', category: 'hardware', label: 'GPU', value: 'ANGLE (Apple, M1, OpenGL)', shockLevel: 3 },
      { id: 'darkmode', category: 'preference', label: '다크 모드', value: '사용 중', shockLevel: 2 },
      { id: 'dnt', category: 'privacy', label: 'Do Not Track', value: '비활성화', shockLevel: 2 },
      { id: 'adblocker', category: 'privacy', label: '광고 차단기', value: '감지됨', shockLevel: 3 },
      { id: 'fonts', category: 'fingerprint', label: '감지된 폰트 수', value: '약 152개', shockLevel: 4 },
      { id: 'canvas', category: 'fingerprint', label: 'Canvas 핑거프린트', value: 'a7f3c9...d2e1b8', shockLevel: 5 },
      { id: 'webgl', category: 'fingerprint', label: 'WebGL 핑거프린트', value: 'e4b2a1...f9c3d7', shockLevel: 5 },
      { id: 'audio', category: 'fingerprint', label: 'AudioContext 핑거프린트', value: '35.108...72491', shockLevel: 5 },
      { id: 'webrtc', category: 'network', label: 'WebRTC 내부 IP', value: '192.168.0.12', shockLevel: 5 },
      { id: 'incognito', category: 'privacy', label: '시크릿 모드', value: '일반 모드', shockLevel: 4 },
    ];
  }
};

function getCollector() {
  if (typeof Collector !== 'undefined' && Collector && typeof Collector.collect === 'function') {
    return Collector;
  }
  return mockCollector;
}

// ── DOM ──
const introScreen = document.getElementById('intro');
const scanScreen = document.getElementById('scan');
const revealScreen = document.getElementById('reveal');
const lessonScreen = document.getElementById('lesson');
const startBtn = document.getElementById('startBtn');
const retryBtn = document.getElementById('retryBtn');
const screenShareBtn = document.getElementById('screenShareBtn');
const punchline = document.getElementById('punchline');

// 4분할 패널
const panels = {
  network: document.querySelector('[data-panel="network"]'),
  hardware: document.querySelector('[data-panel="hardware"]'),
  system: document.querySelector('[data-panel="system"]'),
  fingerprint: document.querySelector('[data-panel="fingerprint"]'),
};
const counterEl = document.getElementById('counter');
const progressBar = document.getElementById('progressBar');
const scanPercent = document.getElementById('scanPercent');
const scanStatus = document.getElementById('scanStatus');
const scanItems = document.getElementById('scanItems');
const categorySummary = document.getElementById('categorySummary');

// ── 화면 전환 ──
function showScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
  window.scrollTo(0, 0);
}

// ── 스캔 화면: 가짜 로딩 + 실제 수집 병렬 ──
const scanMessages = [
  { text: '게임 에셋 로딩', pct: 12 },
  { text: '미사일 궤도 계산', pct: 24 },
  { text: '난이도 보정', pct: 36 },
  { text: '디스플레이 최적화', pct: 48 },
  { text: '입력 지연 측정', pct: 58 },
  { text: '서버 동기화', pct: 68 },
  { text: '랭킹 데이터 수신', pct: 78 },
  { text: '스테이지 생성', pct: 88 },
  { text: '게임 준비 완료', pct: 100 },
];

function addScanItem(text) {
  const el = document.createElement('div');
  el.className = 'scan-item';
  el.innerHTML = `<span class="check">&#10003;</span><span>${text}</span>`;
  scanItems.appendChild(el);
  // 스크롤이 필요하면 아래로
  scanItems.scrollTop = scanItems.scrollHeight;
}

async function runScanAnimation() {
  scanItems.innerHTML = '';
  for (let i = 0; i < scanMessages.length; i++) {
    const msg = scanMessages[i];
    scanStatus.textContent = msg.text + '...';
    progressBar.style.width = msg.pct + '%';
    scanPercent.textContent = msg.pct + '%';
    addScanItem(msg.text);
    // 각 단계 300~500ms (총 3~5초)
    await sleep(300 + Math.random() * 200);
  }
}

// ── 카테고리 → 패널 매핑 ──
function getPanelForCategory(category) {
  switch (category) {
    case 'network': return 'network';
    case 'hardware':
    case 'display': return 'hardware';
    case 'system':
    case 'locale':
    case 'preference':
    case 'meta':
    case 'behavior': return 'system';
    case 'fingerprint':
    case 'privacy': return 'fingerprint';
    default: return 'system';
  }
}

// ── 타이핑 효과 (빠른 버전) ──
function typeText(element, text, speed = 12) {
  return new Promise(resolve => {
    let i = 0;
    element.classList.add('typing-cursor');
    function type() {
      if (i < text.length) {
        // 한 번에 2~3글자씩
        const chunk = Math.min(3, text.length - i);
        element.textContent += text.substring(i, i + chunk);
        i += chunk;
        setTimeout(type, speed);
      } else {
        element.classList.remove('typing-cursor');
        resolve();
      }
    }
    type();
  });
}

// ── 결과 한 줄을 패널에 추가 ──
function addResultLine(panelEl, item) {
  const line = document.createElement('div');
  line.className = 'result-line';
  if (item.shockLevel >= 5) line.classList.add('shock-critical');
  else if (item.shockLevel >= 4) line.classList.add('shock-high');

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = item.label;

  const value = document.createElement('span');
  value.className = 'value';

  line.appendChild(label);
  line.appendChild(value);
  panelEl.appendChild(line);

  // 패널 내 스크롤
  panelEl.scrollTop = panelEl.scrollHeight;

  const displayValue = String(item.value ?? '알 수 없음');
  return typeText(value, displayValue);
}

// ── 카운터 애니메이션 ──
function animateCounter(target) {
  let current = 0;
  const duration = 1200;
  const interval = Math.max(20, Math.floor(duration / target));

  function tick() {
    current++;
    counterEl.textContent = current;
    if (current < target) {
      setTimeout(tick, interval);
    }
  }
  tick();
}

// ── 카테고리 요약 생성 ──
function buildCategorySummary(items) {
  categorySummary.innerHTML = '';

  // 카테고리별 대표 항목 추출
  const catMap = {
    network: { icon: '&#127760;', label: '네트워크', key: ['ip_address', 'ip_location', 'ip'] },
    hardware: { icon: '&#128187;', label: '기기', key: ['gpu_renderer', 'gpu', 'ram'] },
    fingerprint: { icon: '&#128270;', label: '고유 식별', key: ['fp_canvas', 'canvas'] },
    privacy: { icon: '&#128274;', label: '프라이버시', key: ['incognito', 'adblocker'] },
  };

  for (const [cat, info] of Object.entries(catMap)) {
    const found = items.find(i =>
      info.key.includes(i.id) || i.category === cat
    );
    if (!found) continue;

    const card = document.createElement('div');
    card.className = 'cat-card';
    card.innerHTML = `
      <div class="cat-icon">${info.icon}</div>
      <div class="cat-label">${info.label}</div>
      <div class="cat-value">${found.value ?? '수집됨'}</div>
    `;
    categorySummary.appendChild(card);
  }
}

// ── URL 토큰 파싱 ──
function getToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('t') || null;
}

// ── Firebase 전송 ──
async function sendToFirebase(items) {
  try {
    if (typeof FirebaseDB === 'undefined') return;
    FirebaseDB.init();

    // 토큰이 있으면 토큰 경로, 없으면 익명 ID 생성
    const token = getToken() || ('anon_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
    await FirebaseDB.pushVisitorData(token, items);
    FirebaseDB.trackPresence(token);
    console.log('[app] Firebase 전송 완료:', token);
  } catch (e) {
    console.warn('Firebase 전송 실패:', e);
  }
}

// ── 화면 공유 (PRD 7-4) ──
let senderSession = null;

async function startScreenShare() {
  const token = getToken();
  if (!token) {
    console.warn('화면 공유 생략: URL 토큰 없음');
    return;
  }
  try {
    if (typeof WebRTCManager === 'undefined') return;

    const stream = await WebRTCManager.getScreenStream();

    screenShareBtn.textContent = '화면 공유 연결 중...';
    screenShareBtn.disabled = true;

    senderSession = await WebRTCManager.startSender(token, stream, {
      onStateChange(state) {
        switch (state) {
          case 'connecting':
            screenShareBtn.textContent = '연결 중...';
            break;
          case 'connected':
            screenShareBtn.textContent = '화면 공유 중';
            screenShareBtn.style.borderColor = '#22c55e';
            screenShareBtn.style.color = '#22c55e';
            break;
          case 'disconnected':
          case 'failed':
          case 'closed':
            screenShareBtn.textContent = '화면 공유 종료됨';
            screenShareBtn.disabled = false;
            screenShareBtn.style.borderColor = '';
            screenShareBtn.style.color = '';
            senderSession = null;
            break;
        }
      },
      onStreamEnd() {
        screenShareBtn.textContent = '화면 공유 종료됨';
        screenShareBtn.disabled = false;
        screenShareBtn.style.borderColor = '';
        screenShareBtn.style.color = '';
        senderSession = null;
      },
    });
  } catch {
    // 사용자가 취소한 경우
    screenShareBtn.textContent = '추가 보안 진단 — 화면 공유';
    screenShareBtn.disabled = false;
  }
}

// ── 유틸 ──
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── 메인 게임 플로우 ──
async function startGame() {
  // 1. 스캔 화면으로 전환
  showScreen(scanScreen);

  // 스캔 애니메이션과 실제 수집을 병렬로
  const activeCollector = getCollector();
  console.log('[app] 사용 중인 collector:', activeCollector === mockCollector ? 'MOCK' : 'REAL');
  const [, items] = await Promise.all([
    runScanAnimation(),
    activeCollector.collect().then(r => {
      console.log('[app] 수집 완료:', r.length, '개 항목');
      return r;
    }).catch(e => {
      console.error('[app] 수집 실패, mock 데이터 사용:', e);
      return mockCollector.collect();
    }),
  ]);

  // null 값 필터링
  const validItems = items.filter(i => i.value !== null && i.value !== undefined);

  // Firebase 전송 (비동기, 기다리지 않음)
  sendToFirebase(validItems);

  // 잠시 대기 후 결과 화면으로
  await sleep(500);

  // 2. 결과 공개 화면
  showScreen(revealScreen);
  Object.values(panels).forEach(p => p.innerHTML = '');
  punchline.classList.add('hidden');
  punchline.classList.remove('visible');

  // 카테고리별로 4패널에 분배
  const panelItems = { network: [], hardware: [], system: [], fingerprint: [] };
  validItems.forEach(item => {
    const panelKey = getPanelForCategory(item.category);
    panelItems[panelKey].push(item);
  });

  // 각 패널 내에서 shockLevel 오름차순 정렬
  Object.values(panelItems).forEach(arr => arr.sort((a, b) => a.shockLevel - b.shockLevel));

  // 4패널 동시에 한 줄씩 표시
  const maxLen = Math.max(...Object.values(panelItems).map(a => a.length));
  for (let i = 0; i < maxLen; i++) {
    const promises = [];
    for (const [key, items] of Object.entries(panelItems)) {
      if (i < items.length) {
        promises.push(addResultLine(panels[key], items[i]));
      }
    }
    await Promise.all(promises);
    await sleep(80);
  }

  // 3. 펀치라인
  await sleep(800);
  punchline.classList.remove('hidden');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      punchline.classList.add('visible');
    });
  });

  // 4. 교훈 화면으로 전환
  await sleep(3000);
  showScreen(lessonScreen);
  animateCounter(validItems.length);
  buildCategorySummary(validItems);
}

// ── 이벤트 바인딩 ──
startBtn.addEventListener('click', startGame);

retryBtn.addEventListener('click', () => {
  showScreen(introScreen);
});

if (screenShareBtn) {
  screenShareBtn.addEventListener('click', startScreenShare);
}

// checker.js — 링크 검문소 3계층 URL 안전도 분석 오케스트레이션

import { analyzeURL } from './url-analyzer.js';

// ── DOM 요소 ────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const urlForm = $('#urlForm');
const urlInput = $('#urlInput');
const analyzeBtn = $('#analyzeBtn');
const progressSection = $('#progressSection');
const progressBar = $('#progressBar');
const resultSection = $('#resultSection');
const scoreNumber = $('#scoreNumber');
const scoreArc = $('#scoreArc');
const scoreBadge = $('#scoreBadge');
const scoreMessage = $('#scoreMessage');
const layer1Items = $('#layer1Items');
const layer2Items = $('#layer2Items');
const layer3Items = $('#layer3Items');
const redirectChain = $('#redirectChain');
const dangerSummary = $('#dangerSummary');
const dangerReasons = $('#dangerReasons');
const themeToggle = $('#themeToggle');

// ── 다크/라이트 모드 ────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem('checker-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('checker-theme', next);
});

initTheme();

// ── 예시 버튼 ───────────────────────────────────────────

document.querySelectorAll('.example-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    urlInput.value = btn.dataset.url;
    urlForm.dispatchEvent(new Event('submit'));
  });
});

// ── 프로그레스 헬퍼 ─────────────────────────────────────

function setProgress(percent) {
  progressBar.style.width = percent + '%';
}

function setStage(stageNum, state) {
  const el = $(`#stage${stageNum}`);
  el.classList.remove('active', 'done');
  if (state) el.classList.add(state);
}

function showProgress() {
  progressSection.classList.remove('hidden');
  resultSection.classList.add('hidden');
  setProgress(0);
  [1, 2, 3].forEach((n) => setStage(n, null));
}

// ── 렌더링 헬퍼 ─────────────────────────────────────────

function createCheckItem(icon, label, detail, delay) {
  const div = document.createElement('div');
  div.className = 'check-item';
  div.style.animationDelay = delay + 'ms';

  const iconClass = icon === 'pass' ? 'pass' : icon === 'fail' ? 'fail' : icon === 'warn' ? 'warn' : 'info';
  const iconChar = icon === 'pass' ? '\u2713' : icon === 'fail' ? '\u2717' : icon === 'warn' ? '!' : 'i';

  div.innerHTML = `
    <div class="check-icon ${iconClass}">${iconChar}</div>
    <div class="check-content">
      <div class="check-label">${label}</div>
      <div class="check-detail">${detail}</div>
    </div>
  `;
  return div;
}

function renderLayer1(items) {
  layer1Items.innerHTML = '';
  items.forEach((item, i) => {
    const icon = item.passed ? 'pass' : 'fail';
    layer1Items.appendChild(createCheckItem(icon, item.label, item.detail, i * 60));
  });
}

function renderLayer2(safeBrowsing, virusTotal) {
  layer2Items.innerHTML = '';
  let idx = 0;

  // Google Safe Browsing
  if (safeBrowsing.available) {
    const icon = safeBrowsing.safe ? 'pass' : 'fail';
    const detail = safeBrowsing.safe
      ? 'Google Safe Browsing 위협 미감지'
      : `위협 감지: ${safeBrowsing.threats.map((t) => t.type).join(', ')}`;
    layer2Items.appendChild(createCheckItem(icon, 'Google Safe Browsing', detail, idx++ * 60));
  } else {
    layer2Items.appendChild(
      createCheckItem('info', 'Google Safe Browsing', 'API 키 미설정 — 검사 건너뜀', idx++ * 60)
    );
  }

  // VirusTotal
  if (virusTotal.available) {
    if (virusTotal.scanned) {
      const detected = virusTotal.malicious + virusTotal.suspicious;
      const icon = detected === 0 ? 'pass' : detected <= 2 ? 'warn' : 'fail';
      const detail =
        detected === 0
          ? `${virusTotal.totalEngines}개 엔진 중 위협 미감지`
          : `${virusTotal.totalEngines}개 엔진 중 ${detected}개 감지 (악성 ${virusTotal.malicious}, 의심 ${virusTotal.suspicious})`;
      layer2Items.appendChild(createCheckItem(icon, 'VirusTotal 스캔', detail, idx++ * 60));
    } else {
      layer2Items.appendChild(
        createCheckItem('info', 'VirusTotal 스캔', '스캔 요청됨 — 결과 수집 중 (잠시 후 재검사)', idx++ * 60)
      );
    }
  } else {
    layer2Items.appendChild(
      createCheckItem('info', 'VirusTotal 스캔', 'API 키 미설정 — 검사 건너뜀', idx++ * 60)
    );
  }
}

function renderLayer3(chain, finalUrl, originalUrl) {
  layer3Items.innerHTML = '';

  const hasRedirect = chain.length > 1;
  const finalDiffers = finalUrl !== originalUrl;

  // 리다이렉트 수
  const redirectIcon = !hasRedirect ? 'pass' : chain.length > 3 ? 'fail' : 'warn';
  const redirectDetail = !hasRedirect
    ? '리다이렉트 없음 — 직접 접속'
    : `${chain.length - 1}단계 리다이렉트 감지`;
  layer3Items.appendChild(createCheckItem(redirectIcon, '리다이렉트 체인', redirectDetail, 0));

  // 최종 목적지
  if (finalDiffers) {
    layer3Items.appendChild(
      createCheckItem('warn', '최종 목적지', `최종 URL이 다름: ${finalUrl}`, 60)
    );
  } else if (hasRedirect) {
    layer3Items.appendChild(
      createCheckItem('pass', '최종 목적지', '최종 URL이 입력 URL과 동일', 60)
    );
  }

  // 리다이렉트 체인 시각화
  if (hasRedirect) {
    redirectChain.classList.remove('hidden');
    redirectChain.innerHTML = '<div class="chain-title">리다이렉트 경로</div>';

    chain.forEach((url, i) => {
      const step = document.createElement('div');
      step.className = 'chain-step';

      const isLast = i === chain.length - 1;
      step.innerHTML = `
        <div class="chain-connector">
          <div class="chain-dot"></div>
          ${!isLast ? '<div class="chain-line"></div>' : ''}
        </div>
        <div class="chain-url">${url}</div>
      `;
      redirectChain.appendChild(step);
    });
  } else {
    redirectChain.classList.add('hidden');
  }
}

function renderScore(score) {
  // 원형 그래프 애니메이션
  const circumference = 2 * Math.PI * 52; // r=52
  const offset = circumference - (score / 100) * circumference;
  scoreArc.style.strokeDashoffset = offset;

  // 색상
  let color, badgeClass, badgeText, message;
  if (score >= 90) {
    color = 'var(--safe)';
    badgeClass = 'safe';
    badgeText = '안전';
    message = '이 URL은 구조적으로 안전합니다.';
  } else if (score >= 60) {
    color = 'var(--caution)';
    badgeClass = 'caution';
    badgeText = '주의';
    message = '일부 의심스러운 요소가 발견되었습니다. 주의하세요.';
  } else {
    color = 'var(--danger)';
    badgeClass = 'danger';
    badgeText = '위험';
    message = '이 URL은 피싱 가능성이 높습니다. 접속하지 마세요.';
  }

  scoreArc.style.stroke = color;
  scoreBadge.className = 'score-badge ' + badgeClass;
  scoreBadge.textContent = badgeText;
  scoreMessage.textContent = message;

  // 숫자 카운트업 애니메이션
  let current = 0;
  const step = Math.max(1, Math.floor(score / 40));
  const timer = setInterval(() => {
    current = Math.min(current + step, score);
    scoreNumber.textContent = current;
    if (current >= score) clearInterval(timer);
  }, 25);
}

function renderDangerSummary(allItems) {
  const dangers = allItems.filter((item) => !item.passed);
  if (dangers.length === 0) {
    dangerSummary.classList.add('hidden');
    return;
  }

  dangerSummary.classList.remove('hidden');
  dangerReasons.innerHTML = '';
  dangers.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = `${item.label}: ${item.detail}`;
    dangerReasons.appendChild(li);
  });
}

// ── 점수 계산 ───────────────────────────────────────────

function calculateFinalScore(layer1Score, safeBrowsing, virusTotal, chain) {
  // Layer 1: 60%
  const l1 = layer1Score * 0.6;

  // Layer 2: 30%
  let l2Score = 100;
  let l2Available = false;

  if (safeBrowsing.available) {
    l2Available = true;
    if (!safeBrowsing.safe) l2Score -= 50;
  }

  if (virusTotal.available && virusTotal.scanned) {
    l2Available = true;
    const detected = virusTotal.malicious + virusTotal.suspicious;
    if (detected > 0) {
      l2Score -= Math.min(50, detected * 10);
    }
  }

  // Layer 2를 사용할 수 없으면 Layer 1 비중 증가
  const l2Weight = l2Available ? 0.3 : 0;
  const l2 = l2Score * l2Weight;

  // Layer 3: 10%
  const redirectCount = chain.length - 1;
  let l3Score = 100;
  if (redirectCount > 0) l3Score -= Math.min(30, redirectCount * 10);
  // 최종 URL이 원본과 다르면 추가 감점
  if (redirectCount > 0 && chain[0] !== chain[chain.length - 1]) {
    l3Score -= 20;
  }
  l3Score = Math.max(0, l3Score);
  const l3 = l3Score * 0.1;

  // L2 사용 불가 시 나머지 가중치를 L1에 재배분
  const adjustedL1 = l2Available ? l1 : layer1Score * (0.6 + 0.3);

  const total = Math.round(Math.max(0, Math.min(100, adjustedL1 + l2 + l3)));
  return total;
}

// ── 메인 분석 ───────────────────────────────────────────

async function runAnalysis(url) {
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = '분석 중...';
  showProgress();

  try {
    // ── Layer 1: 클라이언트 구조 분석 (즉시) ──
    setStage(1, 'active');
    setProgress(10);

    const layer1 = analyzeURL(url);
    await delay(300); // 시각적 피드백을 위한 최소 지연

    setProgress(33);
    setStage(1, 'done');
    renderLayer1(layer1.items);

    // ── Layer 2 + 3: 서버 API 호출 (병렬) ──
    setStage(2, 'active');
    setProgress(40);

    let apiResult = null;
    try {
      const normalizedUrl = layer1.url || url;
      const resp = await fetch(`/api/check-url?url=${encodeURIComponent(normalizedUrl)}`);
      apiResult = await resp.json();
    } catch {
      apiResult = null;
    }

    setProgress(70);
    setStage(2, 'done');

    // Layer 2 렌더링
    const safeBrowsing = apiResult?.safeBrowsing || { available: false };
    const virusTotal = apiResult?.virusTotal || { available: false };
    renderLayer2(safeBrowsing, virusTotal);

    // ── Layer 3: 리다이렉트 ──
    setStage(3, 'active');
    setProgress(85);

    const chain = apiResult?.chain || [url];
    const finalUrl = apiResult?.finalUrl || url;
    await delay(200);

    renderLayer3(chain, finalUrl, url);

    setProgress(100);
    setStage(3, 'done');

    // 최종 URL이 다른 경우 재분석
    let finalUrlItems = [];
    if (finalUrl !== url && finalUrl !== layer1.url) {
      const finalAnalysis = analyzeURL(finalUrl);
      if (finalAnalysis.items) {
        const failedFinal = finalAnalysis.items.filter((item) => !item.passed);
        if (failedFinal.length > 0) {
          failedFinal.forEach((item) => {
            layer3Items.appendChild(
              createCheckItem('fail', `[최종 URL] ${item.label}`, item.detail, 120)
            );
          });
          finalUrlItems = failedFinal;
        }
      }
    }

    // ── 종합 점수 계산 ──
    const finalScore = calculateFinalScore(layer1.score, safeBrowsing, virusTotal, chain);

    // 결과 표시
    await delay(300);
    resultSection.classList.remove('hidden');
    renderScore(finalScore);

    // 위험 요약
    const allDangers = [
      ...layer1.items.filter((i) => !i.passed),
      ...finalUrlItems,
    ];
    if (!safeBrowsing.safe && safeBrowsing.available) {
      allDangers.push({
        passed: false,
        label: 'Google Safe Browsing',
        detail: `위협 감지: ${safeBrowsing.threats.map((t) => t.type).join(', ')}`,
      });
    }
    if (virusTotal.scanned && (virusTotal.malicious > 0 || virusTotal.suspicious > 0)) {
      allDangers.push({
        passed: false,
        label: 'VirusTotal',
        detail: `${virusTotal.malicious + virusTotal.suspicious}개 엔진에서 위협 감지`,
      });
    }
    renderDangerSummary(allDangers);
  } catch (err) {
    console.error('Analysis error:', err);
    resultSection.classList.remove('hidden');
    renderScore(0);
    scoreMessage.textContent = '분석 중 오류가 발생했습니다: ' + err.message;
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = '검사';
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 이벤트 바인딩 ───────────────────────────────────────

urlForm.addEventListener('submit', (e) => {
  e.preventDefault();
  let url = urlInput.value.trim();
  if (!url) return;

  // 프로토콜 없으면 추가
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
  }

  runAnalysis(url);
});

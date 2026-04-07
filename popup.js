/**
 * ClickProof Popup Script
 * - 현재 탭 URL 자동 분석
 * - URL 직접 입력 수동 검사
 * - 자동 보호 토글
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlEl = document.getElementById('currentUrl');
  const manualInput = document.getElementById('manualUrl');
  const manualBtn = document.getElementById('manualCheck');
  const protectionToggle = document.getElementById('protectionToggle');

  initProtectionToggle(protectionToggle);

  // ── 현재 탭 분석 ──
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || isInternalUrl(tab.url)) {
      urlEl.textContent = '분석할 수 없는 페이지';
      renderError('Chrome 내부 페이지는 분석할 수 없습니다.');
    } else {
      urlEl.textContent = tab.url;
      renderResult(analyzeUrl(tab.url));
    }
  } catch {
    renderError('오류가 발생했습니다. 페이지를 새로고침해 주세요.');
  }

  // ── 수동 검사 ──
  manualBtn.addEventListener('click', runManualCheck);
  manualInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runManualCheck();
  });

  function runManualCheck() {
    const input = manualInput.value.trim();
    if (!input) return;
    urlEl.textContent = input;
    renderResult(analyzeUrl(input));
  }
});

/**
 * 내부 URL 확인
 */
function isInternalUrl(url) {
  return url.startsWith('chrome://') || url.startsWith('chrome-extension://')
    || url.startsWith('about:') || url.startsWith('edge://');
}

/**
 * 자동 보호 토글 초기화
 */
function initProtectionToggle(toggle) {
  chrome.runtime.sendMessage({ type: 'getProtectionStatus' }, (response) => {
    if (response) {
      toggle.checked = response.enabled;
    }
  });

  toggle.addEventListener('change', () => {
    chrome.runtime.sendMessage({
      type: 'setProtectionStatus',
      enabled: toggle.checked,
    });
  });
}

const LEVEL_LABELS = { safe: '안전', warning: '주의', danger: '위험' };
const LEVEL_DESC = {
  safe: '이 URL은 안전한 것으로 분석되었습니다.',
  warning: '이 URL에 주의가 필요합니다.',
  danger: '이 URL은 위험할 수 있습니다. 개인정보 입력을 삼가세요.',
};

function getContentEl() {
  return document.getElementById('content');
}

function renderError(message) {
  const el = document.createElement('div');
  el.className = 'error';
  el.textContent = message;
  const content = getContentEl();
  content.textContent = '';
  content.appendChild(el);
}

function renderResult(result) {
  const content = getContentEl();
  content.textContent = '';

  if (result.items && result.items.length === 1 && result.items[0].id === 'parse') {
    renderError(result.items[0].detail);
    return;
  }

  // 점수 섹션
  const scoreSection = document.createElement('div');
  scoreSection.className = 'score-section';

  const scoreCircle = document.createElement('div');
  scoreCircle.className = `score-circle ${result.riskLevel}`;
  scoreCircle.textContent = result.score;

  const scoreLabel = document.createElement('div');
  scoreLabel.className = `score-label ${result.riskLevel}`;
  scoreLabel.textContent = LEVEL_LABELS[result.riskLevel] || '';

  const scoreDesc = document.createElement('div');
  scoreDesc.style.cssText = 'font-size:11px;color:#64748b;margin-top:6px';
  scoreDesc.textContent = LEVEL_DESC[result.riskLevel] || '';

  scoreSection.append(scoreCircle, scoreLabel, scoreDesc);

  // 항목 리스트
  const resultsList = document.createElement('div');
  resultsList.className = 'results';

  for (const item of result.items) {
    const row = document.createElement('div');
    row.className = 'result-item';

    const icon = document.createElement('div');
    icon.className = `result-icon ${item.passed ? 'pass' : 'fail'}`;
    icon.textContent = item.passed ? '✓' : '✗';

    const name = document.createElement('div');
    name.className = 'result-name';
    name.textContent = item.label;

    const detail = document.createElement('div');
    detail.className = 'result-detail';
    detail.textContent = item.detail;

    row.append(icon, name, detail);
    resultsList.appendChild(row);
  }

  content.append(scoreSection, resultsList);
}

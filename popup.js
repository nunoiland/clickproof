/**
 * ClickProof Popup Script
 * - 현재 탭 URL 자동 분석
 * - URL 직접 입력 수동 검사
 * - 자동 보호 토글
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlEl = document.getElementById('currentUrl');
  const contentEl = document.getElementById('content');
  const manualInput = document.getElementById('manualUrl');
  const manualBtn = document.getElementById('manualCheck');
  const protectionToggle = document.getElementById('protectionToggle');

  // ── 자동 보호 토글 초기화 ──
  initProtectionToggle(protectionToggle);

  // ── 현재 탭 분석 ──
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || isInternalUrl(tab.url)) {
      urlEl.textContent = '분석할 수 없는 페이지';
      contentEl.innerHTML = '<div class="error">Chrome 내부 페이지는 분석할 수 없습니다.</div>';
    } else {
      urlEl.textContent = tab.url;
      const result = analyzeUrl(tab.url);
      renderResult(result);
    }
  } catch (err) {
    contentEl.innerHTML = `<div class="error">오류: ${err.message}</div>`;
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
    const result = analyzeUrl(input);
    renderResult(result);
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

/**
 * 분석 결과 렌더링
 */
function renderResult(result) {
  const contentEl = document.getElementById('content');

  if (result.items && result.items.length === 1 && result.items[0].id === 'parse') {
    contentEl.innerHTML = `<div class="error">${result.items[0].detail}</div>`;
    return;
  }

  const levelLabels = {
    safe: '안전',
    warning: '주의',
    danger: '위험',
  };

  const levelDesc = {
    safe: '이 URL은 안전한 것으로 분석되었습니다.',
    warning: '이 URL에 주의가 필요합니다.',
    danger: '이 URL은 위험할 수 있습니다. 개인정보 입력을 삼가세요.',
  };

  let html = `
    <div class="score-section">
      <div class="score-circle ${result.riskLevel}">${result.score}</div>
      <div class="score-label ${result.riskLevel}">${levelLabels[result.riskLevel]}</div>
      <div style="font-size:11px;color:#64748b;margin-top:6px">${levelDesc[result.riskLevel]}</div>
    </div>
    <div class="results">
  `;

  for (const item of result.items) {
    // weight=0이고 bonus=0인 항목은 neutral 표시
    const iconClass = item.passed ? 'pass' : 'fail';
    const icon = item.passed ? '&#10003;' : '&#10007;';
    html += `
      <div class="result-item">
        <div class="result-icon ${iconClass}">${icon}</div>
        <div class="result-name">${item.label}</div>
        <div class="result-detail">${item.detail}</div>
      </div>
    `;
  }

  html += '</div>';
  contentEl.innerHTML = html;
}

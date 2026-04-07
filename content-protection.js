/**
 * content-protection.js — 폼 입력 보호 + 금융기관 2차 확인
 * 의존: lib/url-analyzer.js, lib/korean-domains.js
 */
(() => {
  const style = document.createElement('style');
  style.textContent = `
    .cp-form-warn {
      position: relative;
      display: block;
      background: #fef2f2;
      border: 1px solid #ef4444;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 6px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      color: #b91c1c;
      line-height: 1.5;
      z-index: 99999;
    }
    .cp-form-warn.critical {
      background: #ef4444;
      color: #fff;
      border-color: #dc2626;
    }
    .cp-form-warn-dismiss {
      float: right;
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      font-size: 11px;
      text-decoration: underline;
      opacity: 0.8;
    }
    .cp-finance-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483646;
      padding: 10px 16px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      text-align: center;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .cp-finance-banner.danger {
      background: #ef4444;
      color: #fff;
    }
    .cp-finance-banner.safe {
      background: #22c55e;
      color: #fff;
      transition: opacity 0.5s;
    }
    .cp-finance-close {
      position: absolute;
      right: 12px;
      background: none;
      border: none;
      color: inherit;
      font-size: 18px;
      cursor: pointer;
      opacity: 0.8;
    }
  `;
  document.head.appendChild(style);

  const hostname = location.hostname;
  let siteResult = null;

  if (typeof analyzeUrl === 'function') {
    siteResult = analyzeUrl(location.href);
  }

  // ══════════════════════════════════════
  // 1. 폼 입력 보호
  // ══════════════════════════════════════
  const SENSITIVE_TYPES = ['password'];
  const SENSITIVE_PATTERNS = [
    /card.?num/i, /카드.?번호/i, /credit/i,
    /주민.?등록/i, /ssn/i, /resident/i,
    /계좌/i, /account.?num/i,
  ];

  const dismissedSites = new Set();

  async function loadDismissed() {
    try {
      const data = await chrome.storage.local.get(['cp_dismissed_sites']);
      (data.cp_dismissed_sites || []).forEach(s => dismissedSites.add(s));
    } catch {}
  }

  function isSensitiveField(input) {
    if (SENSITIVE_TYPES.includes(input.type)) return true;
    const nameAndId = (input.name || '') + (input.id || '') + (input.placeholder || '') + (input.getAttribute('aria-label') || '');
    return SENSITIVE_PATTERNS.some(p => p.test(nameAndId));
  }

  function warnField(input) {
    if (input.dataset.cpProtected) return;
    input.dataset.cpProtected = '1';
    if (dismissedSites.has(hostname)) return;
    if (!siteResult || siteResult.score >= 80) return;

    const isHTTP = location.protocol === 'http:';
    const isCritical = isHTTP && input.type === 'password';

    const warn = document.createElement('div');
    warn.className = 'cp-form-warn' + (isCritical ? ' critical' : '');
    warn.textContent = isCritical
      ? '⚠ 이 사이트는 암호화되지 않은 연결(HTTP)입니다. 비밀번호가 그대로 노출될 수 있습니다.'
      : `⚠ 이 사이트의 안전도가 낮습니다 (${siteResult.score}점). 개인정보 입력에 주의하세요.`;

    const dismiss = document.createElement('button');
    dismiss.className = 'cp-form-warn-dismiss';
    dismiss.textContent = '이 사이트에서 표시 안 함';
    dismiss.onclick = (e) => {
      e.preventDefault();
      dismissedSites.add(hostname);
      chrome.storage.local.set({
        cp_dismissed_sites: [...dismissedSites]
      });
      document.querySelectorAll('.cp-form-warn').forEach(el => el.remove());
    };
    warn.appendChild(dismiss);

    input.parentElement.insertBefore(warn, input);
  }

  function scanForms() {
    document.querySelectorAll('input').forEach(input => {
      if (isSensitiveField(input)) warnField(input);
    });
  }

  // ══════════════════════════════════════
  // 2. 금융기관 2차 확인
  // ══════════════════════════════════════
  const FINANCE_KEYWORDS = [
    '은행', '뱅킹', 'banking', '증권', '보험', '카드',
    '금융', 'finance', '대출', 'loan', '투자', '결제', 'payment',
    '입금', '출금', '송금', '이체',
  ];

  function isFinancePage() {
    const text = (document.title + ' ' + hostname).toLowerCase();
    return FINANCE_KEYWORDS.some(kw => text.includes(kw));
  }

  function showFinanceBanner() {
    if (document.querySelector('.cp-finance-banner')) return;

    const isWhitelisted = typeof isKoreanFinanceDomain === 'function' && isKoreanFinanceDomain(hostname);

    const banner = document.createElement('div');
    banner.className = 'cp-finance-banner ' + (isWhitelisted ? 'safe' : 'danger');

    if (isWhitelisted) {
      banner.textContent = '🏦 공식 인증된 금융기관 도메인입니다';
      document.body.prepend(banner);
      setTimeout(() => {
        banner.style.opacity = '0';
        setTimeout(() => banner.remove(), 500);
      }, 3000);
    } else {
      banner.textContent = '⚠ 이 사이트는 공식 금융기관 도메인이 아닙니다. 금융 정보 입력에 주의하세요.';
      const close = document.createElement('button');
      close.className = 'cp-finance-close';
      close.textContent = '×';
      close.onclick = () => banner.remove();
      banner.appendChild(close);
      document.body.prepend(banner);
    }
  }

  // ── 초기화 ──
  loadDismissed().then(() => {
    scanForms();
    if (isFinancePage()) showFinanceBanner();
  });

  // 동적 폼 감시 (debounce 적용)
  let formScanTimer = null;
  new MutationObserver(() => {
    if (formScanTimer) return;
    formScanTimer = setTimeout(() => {
      formScanTimer = null;
      scanForms();
    }, 300);
  }).observe(document.body, { childList: true, subtree: true });
})();

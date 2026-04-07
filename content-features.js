/**
 * content-features.js — 링크 호버 미리보기 + 검색 결과 뱃지 + 이메일 링크 하이라이트
 * 의존: lib/url-analyzer.js, lib/korean-domains.js (content_scripts로 먼저 로드)
 */
(() => {
  // ── 캐시 ──
  const cache = new Map();
  const MAX_CACHE = 500;

  function getCachedAnalysis(url) {
    if (cache.has(url)) return cache.get(url);
    if (typeof analyzeUrl !== 'function') return null;
    const result = analyzeUrl(url);
    if (cache.size >= MAX_CACHE) {
      const first = cache.keys().next().value;
      cache.delete(first);
    }
    cache.set(url, result);
    return result;
  }

  const COLORS = { safe: '#22c55e', warning: '#eab308', danger: '#ef4444' };
  const LABELS = { safe: '안전', warning: '주의', danger: '위험' };

  // ── 스타일 삽입 ──
  const style = document.createElement('style');
  style.textContent = `
    .cp-tooltip {
      position: fixed;
      z-index: 2147483647;
      background: #1a1a2e;
      color: #fff;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-width: 360px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
      line-height: 1.5;
    }
    .cp-tooltip.visible { opacity: 1; }
    .cp-tooltip-url {
      color: #aaa;
      word-break: break-all;
      font-size: 11px;
      margin-bottom: 6px;
      display: block;
    }
    .cp-tooltip-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 11px;
      color: #fff;
    }
    .cp-tooltip-score {
      color: #ccc;
      margin-left: 8px;
      font-size: 11px;
    }
    .cp-email-danger {
      outline: 2px solid #ef4444 !important;
      outline-offset: 1px;
      border-radius: 2px;
      position: relative;
    }
    .cp-email-warning {
      outline: 2px solid #eab308 !important;
      outline-offset: 1px;
      border-radius: 2px;
    }
    .cp-email-icon {
      display: inline;
      margin-left: 3px;
      font-size: 12px;
      vertical-align: middle;
    }
  `;
  document.head.appendChild(style);

  // ══════════════════════════════════════
  // 1. 링크 호버 미리보기
  // ══════════════════════════════════════
  const tooltip = document.createElement('div');
  tooltip.className = 'cp-tooltip';
  document.body.appendChild(tooltip);

  let hoverTimer = null;

  function showTooltip(e, url) {
    const result = getCachedAnalysis(url);
    if (!result) return;

    const badgeColor = COLORS[result.riskLevel] || COLORS.safe;
    const label = LABELS[result.riskLevel] || '안전';

    tooltip.textContent = '';

    const urlSpan = document.createElement('span');
    urlSpan.className = 'cp-tooltip-url';
    urlSpan.textContent = url.length > 80 ? url.slice(0, 80) + '...' : url;

    const badgeSpan = document.createElement('span');
    badgeSpan.className = 'cp-tooltip-badge';
    badgeSpan.style.background = badgeColor;
    badgeSpan.textContent = label;

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'cp-tooltip-score';
    scoreSpan.textContent = result.score + '점';

    tooltip.append(urlSpan, badgeSpan, scoreSpan);

    const x = Math.min(e.clientX + 12, window.innerWidth - 380);
    const y = Math.min(e.clientY + 16, window.innerHeight - 60);
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    tooltip.classList.add('visible');
  }

  function hideTooltip() {
    clearTimeout(hoverTimer);
    tooltip.classList.remove('visible');
  }

  document.addEventListener('mouseover', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.href;
    if (!href || href.startsWith('javascript:') || href.startsWith('#')) return;

    hoverTimer = setTimeout(() => showTooltip(e, href), 200);
  });

  document.addEventListener('mouseout', (e) => {
    const a = e.target.closest('a[href]');
    if (a) hideTooltip();
  });

  // ══════════════════════════════════════
  // 2. 이메일 링크 하이라이트
  // ══════════════════════════════════════
  function unwrapGoogleRedirect(href) {
    try {
      const url = new URL(href);
      if (url.hostname.includes('google.com') && url.pathname.includes('/url')) {
        return url.searchParams.get('q') || url.searchParams.get('url') || href;
      }
    } catch {}
    return href;
  }

  function scanEmailLinks(root) {
    const links = (root || document).querySelectorAll('a[href]');
    links.forEach(a => {
      if (a.dataset.cpScanned) return;
      a.dataset.cpScanned = '1';

      let href = a.href;
      if (!href || href.startsWith('mailto:') || href.startsWith('#')) return;

      href = unwrapGoogleRedirect(href);
      const result = getCachedAnalysis(href);
      if (!result) return;

      if (result.riskLevel === 'danger') {
        a.classList.add('cp-email-danger');
        if (!a.querySelector('.cp-email-icon')) {
          const icon = document.createElement('span');
          icon.className = 'cp-email-icon';
          icon.textContent = '⚠';
          a.appendChild(icon);
        }
      } else if (result.riskLevel === 'warning') {
        a.classList.add('cp-email-warning');
      }
    });
  }

  function isEmailSite() {
    const host = location.hostname;
    return host.includes('mail.google.com') || host.includes('mail.naver.com');
  }

  // ── MutationObserver로 동적 콘텐츠 감시 (debounce 적용) ──
  let mutationTimer = null;
  const observer = new MutationObserver(() => {
    if (mutationTimer) return;
    mutationTimer = setTimeout(() => {
      mutationTimer = null;
      if (isEmailSite()) scanEmailLinks();
    }, 300);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // 초기 실행
  if (isEmailSite()) scanEmailLinks();
})();

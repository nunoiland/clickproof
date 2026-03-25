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
  const ICONS = { safe: '✓', warning: '?', danger: '!' };

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
    .cp-search-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      font-size: 10px;
      font-weight: 700;
      color: #fff;
      margin-left: 4px;
      vertical-align: middle;
      flex-shrink: 0;
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

    tooltip.innerHTML = `
      <span class="cp-tooltip-url">${url.length > 80 ? url.slice(0, 80) + '...' : url}</span>
      <span class="cp-tooltip-badge" style="background:${badgeColor}">${label}</span>
      <span class="cp-tooltip-score">${result.score}점</span>
    `;

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
  // 2. 검색 결과 안전 뱃지
  // ══════════════════════════════════════
  function addSearchBadge(linkEl) {
    if (linkEl.querySelector('.cp-search-badge')) return;
    const href = linkEl.href;
    if (!href || href.startsWith('javascript:')) return;

    const result = getCachedAnalysis(href);
    if (!result) return;

    const badge = document.createElement('span');
    badge.className = 'cp-search-badge';
    badge.style.background = COLORS[result.riskLevel] || COLORS.safe;
    badge.textContent = ICONS[result.riskLevel] || '✓';
    badge.title = `안전도 ${result.score}점 (${LABELS[result.riskLevel]})`;

    linkEl.appendChild(badge);
  }

  function scanSearchResults() {
    const host = location.hostname;

    // Google
    if (host.includes('google.')) {
      document.querySelectorAll('#search a[href]:not([href^="javascript"]) h3').forEach(h3 => {
        const a = h3.closest('a');
        if (a) addSearchBadge(a);
      });
    }

    // Naver
    if (host.includes('naver.com')) {
      document.querySelectorAll('.total_tit a, .api_txt_lines, .link_tit').forEach(a => {
        if (a.tagName === 'A') addSearchBadge(a);
        else {
          const link = a.closest('a');
          if (link) addSearchBadge(link);
        }
      });
    }
  }

  // ══════════════════════════════════════
  // 3. 이메일 링크 하이라이트
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

  // ── MutationObserver로 동적 콘텐츠 감시 ──
  const observer = new MutationObserver(() => {
    scanSearchResults();
    if (isEmailSite()) scanEmailLinks();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // 초기 실행
  scanSearchResults();
  if (isEmailSite()) scanEmailLinks();
})();

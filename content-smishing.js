/**
 * content-smishing.js — 스미싱 키워드 감지 + 카카오톡/인앱 브라우저 보호
 * 의존: lib/url-analyzer.js, lib/korean-domains.js
 */
(() => {
  const style = document.createElement('style');
  style.textContent = `
    .cp-smishing-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483647;
      background: #dc2626;
      color: #fff;
      padding: 12px 16px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      text-align: center;
      font-weight: 700;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .cp-smishing-banner button {
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.5);
      color: #fff;
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      margin-left: 12px;
    }
    .cp-inapp-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: rgba(0,0,0,0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      color: #fff;
      text-align: center;
      padding: 20px;
    }
    .cp-inapp-overlay h2 {
      font-size: 20px;
      color: #ef4444;
      margin: 0;
    }
    .cp-inapp-overlay p {
      font-size: 14px;
      color: #ccc;
      max-width: 320px;
      line-height: 1.6;
      margin: 0;
    }
    .cp-inapp-btn {
      padding: 12px 28px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      border: none;
      cursor: pointer;
    }
    .cp-inapp-btn.primary {
      background: #2563eb;
      color: #fff;
    }
    .cp-inapp-btn.ghost {
      background: transparent;
      color: #888;
      border: 1px solid #444;
    }
  `;
  document.head.appendChild(style);

  // ══════════════════════════════════════
  // 1. 스미싱 키워드 감지
  // ══════════════════════════════════════
  const SMISHING_PATTERNS = [
    // 택배
    { regex: /택배.{0,5}(배송|조회|확인|수령|실패|반송)/g, category: '택배 사칭' },
    { regex: /미수령.{0,5}택배/g, category: '택배 사칭' },
    { regex: /배송.{0,5}(실패|불가|지연)/g, category: '택배 사칭' },
    // 정부/지원금
    { regex: /(정부|긴급).{0,5}(지원금|재난|보조금|환급)/g, category: '정부 사칭' },
    { regex: /환급금.{0,5}(신청|지급|확인)/g, category: '정부 사칭' },
    // 결제
    { regex: /결제.{0,5}(승인|취소|실패|완료)/g, category: '결제 사칭' },
    { regex: /자동.{0,3}결제/g, category: '결제 사칭' },
    { regex: /미납.{0,5}(요금|금액)/g, category: '결제 사칭' },
    // 계정
    { regex: /(본인|신원|신분).{0,3}확인/g, category: '계정 탈취' },
    { regex: /계정.{0,5}(정지|차단|제한|보호)/g, category: '계정 탈취' },
    { regex: /비밀번호.{0,5}(변경|재설정|만료)/g, category: '계정 탈취' },
    // 당첨
    { regex: /(이벤트|경품|추첨).{0,5}당첨/g, category: '당첨 사기' },
    { regex: /당첨.{0,5}(확인|수령|안내)/g, category: '당첨 사기' },
    // 법률
    { regex: /(법원|검찰|경찰).{0,5}(출석|소환|수사|조사)/g, category: '기관 사칭' },
    { regex: /수사.{0,5}(협조|대상)/g, category: '기관 사칭' },
  ];

  function detectSmishing() {
    const text = document.body?.innerText || '';
    if (text.length < 10 || text.length > 50000) return null;

    const detected = [];
    for (const pattern of SMISHING_PATTERNS) {
      const matches = text.match(pattern.regex);
      if (matches) {
        detected.push({ category: pattern.category, matches: matches.slice(0, 3) });
      }
    }

    if (detected.length === 0) return null;

    // URL 위험도도 함께 확인
    let urlDangerous = false;
    if (typeof analyzeUrl === 'function') {
      const result = analyzeUrl(location.href);
      urlDangerous = result.score < 70;
    }

    // 스미싱 키워드 2개 이상 or (키워드 1개 + URL 위험)
    if (detected.length >= 2 || (detected.length >= 1 && urlDangerous)) {
      return detected;
    }

    return null;
  }

  function showSmishingBanner(detected) {
    if (document.querySelector('.cp-smishing-banner')) return;

    const categories = [...new Set(detected.map(d => d.category))].join(', ');

    const banner = document.createElement('div');
    banner.className = 'cp-smishing-banner';
    const msgSpan = document.createElement('span');
    msgSpan.textContent = `🚨 스미싱 의심 페이지 — ${categories} 패턴이 감지되었습니다`;
    banner.appendChild(msgSpan);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '닫기';
    closeBtn.onclick = () => banner.remove();
    banner.appendChild(closeBtn);

    const backBtn = document.createElement('button');
    backBtn.textContent = '← 뒤로 가기';
    backBtn.onclick = () => history.back();
    banner.appendChild(backBtn);

    document.body.prepend(banner);
  }

  // ══════════════════════════════════════
  // 2. 인앱 브라우저 감지 + 보호
  // ══════════════════════════════════════
  const IN_APP_PATTERNS = [
    { regex: /KAKAOTALK/i, name: '카카오톡' },
    { regex: /NAVER\(/i, name: '네이버' },
    { regex: /Line\//i, name: '라인' },
    { regex: /BAND\//i, name: '밴드' },
    { regex: /Instagram/i, name: '인스타그램' },
    { regex: /FBAN|FBAV/i, name: '페이스북' },
    { regex: /Twitter/i, name: '트위터' },
  ];

  function detectInAppBrowser() {
    const ua = navigator.userAgent;
    for (const pattern of IN_APP_PATTERNS) {
      if (pattern.regex.test(ua)) return pattern.name;
    }
    return null;
  }

  function openInExternalBrowser() {
    const url = location.href;

    // Android intent
    if (/android/i.test(navigator.userAgent)) {
      const intent = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end;`;
      location.href = intent;
      return;
    }

    // iOS — Safari로 열기 시도
    if (/iPhone|iPad/i.test(navigator.userAgent)) {
      // Safari에서 열기
      window.open(url, '_system');
      return;
    }

    // 기본: 새 탭
    window.open(url, '_blank');
  }

  function showInAppWarning(appName) {
    // URL 위험도 확인
    let urlResult = null;
    if (typeof analyzeUrl === 'function') {
      urlResult = analyzeUrl(location.href);
    }

    // 안전한 URL이면 경고 안 함
    if (urlResult && urlResult.score >= 80) return;

    const overlay = document.createElement('div');
    overlay.className = 'cp-inapp-overlay';
    overlay.innerHTML = `
      <h2>⚠ ${appName} 내부 브라우저 감지</h2>
      <p>현재 ${appName} 앱 안에서 링크를 열고 있습니다.<br>
      이 사이트의 안전도가 낮습니다${urlResult ? ` (${urlResult.score}점)` : ''}.<br>
      외부 브라우저에서 여는 것이 안전합니다.</p>
    `;

    const openBtn = document.createElement('button');
    openBtn.className = 'cp-inapp-btn primary';
    openBtn.textContent = '외부 브라우저로 열기';
    openBtn.onclick = () => openInExternalBrowser();

    const ignoreBtn = document.createElement('button');
    ignoreBtn.className = 'cp-inapp-btn ghost';
    ignoreBtn.textContent = '그냥 계속하기';
    ignoreBtn.onclick = () => overlay.remove();

    overlay.appendChild(openBtn);
    overlay.appendChild(ignoreBtn);
    document.body.prepend(overlay);
  }

  // ══════════════════════════════════════
  // 3. 리다이렉트 추적 (단축 URL 경고)
  // ══════════════════════════════════════
  const SHORT_DOMAINS = [
    'bit.ly', 'url.kr', 'han.gl', 'me2.do', 'goo.gl',
    'tinyurl.com', 't.co', 'is.gd', 'ow.ly', 'buff.ly',
    'cutt.ly', 'vo.la', 'zz.am', 'lrl.kr', 'short.io',
  ];

  function isShortUrl(href) {
    try {
      const h = new URL(href).hostname;
      return SHORT_DOMAINS.some(d => h === d || h.endsWith('.' + d));
    } catch { return false; }
  }

  function interceptShortLinks() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      if (!isShortUrl(a.href)) return;

      e.preventDefault();
      e.stopPropagation();

      const confirmed = confirm(
        `⚠ 단축 URL이 감지되었습니다.\n\n` +
        `${a.href}\n\n` +
        `단축 URL은 실제 목적지를 숨길 수 있습니다.\n계속 이동하시겠습니까?`
      );

      if (confirmed) {
        window.open(a.href, '_blank', 'noopener');
      }
    }, true);
  }

  // ── 초기화 ──
  function init() {
    // 스미싱 감지 (DOM 로드 후)
    const smishing = detectSmishing();
    if (smishing) showSmishingBanner(smishing);

    // 인앱 브라우저 감지 (content.js에서 배너를 이미 표시한 경우 중복 방지)
    const inApp = detectInAppBrowser();
    if (inApp && !document.getElementById('clickproof-warning-banner')) {
      showInAppWarning(inApp);
    }

    // 단축 URL 클릭 인터셉트
    interceptShortLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

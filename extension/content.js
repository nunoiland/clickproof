/**
 * ClickProof Content Script
 * - 위험/주의 URL 접근 시 상단 경고 배너 삽입
 * - 카카오톡/네이버 인앱 브라우저 감지
 * - 페이지 내 의심 링크 하이라이트
 */

(function () {
  'use strict';

  const url = window.location.href;

  // 내부 페이지는 분석 제외
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    return;
  }

  // ── 카카오톡 / 네이버 인앱 브라우저 감지 ──

  const ua = navigator.userAgent;
  const inAppBrowser = detectInAppBrowser(ua);

  function detectInAppBrowser(userAgent) {
    const patterns = [
      { name: '카카오톡', pattern: /KAKAOTALK/i },
      { name: '네이버', pattern: /NAVER\(/i },
      { name: '네이버 메일', pattern: /NaverMailApp/i },
      { name: '라인', pattern: /Line\//i },
      { name: '페이스북', pattern: /FBAN|FBAV/i },
      { name: '인스타그램', pattern: /Instagram/i },
      { name: '밴드', pattern: /BAND\//i },
    ];

    for (const { name, pattern } of patterns) {
      if (pattern.test(userAgent)) {
        return name;
      }
    }
    return null;
  }

  // ── URL 분석 실행 ──

  const result = analyzeUrl(url);

  // 인앱 브라우저에서 열린 경우 추가 경고
  if (inAppBrowser && result.riskLevel !== 'safe') {
    injectInAppWarning(inAppBrowser, result);
  } else if (result.riskLevel === 'danger') {
    injectWarningBanner(result);
  } else if (result.riskLevel === 'warning') {
    injectCautionBanner(result);
  }

  // ── 인앱 브라우저 경고 (카카오톡/네이버 등에서 열린 링크) ──

  function injectInAppWarning(appName, result) {
    const banner = createBanner({
      bgColor: '#fef2f2',
      borderColor: '#ef4444',
      textColor: '#991b1b',
      icon: '\uD83D\uDCF1',
      title: `${appName}에서 열린 링크입니다`,
      message: `안전 점수 ${result.score}점. ${appName} 내부 브라우저는 URL 확인이 어렵습니다. 외부 브라우저(Chrome/Safari)에서 여세요.`,
      showClose: true,
      showOpenExternal: true,
    });
    insertBanner(banner);
  }

  // ── 위험 배너 ──

  function injectWarningBanner(result) {
    const banner = createBanner({
      bgColor: '#fef2f2',
      borderColor: '#ef4444',
      textColor: '#991b1b',
      icon: '\u26A0\uFE0F',
      title: 'ClickProof 경고: 위험한 사이트입니다!',
      message: `안전 점수 ${result.score}점 — 개인정보 입력을 삼가세요.`,
      showClose: true,
    });
    insertBanner(banner);
  }

  // ── 주의 배너 ──

  function injectCautionBanner(result) {
    const banner = createBanner({
      bgColor: '#fefce8',
      borderColor: '#eab308',
      textColor: '#854d0e',
      icon: '\u26A0\uFE0F',
      title: 'ClickProof 주의',
      message: `안전 점수 ${result.score}점 — 주의가 필요합니다.`,
      showClose: true,
    });
    insertBanner(banner);
  }

  // ── 배너 생성 ──

  function createBanner({ bgColor, borderColor, textColor, icon, title, message, showClose, showOpenExternal }) {
    const banner = document.createElement('div');
    banner.id = 'clickproof-warning-banner';
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483647;
      background: ${bgColor};
      border-bottom: 3px solid ${borderColor};
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      color: ${textColor};
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      animation: clickproof-slide-down 0.3s ease-out;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes clickproof-slide-down {
        from { transform: translateY(-100%); }
        to { transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);

    const iconSpan = document.createElement('span');
    iconSpan.style.fontSize = '20px';
    iconSpan.textContent = icon;
    banner.appendChild(iconSpan);

    const content = document.createElement('div');
    content.style.flex = '1';

    const titleEl = document.createElement('strong');
    titleEl.textContent = title;
    content.appendChild(titleEl);

    const msgEl = document.createElement('div');
    msgEl.style.cssText = 'font-size:12px;margin-top:2px;opacity:0.8';
    msgEl.textContent = message;
    content.appendChild(msgEl);

    banner.appendChild(content);

    // 외부 브라우저로 열기 버튼 (인앱 브라우저용)
    if (showOpenExternal) {
      const extBtn = document.createElement('button');
      extBtn.textContent = '외부 브라우저로 열기';
      extBtn.style.cssText = `
        background: ${borderColor};
        color: #fff;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      `;
      extBtn.addEventListener('click', () => {
        // 인앱 브라우저에서 외부 브라우저로 열기 시도
        const intentUrl = `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=${window.location.protocol.replace(':', '')};end`;
        window.location.href = intentUrl;
      });
      banner.appendChild(extBtn);
    }

    if (showClose) {
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '\u2715';
      closeBtn.style.cssText = `
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: ${textColor};
        padding: 4px 8px;
        opacity: 0.6;
      `;
      closeBtn.addEventListener('click', () => {
        banner.remove();
        document.body.style.marginTop = '';
      });
      banner.appendChild(closeBtn);
    }

    return banner;
  }

  // ── 배너 삽입 ──

  function insertBanner(banner) {
    // 이미 배너가 있으면 교체
    const existing = document.getElementById('clickproof-warning-banner');
    if (existing) {
      existing.remove();
    }

    if (document.body) {
      document.body.prepend(banner);
      document.body.style.marginTop = '60px';
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.prepend(banner);
        document.body.style.marginTop = '60px';
      });
    }
  }
})();

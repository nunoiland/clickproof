/**
 * ClickProof Background Service Worker (Manifest V3)
 * - 모든 탭 URL 실시간 모니터링
 * - 위험 URL 탐지 시 페이지 로드 전 경고 화면 표시
 * - 주소창 옆 아이콘에 안전/주의/위험 뱃지 표시
 * - 모든 분석은 로컬에서 수행 (외부 전송 없음)
 */

importScripts('lib/korean-domains.js', 'lib/url-analyzer.js');

// 배지 색상 정의
const BADGE_COLORS = {
  safe: '#22c55e',
  warning: '#eab308',
  danger: '#ef4444',
};

// 내부 URL 패턴 (분석 제외)
function isInternalUrl(url) {
  return !url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')
    || url.startsWith('about:') || url.startsWith('edge://') || url.startsWith('brave://');
}

/**
 * 사용자가 허용한 도메인인지 확인
 */
async function isAllowedUrl(hostname) {
  const data = await chrome.storage.local.get(['allowedUrls']);
  const allowed = data.allowedUrls || [];
  return allowed.includes(hostname);
}

/**
 * 보호 기능 활성화 상태 확인
 */
async function isProtectionEnabled() {
  const data = await chrome.storage.local.get(['protectionEnabled']);
  // 기본값: 활성화
  return data.protectionEnabled !== false;
}

/**
 * 탭의 URL을 분석하고 배지를 업데이트
 */
async function analyzeAndBadge(tabId, url) {
  if (isInternalUrl(url)) {
    chrome.action.setBadgeText({ tabId, text: '' });
    return null;
  }

  const result = analyzeUrl(url);

  // 분석 결과를 session storage에 저장 (popup에서 사용)
  try {
    await chrome.storage.session.set({
      [`tab_${tabId}`]: { url, ...result, timestamp: Date.now() }
    });
  } catch {
    // session storage 실패 시 무시
  }

  // 배지 업데이트
  const badgeConfig = {
    danger: { text: '!', color: BADGE_COLORS.danger },
    warning: { text: '?', color: BADGE_COLORS.warning },
    safe: { text: '\u2713', color: BADGE_COLORS.safe },
  };

  const badge = badgeConfig[result.riskLevel] || badgeConfig.safe;
  chrome.action.setBadgeText({ tabId, text: badge.text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });

  return result;
}

/**
 * 위험 URL인 경우 경고 페이지로 리다이렉트
 */
async function blockIfDangerous(tabId, url, result) {
  if (!result || result.riskLevel !== 'danger') return;

  const enabled = await isProtectionEnabled();
  if (!enabled) return;

  try {
    const hostname = new URL(url).hostname;
    const allowed = await isAllowedUrl(hostname);
    if (allowed) return;

    // 금융기관 화이트리스트는 즉시 통과
    if (typeof isKoreanFinanceDomain === 'function' && isKoreanFinanceDomain(hostname)) return;

    const warningUrl = chrome.runtime.getURL('warning.html')
      + '?url=' + encodeURIComponent(url)
      + '&score=' + result.score;
    chrome.tabs.update(tabId, { url: warningUrl });
  } catch {
    // URL 파싱 실패 시 무시
  }
}

// ── 이벤트 리스너 ──

// webNavigation: 페이지 로드 시작 시점에 분석 (onBeforeNavigate → 가장 빠른 타이밍)
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // 메인 프레임만
  const result = await analyzeAndBadge(details.tabId, details.url);
  await blockIfDangerous(details.tabId, details.url, result);
});

// 페이지 로드 완료 시 배지 갱신 (SPA 등 URL 변경 대응)
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  await analyzeAndBadge(details.tabId, details.url);
});

// URL 변경 감지 (SPA의 pushState/replaceState)
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const result = await analyzeAndBadge(details.tabId, details.url);
  await blockIfDangerous(details.tabId, details.url, result);
});

// 탭 활성화 시 배지 갱신
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      await analyzeAndBadge(activeInfo.tabId, tab.url);
    }
  } catch {
    // 탭이 이미 닫힌 경우 무시
  }
});

// 탭 닫힐 때 session storage 정리
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove([`tab_${tabId}`]).catch(() => {});
});

// ── 메시지 핸들러 ──

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'analyzeUrl') {
    // popup이나 content script에서 분석 요청
    const result = analyzeUrl(message.url);
    sendResponse(result);
    return true;
  }

  if (message.type === 'getProtectionStatus') {
    isProtectionEnabled().then(enabled => sendResponse({ enabled }));
    return true;
  }

  if (message.type === 'setProtectionStatus') {
    chrome.storage.local.set({ protectionEnabled: message.enabled }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// 설치/업데이트 시 초기 설정
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['protectionEnabled'], (data) => {
    if (data.protectionEnabled === undefined) {
      chrome.storage.local.set({ protectionEnabled: true });
    }
  });
});

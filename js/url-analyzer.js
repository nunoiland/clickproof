// url-analyzer.js
// URL 구조 기반 피싱 분석 엔진 (블랙리스트 없이 구조만으로 판단)

import { detectTyposquatting, isKnownKoreanDomain } from './korean-domains.js';

// 단축 URL 서비스 목록
const SHORT_URL_DOMAINS = [
  'bit.ly', 'url.kr', 'han.gl', 'me2.do',
  'goo.gl', 'tinyurl.com', 't.co', 'is.gd',
  'ow.ly', 'buff.ly', 'adf.ly', 'bl.ink',
  'short.io', 'rebrand.ly', 'cutt.ly', 'vo.la',
  'zz.am', 'lrl.kr',
];

// 무료 호스팅 서비스 도메인
const FREE_HOSTING_DOMAINS = [
  'blogspot.com', 'wordpress.com', 'wixsite.com', 'weebly.com',
  'netlify.app', 'vercel.app', 'herokuapp.com', 'pages.dev',
  'github.io', 'gitlab.io', 'firebaseapp.com', 'web.app',
  'surge.sh', 'glitch.me', 'replit.dev', 'onrender.com',
  'fly.dev', 'duckdns.org', 'ngrok.io', 'serveo.net',
];

// 의심스러운 경로 패턴
const SUSPICIOUS_PATH_PATTERNS = [
  /\/login/i,
  /\/signin/i,
  /\/verify/i,
  /\/secure/i,
  /\/update/i,
  /\/account/i,
  /\/confirm/i,
  /\/banking/i,
  /\/password/i,
  /\/credential/i,
  /\/auth/i,
  /\/wallet/i,
  /\/payment/i,
  /\/recover/i,
  /\/reset/i,
];

// URL 파싱 헬퍼
function parseURL(input) {
  let urlStr = input.trim();

  // 프로토콜이 없으면 추가
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = 'http://' + urlStr;
  }

  try {
    const url = new URL(urlStr);
    return {
      valid: true,
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      href: url.href,
      origin: url.origin,
    };
  } catch {
    return { valid: false };
  }
}

// 분석 항목별 검사 함수들

function checkTyposquatting(parsed) {
  const result = detectTyposquatting(parsed.hostname);

  if (result.exact) {
    return {
      id: 'typosquatting',
      label: '한국 도메인 타이포스쿼팅',
      passed: true,
      detail: `공식 ${result.matchedService} 도메인 확인됨 (${result.matchedDomain})`,
      weight: 25,
    };
  }

  if (result.isTyposquat) {
    return {
      id: 'typosquatting',
      label: '한국 도메인 타이포스쿼팅',
      passed: false,
      detail: `${result.reason} → 공식: ${result.matchedDomain}`,
      weight: result.severity === 'high' ? 25 : 15,
    };
  }

  return {
    id: 'typosquatting',
    label: '한국 도메인 타이포스쿼팅',
    passed: true,
    detail: '한국 주요 서비스 사칭 패턴 미감지',
    weight: 25,
  };
}

function checkShortURL(parsed) {
  const isShort = SHORT_URL_DOMAINS.some(
    d => parsed.hostname === d || parsed.hostname.endsWith('.' + d)
  );

  return {
    id: 'short-url',
    label: '단축 URL 감지',
    passed: !isShort,
    detail: isShort
      ? `단축 URL 서비스 사용 (${parsed.hostname}) — 실제 목적지 확인 불가`
      : '단축 URL 아님',
    weight: 10,
  };
}

function checkDomainLength(parsed) {
  const hostname = parsed.hostname;
  const len = hostname.length;
  const isTooLong = len > 30;

  return {
    id: 'domain-length',
    label: '도메인 길이',
    passed: !isTooLong,
    detail: isTooLong
      ? `도메인 길이 ${len}자 — 비정상적으로 긴 도메인`
      : `도메인 길이 ${len}자`,
    weight: 5,
  };
}

function checkSubdomainDepth(parsed) {
  const parts = parsed.hostname.split('.');
  // TLD가 co.kr 같은 경우 보정
  const isCoKr = parsed.hostname.endsWith('.co.kr') || parsed.hostname.endsWith('.go.kr')
    || parsed.hostname.endsWith('.or.kr') || parsed.hostname.endsWith('.ac.kr');
  const baseParts = isCoKr ? 3 : 2;
  const subdomainCount = Math.max(0, parts.length - baseParts);
  const isSuspicious = subdomainCount >= 3;

  return {
    id: 'subdomain-depth',
    label: '서브도메인 깊이',
    passed: !isSuspicious,
    detail: isSuspicious
      ? `서브도메인 ${subdomainCount}단계 — 과도한 서브도메인 사용`
      : `서브도메인 ${subdomainCount}단계`,
    weight: 10,
  };
}

function checkSpecialChars(parsed) {
  const fullUrl = parsed.href;
  // @, %, 연속 하이픈, 유니코드 등 특수문자 패턴
  const atSign = fullUrl.includes('@');
  const excessiveHyphens = /--/.test(parsed.hostname);
  const encodedChars = (fullUrl.match(/%[0-9A-Fa-f]{2}/g) || []).length;
  const hasSuspiciousChars = atSign || excessiveHyphens || encodedChars > 3;

  const details = [];
  if (atSign) details.push('@ 문자 포함 (URL 위장 가능)');
  if (excessiveHyphens) details.push('연속 하이픈 사용');
  if (encodedChars > 3) details.push(`URL 인코딩 ${encodedChars}개 (과다)`);

  return {
    id: 'special-chars',
    label: '특수문자 과다 사용',
    passed: !hasSuspiciousChars,
    detail: hasSuspiciousChars
      ? details.join(', ')
      : '특수문자 이상 없음',
    weight: 10,
  };
}

function checkIPAddress(parsed) {
  const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname)
    || parsed.hostname.startsWith('['); // IPv6

  return {
    id: 'ip-address',
    label: 'IP 직접 접속',
    passed: !isIP,
    detail: isIP
      ? `IP 주소 직접 접속 (${parsed.hostname}) — 정상 서비스는 도메인 사용`
      : '도메인 이름 사용 중',
    weight: 15,
  };
}

function checkSuspiciousPath(parsed) {
  const path = parsed.pathname + parsed.search;
  const matched = SUSPICIOUS_PATH_PATTERNS.filter(p => p.test(path));

  const isSuspicious = matched.length >= 2;
  // 알려진 한국 도메인이면 경로 패턴은 문제 없음
  const isKnown = isKnownKoreanDomain(parsed.hostname);

  return {
    id: 'suspicious-path',
    label: '의심 경로 패턴',
    passed: isKnown || !isSuspicious,
    detail: isSuspicious && !isKnown
      ? `의심 경로 키워드 ${matched.length}개 감지 (${matched.map(m => m.source.replace(/[\/\\]/g, '')).join(', ')})`
      : matched.length > 0 && !isKnown
        ? `경로 키워드 ${matched.length}개 (단독으로는 정상 범위)`
        : '의심 경로 패턴 없음',
    weight: 10,
  };
}

function checkFreeHosting(parsed) {
  const isFreeHost = FREE_HOSTING_DOMAINS.some(
    d => parsed.hostname === d || parsed.hostname.endsWith('.' + d)
  );

  return {
    id: 'free-hosting',
    label: '무료 호스팅 감지',
    passed: !isFreeHost,
    detail: isFreeHost
      ? `무료 호스팅 서비스 사용 (${parsed.hostname})`
      : '무료 호스팅 아님',
    weight: 5,
  };
}

function checkHTTPS(parsed) {
  const isHTTPS = parsed.protocol === 'https:';

  return {
    id: 'https',
    label: 'HTTPS 사용 여부',
    passed: isHTTPS,
    detail: isHTTPS
      ? 'HTTPS 사용 중'
      : 'HTTP 사용 — 암호화되지 않은 연결',
    weight: 10,
  };
}

// 메인 분석 함수
function analyzeURL(input) {
  const parsed = parseURL(input);

  if (!parsed.valid) {
    return {
      score: 0,
      url: input,
      error: '유효하지 않은 URL 형식',
      items: [],
    };
  }

  const checks = [
    checkTyposquatting,
    checkShortURL,
    checkDomainLength,
    checkSubdomainDepth,
    checkSpecialChars,
    checkIPAddress,
    checkSuspiciousPath,
    checkFreeHosting,
    checkHTTPS,
  ];

  const items = checks.map(fn => fn(parsed));

  // 점수 계산: 100점에서 실패 항목의 weight를 차감
  const totalDeducted = items
    .filter(item => !item.passed)
    .reduce((sum, item) => sum + item.weight, 0);

  const score = Math.max(0, Math.min(100, 100 - totalDeducted));

  return {
    score,
    url: parsed.href,
    hostname: parsed.hostname,
    items,
  };
}

export { analyzeURL, parseURL };

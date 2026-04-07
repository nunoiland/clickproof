/**
 * ClickProof Extension - URL 구조 분석 엔진
 * js/url-analyzer.js의 풍부한 검사 항목 + extension 전용 기능 통합
 * 모든 분석은 클라이언트 로컬에서 수행 (외부 서버 전송 없음)
 */

// 글로벌 신뢰 도메인 (점수 관계없이 항상 safe)
const GLOBAL_TRUSTED_DOMAINS = [
  // Google
  'google.com', 'google.co.kr', 'google.kr',
  'youtube.com', 'youtube.co.kr', 'youtu.be',
  'gmail.com', 'gstatic.com', 'googleapis.com', 'googleusercontent.com',
  // Microsoft
  'microsoft.com', 'bing.com', 'live.com', 'outlook.com',
  'office.com', 'microsoft365.com', 'azure.com', 'msn.com',
  // Apple
  'apple.com', 'icloud.com',
  // Meta
  'instagram.com', 'facebook.com', 'fb.com', 'messenger.com',
  'whatsapp.com', 'threads.net',
  // Twitter/X
  'twitter.com', 'x.com',
  // Amazon / AWS
  'amazon.com', 'amazon.co.kr', 'aws.amazon.com', 'awsstatic.com',
  // 글로벌 플랫폼
  'linkedin.com', 'reddit.com', 'github.com', 'gitlab.com',
  'netflix.com', 'spotify.com', 'discord.com', 'slack.com',
  'notion.so', 'figma.com', 'canva.com', 'zoom.us',
  'dropbox.com', 'paypal.com', 'stripe.com',
  // 위키
  'wikipedia.org', 'wikimedia.org', 'namu.wiki',
  // 한국 주요 포털·뉴스·커뮤니티
  'naver.com', 'daum.net', 'kakao.com', 'nate.com',
  'chosun.com', 'joongang.co.kr', 'joins.com', 'donga.com',
  'hani.co.kr', 'hankyung.com', 'mk.co.kr', 'mt.co.kr',
  'ytn.co.kr', 'yna.co.kr', 'kbs.co.kr', 'mbc.co.kr', 'sbs.co.kr',
  'ohmynews.com', 'pressian.com',
  'theqoo.net', 'dcinside.com', 'clien.net', 'ppomppu.co.kr',
  'ruliweb.com', 'mlbpark.com', 'inven.co.kr',
  // 한국 쇼핑
  'coupang.com', 'gmarket.co.kr', '11st.co.kr', 'auction.co.kr',
  'ssg.com', 'lotteon.com', 'musinsa.com', 'zigzag.kr', 'ably.kr',
  'oliveyoung.co.kr', 'kurly.com', 'baemin.com', 'yogiyo.co.kr',
  // 한국 금융 (이미 korean-domains.js에 있지만 중복 안전망)
  'toss.im', 'tosspayments.com', 'tossbank.com',
  'kbstar.com', 'shinhan.com', 'wooribank.com', 'hanabank.com',
  'ibk.co.kr', 'nonghyup.com',
  // 인프라·CDN
  'cloudflare.com', 'jsdelivr.net', 'cdnjs.cloudflare.com',
  'akamaihd.net', 'fastly.net', 'twimg.com',
  // 학술
  'scholar.google.com', 'arxiv.org', 'doi.org', 'pubmed.ncbi.nlm.nih.gov',
];

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
  /\/login/i, /\/signin/i, /\/verify/i, /\/secure/i,
  /\/update/i, /\/account/i, /\/confirm/i, /\/banking/i,
  /\/password/i, /\/credential/i, /\/auth/i, /\/wallet/i,
  /\/payment/i, /\/recover/i, /\/reset/i,
];

// 의심스러운 TLD
const SUSPICIOUS_TLDS = [
  '.xyz', '.top', '.club', '.work', '.buzz', '.tk', '.ml', '.ga',
  '.cf', '.gq', '.icu', '.cam', '.rest', '.surf',
];

// 신뢰 TLD
const TRUSTED_TLDS = [
  '.com', '.org', '.net', '.edu', '.gov', '.kr', '.co.kr', '.or.kr',
  '.ac.kr', '.go.kr', '.jp', '.uk', '.de', '.fr', '.io', '.dev',
];

/**
 * URL 파싱 헬퍼
 */
function parseURL(input) {
  let urlStr = input.trim();
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

// ── 개별 검사 함수들 ──

function checkHTTPS(parsed) {
  const isHTTPS = parsed.protocol === 'https:';
  return {
    id: 'https',
    label: 'HTTPS 사용 여부',
    passed: isHTTPS,
    detail: isHTTPS ? 'HTTPS 사용 중' : 'HTTP 사용 — 암호화되지 않은 연결',
    weight: 10,
  };
}

function checkTyposquatting(parsed) {
  if (typeof detectTyposquatting !== 'function') {
    return { id: 'typosquatting', label: '타이포스쿼팅', passed: true, detail: '검사 불가', weight: 0 };
  }

  const result = detectTyposquatting(parsed.hostname);

  if (result.exact) {
    return {
      id: 'typosquatting',
      label: '한국 도메인 타이포스쿼팅',
      passed: true,
      detail: `공식 ${result.matchedService} 도메인 확인 (${result.matchedDomain})`,
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
      ? `단축 URL 서비스 (${parsed.hostname}) — 실제 목적지 확인 불가`
      : '단축 URL 아님',
    weight: 10,
  };
}

function checkDomainLength(parsed) {
  const len = parsed.hostname.length;
  const isTooLong = len > 30;
  return {
    id: 'domain-length',
    label: '도메인 길이',
    passed: !isTooLong,
    detail: isTooLong ? `도메인 ${len}자 — 비정상적으로 긴 도메인` : `도메인 ${len}자`,
    weight: 5,
  };
}

function checkSubdomainDepth(parsed) {
  const parts = parsed.hostname.split('.');
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
      ? `서브도메인 ${subdomainCount}단계 — 과도한 서브도메인`
      : `서브도메인 ${subdomainCount}단계`,
    weight: 10,
  };
}

function checkSpecialChars(parsed) {
  const fullUrl = parsed.href;
  const atSign = fullUrl.includes('@');
  const excessiveHyphens = /--/.test(parsed.hostname);
  const encodedChars = (fullUrl.match(/%[0-9A-Fa-f]{2}/g) || []).length;
  const hasSuspicious = atSign || excessiveHyphens || encodedChars > 3;

  const details = [];
  if (atSign) details.push('@ 문자 포함 (URL 위장 가능)');
  if (excessiveHyphens) details.push('연속 하이픈 사용');
  if (encodedChars > 3) details.push(`URL 인코딩 ${encodedChars}개 (과다)`);

  return {
    id: 'special-chars',
    label: '특수문자 과다 사용',
    passed: !hasSuspicious,
    detail: hasSuspicious ? details.join(', ') : '특수문자 이상 없음',
    weight: 10,
  };
}

function checkIPAddress(parsed) {
  const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname) || parsed.hostname.startsWith('[');
  return {
    id: 'ip-address',
    label: 'IP 직접 접속',
    passed: !isIP,
    detail: isIP
      ? `IP 주소 직접 접속 (${parsed.hostname})`
      : '도메인 이름 사용 중',
    weight: 15,
  };
}

function checkSuspiciousPath(parsed) {
  const path = parsed.pathname + parsed.search;
  const matched = SUSPICIOUS_PATH_PATTERNS.filter(p => p.test(path));
  const isSuspicious = matched.length >= 2;
  const isKnown = typeof isKnownKoreanDomain === 'function' && isKnownKoreanDomain(parsed.hostname);

  return {
    id: 'suspicious-path',
    label: '의심 경로 패턴',
    passed: isKnown || !isSuspicious,
    detail: isSuspicious && !isKnown
      ? `의심 경로 키워드 ${matched.length}개 감지`
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
      ? `무료 호스팅 서비스 (${parsed.hostname})`
      : '무료 호스팅 아님',
    weight: 5,
  };
}

function checkHomograph(parsed) {
  const hasHomograph = /[а-яА-Я]/.test(parsed.hostname) || /[α-ωΑ-Ω]/.test(parsed.hostname);
  return {
    id: 'homograph',
    label: '호모그래프 공격',
    passed: !hasHomograph,
    detail: hasHomograph
      ? '비라틴 문자(키릴/그리스)가 도메인에 포함 — 호모그래프 공격 의심'
      : '호모그래프 공격 미감지',
    weight: 15,
  };
}

function checkPunycode(parsed) {
  const isPunycode = parsed.hostname.startsWith('xn--') || parsed.hostname.includes('.xn--');
  return {
    id: 'punycode',
    label: 'Punycode 도메인',
    passed: !isPunycode,
    detail: isPunycode
      ? 'Punycode 도메인 — 국제화 도메인 위장 가능'
      : 'Punycode 미사용',
    weight: 5,
  };
}

function checkTLD(parsed) {
  const isSuspiciousTld = SUSPICIOUS_TLDS.some(tld => parsed.hostname.endsWith(tld));
  const isTrustedTld = TRUSTED_TLDS.some(tld => parsed.hostname.endsWith(tld));
  return {
    id: 'tld',
    label: 'TLD 신뢰도',
    passed: !isSuspiciousTld,
    detail: isSuspiciousTld
      ? '의심스러운 TLD 사용'
      : isTrustedTld ? '신뢰 TLD' : '일반 TLD',
    weight: 5,
  };
}

function checkKoreanTrusted(parsed) {
  const isTrusted = typeof isKoreanTrustedDomain === 'function' && isKoreanTrustedDomain(parsed.hostname);
  const isKrTld = typeof isKoreanTLD === 'function' && isKoreanTLD(parsed.hostname);
  const isFinance = typeof isKoreanFinanceDomain === 'function' && isKoreanFinanceDomain(parsed.hostname);

  if (isFinance) {
    return {
      id: 'korean-trusted',
      label: '한국 신뢰 도메인',
      passed: true,
      detail: '한국 금융기관 공식 도메인 (화이트리스트)',
      weight: 0,
      bonus: 15,
    };
  }
  if (isTrusted) {
    return {
      id: 'korean-trusted',
      label: '한국 신뢰 도메인',
      passed: true,
      detail: '한국 주요 서비스 공식 도메인',
      weight: 0,
      bonus: 10,
    };
  }
  if (isKrTld) {
    return {
      id: 'korean-trusted',
      label: '한국 신뢰 도메인',
      passed: true,
      detail: '한국 TLD(.kr) 사용',
      weight: 0,
      bonus: 5,
    };
  }
  return {
    id: 'korean-trusted',
    label: '한국 신뢰 도메인',
    passed: false,
    detail: '한국 신뢰 도메인 목록에 없음',
    weight: 0,
    bonus: 0,
  };
}

// ── 메인 분석 함수 ──

/**
 * URL을 분석하여 안전 점수와 세부 결과를 반환
 * @param {string} urlString - 분석할 URL
 * @returns {{ score: number, items: Array, riskLevel: string, hostname: string, url: string }}
 */
function analyzeUrl(urlString) {
  const parsed = parseURL(urlString);

  if (!parsed.valid) {
    return {
      score: 0,
      url: urlString,
      hostname: '',
      items: [{ id: 'parse', label: 'URL 파싱', passed: false, detail: '유효하지 않은 URL', weight: 0 }],
      riskLevel: 'danger',
    };
  }

  // 글로벌 신뢰 도메인 — 항상 safe 반환
  const isGlobalTrusted = GLOBAL_TRUSTED_DOMAINS.some(
    d => parsed.hostname === d || parsed.hostname.endsWith('.' + d)
  );
  if (isGlobalTrusted) {
    return { score: 100, url: parsed.href, hostname: parsed.hostname, items: [], riskLevel: 'safe' };
  }

  const checks = [
    checkHTTPS,
    checkTyposquatting,
    checkShortURL,
    checkDomainLength,
    checkSubdomainDepth,
    checkSpecialChars,
    checkIPAddress,
    checkSuspiciousPath,
    checkFreeHosting,
    checkHomograph,
    checkPunycode,
    checkTLD,
    checkKoreanTrusted,
  ];

  const items = checks.map(fn => fn(parsed));

  // 점수 계산: 100점에서 실패 항목의 weight 차감 + bonus 가산
  const totalDeducted = items
    .filter(item => !item.passed)
    .reduce((sum, item) => sum + (item.weight || 0), 0);

  const totalBonus = items
    .reduce((sum, item) => sum + (item.bonus || 0), 0);

  const score = Math.max(0, Math.min(100, 100 - totalDeducted + totalBonus));

  let riskLevel;
  if (score >= 80) riskLevel = 'safe';
  else if (score >= 60) riskLevel = 'warning';
  else riskLevel = 'danger';

  return { score, url: parsed.href, hostname: parsed.hostname, items, riskLevel };
}

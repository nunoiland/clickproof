/**
 * ClickProof Extension - 한국 도메인 DB & 타이포스쿼팅 감지
 * js/korean-domains.js에서 포팅 (Extension용 non-module)
 */

// 한국 주요 서비스 도메인 목록 (서비스별 공식 도메인)
const KOREAN_DOMAINS = {
  naver: ['naver.com', 'nid.naver.com', 'mail.naver.com', 'pay.naver.com', 'shopping.naver.com'],
  kakao: ['kakao.com', 'kakaocorp.com', 'kakaobank.com', 'kakaopay.com', 'kakaocdn.net'],
  toss: ['toss.im', 'tosspayments.com', 'tossbank.com'],
  shinhan: ['shinhan.com', 'shinhanbank.com', 'shinhancard.com'],
  kookmin: ['kbstar.com', 'kbcard.com', 'kbinsure.com'],
  hana: ['hanabank.com', 'hanacard.co.kr', 'hanafn.com'],
  woori: ['wooribank.com', 'wooricard.com', 'woorifg.com'],
  kb: ['kbstar.com', 'kbcard.com', 'kbsec.com'],
  nh: ['nonghyup.com', 'nhbank.com', 'nhcard.com', 'nhinvest.com'],
  coupang: ['coupang.com', 'coupangpay.com', 'coupangeats.com'],
  baemin: ['baemin.com', 'baedal.com'],
  samsung: ['samsung.com', 'samsungcard.com', 'samsunglife.com'],
  lotte: ['lottecard.co.kr', 'lotteon.com'],
  government: ['go.kr', 'or.kr', 'korea.kr'],
  daum: ['daum.net', 'daum.co.kr'],
  skt: ['skt.com', 'tworld.co.kr'],
  kt: ['kt.com', 'ktcs.co.kr'],
  lgu: ['lguplus.com', 'uplus.co.kr'],
  gmarket: ['gmarket.co.kr', 'gmarket.com'],
  '11st': ['11st.co.kr', '11번가.kr'],
  auction: ['auction.co.kr'],
  ssg: ['ssg.com', 'shinsegae.com'],
  musinsa: ['musinsa.com'],
  yogiyo: ['yogiyo.co.kr'],
  kurly: ['kurly.com', 'kurlycorp.com'],
};

// 한국 금융기관 도메인 화이트리스트 (즉시 통과)
const KOREAN_FINANCE_WHITELIST = [
  'kbstar.com', 'shinhan.com', 'wooribank.com', 'hanabank.com',
  'ibk.co.kr', 'nhbank.com', 'citibank.co.kr', 'standardchartered.co.kr',
  'kbcard.com', 'shinhancard.com', 'wooricard.com', 'hanacard.co.kr',
  'samsungcard.com', 'lottecard.co.kr', 'hyundaicard.com', 'bccard.com',
  'toss.im', 'tosspayments.com', 'tossbank.com',
  'kakaopay.com', 'kakaobank.com',
  'naverpay.com',
  'ksd.or.kr', 'kofia.or.kr', 'fss.or.kr', 'fsc.go.kr',
  'kftc.or.kr', 'kcredit.or.kr',
];

// 한국 TLD
const KOREAN_TLDS = ['.kr', '.한국'];

// 시각적으로 유사한 문자 매핑
const VISUAL_SIMILAR_CHARS = {
  'l': ['1', 'i', '|'],
  '1': ['l', 'i', '|'],
  'i': ['l', '1', '|'],
  'o': ['0'],
  '0': ['o'],
  'rn': ['m'],
  'm': ['rn'],
  'vv': ['w'],
  'w': ['vv'],
  'cl': ['d'],
  'd': ['cl'],
  'nn': ['m'],
  'q': ['g'],
  'g': ['q'],
};

/**
 * 레벤슈타인 거리 계산
 */
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * 시각적 유사 문자를 정규화
 */
function normalizeVisual(str) {
  let normalized = str.toLowerCase();
  normalized = normalized.replace(/rn/g, 'm');
  normalized = normalized.replace(/vv/g, 'w');
  normalized = normalized.replace(/cl/g, 'd');
  normalized = normalized.replace(/nn/g, 'm');
  normalized = normalized.replace(/[1|]/g, 'l');
  normalized = normalized.replace(/0/g, 'o');
  return normalized;
}

/**
 * 도메인에서 핵심 이름 추출 (TLD 제거)
 */
function extractCoreName(domain) {
  return domain.replace(/\.(com|co\.kr|kr|net|org|im)$/, '');
}

/**
 * 타이포스쿼팅 감지
 * @param {string} hostname
 * @returns {{ isTyposquat: boolean, matchedService?: string, matchedDomain?: string, reason?: string, severity?: string, exact?: boolean }}
 */
function detectTyposquatting(hostname) {
  const results = [];
  const cleanHost = hostname.split(':')[0].toLowerCase();

  for (const [service, domains] of Object.entries(KOREAN_DOMAINS)) {
    for (const legit of domains) {
      const legitName = extractCoreName(legit);
      const inputName = extractCoreName(cleanHost);

      // 정확히 일치하면 안전
      if (cleanHost === legit || cleanHost.endsWith('.' + legit)) {
        return { isTyposquat: false, matchedService: service, matchedDomain: legit, exact: true };
      }

      // 호스트에 정식 서비스명이 포함되어 있지만 공식 도메인이 아닌 경우
      if (cleanHost.includes(legitName) && cleanHost !== legit && !cleanHost.endsWith('.' + legit)) {
        results.push({
          service,
          domain: legit,
          reason: `"${legitName}" 포함되었지만 공식 도메인이 아님`,
          severity: 'high',
        });
        continue;
      }

      // 레벤슈타인 거리 기반 감지
      const distance = levenshteinDistance(inputName, legitName);
      if (distance > 0 && distance <= 2 && inputName.length >= 3) {
        results.push({
          service,
          domain: legit,
          reason: `"${inputName}" ↔ "${legitName}" ${distance}글자 차이 (오타 의심)`,
          severity: distance === 1 ? 'high' : 'medium',
        });
        continue;
      }

      // 시각적 유사 문자 감지
      const normalizedInput = normalizeVisual(inputName);
      const normalizedLegit = normalizeVisual(legitName);
      if (normalizedInput === normalizedLegit && inputName !== legitName) {
        results.push({
          service,
          domain: legit,
          reason: `"${inputName}" ↔ "${legitName}" 시각적으로 유사 (유사 문자 사용)`,
          severity: 'high',
        });
      }
    }
  }

  if (results.length > 0) {
    const best = results.sort((a, b) => (a.severity === 'high' ? -1 : 1) - (b.severity === 'high' ? -1 : 1))[0];
    return {
      isTyposquat: true,
      matchedService: best.service,
      matchedDomain: best.domain,
      reason: best.reason,
      severity: best.severity,
    };
  }

  return { isTyposquat: false };
}

/**
 * 알려진 한국 도메인인지 확인
 */
function isKnownKoreanDomain(hostname) {
  const cleanHost = hostname.split(':')[0].toLowerCase();
  for (const domains of Object.values(KOREAN_DOMAINS)) {
    for (const d of domains) {
      if (cleanHost === d || cleanHost.endsWith('.' + d)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 한국 금융기관 화이트리스트 확인
 */
function isKoreanFinanceDomain(hostname) {
  const cleanHost = hostname.split(':')[0].toLowerCase();
  return KOREAN_FINANCE_WHITELIST.some(d => cleanHost === d || cleanHost.endsWith('.' + d));
}

/**
 * 한국 신뢰 도메인 확인 (금융 + 주요 서비스)
 */
function isKoreanTrustedDomain(hostname) {
  return isKnownKoreanDomain(hostname) || isKoreanFinanceDomain(hostname);
}

/**
 * 한국 TLD인지 확인
 */
function isKoreanTLD(hostname) {
  const lower = hostname.toLowerCase();
  return KOREAN_TLDS.some(tld => lower.endsWith(tld));
}

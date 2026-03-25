// korean-domains.js
// 한국 주요 서비스 도메인 목록 및 타이포스쿼팅 감지

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
  coupang: ['coupang.com', 'coupangpay.com'],
  baemin: ['baemin.com', 'baedal.com'],
  samsung: ['samsung.com', 'samsungcard.com', 'samsunglife.com'],
  lotte: ['lottecard.co.kr', 'lotteon.com'],
  government: ['go.kr', 'or.kr', 'korea.kr'],
};

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

// 레벤슈타인 거리 계산
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

// 시각적 유사 문자를 정규화하여 비교
function normalizeVisual(str) {
  let normalized = str.toLowerCase();
  // 다중 문자 치환 먼저
  normalized = normalized.replace(/rn/g, 'm');
  normalized = normalized.replace(/vv/g, 'w');
  normalized = normalized.replace(/cl/g, 'd');
  normalized = normalized.replace(/nn/g, 'm');
  // 단일 문자 치환
  normalized = normalized.replace(/[1|]/g, 'l');
  normalized = normalized.replace(/0/g, 'o');
  return normalized;
}

// 도메인에서 핵심 이름 추출 (TLD 제거)
function extractCoreName(domain) {
  return domain.replace(/\.(com|co\.kr|kr|net|org|im)$/, '');
}

// 타이포스쿼팅 감지: 입력 도메인이 한국 주요 도메인과 유사한지 검사
function detectTyposquatting(hostname) {
  const results = [];

  // hostname에서 포트 제거
  const cleanHost = hostname.split(':')[0].toLowerCase();

  // 모든 한국 도메인과 비교
  for (const [service, domains] of Object.entries(KOREAN_DOMAINS)) {
    for (const legit of domains) {
      const legitName = extractCoreName(legit);
      const inputName = extractCoreName(cleanHost);

      // 정확히 일치하면 안전
      if (cleanHost === legit || cleanHost.endsWith('.' + legit)) {
        return { isTyposquat: false, matchedService: service, matchedDomain: legit, exact: true };
      }

      // 호스트에 정식 서비스명이 포함되어 있지만 정식 도메인이 아닌 경우
      if (cleanHost.includes(legitName) && cleanHost !== legit && !cleanHost.endsWith('.' + legit)) {
        results.push({
          service,
          domain: legit,
          reason: `도메인에 "${legitName}" 포함되었지만 공식 도메인이 아님`,
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
          reason: `"${inputName}"이(가) "${legitName}"과(와) ${distance}글자 차이 (오타 의심)`,
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
          reason: `"${inputName}"이(가) "${legitName}"과(와) 시각적으로 유사 (유사 문자 사용)`,
          severity: 'high',
        });
      }
    }
  }

  if (results.length > 0) {
    // severity가 가장 높은 결과 반환
    const best = results.sort((a) => (a.severity === 'high' ? -1 : 1))[0];
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

// 알려진 한국 도메인인지 확인
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

export {
  KOREAN_DOMAINS,
  VISUAL_SIMILAR_CHARS,
  levenshteinDistance,
  normalizeVisual,
  detectTyposquatting,
  isKnownKoreanDomain,
};

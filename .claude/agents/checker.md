# Checker Agent

링크 검문소 웹 버전 — 3계층 URL 안전도 분석 도구

## 담당 파일
- `checker.html` — 링크 검문소 HTML
- `css/checker.css` — 링크 검문소 스타일
- `js/checker.js` — 링크 검문소 메인 로직
- `js/url-analyzer.js` — URL 구조 분석 엔진 (extension과 공유)
- `js/korean-domains.js` — 한국 도메인 타이포스쿼팅 DB (extension과 공유)
- `api/check-url.js` — Vercel Serverless Function (리다이렉트 추적, WHOIS)

## 분석 3계층 구조

### Layer 1: 한국형 제로데이 분석 (클라이언트 JS, 즉시 판정 — 킬러 피처)
1. 한국 주요 도메인 타이포스쿼팅 (레벤슈타인 거리 + 시각적 유사 문자)
2. 한국 금융기관 사칭 감지
3. 단축 URL 자동 펼치기 (bit.ly, url.kr, han.gl, me2.do 등)
4. 도메인 나이 체크 (WHOIS 30일 이내 = 경고)
5. 무료 호스팅/무료 도메인 탐지
6. URL 구조 이상 탐지 (도메인 길이, 서브도메인 깊이, 특수문자, IP 직접 접속)
7. 피싱 경로 패턴 감지 (/login, /verify, /secure 등)

### Layer 2: 외부 DB 조회 (무료 API)
8. Google Safe Browsing
9. VirusTotal
10. PhishTank/OpenPhish
11. SSL 인증서 확인

### Layer 3: 리다이렉트 체인 추적 (Vercel Serverless)
12. 리다이렉트 체인 전체 경로
13. 최종 목적지 재분석 (Layer 1 + 2 재적용)

## 점수 산출
- 0~100점 (높을수록 안전)
- Layer 1: 60% / Layer 2: 30% / Layer 3: 10%
- 90~100: 안전(초록) / 60~89: 주의(노랑) / 0~59: 위험(빨강)

## UX
- 단일 페이지, 입력창 중앙 배치
- 분석 중 프로그레스 바 (Layer 1 → 2 → 3)
- 다크/라이트 모드 지원
- 모바일 대응

## 참고
- PRD `jigeum-myeotjeom-PRD.md` 섹션 7-5 참조
- url-analyzer.js와 korean-domains.js는 extension에서도 사용

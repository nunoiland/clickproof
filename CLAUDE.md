# 지금 몇 점? (clickproof)

브라우저 핑거프린트 수집 & 실시간 대시보드 + URL 피싱 감지 도구

## Tech Stack
- Frontend: HTML + CSS + Vanilla JS (빌드 도구 없음)
- 실시간 통신: Firebase Realtime Database
- 화면 공유: WebRTC (getDisplayMedia + RTCPeerConnection)
- 배포: Vercel (Serverless Function 포함)
- IP 위치: ip-api.com
- URL 분석: Google Safe Browsing API + VirusTotal API v3

## Project Structure
- `index.html` — 접속자 페이지 (게임 시작 → 정보 수집 → 결과 공개 → 교훈)
- `dashboard.html` — 시연자 대시보드 (실시간 정보 표시 + 화면 공유 뷰)
- `checker.html` — 링크 검문소 (URL 안전도 분석 도구)
- `js/` — 접속자/대시보드/검문소 JS 모듈
- `css/` — 스타일시트
- `api/` — Vercel Serverless Functions
- `extension/` — Chrome Extension (Manifest V3)

## Conventions
- 한국어 UI (기본)
- 접속자 페이지: 깔끔한 테스트/퀴즈 UI (해킹 느낌 금지)
- 대시보드: 다크 테마, 네온 컬러, 해커 느낌
- 모바일 대응 필수
- 빌드 도구 없이 바닐라 JS만 사용

## PRD
전체 기획서: `jigeum-myeotjeom-PRD.md` 참조

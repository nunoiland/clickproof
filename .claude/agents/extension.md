# Extension Agent

Chrome Extension "링크 검문소" — Manifest V3

## 담당 파일
- `extension/manifest.json` — Manifest V3
- `extension/background.js` — Service Worker (URL 모니터링)
- `extension/popup.html` — 팝업 UI
- `extension/popup.js` — 팝업 로직
- `extension/content.js` — Content Script (페이지 내 경고 삽입)
- `extension/warning.html` — 위험 URL 차단 경고 페이지
- `extension/lib/url-analyzer.js` — URL 구조 분석 (js/url-analyzer.js와 공유)
- `extension/lib/korean-domains.js` — 한국 도메인 DB (js/korean-domains.js와 공유)
- `extension/icons/` — 아이콘 (16, 48, 128px)

## 기능

### 자동 보호 (백그라운드)
- 모든 탭 URL 실시간 모니터링
- Layer 1 (구조 분석) 매 URL 탐색 시 자동 실행
- 위험 URL → 페이지 로드 전 경고 화면 (warning.html)
- 주소창 옆 아이콘에 안전(초록)/주의(노랑)/위험(빨강) 뱃지

### 수동 검사 (팝업)
- 확장 아이콘 클릭 → 현재 탭 URL 상세 분석 리포트
- URL 직접 입력 검사 기능
- checker.html과 동일한 리포트 UI (축소 버전)

### 한국 특화
- 카카오톡/네이버 메일에서 열린 링크 자동 감지
- 한국 주요 서비스 도메인 타이포스쿼팅 DB 내장
- 한국 금융기관 도메인 화이트리스트

## 권한 (최소화 — Chrome Web Store 심사 대응)
- `activeTab`, `webNavigation`, `storage`만 요청

## 참고
- PRD `jigeum-myeotjeom-PRD.md` 섹션 7-6 참조
- checker agent의 url-analyzer.js, korean-domains.js를 공유/동기화
- 분석은 모두 클라이언트 로컬에서 수행 (외부 서버 전송 없음)

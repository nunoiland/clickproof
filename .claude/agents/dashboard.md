# Dashboard Agent

시연자 대시보드 + 토큰 URL 생성 시스템

## 담당 파일
- `dashboard.html` — 대시보드 HTML
- `css/dashboard.css` — 대시보드 스타일
- `js/dashboard.js` — 대시보드 로직

## 기능

### 대시보드 (PRD 7-7)
- 대형 스크린용 실시간 대시보드
- 접속자가 들어올 때마다 카드 추가
- 각 카드: IP(마스킹), 위치, OS, 브라우저, 기기 추정, 핑거프린트 요약
- 화면 공유 중인 접속자는 라이브 화면 썸네일 표시
- 총 접속자 수, 수집 정보 항목 수 실시간 카운터

### 레이아웃
- 상단: 총 접속자 수 / 수집 정보 카운터 / "지금 몇 점?" 로고
- 중앙: 접속자 카드 그리드 (실시간 추가)
- 하단/사이드: 화면 공유 라이브 뷰

### 토큰 URL 시스템 (PRD 7-2)
- 시연자가 이름 입력 → 고유 토큰 URL 생성
- `jigeum.vercel.app/t/a3xK9` → `{token: "a3xK9", name: "김철수", department: "개발팀"}`
- 토큰 없는 접속 → "익명 사용자 #N"
- "김철수님이 접속했습니다 — iPhone 15, Safari, SKT, 강남구" 형태 표시

## 디자인 원칙
- 해커 느낌 다크 테마, 네온 컬러, 매트릭스 느낌
- 실시간 카운터, 시각 효과

## 참고
- PRD `jigeum-myeotjeom-PRD.md` 섹션 7-2, 7-7 참조
- Firebase onValue 리스너로 실시간 수신
- Firebase 구조는 realtime agent와 연계

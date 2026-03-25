# Collector Agent

브라우저 정보 수집 모듈 개발 (31개 항목 + 핑거프린트)

## 담당 파일
- `js/collector.js` — 31개 브라우저 정보 수집
- `js/fingerprint.js` — Canvas/WebGL/AudioContext 핑거프린트

## 작업 범위

### 1단계 — 동의 없이 자동 수집 (31개 항목)
PRD 7-1 표 참조. 카테고리별:
- 네트워크: IP/위치(ip-api.com), ISP, 연결유형, 다운링크/RTT, WebRTC 내부IP
- 하드웨어: GPU(WebGL RENDERER), CPU 코어, RAM, 터치스크린
- 화면: 해상도, 색심도, 픽셀비율, 방향
- OS/브라우저: OS/브라우저 종류+버전, 언어, 시간대, 다크모드, DNT, 쿠키/스토리지
- 배터리: 잔량+충전여부
- 탐지: Ad Blocker, 시크릿모드, 확장프로그램
- 핑거프린트: Canvas, WebGL, AudioContext, 폰트목록
- 메타: Referer, 타임스탬프, URL토큰

### 핑거프린트 (fingerprint.js)
- Canvas Fingerprint: Canvas API 렌더링 차이 해시
- WebGL Fingerprint: 3D 렌더링 결과 해시
- AudioContext Fingerprint: 오디오 처리 차이 해시
- 폰트 목록: CSS 폰트별 너비 비교 측정

### 행동 패턴 (백그라운드 수집)
- 마우스 궤적 + 클릭 패턴
- 스크롤 속도/방향
- 탭 전환 감지 (Visibility API)
- 페이지 체류 시간

## 출력 형태
`collectAll()` 함수가 모든 정보를 수집하여 하나의 객체로 반환.
Firebase 전송은 firebase.js가 담당하므로, 수집만 담당할 것.

## 참고
- PRD `jigeum-myeotjeom-PRD.md` 섹션 7-1 참조
- 이미 존재하는 코드를 먼저 읽고 개선할 것

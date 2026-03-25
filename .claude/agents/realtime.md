# Realtime Agent

Firebase 연동 + WebRTC 화면 공유

## 담당 파일
- `js/firebase.js` — Firebase Realtime Database 연동
- `js/webrtc.js` — WebRTC 화면 공유 스트리밍

## 기능

### Firebase 연동 (PRD 7-8)
- Firebase Realtime Database 사용 (무료 티어)
- 접속자 페이지에서 수집 완료 시 데이터 push
- 대시보드에서 onValue 리스너로 실시간 수신
- 1초 이내 데이터 전달 목표

### Firebase 데이터 구조
- `/visitors/{visitorId}` — 접속자별 수집 데이터
- `/tokens/{tokenId}` — 토큰 URL 매핑 (name, department)
- `/signaling/{visitorId}` — WebRTC 시그널링 (offer/answer/ICE)

### WebRTC 화면 공유 (PRD 7-4)
- getDisplayMedia로 화면 캡처
- RTCPeerConnection으로 대시보드에 단방향 스트리밍
- Firebase를 시그널링 서버로 활용 (offer/answer/ICE candidate 교환)
- 접속자 → 대시보드 단방향

### 화면 공유 유도 UX
- 교훈 화면 이후 "추가 보안 진단을 위해 화면 공유가 필요합니다" 버튼
- 허용 시 대시보드에 해당 접속자 데스크탑 실시간 표시

## 참고
- PRD `jigeum-myeotjeom-PRD.md` 섹션 7-4, 7-8 참조
- dashboard agent와 연계 (Firebase 구조 공유)
- firebase.json 설정 파일 참조

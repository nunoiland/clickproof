// webrtc.js — 화면 공유 + Firebase 시그널링을 통한 단방향 스트리밍
// 의존: firebase.js (window.FirebaseDB)

const WebRTCManager = (() => {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  const PEER_CONFIG = {
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 10,
  };

  // ── 화면 공유 스트림 획득 ──

  /**
   * 화면 공유 스트림 획득 (송신 측)
   * @param {object} [constraints] - getDisplayMedia 옵션
   * @returns {Promise<MediaStream>}
   */
  async function getScreenStream(constraints) {
    const defaultConstraints = {
      video: {
        cursor: 'always',
        displaySurface: 'monitor',
      },
      audio: false,
    };
    return navigator.mediaDevices.getDisplayMedia(constraints || defaultConstraints);
  }

  // ── 송신 측 (화면 공유하는 접속자) ──

  /**
   * 송신 Peer 생성: 화면 공유 스트림을 대시보드로 전송
   * @param {string} token - 세션 토큰
   * @param {MediaStream} stream - getScreenStream()으로 획득한 스트림
   * @param {object} [callbacks] - 상태 콜백
   * @param {function} [callbacks.onStateChange] - 연결 상태 변경 콜백 ('connecting'|'connected'|'disconnected'|'failed')
   * @param {function} [callbacks.onStreamEnd] - 스트림 종료 콜백 (사용자가 공유 중지)
   * @returns {Promise<{ pc: RTCPeerConnection, stop: function }>}
   */
  async function startSender(token, stream, callbacks) {
    const { onStateChange, onStreamEnd } = callbacks || {};
    const sigRef = window.FirebaseDB.getSignalingRef(token);

    // 기존 시그널링 데이터 정리 후 시작
    await window.FirebaseDB.clearSignaling(token);

    const pc = new RTCPeerConnection(PEER_CONFIG);
    let stopped = false;

    if (onStateChange) onStateChange('connecting');

    // 트랙 추가 (단방향: 송신만)
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);

      // 사용자가 브라우저 UI에서 "공유 중지" 클릭 시
      track.onended = () => {
        if (!stopped) {
          if (onStreamEnd) onStreamEnd();
          stop();
        }
      };
    });

    // 연결 상태 모니터링
    pc.onconnectionstatechange = () => {
      if (onStateChange) onStateChange(pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (!stopped) stop();
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        // ICE restart 시도
        pc.restartIce();
      }
    };

    // ICE candidate → Firebase
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sigRef.child('senderCandidates').push(e.candidate.toJSON());
      }
    };

    // Offer 생성 및 저장
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sigRef.child('offer').set({
      type: offer.type,
      sdp: offer.sdp,
    });

    // Answer 수신 대기
    const answerUnsub = sigRef.child('answer');
    answerUnsub.on('value', async (snapshot) => {
      const answer = snapshot.val();
      if (answer && !pc.currentRemoteDescription) {
        try {
          await pc.setRemoteDescription(answer);
        } catch (err) {
          console.error('[WebRTC Sender] setRemoteDescription 실패:', err);
        }
      }
    });

    // 수신 측 ICE candidate 처리
    const candidateUnsub = sigRef.child('receiverCandidates');
    candidateUnsub.on('child_added', (snapshot) => {
      const candidate = snapshot.val();
      if (candidate) {
        pc.addIceCandidate(candidate).catch((err) => {
          console.warn('[WebRTC Sender] addIceCandidate 실패:', err);
        });
      }
    });

    function stop() {
      if (stopped) return;
      stopped = true;

      // Firebase 리스너 해제
      answerUnsub.off('value');
      candidateUnsub.off('child_added');

      // 스트림 트랙 정지
      stream.getTracks().forEach((t) => t.stop());

      // PeerConnection 종료
      pc.close();

      // 시그널링 데이터 정리
      sigRef.remove().catch(() => {});

      // 화면 공유 상태 업데이트
      window.FirebaseDB.setScreenShareStatus(token, false).catch(() => {});

      if (onStateChange) onStateChange('closed');
    }

    // 화면 공유 상태를 Firebase에 기록
    window.FirebaseDB.setScreenShareStatus(token, true);

    return { pc, stop };
  }

  // ── 수신 측 (대시보드) ──

  /**
   * 수신 Peer 생성: 대시보드에서 원격 화면 스트림 수신
   * @param {string} token - 세션 토큰
   * @param {object} callbacks - 콜백 객체
   * @param {function} callbacks.onStream - 원격 스트림 수신 콜백 (MediaStream)
   * @param {function} [callbacks.onStateChange] - 연결 상태 변경 콜백
   * @param {function} [callbacks.onEnded] - 상대방 스트림 종료 콜백
   * @returns {Promise<{ pc: RTCPeerConnection, stop: function }>}
   */
  async function startReceiver(token, callbacks) {
    const { onStream, onStateChange, onEnded } = callbacks || {};
    const sigRef = window.FirebaseDB.getSignalingRef(token);
    const pc = new RTCPeerConnection(PEER_CONFIG);
    let stopped = false;

    if (onStateChange) onStateChange('waiting');

    // 원격 트랙 수신
    pc.ontrack = (e) => {
      if (e.streams && e.streams[0]) {
        const remoteStream = e.streams[0];
        if (onStream) onStream(remoteStream);

        // 스트림 종료 감지
        remoteStream.getTracks().forEach((track) => {
          track.onended = () => {
            if (!stopped && onEnded) onEnded();
          };
        });
      }
    };

    // 연결 상태 모니터링
    pc.onconnectionstatechange = () => {
      if (onStateChange) onStateChange(pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        if (!stopped && onEnded) onEnded();
      }
    };

    // ICE candidate → Firebase
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sigRef.child('receiverCandidates').push(e.candidate.toJSON());
      }
    };

    // Offer 수신 대기
    const offerUnsub = sigRef.child('offer');
    offerUnsub.on('value', async (snapshot) => {
      const offer = snapshot.val();
      if (!offer) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sigRef.child('answer').set({
          type: answer.type,
          sdp: answer.sdp,
        });
        if (onStateChange) onStateChange('connecting');
      } catch (err) {
        console.error('[WebRTC Receiver] 핸드셰이크 실패:', err);
      }
    });

    // 송신 측 ICE candidate 처리
    const candidateUnsub = sigRef.child('senderCandidates');
    candidateUnsub.on('child_added', (snapshot) => {
      const candidate = snapshot.val();
      if (candidate) {
        pc.addIceCandidate(candidate).catch((err) => {
          console.warn('[WebRTC Receiver] addIceCandidate 실패:', err);
        });
      }
    });

    function stop() {
      if (stopped) return;
      stopped = true;

      offerUnsub.off('value');
      candidateUnsub.off('child_added');
      pc.close();

      if (onStateChange) onStateChange('closed');
    }

    return { pc, stop };
  }

  // ── 대시보드: 화면 공유 가능한 접속자 감시 ──

  /**
   * 화면 공유 중인 접속자를 실시간 감시
   * @param {function} onShareStart - (token) 화면 공유 시작 콜백
   * @param {function} onShareEnd - (token) 화면 공유 종료 콜백
   * @returns {function} unsubscribe
   */
  function watchScreenShares(onShareStart, onShareEnd) {
    const db = window.FirebaseDB.getDb();
    const visitorsRef = db.ref('visitors');
    const activeTokens = new Set();

    const cb = (snapshot) => {
      const visitors = snapshot.val();
      if (!visitors) return;

      const currentSharing = new Set();

      Object.keys(visitors).forEach((token) => {
        if (visitors[token].screenSharing) {
          currentSharing.add(token);
          if (!activeTokens.has(token)) {
            activeTokens.add(token);
            onShareStart(token);
          }
        }
      });

      // 공유 종료된 토큰 처리
      activeTokens.forEach((token) => {
        if (!currentSharing.has(token)) {
          activeTokens.delete(token);
          onShareEnd(token);
        }
      });
    };

    visitorsRef.on('value', cb);
    return () => visitorsRef.off('value', cb);
  }

  return {
    getScreenStream,
    startSender,
    startReceiver,
    watchScreenShares,
  };
})();

if (typeof window !== 'undefined') {
  window.WebRTCManager = WebRTCManager;
}

// firebase.js — Firebase Realtime Database 연동
// Firebase SDK는 HTML에서 CDN으로 로드
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>

const FirebaseDB = (() => {
  // ── 설정 ──
  const firebaseConfig = {
    apiKey: 'AIzaSyC6Gw6xCAUBlWoy9sX2vQNhmFFFVCZ8sLY',
    authDomain: 'clickproof.firebaseapp.com',
    databaseURL: 'https://clickproof-default-rtdb.firebaseio.com',
    projectId: 'clickproof',
    storageBucket: 'clickproof.firebasestorage.app',
    messagingSenderId: '462449109109',
    appId: '1:462449109109:web:29cbe216afe40916edb03c',
  };

  let app = null;
  let db = null;
  let initialized = false;

  function init(customConfig) {
    if (initialized) return db;
    const config = customConfig || firebaseConfig;

    // 다른 스크립트에서 이미 초기화했을 수 있음
    if (firebase.apps.length > 0) {
      app = firebase.apps[0];
    } else {
      app = firebase.initializeApp(config);
    }
    db = firebase.database();
    initialized = true;
    return db;
  }

  function getDb() {
    if (!initialized) init();
    return db;
  }

  // ── 접속자 데이터 전송 (접속자 페이지 → Firebase) ──

  /**
   * 수집된 데이터를 Firebase에 저장
   * 경로: /visitors/{token}
   * @param {string} token - URL 토큰
   * @param {Array} items - Collector가 수집한 항목 배열
   * @returns {Promise}
   */
  function pushVisitorData(token, items) {
    const ref = getDb().ref('visitors/' + token);

    // items 배열을 flat object로 변환 + 메타 정보 추가
    const data = {
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      createdAt: Date.now(),
      userAgent: navigator.userAgent,
      items: {},
    };

    // 각 수집 항목을 id 기준으로 저장
    if (Array.isArray(items)) {
      items.forEach((item) => {
        if (item.id) {
          data.items[item.id] = {
            label: item.label,
            value: item.value,
            category: item.category,
            shockLevel: item.shockLevel,
          };
        }

        // dashboard.js가 기대하는 flat 필드도 설정
        switch (item.id) {
          case 'ip_address':
            data.ip = item.value;
            break;
          case 'ip_location':
            data.location = item.value;
            break;
          case 'ip_isp':
            data.isp = item.value;
            break;
          case 'ip_lat_lon':
            data.latlon = item.value;
            break;
          case 'gpu_renderer':
            data.gpu = item.value;
            break;
          case 'gpu_vendor':
            data.gpuVendor = item.value;
            break;
          case 'battery_level':
            data.battery = item.value;
            break;
          case 'cpu_cores':
            data.hardwareConcurrency = item.value;
            break;
          case 'ram':
            data.deviceMemory = item.value;
            break;
          case 'screen_resolution':
            data.screenResolution = item.value;
            break;
          case 'language':
            data.language = item.value;
            break;
          case 'timezone':
            data.timezone = item.value;
            break;
          case 'os':
            data.os = item.value;
            break;
          case 'browser':
            data.browser = item.value;
            break;
          case 'platform':
            data.platform = item.value;
            break;
          case 'connection_type':
            data.connectionType = item.value;
            break;
          case 'do_not_track':
            data.doNotTrack = item.value;
            break;
          case 'fp_canvas':
            data.canvasFingerprint = item.value;
            break;
          case 'fp_webgl':
            data.webglFingerprint = item.value;
            break;
          case 'fp_audio':
            data.audioFingerprint = item.value;
            break;
          case 'incognito':
            data.incognito = item.value === '시크릿 모드 사용 중';
            break;
          case 'webrtc_local_ip':
            data.webrtcLocalIPs = item.value;
            break;
          case 'fonts_count':
            data.fonts = item.value;
            break;
        }
      });
    }

    // 위치 정보를 geo 객체로도 구성
    if (data.location) {
      const parts = data.location.split(', ');
      data.geo = {
        city: parts[0] || '',
        region: parts[1] || '',
        country: parts[2] || '',
      };
      data.city = parts[0] || '';
      data.country = parts[parts.length - 1] || '';
    }

    return ref.set(data);
  }

  /**
   * 화면 공유 상태를 Firebase에 기록
   * @param {string} token - URL 토큰
   * @param {boolean} sharing - 화면 공유 중 여부
   */
  function setScreenShareStatus(token, sharing) {
    return getDb().ref('visitors/' + token + '/screenSharing').set(sharing);
  }

  // ── 대시보드 리스너 (대시보드 → Firebase) ──

  /**
   * 토큰-이름 매핑 실시간 수신
   * @param {function} onData - 콜백 ({ [token]: { name, createdAt } })
   * @returns {function} unsubscribe
   */
  function onTokens(onData) {
    const ref = getDb().ref('tokens');
    const cb = (snapshot) => onData(snapshot.val());
    ref.on('value', cb);
    return () => ref.off('value', cb);
  }

  /**
   * 접속자 추가 이벤트
   * @param {function} onAdded - 콜백 (token, data)
   * @returns {function} unsubscribe
   */
  function onVisitorAdded(onAdded) {
    const ref = getDb().ref('visitors');
    const cb = (snapshot) => onAdded(snapshot.key, snapshot.val());
    ref.on('child_added', cb);
    return () => ref.off('child_added', cb);
  }

  /**
   * 접속자 데이터 변경 이벤트
   * @param {function} onChanged - 콜백 (token, data)
   * @returns {function} unsubscribe
   */
  function onVisitorChanged(onChanged) {
    const ref = getDb().ref('visitors');
    const cb = (snapshot) => onChanged(snapshot.key, snapshot.val());
    ref.on('child_changed', cb);
    return () => ref.off('child_changed', cb);
  }

  /**
   * 접속자 제거 이벤트
   * @param {function} onRemoved - 콜백 (token)
   * @returns {function} unsubscribe
   */
  function onVisitorRemoved(onRemoved) {
    const ref = getDb().ref('visitors');
    const cb = (snapshot) => onRemoved(snapshot.key);
    ref.on('child_removed', cb);
    return () => ref.off('child_removed', cb);
  }

  // ── WebRTC 시그널링 ──

  /**
   * 시그널링용 레퍼런스 반환
   * @param {string} token - 세션 토큰
   * @returns {firebase.database.Reference}
   */
  function getSignalingRef(token) {
    return getDb().ref('signaling/' + token);
  }

  /**
   * 시그널링 데이터 정리
   * @param {string} token - 세션 토큰
   */
  function clearSignaling(token) {
    return getDb().ref('signaling/' + token).remove();
  }

  // ── 토큰 관리 ──

  /**
   * 새 토큰-이름 매핑 저장
   * @param {string} token
   * @param {string} name
   */
  function saveToken(token, name) {
    return getDb().ref('tokens/' + token).set({
      name: name,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
    });
  }

  // ── 접속자 presence (온라인/오프라인 추적) ──

  /**
   * 접속자의 온라인 상태를 추적
   * @param {string} token - URL 토큰
   */
  function trackPresence(token) {
    const presenceRef = getDb().ref('visitors/' + token + '/online');
    const connectedRef = getDb().ref('.info/connected');

    connectedRef.on('value', (snapshot) => {
      if (snapshot.val() === true) {
        presenceRef.set(true);
        presenceRef.onDisconnect().set(false);
      }
    });
  }

  /**
   * Firebase 연결 상태 감시
   * @param {function} onConnected - 연결 시 콜백
   * @param {function} onDisconnected - 연결 해제 시 콜백
   * @returns {function} unsubscribe
   */
  function onConnectionState(onConnected, onDisconnected) {
    const ref = getDb().ref('.info/connected');
    const cb = (snapshot) => {
      if (snapshot.val() === true) {
        onConnected();
      } else {
        onDisconnected();
      }
    };
    ref.on('value', cb);
    return () => ref.off('value', cb);
  }

  return {
    init,
    getDb,
    pushVisitorData,
    setScreenShareStatus,
    onTokens,
    onVisitorAdded,
    onVisitorChanged,
    onVisitorRemoved,
    getSignalingRef,
    clearSignaling,
    saveToken,
    trackPresence,
    onConnectionState,
  };
})();

if (typeof window !== 'undefined') {
  window.FirebaseDB = FirebaseDB;
}

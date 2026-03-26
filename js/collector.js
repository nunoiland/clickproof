/**
 * collector.js - 브라우저 정보 수집 오케스트레이터
 * Fingerprint 모듈에 의존 (fingerprint.js 먼저 로드 필요)
 * PRD 7-1 기준 31개 항목 + 핑거프린트 + 행동 패턴 수집
 * 각 항목: { id, category, label, value, shockLevel(1~5) }
 */
const Collector = (() => {
  // 페이지 로드 시각 기록 (체류 시간 계산용)
  const _pageLoadTime = performance.now();
  const _pageLoadTimestamp = Date.now();

  // 행동 패턴 수집기 상태
  const _behavior = {
    clicks: [],
    scrolls: [],
    tabSwitches: 0,
    lastVisibilityChange: null,
  };

  function item(id, category, label, value, shockLevel) {
    return { id, category, label, value, shockLevel };
  }

  // ── 행동 패턴 백그라운드 리스너 시작 ──
  function startBehaviorTracking() {
    // 클릭 패턴 수집
    document.addEventListener('click', (e) => {
      _behavior.clicks.push({
        x: e.clientX,
        y: e.clientY,
        t: Date.now(),
        target: e.target.tagName,
      });
    });

    // 스크롤 패턴 수집
    let lastScrollY = window.scrollY;
    let lastScrollTime = Date.now();
    let scrollThrottled = false;
    window.addEventListener('scroll', () => {
      if (scrollThrottled) return;
      scrollThrottled = true;
      setTimeout(() => { scrollThrottled = false; }, 200);
      const now = Date.now();
      const dy = window.scrollY - lastScrollY;
      const dt = now - lastScrollTime;
      _behavior.scrolls.push({
        y: window.scrollY,
        dy,
        dt,
        speed: dt > 0 ? Math.abs(dy / (dt / 1000)) : 0,
        direction: dy > 0 ? 'down' : dy < 0 ? 'up' : 'none',
        t: now,
      });
      lastScrollY = window.scrollY;
      lastScrollTime = now;
    });

    // 탭 전환 감지
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        _behavior.tabSwitches++;
        _behavior.lastVisibilityChange = Date.now();
      }
    });
  }

  // ── #1~#2 IP / 위치 (ip-api.com) ──
  async function collectIP() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('https://ip-api.com/json/?lang=ko', { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      return [
        item('ip_address', 'network', 'IP 주소', data.query, 4),
        item('ip_isp', 'network', 'ISP / 통신사', data.isp || data.org, 3),
        item('ip_location', 'network', '접속 지역',
          [data.country, data.regionName, data.city].filter(Boolean).join(' '), 4),
      ];
    } catch {
      return [item('ip_address', 'network', 'IP 주소', '수집 실패', 4)];
    }
  }

  // ── #3~#4 연결 유형 / 속도 / RTT ──
  function collectConnection() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) {
      return [
        item('connection_type', 'network', '연결 유형', '미지원', 3),
      ];
    }
    return [
      item('connection_type', 'network', '연결 유형',
        conn.effectiveType || '알 수 없음', 3),
      item('connection_savedata', 'network', '데이터 절약 모드',
        conn.saveData ? '활성화' : '비활성화', 2),
    ];
  }

  // ── 실제 네트워크 속도 측정 ──
  async function measureNetwork() {
    try {
      const url = 'https://www.google.com/favicon.ico?' + Date.now();
      const start = performance.now();
      const res = await fetch(url, { mode: 'no-cors', cache: 'no-store' });
      const rtt = Math.round(performance.now() - start);
      return [
        item('real_rtt', 'network', '실측 RTT (지연 시간)', `${rtt} ms`, 2),
      ];
    } catch {
      return [];
    }
  }

  // ── #5 WebRTC 내부 IP ──
  function collectWebRTC() {
    return new Promise((resolve) => {
      const ips = new Set();
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        pc.createDataChannel('');

        pc.onicecandidate = (e) => {
          if (!e.candidate) {
            pc.close();
            const ipList = [...ips];
            resolve([
              item('webrtc_local_ip', 'network', 'WebRTC 내부 IP',
                ipList.length ? ipList.join(', ') : '차단됨 / 감지 불가', 5),
            ]);
            return;
          }
          const match = e.candidate.candidate.match(
            /([0-9]{1,3}\.){3}[0-9]{1,3}|([a-f0-9]{1,4}:){1,7}[a-f0-9]{1,4}/
          );
          if (match) ips.add(match[0]);
        };

        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .catch(() => {
            resolve([item('webrtc_local_ip', 'network', 'WebRTC 내부 IP', '수집 실패', 5)]);
          });

        setTimeout(() => {
          try { pc.close(); } catch {}
          const ipList = [...ips];
          resolve([
            item('webrtc_local_ip', 'network', 'WebRTC 내부 IP',
              ipList.length ? ipList.join(', ') : '타임아웃', 5),
          ]);
        }, 2000);
      } catch {
        resolve([item('webrtc_local_ip', 'network', 'WebRTC 내부 IP', '미지원', 5)]);
      }
    });
  }

  // ── #6 GPU (WebGL) ──
  function collectGPU() {
    const { renderer, vendor } = Fingerprint.webgl();
    return [
      item('gpu_renderer', 'hardware', 'GPU (렌더러)', renderer || '알 수 없음', 4),
      item('gpu_vendor', 'hardware', 'GPU (벤더)', vendor || '알 수 없음', 2),
    ];
  }

  // ── #7~#8 CPU / RAM ──
  function collectHardware() {
    return [
      item('cpu_cores', 'hardware', 'CPU 코어 수',
        navigator.hardwareConcurrency || '알 수 없음', 2),
      item('js_heap_limit', 'hardware', 'JS 메모리 한도',
        performance.memory
          ? `${Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)} MB`
          : '미지원 (Chrome 전용)', 2),
    ];
  }

  // ── #9 터치스크린 ──
  function collectTouch() {
    const maxTouch = navigator.maxTouchPoints || 0;
    const hasTouch = maxTouch > 0 || 'ontouchstart' in window;
    return [
      item('touch_support', 'hardware', '터치스크린',
        hasTouch ? `지원 (최대 ${maxTouch}포인트)` : '미지원', 1),
    ];
  }

  // ── #10~#13 화면/디스플레이 ──
  function collectScreen() {
    const orientation = screen.orientation
      ? screen.orientation.type.replace('-primary', '').replace('-secondary', '')
      : (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
    const orientationLabel = orientation === 'landscape' ? '가로' : '세로';

    const dpr = window.devicePixelRatio || 1;
    const physicalW = Math.round(screen.width * dpr);
    const physicalH = Math.round(screen.height * dpr);

    return [
      item('screen_resolution', 'display', '실제 화면 해상도',
        `${physicalW} x ${physicalH}`, 2),
      item('viewport', 'display', '뷰포트 크기',
        `${window.innerWidth} x ${window.innerHeight}`, 1),
      item('pixel_ratio', 'display', '픽셀 비율 (DPR)',
        dpr, 2),
      item('color_depth', 'display', '색심도',
        `${screen.colorDepth}bit`, 1),
      item('screen_orientation', 'display', '화면 방향',
        orientationLabel, 1),
    ];
  }

  // ── #14~#15 OS / 브라우저 ──
  function collectUA() {
    const ua = navigator.userAgent;

    // OS 파싱
    let os = '알 수 없음';
    if (ua.includes('Windows NT 10')) os = 'Windows 10/11';
    else if (ua.includes('Windows NT')) os = 'Windows';
    else if (ua.includes('Mac OS X')) {
      const ver = ua.match(/Mac OS X ([0-9_]+)/);
      os = ver ? `macOS ${ver[1].replace(/_/g, '.')}` : 'macOS';
    } else if (ua.includes('Android')) {
      const ver = ua.match(/Android ([0-9.]+)/);
      os = ver ? `Android ${ver[1]}` : 'Android';
    } else if (ua.includes('iPhone') || ua.includes('iPad')) {
      const ver = ua.match(/OS ([0-9_]+)/);
      os = ver ? `iOS ${ver[1].replace(/_/g, '.')}` : 'iOS';
    } else if (ua.includes('Linux')) os = 'Linux';

    // 브라우저 파싱
    let browser = '알 수 없음';
    if (ua.includes('Edg/')) {
      const ver = ua.match(/Edg\/([0-9.]+)/);
      browser = `Edge ${ver ? ver[1] : ''}`;
    } else if (ua.includes('OPR/') || ua.includes('Opera')) {
      browser = 'Opera';
    } else if (ua.includes('Chrome/')) {
      const ver = ua.match(/Chrome\/([0-9.]+)/);
      browser = `Chrome ${ver ? ver[1] : ''}`;
    } else if (ua.includes('Firefox/')) {
      const ver = ua.match(/Firefox\/([0-9.]+)/);
      browser = `Firefox ${ver ? ver[1] : ''}`;
    } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
      const ver = ua.match(/Version\/([0-9.]+)/);
      browser = `Safari ${ver ? ver[1] : ''}`;
    }

    return [
      item('os', 'system', 'OS', os, 2),
      item('browser', 'system', '브라우저', browser.trim(), 2),
      item('user_agent', 'system', 'User-Agent', ua, 3),
      item('platform', 'system', '플랫폼', navigator.platform || '알 수 없음', 2),
    ];
  }

  // ── #16~#17 언어 / 시간대 / 시스템 시각 ──
  function collectLocale() {
    const now = new Date();
    const serverTimeDiff = Math.round((Date.now() - _pageLoadTimestamp) / 1000);
    return [
      item('language', 'locale', '기본 언어', navigator.language, 1),
      item('languages', 'locale', '언어 목록',
        navigator.languages?.join(', ') || navigator.language, 2),
      item('timezone', 'locale', '시간대',
        Intl.DateTimeFormat().resolvedOptions().timeZone, 3),
      item('timezone_offset', 'locale', 'UTC 오프셋',
        `UTC${now.getTimezoneOffset() <= 0 ? '+' : '-'}${Math.abs(now.getTimezoneOffset() / 60)}`,
        2),
      item('system_time', 'locale', '시스템 시각',
        now.toLocaleString('ko-KR'), 2),
    ];
  }

  // ── #18~#19 다크모드 / DNT ──
  // ── #20 쿠키/로컬스토리지 ──
  // ── #29 Referer ──
  function collectPreferences() {
    const darkMode = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const dnt = navigator.doNotTrack;

    // 쿠키 활성화 여부
    const cookieEnabled = navigator.cookieEnabled;

    // 로컬스토리지 활성화 여부
    let localStorageEnabled = false;
    try {
      const testKey = '__clickproof_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      localStorageEnabled = true;
    } catch {
      localStorageEnabled = false;
    }

    return [
      item('dark_mode', 'preference', '다크 모드', darkMode ? '사용 중' : '미사용', 2),
      item('do_not_track', 'privacy', 'Do Not Track',
        dnt === '1' ? '활성화' : dnt === '0' ? '비활성화' : '설정 안 됨', 2),
      item('cookie_enabled', 'privacy', '쿠키 활성화',
        cookieEnabled ? '활성화' : '비활성화', 1),
      item('localstorage_enabled', 'privacy', '로컬스토리지 활성화',
        localStorageEnabled ? '활성화' : '비활성화', 1),
      item('referer', 'network', 'Referer', document.referrer || '(직접 접속)', 2),
    ];
  }

  // ── #21 배터리 ──
  async function collectBattery() {
    try {
      if (!navigator.getBattery) {
        return [item('battery', 'hardware', '배터리', '미지원', 3)];
      }
      const bat = await navigator.getBattery();
      return [
        item('battery_level', 'hardware', '배터리 잔량',
          `${Math.round(bat.level * 100)}%`, 3),
        item('battery_charging', 'hardware', '충전 중',
          bat.charging ? '예' : '아니오', 2),
      ];
    } catch {
      return [item('battery', 'hardware', '배터리', '수집 실패', 3)];
    }
  }

  // ── #22 AdBlocker ──
  async function collectAdBlocker() {
    const blocked = await Fingerprint.detectAdBlocker();
    return [
      item('adblocker', 'privacy', '광고 차단기',
        blocked ? '감지됨' : '미감지', 3),
    ];
  }

  // #23, #24 — 시크릿 모드/확장 프로그램 감지는 최신 브라우저에서 부정확하여 제거

  // ── #25~#27 핑거프린트 (Canvas, WebGL, Audio) ──
  async function collectFingerprints() {
    const canvasHash = Fingerprint.canvas();
    const webglData = Fingerprint.webgl();
    const audioHash = await Fingerprint.audio();

    return [
      item('fp_canvas', 'fingerprint', 'Canvas 핑거프린트', canvasHash || '수집 실패', 5),
      item('fp_webgl', 'fingerprint', 'WebGL 핑거프린트', webglData.fingerprint || '수집 실패', 5),
      item('fp_audio', 'fingerprint', 'AudioContext 핑거프린트', audioHash || '수집 실패', 5),
    ];
  }

  // ── #28 설치된 폰트 ──
  function collectFonts() {
    const fonts = Fingerprint.detectFonts();
    return [
      item('fonts_list', 'fingerprint', '설치된 폰트',
        fonts.length ? fonts.join(', ') : '감지 실패', 4),
      item('fonts_count', 'fingerprint', '감지된 폰트 수',
        `${fonts.length}개`, 3),
    ];
  }

  // ── #30 접속 타임스탬프 ──
  function collectTimestamp() {
    const now = new Date();
    return [
      item('access_timestamp', 'meta', '접속 시각',
        now.toLocaleString('ko-KR', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false,
        }), 1),
      item('access_timestamp_unix', 'meta', '접속 Unix 타임스탬프',
        `${Date.now()}`, 1),
    ];
  }

  // ── #31 고유 URL 토큰 ──
  function collectURLToken() {
    const path = window.location.pathname;
    const tokenMatch = path.match(/\/t\/([a-zA-Z0-9]+)/);
    const urlParams = new URLSearchParams(window.location.search);
    const token = tokenMatch ? tokenMatch[1] : urlParams.get('token') || null;

    return [
      item('url_token', 'meta', 'URL 토큰',
        token || '(토큰 없음 — 익명 접속)', 5),
    ];
  }

  // ── #34 마우스 움직임 궤적 + 클릭 패턴 ──
  function collectMousePattern() {
    return new Promise((resolve) => {
      const points = [];
      const handler = (e) => {
        points.push({ x: e.clientX, y: e.clientY, t: Date.now() });
      };
      document.addEventListener('mousemove', handler);

      setTimeout(() => {
        document.removeEventListener('mousemove', handler);

        const results = [];

        if (points.length < 2) {
          // 모바일이나 마우스 움직임 없는 경우도 빠르게 처리
          results.push(
            item('mouse_pattern', 'behavior', '마우스 움직임',
              '데이터 부족 (터치 기기이거나 움직임 없음)', 2),
          );
        } else {
          let totalDist = 0;
          for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i - 1].x;
            const dy = points[i].y - points[i - 1].y;
            totalDist += Math.sqrt(dx * dx + dy * dy);
          }
          const duration = (points[points.length - 1].t - points[0].t) / 1000;
          const avgSpeed = duration > 0 ? Math.round(totalDist / duration) : 0;

          results.push(
            item('mouse_points', 'behavior', '마우스 이동 포인트 수',
              `${points.length}개 (${duration.toFixed(1)}초간)`, 3),
            item('mouse_speed', 'behavior', '평균 마우스 속도',
              `${avgSpeed} px/s`, 3),
            item('mouse_distance', 'behavior', '총 마우스 이동 거리',
              `${Math.round(totalDist)} px`, 2),
          );
        }

        // 클릭 패턴 (백그라운드 수집된 데이터)
        const clicks = _behavior.clicks;
        results.push(
          item('click_count', 'behavior', '클릭 횟수',
            `${clicks.length}회`, 3),
        );
        if (clicks.length > 0) {
          const targets = {};
          clicks.forEach((c) => {
            targets[c.target] = (targets[c.target] || 0) + 1;
          });
          const topTargets = Object.entries(targets)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([tag, count]) => `${tag}(${count})`)
            .join(', ');
          results.push(
            item('click_targets', 'behavior', '클릭 대상',
              topTargets, 3),
          );
        }

        resolve(results);
      }, 1500);
    });
  }

  // ── #35 스크롤 패턴 ──
  function collectScrollPattern() {
    const scrolls = _behavior.scrolls;
    if (scrolls.length < 2) {
      return [
        item('scroll_pattern', 'behavior', '스크롤 패턴',
          '데이터 부족', 1),
      ];
    }

    const totalDistance = scrolls.reduce((sum, s) => sum + Math.abs(s.dy), 0);
    const avgSpeed = Math.round(
      scrolls.reduce((sum, s) => sum + s.speed, 0) / scrolls.length
    );
    const downCount = scrolls.filter((s) => s.direction === 'down').length;
    const upCount = scrolls.filter((s) => s.direction === 'up').length;

    return [
      item('scroll_events', 'behavior', '스크롤 이벤트 수',
        `${scrolls.length}회`, 1),
      item('scroll_distance', 'behavior', '총 스크롤 거리',
        `${totalDistance} px`, 1),
      item('scroll_speed', 'behavior', '평균 스크롤 속도',
        `${avgSpeed} px/s`, 1),
      item('scroll_direction', 'behavior', '스크롤 방향 비율',
        `아래 ${downCount}회 / 위 ${upCount}회`, 1),
    ];
  }

  // ── #36 탭 전환 감지 ──
  function collectVisibility() {
    return [
      item('tab_visible', 'behavior', '현재 탭 상태',
        document.hidden ? '백그라운드' : '활성', 2),
      item('tab_switches', 'behavior', '탭 전환 횟수',
        `${_behavior.tabSwitches}회`, 3),
      item('tab_visibility_api', 'behavior', 'Visibility API',
        typeof document.hidden !== 'undefined' ? '지원됨 (탭 전환 추적 가능)' : '미지원',
        3),
    ];
  }

  // ── #37 페이지 체류 시간 ──
  function collectDwellTime() {
    const elapsed = Math.round((performance.now() - _pageLoadTime) / 1000);
    const min = Math.floor(elapsed / 60);
    const sec = elapsed % 60;
    return [
      item('dwell_time', 'behavior', '페이지 체류 시간',
        min > 0 ? `${min}분 ${sec}초` : `${sec}초`, 1),
    ];
  }

  /**
   * 모든 항목 수집 (PRD 31개 + 행동 패턴)
   * @returns {Promise<Array<{id, category, label, value, shockLevel}>>}
   */
  async function collect() {
    // 동기 수집기들 즉시 실행
    const syncResults = [
      ...collectGPU(),           // #6
      ...collectHardware(),      // #7, #8
      ...collectTouch(),         // #9
      ...collectScreen(),        // #10~#13
      ...collectUA(),            // #14, #15
      ...collectLocale(),        // #16, #17
      ...collectConnection(),    // #3, #4
      ...collectPreferences(),   // #18, #19, #20, #29
      ...collectFonts(),         // #28
      ...collectTimestamp(),      // #30
      ...collectURLToken(),      // #31
      ...collectVisibility(),    // #36
      ...collectDwellTime(),     // #37
      ...collectScrollPattern(), // #35
    ];

    // 비동기 수집기들 병렬 실행
    const asyncResults = await Promise.all([
      collectIP(),               // #1, #2
      collectWebRTC(),           // #5
      collectBattery(),          // #21
      collectAdBlocker(),        // #22
      collectFingerprints(),     // #25~#27
      measureNetwork(),          // 실측 RTT
      collectMousePattern(),     // #34
    ]);

    return [...syncResults, ...asyncResults.flat()];
  }

  return { collect, startBehaviorTracking };
})();

if (typeof window !== 'undefined') {
  window.Collector = Collector;
  // 페이지 로드 즉시 행동 패턴 추적 시작
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Collector.startBehaviorTracking());
  } else {
    Collector.startBehaviorTracking();
  }
}

/**
 * fingerprint.js - 브라우저 핑거프린팅 유틸리티
 * Canvas, WebGL, AudioContext 핑거프린트 및 폰트/시크릿/AdBlock 감지
 */
const Fingerprint = (() => {
  // FNV-1a 해시
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }

  /**
   * Canvas 핑거프린트
   * 동일한 드로잉 명령이 GPU/OS/브라우저마다 미세하게 다른 픽셀을 생성
   */
  function canvas() {
    try {
      const cvs = document.createElement('canvas');
      cvs.width = 280;
      cvs.height = 60;
      const ctx = cvs.getContext('2d');
      if (!ctx) return null;

      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(100, 1, 62, 20);

      ctx.fillStyle = '#069';
      ctx.font = '11pt Arial';
      ctx.fillText('ClickProof,\ud83d\ude00', 2, 15);

      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.font = '18pt Georgia';
      ctx.fillText('ClickProof,\ud83d\ude00', 4, 45);

      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgb(255,0,255)';
      ctx.beginPath();
      ctx.arc(50, 50, 50, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fill();

      return hash(cvs.toDataURL());
    } catch {
      return null;
    }
  }

  /**
   * WebGL 핑거프린트
   * GPU 렌더러, 확장 기능, 매개변수 조합이 기기마다 고유
   */
  function webgl() {
    try {
      const cvs = document.createElement('canvas');
      const gl = cvs.getContext('webgl') || cvs.getContext('experimental-webgl');
      if (!gl) return { renderer: null, vendor: null, fingerprint: null };

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : null;
      const vendor = debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : null;

      const params = [
        gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
        gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
        gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
        gl.getParameter(gl.MAX_VARYING_VECTORS),
        gl.getParameter(gl.MAX_TEXTURE_SIZE),
        gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)?.toString(),
        gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)?.toString(),
        gl.getParameter(gl.MAX_VIEWPORT_DIMS)?.toString(),
        renderer,
        vendor,
        gl.getSupportedExtensions()?.join(','),
      ];

      return {
        renderer,
        vendor,
        fingerprint: hash(params.join('|')),
      };
    } catch {
      return { renderer: null, vendor: null, fingerprint: null };
    }
  }

  /**
   * AudioContext 핑거프린트
   * 오디오 프로세싱 파이프라인의 부동소수점 차이를 이용
   */
  function audio() {
    return new Promise((resolve) => {
      try {
        const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!AudioCtx) return resolve(null);

        const ctx = new AudioCtx(1, 44100, 44100);
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(10000, ctx.currentTime);

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-50, ctx.currentTime);
        comp.knee.setValueAtTime(40, ctx.currentTime);
        comp.ratio.setValueAtTime(12, ctx.currentTime);
        comp.attack.setValueAtTime(0, ctx.currentTime);
        comp.release.setValueAtTime(0.25, ctx.currentTime);

        osc.connect(comp);
        comp.connect(ctx.destination);
        osc.start(0);

        ctx.startRendering().then((buffer) => {
          const data = buffer.getChannelData(0);
          let sum = 0;
          for (let i = 4500; i < 5000; i++) {
            sum += Math.abs(data[i]);
          }
          resolve(hash(sum.toString()));
        }).catch(() => resolve(null));
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * 설치된 폰트 감지 (CSS 너비 측정)
   */
  function detectFonts() {
    const baseFonts = ['monospace', 'sans-serif', 'serif'];
    const testFonts = [
      'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS',
      'Consolas', 'Courier New', 'Georgia', 'Helvetica', 'Impact',
      'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype',
      'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS',
      'Verdana', 'Wingdings',
      'Apple SD Gothic Neo', 'Malgun Gothic', 'NanumGothic',
      'NanumMyeongjo', 'Gulim', 'Dotum', 'Batang',
      'Noto Sans KR', 'Noto Sans JP', 'Noto Sans SC',
      'Meiryo', 'MS Gothic', 'Yu Gothic',
      'Roboto', 'Open Sans', 'Lato', 'Montserrat',
      'Source Code Pro', 'Fira Code', 'JetBrains Mono',
    ];

    const testString = 'mmmmmmmmmmlli';
    const testSize = '72px';
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden;';
    document.body.appendChild(container);

    const baseWidths = {};
    for (const base of baseFonts) {
      const span = document.createElement('span');
      span.style.font = `${testSize} ${base}`;
      span.textContent = testString;
      container.appendChild(span);
      baseWidths[base] = span.offsetWidth;
    }

    const detected = [];
    for (const font of testFonts) {
      for (const base of baseFonts) {
        const span = document.createElement('span');
        span.style.font = `${testSize} '${font}', ${base}`;
        span.textContent = testString;
        container.appendChild(span);
        if (span.offsetWidth !== baseWidths[base]) {
          detected.push(font);
          break;
        }
      }
    }

    document.body.removeChild(container);
    return detected;
  }

  /**
   * 시크릿(프라이빗) 모드 감지 - 스토리지 할당량 기반
   */
  async function detectIncognito() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const { quota } = await navigator.storage.estimate();
        if (quota && quota < 130 * 1024 * 1024) return true;
      } catch {}
    }

    if (window.webkitRequestFileSystem) {
      return new Promise((resolve) => {
        window.webkitRequestFileSystem(
          window.TEMPORARY, 100,
          () => resolve(false),
          () => resolve(true)
        );
      });
    }

    return false;
  }

  /**
   * AdBlocker 감지 - 광고처럼 보이는 DOM bait 삽입
   */
  function detectAdBlocker() {
    return new Promise((resolve) => {
      const bait = document.createElement('div');
      bait.className = 'adsbox ad-banner ad-placeholder textads banner-ads';
      bait.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;';
      bait.innerHTML = '&nbsp;';
      document.body.appendChild(bait);

      requestAnimationFrame(() => {
        const blocked =
          bait.offsetHeight === 0 ||
          bait.offsetParent === null ||
          getComputedStyle(bait).display === 'none';
        document.body.removeChild(bait);
        resolve(blocked);
      });
    });
  }

  /**
   * 브라우저 확장 감지 - 알려진 확장의 web_accessible_resources probe
   */
  async function detectExtensions() {
    const extensions = [
      { name: 'MetaMask', id: 'nkbihfbeogaeaoehlefnkodbefgpgknn', resource: 'images/icon-16.png' },
      { name: 'uBlock Origin', id: 'cjpalhdlnbpafiamejdnhcphjbkeiagm', resource: 'web-accessible-resources/noop.html' },
      { name: 'AdBlock Plus', id: 'cfhdojbkjhnklbpkdaibdccddilifddb', resource: 'icons/detailed/abp-16.png' },
      { name: 'Bitwarden', id: 'nngceckbapebfimnlniiiahkandclblb', resource: 'images/icon16.png' },
      { name: 'LastPass', id: 'hdokiejnpimakedhajhdlcegeplioahd', resource: 'images/lp-icon-white-16.png' },
      { name: 'Grammarly', id: 'kbfnbcaeplbcioakkpcpgfkobkghlhen', resource: 'src/shared/assets/extension-icon/icon-16.png' },
      { name: 'React DevTools', id: 'fmkadmapgofadopljbjfkapdkoienihi', resource: 'main.html' },
      { name: 'Vue DevTools', id: 'nhdogjmejiglipccpnnnanhbledajbpd', resource: 'devtools-background.html' },
      { name: 'Honey', id: 'bmnlcjabgnpnenekpadlanbbkooimhnj', resource: 'pages/options.html' },
      { name: 'ColorZilla', id: 'bhlhnicpbhignbdhedgjhgdocnmhomnp', resource: 'images/icon16.png' },
    ];

    const detected = [];
    const probes = extensions.map(async (ext) => {
      try {
        const url = `chrome-extension://${ext.id}/${ext.resource}`;
        const res = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
        // no-cors fetch 성공 시 type이 'opaque'
        detected.push(ext.name);
      } catch {
        // 확장 없음
      }
    });

    await Promise.allSettled(probes);
    return detected;
  }

  return {
    hash,
    canvas,
    webgl,
    audio,
    detectFonts,
    detectIncognito,
    detectAdBlocker,
    detectExtensions,
  };
})();

if (typeof window !== 'undefined') {
  window.Fingerprint = Fingerprint;
}

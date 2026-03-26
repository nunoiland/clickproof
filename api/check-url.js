// api/check-url.js — Vercel Serverless Function
// 3계층 URL 안전도 분석: 리다이렉트 체인 + Google Safe Browsing + VirusTotal

const https = require('https');
const http = require('http');
const { URL } = require('url');

const MAX_REDIRECTS = 20;
const REQUEST_TIMEOUT = 10000;

// ── 리다이렉트 추적 (Layer 3) ──────────────────────────────

function fetchHead(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.request(
      targetUrl,
      {
        method: 'HEAD',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: REQUEST_TIMEOUT,
      },
      (res) => {
        resolve({
          statusCode: res.statusCode,
          location: res.headers.location || null,
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', reject);
    req.end();
  });
}

async function traceRedirects(startUrl) {
  const chain = [startUrl];
  let currentUrl = startUrl;

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    try {
      const { statusCode, location } = await fetchHead(currentUrl);
      if (statusCode >= 300 && statusCode < 400 && location) {
        const nextUrl = new URL(location, currentUrl).href;
        chain.push(nextUrl);
        currentUrl = nextUrl;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  return { chain, finalUrl: currentUrl };
}

// ── Google Safe Browsing (Layer 2) ──────────────────────────

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      timeout: REQUEST_TIMEOUT,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: null });
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);

    if (options.body) req.write(options.body);
    req.end();
  });
}

async function checkSafeBrowsing(url) {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_KEY;
  if (!apiKey) return { available: false };

  try {
    const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`;
    const body = JSON.stringify({
      client: { clientId: 'clickproof', clientVersion: '1.0' },
      threatInfo: {
        threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
        platformTypes: ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries: [{ url }],
      },
    });

    const res = await fetchJSON(endpoint, { method: 'POST', body });
    const matches = res.data?.matches || [];

    return {
      available: true,
      safe: matches.length === 0,
      threats: matches.map((m) => ({
        type: m.threatType,
        platform: m.platformType,
      })),
    };
  } catch {
    return { available: false };
  }
}

// ── VirusTotal (Layer 2) ────────────────────────────────────

async function checkVirusTotal(url) {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) return { available: false };

  try {
    // URL을 base64로 인코딩 (패딩 제거)
    const urlId = Buffer.from(url).toString('base64').replace(/=+$/, '');
    const endpoint = `https://www.virustotal.com/api/v3/urls/${urlId}`;

    const res = await fetchJSON(endpoint, {
      headers: { 'x-apikey': apiKey },
    });

    if (res.status === 404) {
      // URL이 아직 스캔되지 않은 경우 — 스캔 요청
      const submitEndpoint = 'https://www.virustotal.com/api/v3/urls';
      const submitBody = `url=${encodeURIComponent(url)}`;
      const submitRes = await fetchJSON(submitEndpoint, {
        method: 'POST',
        headers: {
          'x-apikey': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: submitBody,
      });

      return {
        available: true,
        scanned: false,
        analysisId: submitRes.data?.data?.id || null,
      };
    }

    const stats = res.data?.data?.attributes?.last_analysis_stats || {};
    const totalEngines = Object.values(stats).reduce((a, b) => a + b, 0);
    const malicious = stats.malicious || 0;
    const suspicious = stats.suspicious || 0;

    return {
      available: true,
      scanned: true,
      malicious,
      suspicious,
      harmless: stats.harmless || 0,
      undetected: stats.undetected || 0,
      totalEngines,
      detectionRate: totalEngines > 0 ? (malicious + suspicious) / totalEngines : 0,
    };
  } catch {
    return { available: false };
  }
}

// ── Handler ─────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  const allowedOrigins = [
    'https://clickproof.vercel.app',
    'https://clickproof.com',
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV === 'development') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.query?.url || req.body?.url;

  if (!url) {
    return res.status(400).json({ error: 'url parameter is required' });
  }

  if (url.length > 2048) {
    return res.status(400).json({ error: 'URL too long (max 2048 characters)' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    // 3개 작업을 병렬 실행
    const [redirectResult, safeBrowsingResult, virusTotalResult] = await Promise.all([
      traceRedirects(url),
      checkSafeBrowsing(url),
      checkVirusTotal(url),
    ]);

    return res.status(200).json({
      originalUrl: url,
      // Layer 3: 리다이렉트 체인
      finalUrl: redirectResult.finalUrl,
      redirectCount: redirectResult.chain.length - 1,
      chain: redirectResult.chain,
      // Layer 2: 외부 DB
      safeBrowsing: safeBrowsingResult,
      virusTotal: virusTotalResult,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to analyze URL',
      message: err.message,
    });
  }
};

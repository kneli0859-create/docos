/* DocOS — Music fetch (server-side download)
   Takes any URL (YouTube / SoundCloud / Spotify / TikTok / direct mp3)
   → returns audio stream so it never leaves docos.bgpomosht.eu.

   Strategy:
   1. POST { url, mode } → resolve via Cobalt-compatible APIs
   2. Stream the resolved audio file back to the browser as audio/mpeg
   3. If direct URL — proxy as-is

   No third-party redirect. Pure server-side.
*/

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

// Public Cobalt-compatible instances (community-run, free, ToS-respecting).
// We try them in order — each takes { url, downloadMode: "audio", audioFormat: "mp3" }.
const COBALT_INSTANCES = [
  'https://api.cobalt.tools',
  'https://co.eepy.today',
  'https://capi.oodul.com',
  'https://cobalt.synzr.ru'
];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function jsonError(res, code, msg) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  setCors(res);
  res.end(JSON.stringify({ error: msg }));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 8192) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

async function resolveViaCobalt(url) {
  let lastErr = null;
  for (const base of COBALT_INSTANCES) {
    try {
      const res = await fetch(`${base}/`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': UA
        },
        body: JSON.stringify({
          url,
          downloadMode: 'audio',
          audioFormat: 'mp3',
          audioBitrate: '192',
          filenameStyle: 'pretty',
          disableMetadata: false
        }),
        signal: AbortSignal.timeout(12000)
      });
      if (!res.ok) { lastErr = `${base}: HTTP ${res.status}`; continue; }
      const data = await res.json();
      // Cobalt returns: { status: "tunnel"|"redirect"|"picker"|"error", url, filename }
      if (data?.status === 'tunnel' || data?.status === 'redirect') {
        return { ok: true, url: data.url, filename: data.filename || 'track.mp3', via: base };
      }
      if (data?.status === 'picker' && Array.isArray(data?.picker) && data.picker[0]?.url) {
        return { ok: true, url: data.picker[0].url, filename: data.filename || 'track.mp3', via: base };
      }
      lastErr = `${base}: ${data?.status || 'unknown'} — ${data?.error?.code || data?.text || ''}`;
    } catch (e) {
      lastErr = `${base}: ${e.message}`;
    }
  }
  return { ok: false, error: lastErr || 'all cobalt instances failed' };
}

async function streamProxy(res, sourceUrl, filename) {
  const upstream = await fetch(sourceUrl, {
    headers: { 'User-Agent': UA, 'Accept': '*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(120000)
  });
  if (!upstream.ok || !upstream.body) {
    return jsonError(res, 502, `Upstream ${upstream.status}`);
  }
  res.statusCode = 200;
  setCors(res);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
  const len = upstream.headers.get('content-length');
  if (len) res.setHeader('Content-Length', len);
  res.setHeader('Content-Disposition', `attachment; filename="${(filename || 'track.mp3').replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'no-store');

  const reader = upstream.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) res.write(Buffer.from(value));
  }
  res.end();
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { setCors(res); res.statusCode = 204; res.end(); return; }

  // GET ?url=... → directly proxy & stream (used for resolved URLs)
  // POST { url } → resolve via cobalt then return JSON { downloadUrl, filename }
  try {
    if (req.method === 'GET') {
      const u = new URL(req.url, 'http://x.local');
      const target = u.searchParams.get('url');
      const fname = u.searchParams.get('name') || 'track.mp3';
      if (!target) return jsonError(res, 400, 'missing url');
      return await streamProxy(res, target, fname);
    }

    if (req.method !== 'POST') return jsonError(res, 405, 'POST or GET only');

    const body = await readBody(req).catch(() => ({}));
    const url = String(body.url || '').trim();
    if (!url) return jsonError(res, 400, 'missing url');
    if (!/^https?:\/\//i.test(url)) return jsonError(res, 400, 'invalid url');

    const lower = url.toLowerCase();
    const isDirect = /\.(mp3|wav|m4a|ogg|flac|aac|opus)(\?|#|$)/i.test(lower);
    const isPlatform = /(youtu\.?be|youtube\.com|spotify\.com|soundcloud\.com|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|reddit\.com|vimeo\.com|tumblr\.com|bilibili\.com|bandcamp\.com|deezer\.com|tidal\.com|loom\.com|vk\.com)/i.test(lower);

    if (isDirect && !isPlatform) {
      // Direct file — return passthrough proxy URL
      const proxy = `/api/music-fetch?url=${encodeURIComponent(url)}&name=${encodeURIComponent((url.split('/').pop() || 'track.mp3').split('?')[0])}`;
      res.statusCode = 200;
      setCors(res);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, downloadUrl: proxy, filename: (url.split('/').pop() || 'track.mp3').split('?')[0], direct: true }));
      return;
    }

    // Platform URL — resolve via Cobalt
    const resolved = await resolveViaCobalt(url);
    if (!resolved.ok) return jsonError(res, 502, resolved.error || 'resolve failed');

    // Return a same-origin proxy URL so the browser pulls audio from docos.bgpomosht.eu
    const proxy = `/api/music-fetch?url=${encodeURIComponent(resolved.url)}&name=${encodeURIComponent(resolved.filename)}`;
    res.statusCode = 200;
    setCors(res);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, downloadUrl: proxy, filename: resolved.filename, via: resolved.via }));
  } catch (e) {
    return jsonError(res, 500, e.message || 'unknown');
  }
};

module.exports.config = { maxDuration: 120 };

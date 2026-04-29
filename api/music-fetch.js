/* DocOS — Music fetch (multi-source resolver + same-origin proxy)

   Стратегия (в ред на приоритет):
   1. Direct .mp3/.wav/.m4a и т.н. → проксирам директно
   2. YouTube → Piped (dynamic instance list, race), след това /api/yt-dlp fallback
   3. SoundCloud / TikTok / Spotify / Vimeo / др. → Cobalt (dynamic list, race), след това /api/yt-dlp

   POST { url } → { ok, downloadUrl, filename, source }
   GET  ?url=... → стриймва файла като audio/* (с Range support)
*/

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

// Static seed lists (fallback ако dynamic discovery падне)
const PIPED_SEED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi-libre.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.darkness.services',
  'https://pipedapi.smnz.de',
  'https://pipedapi.us.projectsegfau.lt',
  'https://pipedapi.ducks.party',
  'https://pipedapi.ggtyler.dev'
];

const COBALT_SEED = [
  'https://cobalt-api.meowing.de',
  'https://cobalt-backend.canine.tools',
  'https://capi.3kh0.net',
  'https://kityune.imput.net',
  'https://nachos.imput.net',
  'https://sunny.imput.net',
  'https://blossom.imput.net'
];

// ──────────────────── HTTP HELPERS ────────────────────

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
}

function jsonError(res, code, msg, details) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  setCors(res);
  res.end(JSON.stringify({ ok: false, error: msg, details: details || null }));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 16384) reject(new Error('body too large')); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

async function fetchWithTimeout(url, opts = {}, ms = 12000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function ytExtractId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split(/[/?]/)[0];
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([A-Za-z0-9_-]{6,})/);
    if (m) return m[2];
    return null;
  } catch { return null; }
}

function sanitizeFilename(name, ext = 'mp3') {
  const cleaned = String(name || 'track').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 150) || 'track';
  return cleaned.toLowerCase().endsWith('.' + ext) ? cleaned : `${cleaned}.${ext}`;
}

// ──────────────────── DYNAMIC INSTANCE DISCOVERY ────────────────────

let pipedCache = null;
let pipedCacheTime = 0;
async function getPipedInstances() {
  const now = Date.now();
  if (pipedCache && (now - pipedCacheTime) < 10 * 60 * 1000) return pipedCache;
  try {
    const r = await fetchWithTimeout('https://piped-instances.kavin.rocks/', {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' }
    }, 5000);
    if (r.ok) {
      const arr = await r.json();
      const live = (Array.isArray(arr) ? arr : []).map(i => i?.api_url).filter(Boolean);
      if (live.length) {
        const merged = [...new Set([...live, ...PIPED_SEED])];
        pipedCache = merged;
        pipedCacheTime = now;
        return merged;
      }
    }
  } catch {}
  pipedCache = PIPED_SEED;
  pipedCacheTime = now;
  return PIPED_SEED;
}

let cobaltCache = null;
let cobaltCacheTime = 0;
async function getCobaltInstances() {
  const now = Date.now();
  if (cobaltCache && (now - cobaltCacheTime) < 10 * 60 * 1000) return cobaltCache;
  try {
    const r = await fetchWithTimeout('https://instances.cobalt.best/api/instances.json', {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' }
    }, 5000);
    if (r.ok) {
      const data = await r.json();
      const arr = Array.isArray(data) ? data : (data.instances || []);
      const live = arr
        .map(i => i?.api || i?.frontend || (typeof i === 'string' ? i : null))
        .filter(Boolean)
        .map(host => host.startsWith('http') ? host : `https://${host}`);
      if (live.length) {
        const merged = [...new Set([...live, ...COBALT_SEED])];
        cobaltCache = merged;
        cobaltCacheTime = now;
        return merged;
      }
    }
  } catch {}
  cobaltCache = COBALT_SEED;
  cobaltCacheTime = now;
  return COBALT_SEED;
}

// ──────────────────── PIPED RESOLVE ────────────────────

async function tryPiped(base, videoId) {
  const r = await fetchWithTimeout(`${base}/streams/${videoId}`, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' }
  }, 8000);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  const audios = (data.audioStreams || []).filter(a => a && a.url);
  if (!audios.length) throw new Error('no audioStreams');
  audios.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  const pick = audios[0];
  const fmtStr = `${pick.format || ''} ${pick.codec || ''} ${pick.mimeType || ''}`.toLowerCase();
  const ext = fmtStr.includes('opus') ? 'opus' : fmtStr.includes('m4a') || fmtStr.includes('mp4') ? 'm4a' : 'mp3';
  return {
    ok: true,
    url: pick.url,
    filename: sanitizeFilename(data.title || videoId, ext),
    source: `piped:${base.replace('https://', '').split('/')[0]}`
  };
}

async function resolveYouTubeViaPiped(videoId) {
  const instances = await getPipedInstances();
  const errors = [];
  // Race them in batches of 4 → first winner wins, the rest are aborted by GC
  for (let i = 0; i < instances.length; i += 4) {
    const batch = instances.slice(i, i + 4);
    try {
      return await Promise.any(batch.map(b => tryPiped(b, videoId).catch(e => { errors.push(`${b}: ${e.message}`); throw e; })));
    } catch {
      // All failed in this batch → continue to next batch
    }
  }
  return { ok: false, errors };
}

// ──────────────────── COBALT RESOLVE ────────────────────

async function tryCobalt(base, url) {
  const r = await fetchWithTimeout(`${base}/`, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({
      url,
      downloadMode: 'audio',
      audioFormat: 'mp3',
      audioBitrate: '192',
      filenameStyle: 'pretty',
      disableMetadata: false
    })
  }, 12000);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('invalid JSON'); }
  if (!r.ok) throw new Error(`HTTP ${r.status} ${data?.error?.code || ''}`);
  if (data?.status === 'tunnel' || data?.status === 'redirect') {
    return {
      ok: true,
      url: data.url,
      filename: sanitizeFilename(data.filename || 'track', 'mp3'),
      source: `cobalt:${base.replace('https://', '').split('/')[0]}`
    };
  }
  if (data?.status === 'picker' && Array.isArray(data?.picker) && data.picker[0]?.url) {
    return {
      ok: true,
      url: data.picker[0].url,
      filename: sanitizeFilename(data.filename || 'track', 'mp3'),
      source: `cobalt:${base.replace('https://', '').split('/')[0]}`
    };
  }
  throw new Error(`${data?.status || 'unknown'} ${data?.error?.code || ''}`.trim());
}

async function resolveViaCobalt(url) {
  const instances = await getCobaltInstances();
  const errors = [];
  for (let i = 0; i < instances.length; i += 3) {
    const batch = instances.slice(i, i + 3);
    try {
      return await Promise.any(batch.map(b => tryCobalt(b, url).catch(e => { errors.push(`${b.replace('https://', '')}: ${e.message}`); throw e; })));
    } catch {}
  }
  return { ok: false, errors };
}

// ──────────────────── YT-DLP RESOLVE (Python serverless function) ────────────────────

async function resolveViaYtDlp(req, url) {
  // Same-origin call → no extra latency, no CORS
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const base = host ? `${proto}://${host}` : '';
  try {
    const r = await fetchWithTimeout(`${base}/api/yt?url=${encodeURIComponent(url)}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': UA }
    }, 25000);
    const data = await r.json().catch(() => null);
    if (data && data.ok && data.url) {
      return {
        ok: true,
        url: data.url,
        filename: sanitizeFilename(data.title || 'track', data.ext || 'mp3'),
        source: data.source || 'yt-dlp'
      };
    }
    return { ok: false, errors: [`yt-dlp: ${data?.error || `HTTP ${r.status}`}`] };
  } catch (e) {
    return { ok: false, errors: [`yt-dlp: ${e.message}`] };
  }
}

// ──────────────────── MAIN RESOLVE ────────────────────

async function resolveAudio(req, url) {
  const errors = [];
  const ytId = ytExtractId(url);

  if (ytId) {
    // 1. yt-dlp (most reliable, actively maintained)
    const r0 = await resolveViaYtDlp(req, url);
    if (r0.ok) return r0;
    errors.push(...(r0.errors || []).slice(0, 2));

    // 2. Piped (fast, no install, multiple instances)
    const r1 = await resolveYouTubeViaPiped(ytId);
    if (r1.ok) return r1;
    errors.push(...(r1.errors || []).slice(0, 3));

    // 3. Cobalt (last resort)
    const r2 = await resolveViaCobalt(url);
    if (r2.ok) return r2;
    errors.push(...(r2.errors || []).slice(0, 3));

    return { ok: false, error: 'YouTube е недостъпен от всички сървъри в момента — опитай след минута.', details: errors };
  }

  // Non-YouTube → yt-dlp първо (поддържа SC/TikTok/Vimeo/Bandcamp/etc), Cobalt fallback
  const r0 = await resolveViaYtDlp(req, url);
  if (r0.ok) return r0;
  errors.push(...(r0.errors || []).slice(0, 2));

  const r = await resolveViaCobalt(url);
  if (r.ok) return r;
  errors.push(...(r.errors || []).slice(0, 4));
  return { ok: false, error: 'Източникът отказва — опитай друг линк или директен .mp3.', details: errors };
}

// ──────────────────── PROXY STREAM ────────────────────

async function streamProxy(res, sourceUrl, filename, rangeHeader) {
  const headers = { 'User-Agent': UA, 'Accept': '*/*' };
  if (rangeHeader) headers['Range'] = rangeHeader;
  const upstream = await fetchWithTimeout(sourceUrl, { headers, redirect: 'follow' }, 60000);
  if (!upstream.ok && upstream.status !== 206) {
    return jsonError(res, 502, `Upstream HTTP ${upstream.status}`);
  }
  res.statusCode = upstream.status === 206 ? 206 : 200;
  setCors(res);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
  ['content-length', 'content-range', 'accept-ranges'].forEach(h => {
    const v = upstream.headers.get(h);
    if (v) res.setHeader(h.replace(/(^|-)([a-z])/g, (_, p, c) => p + c.toUpperCase()), v);
  });
  res.setHeader('Content-Disposition', `attachment; filename="${(filename || 'track.mp3').replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'no-store');

  const reader = upstream.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      const ok = res.write(Buffer.from(value));
      if (!ok) await new Promise(r => res.once('drain', r));
    }
  }
  res.end();
}

// ──────────────────── HANDLER ────────────────────

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { setCors(res); res.statusCode = 204; res.end(); return; }

  try {
    if (req.method === 'GET') {
      const u = new URL(req.url, 'http://x.local');
      const target = u.searchParams.get('url');
      const fname = u.searchParams.get('name') || 'track.mp3';
      if (!target) return jsonError(res, 400, 'missing url');
      return await streamProxy(res, target, fname, req.headers['range']);
    }

    if (req.method !== 'POST') return jsonError(res, 405, 'POST or GET only');

    const body = await readBody(req).catch(() => ({}));
    const url = String(body.url || '').trim();
    if (!url) return jsonError(res, 400, 'missing url');
    if (!/^https?:\/\//i.test(url)) return jsonError(res, 400, 'invalid url');

    // Direct file shortcut
    if (/\.(mp3|wav|m4a|ogg|flac|aac|opus|webm)(\?|#|$)/i.test(url) && !/youtu\.?be|spotify|soundcloud|tiktok/i.test(url)) {
      const guessed = (url.split('/').pop() || 'track').split('?')[0];
      const ext = (guessed.match(/\.([a-z0-9]+)$/i) || [])[1] || 'mp3';
      const fname = sanitizeFilename(guessed.replace(/\.[a-z0-9]+$/i, ''), ext.toLowerCase());
      const proxy = `/api/music-fetch?url=${encodeURIComponent(url)}&name=${encodeURIComponent(fname)}`;
      res.statusCode = 200;
      setCors(res);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, downloadUrl: proxy, filename: fname, source: 'direct' }));
      return;
    }

    const resolved = await resolveAudio(req, url);
    if (!resolved.ok) {
      return jsonError(res, 502, resolved.error || 'resolve failed', resolved.details);
    }

    const proxy = `/api/music-fetch?url=${encodeURIComponent(resolved.url)}&name=${encodeURIComponent(resolved.filename)}`;
    res.statusCode = 200;
    setCors(res);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, downloadUrl: proxy, filename: resolved.filename, source: resolved.source }));
  } catch (e) {
    return jsonError(res, 500, e.message || 'unknown error');
  }
};

module.exports.config = { maxDuration: 60 };

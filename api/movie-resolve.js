/* DocOS — Movie resolver
   Takes a URL (or movie title) → returns IMDB-id-based embed URLs that ACTUALLY allow framing.

   Flow:
   1. If pasted URL is a known movie aggregator (filmizip, etc.):
      - Fetch the page server-side
      - Extract the original/English title from og:title (format: "EN / BG title (year)")
   2. Use IMDb's public suggest API (no key needed) to find the IMDB id
   3. Return playable embeds (vidsrc.to / vidsrc.xyz / 2embed.cc) — these allow iframing

   The user pastes filmizip → we play via vidsrc → it works.
*/

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600');
  res.end(JSON.stringify(body));
}

function buildEmbeds(imdbId, season, episode) {
  if (season && episode) {
    return [
      { name: 'VidSrc', url: `https://vidsrc.to/embed/tv/${imdbId}/${season}/${episode}` },
      { name: 'VidSrc.xyz', url: `https://vidsrc.xyz/embed/tv?imdb=${imdbId}&season=${season}&episode=${episode}` },
      { name: '2Embed', url: `https://www.2embed.cc/embedtv/${imdbId}&s=${season}&e=${episode}` },
      { name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=${imdbId}&tmdb=0&s=${season}&e=${episode}` },
      { name: 'AutoEmbed', url: `https://player.autoembed.cc/embed/tv/${imdbId}/${season}/${episode}` }
    ];
  }
  return [
    { name: 'VidSrc', url: `https://vidsrc.to/embed/movie/${imdbId}` },
    { name: 'VidSrc.xyz', url: `https://vidsrc.xyz/embed/movie?imdb=${imdbId}` },
    { name: '2Embed', url: `https://www.2embed.cc/embed/${imdbId}` },
    { name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=${imdbId}&tmdb=0` },
    { name: 'AutoEmbed', url: `https://player.autoembed.cc/embed/movie/${imdbId}` }
  ];
}

async function imdbSuggest(query) {
  const q = encodeURIComponent(query.trim().toLowerCase()).replace(/%20/g, '_');
  const url = `https://v3.sg.media-imdb.com/suggestion/x/${q}.json`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!r.ok) return null;
  const j = await r.json();
  return Array.isArray(j.d) ? j.d : [];
}

function pickBestMatch(results, year) {
  if (!results || !results.length) return null;
  const movies = results.filter(r => r.qid === 'movie' || r.qid === 'tvSeries' || r.q === 'feature' || r.q === 'TV series');
  if (!movies.length) return results[0];
  if (year) {
    const exact = movies.find(r => String(r.y) === String(year));
    if (exact) return exact;
    // fuzzy ±1 year
    const close = movies.find(r => Math.abs(Number(r.y) - Number(year)) <= 1);
    if (close) return close;
  }
  return movies[0];
}

function extractTitleAndYear(html) {
  // og:title — typical filmizip format: "Apex / Върховен хищник (2026) филм онлайн безплатно"
  const og = (html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) || [])[1] || '';
  const ttl = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || '';
  const both = og || ttl;
  const yearMatch = both.match(/\((\d{4})\)/);
  const year = yearMatch ? yearMatch[1] : null;
  // Try to find the English/original title (before "/")
  let title = both
    .replace(/\([^)]*\)/g, '')
    .replace(/филм онлайн.*$/i, '')
    .replace(/онлайн.*$/i, '')
    .replace(/безплатно.*$/i, '')
    .trim();
  if (title.includes('/')) {
    // "EN / BG" — pick the part with mostly Latin letters
    const parts = title.split('/').map(s => s.trim()).filter(Boolean);
    const latinScore = s => (s.match(/[A-Za-z]/g) || []).length / Math.max(s.length, 1);
    parts.sort((a, b) => latinScore(b) - latinScore(a));
    title = parts[0];
  }
  return { title, year };
}

function extractFromUrlSlug(rawUrl) {
  // /filmi/20735-apex.html → "apex"
  // /movies/12345-the-matrix-1999.html → "the matrix" + year 1999
  // /film/inception → "inception"
  let url;
  try { url = new URL(rawUrl); } catch (_) { return { title: '', year: '' }; }
  const seg = url.pathname.split('/').filter(Boolean).pop() || '';
  let slug = seg.replace(/\.[a-z0-9]{1,5}$/i, ''); // strip .html .php
  slug = slug.replace(/^[0-9]+-/, ''); // strip leading id-
  let year = '';
  const ym = slug.match(/[-_](\d{4})(?:[-_]|$)/);
  if (ym) { year = ym[1]; slug = slug.replace(ym[0], '-'); }
  const title = slug.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { title, year };
}

async function resolveFromUrl(rawUrl) {
  // 1) Always derive title from URL slug — fast and works even when source blocks our IP
  const slug = extractFromUrlSlug(rawUrl);

  // 2) Try real scrape for richer metadata; ignore failures (Cloudflare on Vercel often 403s)
  try {
    const r = await fetch(rawUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'bg,en-US;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      },
      redirect: 'follow'
    });
    if (r.ok) {
      const html = await r.text();
      const meta = extractTitleAndYear(html);
      if (meta.title) return { title: meta.title, year: meta.year || slug.year };
    }
  } catch (_) {}

  if (slug.title) return slug;
  throw new Error('Не успях да извлека заглавие от линка');
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const url = new URL(req.url, 'http://x');
    const sourceUrl = url.searchParams.get('url');
    let title = url.searchParams.get('title') || '';
    let year = url.searchParams.get('year') || '';
    const season = url.searchParams.get('season') || '';
    const episode = url.searchParams.get('episode') || '';
    const imdbDirect = url.searchParams.get('imdb') || '';

    let resolvedTitle = title;
    let resolvedYear = year;
    let imdbId = imdbDirect;

    if (!imdbId && sourceUrl) {
      // Direct IMDB URL
      const imdbMatch = sourceUrl.match(/(tt\d{6,})/);
      if (imdbMatch) {
        imdbId = imdbMatch[1];
      } else {
        // Scrape source page for title + year
        const r = await resolveFromUrl(sourceUrl);
        resolvedTitle = r.title;
        resolvedYear = r.year;
      }
    }

    if (!imdbId && resolvedTitle) {
      const suggestions = await imdbSuggest(resolvedTitle);
      const best = pickBestMatch(suggestions, resolvedYear);
      if (best) imdbId = best.id;
      var meta = best ? {
        title: best.l,
        year: best.y,
        poster: best.i ? best.i.imageUrl : null,
        cast: best.s
      } : null;
    }

    if (!imdbId) {
      return send(res, 404, {
        ok: false,
        error: 'Не намирам филма в IMDb',
        hint: resolvedTitle ? `Опитах с "${resolvedTitle}"` : 'Опитай с друг линк или само заглавието'
      });
    }

    const embeds = buildEmbeds(imdbId, season, episode);
    return send(res, 200, {
      ok: true,
      imdbId,
      title: resolvedTitle || (typeof meta === 'object' && meta ? meta.title : null),
      year: resolvedYear || (typeof meta === 'object' && meta ? meta.year : null),
      poster: typeof meta === 'object' && meta ? meta.poster : null,
      cast: typeof meta === 'object' && meta ? meta.cast : null,
      embeds
    });
  } catch (e) {
    return send(res, 500, { ok: false, error: e.message || String(e) });
  }
};

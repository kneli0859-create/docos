"""
DocOS — YouTube/SoundCloud/etc resolver via yt-dlp.
Bulletproof fallback when Piped/Cobalt are down.

GET ?url=<source>  →  JSON { ok, url, title, ext, source }
"""
import json
import re
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

try:
    from yt_dlp import YoutubeDL
except Exception as e:
    YoutubeDL = None
    _YT_IMPORT_ERR = str(e)


def _safe_filename(name: str, ext: str = "mp3") -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', name or 'track').strip()[:150] or 'track'
    if not cleaned.lower().endswith('.' + ext):
        cleaned = f"{cleaned}.{ext}"
    return cleaned


def _resolve(url: str):
    if YoutubeDL is None:
        return {"ok": False, "error": f"yt-dlp not available: {_YT_IMPORT_ERR}"}

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "format": "bestaudio/best",
        "noplaylist": True,
        "extractor_args": {
            # Use Android client → bypasses most PoToken / cipher requirements
            "youtube": {"player_client": ["android", "web"]}
        },
        "socket_timeout": 15,
    }
    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
        if "entries" in info and info["entries"]:
            info = info["entries"][0]
        direct = info.get("url")
        if not direct:
            # Fallback: pick best audio from formats[]
            fmts = info.get("formats") or []
            audio_only = [f for f in fmts if f.get("acodec") and f.get("acodec") != "none" and (not f.get("vcodec") or f.get("vcodec") == "none")]
            if not audio_only:
                audio_only = [f for f in fmts if f.get("acodec") and f.get("acodec") != "none"]
            audio_only.sort(key=lambda f: (f.get("abr") or 0, f.get("tbr") or 0), reverse=True)
            if audio_only:
                direct = audio_only[0].get("url")
                ext = audio_only[0].get("ext") or "mp3"
            else:
                return {"ok": False, "error": "no audio formats found"}
        else:
            ext = info.get("ext") or "mp3"
        title = info.get("title") or "track"
        return {
            "ok": True,
            "url": direct,
            "title": title,
            "ext": ext,
            "filename": _safe_filename(title, ext),
            "source": f"yt-dlp:{info.get('extractor') or 'unknown'}",
        }
    except Exception as e:
        msg = str(e)
        # Trim noisy traces
        if len(msg) > 300:
            msg = msg[:300]
        return {"ok": False, "error": msg}


class handler(BaseHTTPRequestHandler):
    def _send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        try:
            qs = parse_qs(urlparse(self.path).query)
            url = (qs.get("url") or [""])[0].strip()
            if not url:
                return self._send_json(400, {"ok": False, "error": "missing url"})
            if not re.match(r"^https?://", url, re.I):
                return self._send_json(400, {"ok": False, "error": "invalid url"})
            result = _resolve(url)
            return self._send_json(200 if result.get("ok") else 502, result)
        except Exception as e:
            return self._send_json(500, {"ok": False, "error": str(e)[:200]})

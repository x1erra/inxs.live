"""
Vercel Python Serverless Function — /api/download
Uses fxtwitter.com API to extract the best video URL from an X/Twitter post.
No external packages needed — pure stdlib urllib.
"""

import json
import re
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler

TWEET_RE = re.compile(
    r'(?:twitter\.com|x\.com|t\.co)/([\w]+)/status/(\d+)', re.IGNORECASE
)
ALLOWED_DOMAINS = re.compile(
    r'^https?://(www\.)?(twitter\.com|x\.com|t\.co)/', re.IGNORECASE
)
MAX_URL_LEN = 512


def is_valid_url(url: str) -> bool:
    if not url or len(url) > MAX_URL_LEN:
        return False
    return bool(ALLOWED_DOMAINS.match(url))


def get_video_info(tweet_url: str) -> dict:
    m = TWEET_RE.search(tweet_url)
    if not m:
        return {"error": "Could not parse tweet URL. Make sure it's a valid X post link."}

    username, tweet_id = m.group(1), m.group(2)
    api_url = f"https://api.fxtwitter.com/{username}/status/{tweet_id}"

    try:
        req = urllib.request.Request(
            api_url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; inxs.live/1.0)"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"error": "Post not found. Make sure the URL is correct and the post is public."}
        return {"error": f"Could not reach fxtwitter API (HTTP {e.code})."}
    except Exception as e:
        return {"error": "Network error fetching post data. Please try again."}

    tweet = data.get("tweet") or data.get("data") or {}
    media = tweet.get("media") or {}
    all_media = media.get("all") or media.get("videos") or []

    if not all_media:
        return {"error": "No video found in that post. Make sure it contains a video."}

    best_url = None
    best_bitrate = -1
    title = tweet.get("author", {}).get("screen_name", "video") + "_" + tweet_id

    for item in all_media:
        item_type = item.get("type", "")
        if item_type not in ("video", "animated_gif", "gif"):
            continue

        # Top-level URL (already best quality in some responses)
        if item.get("url") and ".mp4" in item.get("url", ""):
            if best_url is None:
                best_url = item["url"]

        # Check formats array for highest bitrate
        for fmt in item.get("formats") or []:
            if fmt.get("container") == "mp4" or ".mp4" in fmt.get("url", ""):
                br = fmt.get("bitrate") or 0
                if br > best_bitrate:
                    best_bitrate = br
                    best_url = fmt["url"]

    if not best_url:
        return {"error": "Could not extract a downloadable video URL from that post."}

    return {"url": best_url, "title": title}


class handler(BaseHTTPRequestHandler):

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
        except Exception:
            self._respond(400, {"error": "Invalid request body."})
            return

        url = (body.get("url") or "").strip()
        if not is_valid_url(url):
            self._respond(400, {
                "error": "Only X (twitter.com or x.com) URLs are supported."
            })
            return

        result = get_video_info(url)
        self._respond(200 if "url" in result else 422, result)

    def _respond(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

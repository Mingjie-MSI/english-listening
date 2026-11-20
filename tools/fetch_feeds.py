"""Fetch the podcast feeds used by the listening plan and write data/episodes.json.

Standard library only. Run locally (python tools/fetch_feeds.py) or by the
GitHub Action every day. Only metadata and links are stored: audio is streamed
from the publishers, transcripts are opened on the publishers' own pages.
"""
import email.utils
import html
import json
import os
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "episodes.json")
UA = {"User-Agent": "Mozilla/5.0 (listening-plan feed reader)"}
ITUNES = "{http://www.itunes.com/dtds/podcast-1.0.dtd}"

SOURCES = {
    "bbc6": {
        "name": "BBC 6 Minute English",
        "feed": "https://podcasts.files.bbci.co.uk/p02pc9tn.rss",
        "keep": 40,
    },
    "shortwave": {
        "name": "NPR Short Wave",
        "feed": "https://feeds.npr.org/510351/podcast.xml",
        "keep": 40,
    },
    "planetmoney": {
        "name": "NPR Planet Money",
        "feed": "https://feeds.npr.org/510289/podcast.xml",
        "keep": 30,
    },
    "ted": {
        "name": "TED Talks Daily",
        "feed": "https://feeds.acast.com/public/shows/67587e77c705e441797aff96",
        "keep": 40,
    },
    "inourtime": {
        "name": "BBC In Our Time",
        "feed": "https://podcasts.files.bbci.co.uk/b006qykl.rss",
        "keep": 30,
    },
}

SKIP_TED = re.compile(
    r"\bperformance\b|\bperforms?\b|\bsongs?\b|\bconcert\b|\bmusician\b|\bpoem\b|\bpoetry\b|Sunday Pick|\bfrom (ReThinking|WorkLife|The TED AI Show|TED Business|Far Flung)",
    re.I)

BBC6_PAGES = [
    "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english",
]


def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace"), r.geturl()


def text(el, tag):
    x = el.find(tag)
    return (x.text or "").strip() if x is not None and x.text else ""


def strip_html(s, limit=400):
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = html.unescape(re.sub(r"\s+", " ", s)).strip()
    return s[:limit] + ("…" if len(s) > limit else "")


def duration(s):
    s = (s or "").strip()
    if not s:
        return None
    if s.isdigit():
        return int(s)
    parts = [int(p) for p in s.split(":") if p.isdigit()]
    secs = 0
    for p in parts:
        secs = secs * 60 + p
    return secs or None


def norm_title(t):
    return re.sub(r"[^a-z0-9]+", " ", html.unescape(t).lower()).strip()


def bbc6_transcripts():
    """Map normalised episode title -> BBC Learning English page (has the transcript)."""
    found = {}
    for page in BBC6_PAGES:
        try:
            h, _ = get(page)
        except Exception as e:
            print("  bbc6 listing failed:", e)
            continue
        for href, title in re.findall(
                r'<h2><a\s+href="(/learningenglish/english/features/6-minute-english[^"]*/ep-\d+)">([^<]+)</a>', h):
            found.setdefault(norm_title(title), "https://www.bbc.co.uk" + href)
    return found


def npr_transcript(link):
    # https://www.npr.org/2026/11/18/nx-s1-6034426/slug  ->  https://www.npr.org/transcripts/nx-s1-6034426
    m = re.search(r"npr\.org/(?:\d{4}/\d{2}/\d{2}/)?((?:nx-s1-)?\d{6,})", link or "")
    return f"https://www.npr.org/transcripts/{m.group(1)}" if m else None


def ted_transcript(link, cache):
    if not link or "go.ted.com" not in link:
        return None
    if link in cache:
        return cache[link]
    url = None
    try:
        _, final = get(link.replace("http://", "https://"), timeout=20)
        m = re.match(r"(https://www\.ted\.com/talks/[^/?#]+)", final)
        if m:
            url = m.group(1) + "/transcript"
    except Exception as e:
        print("  ted resolve failed:", link, e)
    cache[link] = url
    time.sleep(0.3)
    return url


def parse_feed(key, cfg, extra):
    xml_text, _ = get(cfg["feed"])
    root = ET.fromstring(xml_text.encode("utf-8"))
    items = []
    for it in root.iter("item"):
        enc = it.find("enclosure")
        if enc is None or not enc.get("url"):
            continue
        audio = enc.get("url").replace("/proto/http/", "/proto/https/")
        if audio.startswith("http://"):
            audio = "https://" + audio[len("http://"):]
        title = html.unescape(text(it, "title"))
        try:
            date = email.utils.parsedate_to_datetime(text(it, "pubDate")).date().isoformat()
        except Exception:
            date = None
        link = text(it, "link")
        desc = text(it, "description") or text(it, ITUNES + "summary")
        ep = {
            "id": key + ":" + (text(it, "guid") or audio)[-60:],
            "title": title,
            "date": date,
            "audio": audio,
            "dur": duration(text(it, ITUNES + "duration")),
            "link": link.replace("http://", "https://") if link else None,
            "desc": strip_html(desc),
        }
        if key == "ted" and SKIP_TED.search(title + " " + ep["desc"]):
            ep["skip"] = True      # music performances and cross-promoted shows: not useful for listening practice
        if key == "bbc6":
            ep["transcript"] = extra["bbc6"].get(norm_title(title))
        elif key in ("shortwave", "planetmoney"):
            ep["transcript"] = npr_transcript(link)
        items.append(ep)
        if len(items) >= cfg["keep"]:
            break
    if key == "ted":
        for ep in items:
            ep["transcript"] = ted_transcript(ep["link"], extra["ted_cache"])
    return items


def main():
    try:
        with open(OUT, encoding="utf-8") as f:
            old = json.load(f)
    except Exception:
        old = {"sources": {}}
    ted_cache = {}
    for ep in old.get("sources", {}).get("ted", {}).get("items", []):
        if ep.get("link") and ep.get("transcript"):
            ted_cache[ep["link"].replace("https://", "http://")] = ep["transcript"]
            ted_cache[ep["link"]] = ep["transcript"]
    extra = {"bbc6": bbc6_transcripts(), "ted_cache": ted_cache}

    out = {"updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "sources": {}}
    failures = 0
    for key, cfg in SOURCES.items():
        try:
            items = parse_feed(key, cfg, extra)
            print(f"{key}: {len(items)} items, {sum(1 for i in items if i.get('transcript'))} with transcript")
        except Exception as e:
            failures += 1
            items = old.get("sources", {}).get(key, {}).get("items", [])
            print(f"{key}: FAILED ({e}); keeping {len(items)} old items")
        out["sources"][key] = {"name": cfg["name"], "items": items}

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    if failures == len(SOURCES):
        sys.exit(1)


if __name__ == "__main__":
    main()

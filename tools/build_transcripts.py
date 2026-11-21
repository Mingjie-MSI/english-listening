"""Build the in-app transcripts: sentence timings, Chinese translation and vocabulary glosses.

Runs after fetch_feeds.py (GitHub Action, every day). For the newest episodes the plan is likely
to assign, it
  1. transcribes the audio with Whisper (faster-whisper) to get the time of every word,
  2. takes the official transcript (BBC / NPR / TED) when there is one and lines its sentences up
     with those times; otherwise it uses Whisper's own text,
  3. translates every sentence into Chinese and picks the less common words as vocabulary,
then writes data/tx/<name>.json and marks the episode in data/episodes.json with "tx": <name>.

Episodes already done are skipped, so each run only does the new ones (within TX_BUDGET_MIN minutes).
Needs: pip install -r tools/requirements.txt
"""
import difflib
import hashlib
import html
import json
import os
import re
import sys
import tempfile
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fetch_feeds import get, UA  # noqa: E402

DATA = os.path.join(HERE, "..", "data")
EPISODES = os.path.join(DATA, "episodes.json")
TX_DIR = os.path.join(DATA, "tx")
GLOSS_CACHE = os.path.join(HERE, "gloss_cache.json")
VERSION = 1

MODEL = os.environ.get("WHISPER_MODEL", "small.en")
BEAM = int(os.environ.get("WHISPER_BEAM", "2"))
BUDGET = float(os.environ.get("TX_BUDGET_MIN", "60")) * 60
SPEED = 0.4            # rough seconds of CPU per second of audio, used to stay inside the budget
RARE = 3.6             # zipf frequency below this counts as vocabulary (≈ outside the 15k most common words)
MAX_VOCAB = 120

# (source, max duration) the app may assign; mirrors PHASES in app.js. Newest first, round-robin.
INT = [("bbc6", None), ("lifekit", None), ("shortwave", 20 * 60), ("ted", 25 * 60)]
EXT = [("archers", None), ("allears", 22 * 60), ("bep", 25 * 60), ("shortwave", 17 * 60),
       ("ted", 20 * 60), ("planetmoney", None)]
DEPTH_INT, DEPTH_EXT = 3, 2

T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:6.0f}s]", *a, flush=True)


def tx_name(ep_id):
    return hashlib.sha1(ep_id.encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------- official transcripts
def clean(s):
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def npr_lines(url):
    h, _ = get(url)
    i = h.find('class="transcript storytext"')
    if i < 0:
        return None, set()
    j = h.find('<p class="disclaimer"', i)
    body = h[i:j if j > 0 else None]
    lines, spk = [], ""
    for p in re.split(r"<p[^>]*>", body)[1:]:
        t = clean(p)
        if not t or t.startswith("Copyright ©") or re.search(r"permissions|terms of use", t, re.I) and "npr.org" in p:
            continue
        if re.fullmatch(r"\([A-Z][^)]*\)|\[[^\]]*\]", t) or t.startswith("(SOUNDBITE"):
            continue
        m = re.match(r"^([A-Z][A-Z.'’\- ]+[A-Z])(?:, [A-Z0-9 ,.'’\-]+)?:\s*(.*)$", t)
        if m:
            spk = m.group(1).title()
            t = m.group(2)
        t = re.sub(r"\((?:SOUNDBITE|LAUGHTER|MUSIC)[^)]*\)", "", t).strip()
        if t:
            lines.append((spk, t))
    return lines, set()


def bbc6_lines(url):
    h, _ = get(url)
    i = h.find("TRANSCRIPT</strong>")
    if i < 0:
        return None, set()
    j = h.find("</div>", i)
    s = h[i:j]
    k = s.find("What do you think of")
    if k > 0:
        s = s[:k]
    s = re.sub(r"<a\b[^>]*>\s*<img[^>]*>\s*</a>|<img[^>]*>", "", s)
    s = re.sub(r"<strong>([^<]{1,30})</strong>\s*<br\s*/?>", lambda m: "\n@@" + m.group(1).strip() + "@@", s)
    bold = {clean(b).lower() for b in re.findall(r"<strong>([^<]{1,40})</strong>", s)}
    lines = []
    for chunk in s.split("\n@@")[1:]:
        spk, _, rest = chunk.partition("@@")
        t = clean(re.sub(r"<br\s*/?>", " ", rest))
        if t:
            lines.append((spk, t))
    vocab = {b for b in bold if re.fullmatch(r"[a-z][a-z\-]+", b) and b != "transcript"}
    return lines, vocab


def ted_lines(url):
    h, _ = get(url)
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
    if not m:
        return None, set()
    try:
        paras = json.loads(m.group(1))["props"]["pageProps"]["transcriptData"]["translation"]["paragraphs"]
    except (KeyError, TypeError):
        return None, set()
    lines = []
    for p in paras:
        cues = [c["text"].replace("\n", " ") for c in p.get("cues", [])]
        t = re.sub(r"\((?:Applause|Laughter|Music|Video|Audio)[^)]*\)", "", " ".join(cues))
        t = re.sub(r"\s+", " ", t).strip()
        if t:
            lines.append(("", t))
    return lines, set()


def official(src, ep):
    url = ep.get("transcript")
    if not url:
        return None, set()
    try:
        if src == "bbc6" and "/ep-" in url:
            return bbc6_lines(url)
        if "npr.org/transcripts/" in url:
            return npr_lines(url)
        if "ted.com/talks/" in url:
            return ted_lines(url)
    except Exception as e:
        log("  official transcript failed:", e)
    return None, set()


ABBR = re.compile(r"(?:\b(?:Mr|Mrs|Ms|Dr|St|Prof|Jr|Sr|vs|etc|No|Vol|Inc|Ltd|Co|U\.S|U\.K|e\.g|i\.e)\.|\b[A-Z]\.)$")


def split_sents(text):
    out, start = [], 0
    for m in re.finditer(r"[.!?…]+[\"”’')\]]*\s+", text):
        nxt = text[m.end():m.end() + 1]
        if not nxt or not re.match(r"[A-Z0-9\"“‘'(\[]", nxt):
            continue
        if ABBR.search(text[start:m.end()].rstrip()):
            continue
        out.append(text[start:m.end()].strip())
        start = m.end()
    if text[start:].strip():
        out.append(text[start:].strip())
    return out


# ---------------------------------------------------------------- Whisper
_model = None


def asr_words(audio_url):
    global _model
    from faster_whisper import WhisperModel
    if _model is None:
        log("  loading Whisper", MODEL)
        _model = WhisperModel(MODEL, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
    fd, path = tempfile.mkstemp(suffix=".mp3")
    os.close(fd)
    try:
        req = urllib.request.Request(audio_url, headers=UA)
        with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
            while True:
                b = r.read(1 << 16)
                if not b:
                    break
                f.write(b)
        segs, _ = _model.transcribe(path, language="en", beam_size=BEAM, word_timestamps=True,
                                    vad_filter=True, condition_on_previous_text=False)
        words = []
        for s in segs:
            for w in s.words or []:
                words.append((w.word, round(w.start, 2), round(w.end, 2)))
        return words
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def toks(s):
    return re.findall(r"[a-z0-9]+(?:'[a-z]+)?", s.lower().replace("’", "'"))


def asr_sents(words):
    out, cur, last_end = [], [], None

    def flush():
        if cur:
            out.append({"t": cur[0][1], "en": "".join(w for w, _, _ in cur).strip()})
            cur.clear()

    for w in words:
        if cur and last_end is not None and w[1] - last_end > 1.8 and len(cur) >= 4:
            flush()
        cur.append(w)
        last_end = w[2]
        if (re.search(r"[.!?][\"”’]?$", w[0].strip()) and len(cur) >= 3) or len(cur) >= 45:
            flush()
    flush()
    return [s for s in out if s["en"]]


def align(sents, words):
    """Give each official sentence the time of its first word found in the Whisper output."""
    otok, osent = [], []
    for si, s in enumerate(sents):
        for t in toks(s["en"]):
            otok.append(t)
            osent.append(si)
    wtok, wtime = [], []
    for w, st, _ in words:
        for t in toks(w):
            wtok.append(t)
            wtime.append(st)
    if not otok or not wtok:
        return 0.0
    match = [None] * len(otok)
    sm = difflib.SequenceMatcher(None, otok, wtok, autojunk=False)
    for a, b, n in sm.get_matching_blocks():
        if n >= 2:
            for k in range(n):
                match[a + k] = b + k
    cov = sum(m is not None for m in match) / len(otok)

    first = {}
    for i, si in enumerate(osent):
        first.setdefault(si, i)
    times = [None] * len(sents)
    for si in range(len(sents)):
        if si not in first:
            continue
        i = first[si]
        while i < len(osent) and osent[i] == si:
            if match[i] is not None:
                times[si] = max(0.0, wtime[match[i]] - 0.3 * (i - first[si]))
                break
            i += 1
    # drop out-of-order times, then fill the gaps
    last = -1.0
    for si, t in enumerate(times):
        if t is None:
            continue
        if t < last:
            times[si] = None
        else:
            last = t
    known = [i for i, t in enumerate(times) if t is not None]
    if not known:
        return 0.0
    for si in range(len(times)):
        if times[si] is not None:
            continue
        prev = max((k for k in known if k < si), default=None)
        nxt = min((k for k in known if k > si), default=None)
        if prev is not None and nxt is not None:
            times[si] = times[prev] + (times[nxt] - times[prev]) * (si - prev) / (nxt - prev)
        elif nxt is not None:
            times[si] = max(0.0, times[nxt] - 3 * (nxt - si))
        else:
            times[si] = times[prev] + 3 * (si - prev)
    for s, t in zip(sents, times):
        s["t"] = round(t, 1)
    return cov


# ---------------------------------------------------------------- translation + vocabulary
GTX = "https://translate.googleapis.com/translate_a/single"


def gtx(q, extra=""):
    for attempt in range(4):
        try:
            data = urllib.parse.urlencode({"q": q}).encode()
            req = urllib.request.Request(f"{GTX}?client=gtx&sl=en&tl=zh-CN&dt=t{extra}", data=data,
                                         headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            log("  translate retry", attempt + 1, e)
            time.sleep(2 + attempt * 4)
    return None


def translate(lines):
    out, batch = [], []

    def flush():
        if not batch:
            return
        r = gtx("\n".join(batch))
        parts = "".join(seg[0] for seg in r[0] if seg and seg[0]).split("\n") if r else []
        if len(parts) == len(batch):
            out.extend(p.strip() for p in parts)
        else:
            for line in batch:                         # line count changed: do them one by one
                r1 = gtx(line)
                out.append("".join(seg[0] for seg in r1[0] if seg and seg[0]).strip() if r1 else None)
        batch.clear()
        time.sleep(0.5)

    size = 0
    for line in lines:
        if batch and size + len(line) > 3500:
            flush()
            size = 0
        batch.append(line.replace("\n", " "))
        size += len(line) + 1
    flush()
    return out


def zipf(w):
    from wordfreq import zipf_frequency
    cands = {w}
    for suf, add in (("ies", "y"), ("ied", "y"), ("es", ""), ("s", ""), ("ed", ""), ("ed", "e"), ("d", ""),
                     ("ing", ""), ("ing", "e"), ("ly", ""), ("er", ""), ("est", "")):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            cands.add(w[:-len(suf)] + add)
    return max(zipf_frequency(c, "en") for c in cands)


def pick_vocab(sents, forced):
    words, lower_seen = {}, set()
    for s in sents:
        for i, m in enumerate(re.finditer(r"[A-Za-z]+(?:['’][A-Za-z]+)?", s["en"])):
            w = m.group(0)
            if w[0].islower():
                lower_seen.add(w.lower())
            words.setdefault(w.lower(), []).append((w, i))
    picked = []
    for lw, occ in words.items():
        if lw in forced:
            picked.append((0, lw))
            continue
        if len(lw) < 4 or "'" in lw or "’" in lw or lw not in lower_seen:   # only ever capitalised: a name
            continue
        z = zipf(lw)
        if 0 < z < RARE:
            picked.append((z, lw))
    picked.sort()
    return [w for _, w in picked[:MAX_VOCAB]]


def gloss(words, cache):
    out = {}
    for w in words:
        if w not in cache:
            r = gtx(w, "&dt=bd")
            g = None
            if r:
                main = "".join(seg[0] for seg in r[0] if seg and seg[0]).strip()
                extra = []
                if len(r) > 1 and r[1]:
                    for pos in r[1][:2]:
                        terms = [t for t in pos[1][:3] if t != main]
                        if terms:
                            ab = {"noun": "n.", "verb": "v.", "adjective": "adj.", "adverb": "adv."}.get(pos[0], pos[0])
                            extra.append(f"{ab} {'、'.join(terms)}")
                g = main + (f"（{'；'.join(extra)}）" if extra else "")
            cache[w] = g
            time.sleep(0.15)
        if cache.get(w) and cache[w].lower() != w:
            out[w] = cache[w]
    return out


# ---------------------------------------------------------------- per episode
def build(src, ep, path, cache):
    lines, forced = official(src, ep)
    log("  official transcript:", f"{len(lines)} paragraphs" if lines else "none")
    words = asr_words(ep["audio"])
    log(f"  whisper: {len(words)} words")
    if not words:
        return False
    mode, sents = "asr", None
    if lines:
        sents = [{"t": 0, "en": s, "spk": spk} for spk, text in lines for s in split_sents(text)]
        cov = align(sents, words)
        log(f"  aligned {len(sents)} sentences, coverage {cov:.0%}")
        mode = "official" if cov >= 0.45 else "asr"
    if mode == "asr":
        sents = asr_sents(words)
    zh = translate([s["en"] for s in sents])
    vocab = gloss(pick_vocab(sents, forced), cache)
    rows = []
    last_spk = None
    for s, z in zip(sents, zh):
        row = [s["t"], s["en"], z or ""]
        spk = s.get("spk") or ""
        if spk and spk != last_spk:
            row.append(spk)
        last_spk = spk or last_spk
        rows.append(row)
    out = {"v": VERSION, "id": ep["id"], "mode": mode, "s": rows, "w": vocab}
    if any(z is None for z in zh):
        out["needZh"] = True
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    log(f"  wrote {os.path.basename(path)}: {len(rows)} sentences, {len(vocab)} words, mode {mode}")
    return True


def retranslate(path):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    if not d.get("needZh"):
        return
    idx = [i for i, r in enumerate(d["s"]) if not r[2]]
    zh = translate([d["s"][i][1] for i in idx])
    for i, z in zip(idx, zh):
        d["s"][i][2] = z or ""
    if all(r[2] for r in d["s"]):
        d.pop("needZh", None)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))


def queue(data):
    srcs = data["sources"]

    def cands(src, maxdur, depth, need_tx=False):
        items = [i for i in srcs.get(src, {}).get("items", [])
                 if i.get("audio") and not i.get("skip") and (not maxdur or not i.get("dur") or i["dur"] <= maxdur)
                 and (not need_tx or i.get("transcript"))]
        return items[:depth]

    lists = [cands(s, d, DEPTH_INT, s == "ted") for s, d in INT] + [cands(s, d, DEPTH_EXT) for s, d in EXT]
    names = [s for s, _ in INT] + [s for s, _ in EXT]
    out, seen = [], set()
    for rank in range(max(DEPTH_INT, DEPTH_EXT)):
        for src, lst in zip(names, lists):
            if rank < len(lst) and lst[rank]["id"] not in seen:
                seen.add(lst[rank]["id"])
                out.append((src, lst[rank]))
    return out


def main():
    with open(EPISODES, encoding="utf-8") as f:
        data = json.load(f)
    os.makedirs(TX_DIR, exist_ok=True)
    try:
        with open(GLOSS_CACHE, encoding="utf-8") as f:
            cache = json.load(f)
    except Exception:
        cache = {}

    for fn in os.listdir(TX_DIR):
        if fn.endswith(".json"):
            retranslate(os.path.join(TX_DIR, fn))

    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    done = failed = 0
    for src, ep in queue(data):
        path = os.path.join(TX_DIR, tx_name(ep["id"]) + ".json")
        if os.path.exists(path):
            continue
        est = (ep.get("dur") or 900) * SPEED
        if time.time() - T0 + est > BUDGET:
            log("time budget reached; the rest waits for the next run")
            break
        log(f"{src}: {ep['title']} ({(ep.get('dur') or 0) // 60} min)")
        try:
            if build(src, ep, path, cache):
                done += 1
        except Exception as e:
            failed += 1
            log("  FAILED:", repr(e))
        with open(GLOSS_CACHE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=0, sort_keys=True)
        if limit and done >= limit:
            break

    # mark episodes that have a transcript; delete files no episode refers to any more
    have = {fn[:-5] for fn in os.listdir(TX_DIR) if fn.endswith(".json")}
    used = set()
    for s in data["sources"].values():
        for ep in s["items"]:
            n = tx_name(ep["id"])
            if n in have:
                ep["tx"] = n
                used.add(n)
            else:
                ep.pop("tx", None)
    for n in have - used:
        os.remove(os.path.join(TX_DIR, n + ".json"))
    with open(EPISODES, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    log(f"done: {done} new, {len(used)} episodes with transcripts")
    if failed and not done:
        sys.exit("every episode failed, see FAILED lines above")      # shows up as a warning on the Actions page


if __name__ == "__main__":
    main()

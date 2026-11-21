/* Daily English listening plan (TOEFL level).
   Data: data/episodes.json (refreshed daily by tools/fetch_feeds.py via GitHub Actions).
   Progress lives in localStorage on each device; export/import moves it between devices. */
(() => {
  "use strict";

  const KEY = "tl.v1";
  const PART_MIN = 15;                       // extensive listening minutes per day
  const CHECKPOINTS = [28, 56, 84];          // study-day numbers with an ETS practice set
  const ETS = "https://www.ets.org/toefl/test-takers/ibt/prepare/practice-tests.html";
  const BBC6_HOME = "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english";

  // accent + topic shown on each card
  const SRC = {
    bbc6: ["🇬🇧 英音", "话题对话"], lifekit: ["🇺🇸 美音", "生活实用"], shortwave: ["🇺🇸 美音", "科普"],
    planetmoney: ["🇺🇸 美音", "经济"], ted: ["🌐 多种口音", "演讲"], inourtime: ["🇬🇧 英音", "学术讨论"],
    allears: ["🇺🇸 美音", "日常 / 职场口语"], archers: ["🇬🇧 英音", "英国日常生活广播剧"], bep: ["🌐 多种口音", "职场对话"],
  };

  // Each day takes the next option in `int` and `ext` (rotation by study day), so US/UK and
  // daily-life / work / academic content alternate. Long episodes are finished on consecutive days first.
  const PHASES = [
    { n: 1, from: 1, name: "阶段一 · 打基础", weeks: "第 1–4 周",
      int: [{ src: "bbc6", how: "whole" }, { src: "lifekit", how: "segment", seg: 4 }],
      ext: [{ src: "allears", maxDur: 22 * 60 }, { src: "archers" }, { src: "shortwave", maxDur: 17 * 60 }],
      intText: "轮换：BBC 6 Minute English 全篇（🇬🇧，约 6 分钟）/ NPR Life Kit 生活话题选 4 分钟（🇺🇸）。都有原文",
      extText: "轮换：All Ears English 日常口语（🇺🇸）/ The Archers 英国生活剧（🇬🇧）/ NPR Short Wave 科普（🇺🇸）",
      goal: "习惯真实语速和英美两种口音，把常见的连读、弱读听出来；建立每天听的习惯。" },
    { n: 2, from: 29, name: "阶段二 · 适应原速", weeks: "第 5–8 周",
      int: [{ src: "lifekit", how: "segment", seg: 4 }, { src: "bbc6", how: "whole" }, { src: "shortwave", how: "segment", seg: 4, maxDur: 20 * 60 }],
      ext: [{ src: "bep", maxDur: 25 * 60 }, { src: "archers" }, { src: "allears", maxDur: 22 * 60 }, { src: "ted", maxDur: 20 * 60 }],
      intText: "轮换：Life Kit（🇺🇸 生活）/ 6 Minute English（🇬🇧）/ Short Wave（🇺🇸 科普），各选 4 分钟左右精听",
      extText: "轮换：Business English Pod 职场对话 / The Archers（🇬🇧）/ All Ears English（🇺🇸）/ TED 演讲",
      goal: "原速下抓住主旨和细节；熟悉开会、面试、电话等职场场景的说法。" },
    { n: 3, from: 57, name: "阶段三 · 托福难度", weeks: "第 9 周起",
      int: [{ src: "ted", how: "segment", seg: 5, maxDur: 25 * 60, needTranscript: true }, { src: "lifekit", how: "segment", seg: 5 }],
      ext: [{ src: "bep", maxDur: 25 * 60 }, { src: "archers" }, { src: "inourtime" }, { src: "planetmoney" }, { src: "allears", maxDur: 22 * 60 }],
      intText: "轮换：TED 演讲 / Life Kit 各选 5 分钟（有原文），边听边记笔记",
      extText: "轮换：职场对话 / The Archers / In Our Time 学术讨论（🇬🇧，分几天听完）/ Planet Money / All Ears English",
      goal: "接近托福讲座和真实工作场景：长内容、边听边记笔记、抓结构和观点。" },
  ];

  const INT_STEPS = [
    ["盲听一遍", "不看原文，从头听到尾，记下听到的 3 个关键词或要点，然后在下面给第一遍的理解程度打分。"],
    ["分句精听", "一句一句地听：没听清就按「⟲5」回放，同一句最多听 3 遍。还是听不出的地方先记下来。"],
    ["对照原文", "打开原文，找出没听出来的词，在笔记里写下原因：生词？连读？弱读？语速太快？"],
    ["影子跟读 2–3 分钟", "不看原文，比录音慢半拍跟着说，模仿语调和停顿。"],
  ];
  const SEG_HINT = "先跳过开头的广告和导语，选一段内容：在起点按「A」、终点按「B」，就会循环播放这一段。";

  // ------------------------------------------------------------------ state
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const today = () => ymd(new Date());
  const fmt = (t) => { t = Math.max(0, Math.floor(t || 0)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ":" + pad(m) : m) + ":" + pad(s); };
  const cnDate = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}月${d.getDate()}日 周${"日一二三四五六"[d.getDay()]}`; };

  function blank() { return { v: 1, start: today(), phase: "auto", speed: 1, days: {}, used: {}, cont: {}, known: {}, txZh: true, txFollow: true }; }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return Object.assign(blank(), s); } catch (e) {}
    return blank();
  }
  let S = load();
  let saveTimer = null;
  function save(now) {
    clearTimeout(saveTimer);
    const w = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
    if (now) w(); else saveTimer = setTimeout(w, 400);
  }

  let DATA = null;
  let dataError = null;
  let EPI = {};                 // episode id -> item in DATA (to find its transcript file)

  // ------------------------------------------------------------------ plan logic
  const dayDone = (d) => !!(d && d.tasks.length && d.tasks.every((t) => t.done));
  function completedBefore(date) { return Object.keys(S.days).filter((k) => k < date && dayDone(S.days[k])).length; }
  function phaseFor(studyDay) {
    if (S.phase !== "auto") return PHASES[Number(S.phase) - 1];
    let p = PHASES[0];
    for (const x of PHASES) if (studyDay >= x.from) p = x;
    return p;
  }
  function snap(src, ep) {
    return { id: ep.id, title: ep.title, date: ep.date, audio: ep.audio, dur: ep.dur, link: ep.link,
             transcript: ep.transcript || (src === "bbc6" ? BBC6_HOME : null), desc: ep.desc,
             srcName: DATA.sources[src].name };
  }
  function pickEp(src, ok) {
    const items = ((DATA.sources[src] || {}).items || []).filter((i) => i.audio && !i.skip && ok(i));
    if (!items.length) return null;
    const fresh = items.find((i) => !S.used[i.id] && i.tx) || items.find((i) => !S.used[i.id]);   // prefer ones with an in-app transcript
    if (fresh) return fresh;
    return items.slice().sort((a, b) => (S.used[a.id] < S.used[b.id] ? -1 : 1))[0];   // least recently used
  }
  function makeInt(ph, date, studyDay) {
    const c = ph.int[studyDay % ph.int.length];
    const ep = pickEp(c.src, (i) => (!c.maxDur || !i.dur || i.dur <= c.maxDur) && (!c.needTranscript || i.transcript));
    if (!ep) return { kind: "int", src: c.src, ep: null, done: false };
    S.used[ep.id] = date;
    return { kind: "int", src: c.src, how: c.how, seg: c.seg || null, ep: snap(c.src, ep),
             steps: INT_STEPS.map(() => false), score: null, notes: "", pos: 0, a: null, b: null, done: false };
  }
  function makeExt(ph, date, studyDay) {
    const going = ph.ext.find((o) => S.cont[o.src]);          // finish a multi-day episode first
    const opt = going || ph.ext[studyDay % ph.ext.length];
    let ep, part = 1, parts = 1;
    const cont = S.cont[opt.src];
    if (cont && cont.part <= cont.parts) {
      ep = cont.ep; part = cont.part; parts = cont.parts;
    } else {
      const raw = pickEp(opt.src, (i) => !opt.maxDur || !i.dur || i.dur <= opt.maxDur);
      if (!raw) return { kind: "ext", src: opt.src, ep: null, done: false };
      S.used[raw.id] = date;
      ep = snap(opt.src, raw);
      parts = ep.dur ? Math.max(1, Math.ceil(ep.dur / (PART_MIN * 60) - 0.5)) : 1;   // up to ~22 min stays in one go
    }
    if (part < parts) S.cont[opt.src] = { ep, part: part + 1, parts }; else delete S.cont[opt.src];
    const len = ep.dur ? ep.dur / parts : null;
    const start = len ? Math.round((part - 1) * len) : 0;
    const end = len && part < parts ? Math.round(part * len) : null;
    return { kind: "ext", src: opt.src, ep, part, parts, start, end, steps: [false, false],
             summary: "", score: null, pos: start, done: false };
  }
  function ensureToday() {
    const t = today();
    if (S.days[t] || !DATA) return S.days[t] || null;
    const studyDay = completedBefore(t) + 1;
    const ph = phaseFor(studyDay);
    const tasks = [makeInt(ph, t, studyDay)];
    if (CHECKPOINTS.includes(studyDay)) {
      tasks.push({ kind: "chk", steps: [false], score: "", notes: "", done: false });
    } else {
      tasks.push(makeExt(ph, t, studyDay));
    }
    S.days[t] = { phase: ph.n, studyDay, tasks };
    save(true);
    return S.days[t];
  }

  function streaks() {
    const t = today();
    let cur = 0, d = dayDone(S.days[t]) ? t : addDays(t, -1);
    while (dayDone(S.days[d])) { cur++; d = addDays(d, -1); }
    let best = 0, run = 0, prev = null;
    for (const k of Object.keys(S.days).sort()) {
      if (!dayDone(S.days[k])) continue;
      run = prev && addDays(prev, 1) === k ? run + 1 : 1;
      best = Math.max(best, run); prev = k;
    }
    return { cur, best };
  }

  // ------------------------------------------------------------------ audio
  const audio = $("#audio");
  let active = null;            // { date, ti }
  const taskOf = (a) => a && S.days[a.date] && S.days[a.date].tasks[a.ti];
  const bounds = (t) => {
    const lo = t.kind === "ext" ? t.start || 0 : 0;
    const hi = t.kind === "ext" && t.end ? t.end : (audio.duration && isFinite(audio.duration) ? audio.duration : (t.ep && t.ep.dur) || 0);
    return [lo, hi];
  };

  function activate(date, ti) {
    const t = S.days[date].tasks[ti];
    if (active && active.date === date && active.ti === ti) return t;
    audio.pause();
    active = { date, ti };
    audio.src = t.ep.audio;
    audio.playbackRate = S.speed || 1;
    const startAt = t.pos || (t.kind === "ext" ? t.start : 0) || 0;
    audio.addEventListener("loadedmetadata", () => { try { audio.currentTime = startAt; } catch (e) {} paintPlayer(); }, { once: true });
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.ep.title, artist: t.ep.srcName, album: "每日英语听力" });
    }
    return t;
  }
  function toggle(date, ti) {
    const t = activate(date, ti);
    if (audio.paused) {
      const [lo, hi] = bounds(t);
      if (t.kind === "ext" && t.end && audio.currentTime >= hi - 0.5) audio.currentTime = lo;
      audio.playbackRate = S.speed || 1;
      audio.play().catch((e) => flash("播放失败：" + e.message));
    } else audio.pause();
  }
  function seekBy(sec) {
    const t = taskOf(active); if (!t) return;
    const [lo, hi] = bounds(t);
    audio.currentTime = Math.min(Math.max(lo, audio.currentTime + sec), hi || audio.currentTime + sec);
  }
  let lastSave = 0;
  audio.addEventListener("timeupdate", () => {
    const t = taskOf(active); if (!t) return;
    if (t.a != null && t.b != null && t.b > t.a && audio.currentTime >= t.b) audio.currentTime = t.a;
    if (t.kind === "ext" && t.end && audio.currentTime >= t.end) {
      audio.pause(); audio.currentTime = t.end;
      flash("今天这一部分听完了 👍");
    }
    t.pos = audio.currentTime;
    if (Date.now() - lastSave > 5000) { lastSave = Date.now(); save(); }
    paintPlayer();
    syncTx();
  });
  audio.addEventListener("seeked", syncTx);
  ["play", "pause", "ended", "durationchange", "waiting", "playing"].forEach((ev) => audio.addEventListener(ev, paintPlayer));
  audio.addEventListener("error", () => { if (active) flash("音频加载失败，请检查网络，或点「打开原页面」收听。"); });
  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => audio.play());
    ms.setActionHandler("pause", () => audio.pause());
    try { ms.setActionHandler("seekbackward", () => seekBy(-5)); ms.setActionHandler("seekforward", () => seekBy(5)); } catch (e) {}
  }

  function paintPlayer() {
    document.querySelectorAll(".player").forEach((p) => {
      const date = p.dataset.date, ti = +p.dataset.ti;
      const t = S.days[date] && S.days[date].tasks[ti]; if (!t) return;
      const isActive = active && active.date === date && active.ti === ti;
      const [lo, hi] = isActive ? bounds(t) : [t.kind === "ext" ? t.start || 0 : 0, t.kind === "ext" && t.end ? t.end : (t.ep.dur || 0)];
      const cur = isActive ? audio.currentTime : (t.pos || lo);
      $(".play", p).textContent = isActive && !audio.paused ? "❚❚" : "▶";
      $(".time", p).textContent = `${fmt(cur - lo)} / ${fmt(hi - lo)}`;
      const r = $("input[type=range]", p);
      r.min = lo; r.max = hi || 1;
      if (document.activeElement !== r) r.value = cur;
      const ab = $(".ab", p);
      if (ab) {
        ab.textContent = t.a != null ? `循环 ${fmt(t.a)}–${t.b != null ? fmt(t.b) : "…"}` : "";
        $("[data-act=a]", p).classList.toggle("on", t.a != null);
        $("[data-act=b]", p).classList.toggle("on", t.b != null);
      }
    });
  }

  // ------------------------------------------------------------------ in-app transcript
  // data/tx/<name>.json: { mode: "official"|"asr", s: [[startSec, en, zh, speaker?]...], w: { word: gloss } }
  const TXC = {};               // name -> loaded transcript (or a pending promise)
  const openTx = new Set();     // "date:ti" of open panels
  let lastRow = null, holdScroll = 0;
  const txOf = (t) => (t && t.ep && EPI[t.ep.id] && EPI[t.ep.id].tx) || null;

  function loadTx(name) {
    if (!TXC[name]) {
      TXC[name] = fetch(`data/tx/${name}.json`).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then((d) => (TXC[name] = d)).catch((e) => { delete TXC[name]; throw e; });
    }
    return Promise.resolve(TXC[name]);
  }

  function enHtml(text, vocab) {
    return text.split(/([A-Za-z]+(?:['’][A-Za-z]+)?)/).map((p, i) => {
      if (i % 2 === 0) return esc(p);
      const w = p.toLowerCase();
      return vocab[w] && !(S.known || {})[w] ? `<mark class="v" data-w="${esc(w)}">${esc(p)}</mark>` : esc(p);
    }).join("");
  }

  async function fillTx(panel) {
    const [date, ti] = panel.dataset.key.split(":");
    const t = S.days[date] && S.days[date].tasks[+ti];
    const name = txOf(t); if (!name) return;
    panel.classList.toggle("nozh", !S.txZh);
    if (panel.dataset.ready === name) { syncTx(); return; }
    panel.innerHTML = `<div class="muted txnote">正在载入原文…</div>`;
    let d;
    try { d = await loadTx(name); } catch (e) { panel.innerHTML = `<div class="muted txnote">原文载入失败（${esc(e.message)}），请联网后再试。</div>`; return; }
    panel.dataset.ready = name;
    const lo = t.kind === "ext" ? t.start || 0 : 0, hi = t.kind === "ext" && t.end ? t.end : Infinity;
    panel.innerHTML = `<div class="txbar">
        <label><input type="checkbox" data-act="txzh" ${S.txZh ? "checked" : ""}> 中文</label>
        <label><input type="checkbox" data-act="txfollow" ${S.txFollow ? "checked" : ""}> 跟随播放</label>
        <span class="muted">点句子从那里播放 · 点<mark class="v demo">黄色生词</mark>看释义</span></div>
      ${d.mode === "asr" ? `<div class="muted txnote">这个节目没有官方原文，下面是语音识别自动生成的，个别词可能不准。</div>` : ""}
      <div class="txbody">${d.s.map((r, i) => `<div class="s${r[0] < lo - 1 || r[0] >= hi ? " out" : ""}" data-i="${i}" data-t="${r[0]}">${r[3] ? `<div class="spk">${esc(r[3])}</div>` : ""}<div class="en">${enHtml(r[1], d.w || {})}</div>${r[2] ? `<div class="zh">${esc(r[2])}</div>` : ""}</div>`).join("")}</div>`;
    lastRow = null;
    const body = panel.querySelector(".txbody");
    const hold = () => { holdScroll = Date.now() + 6000; };          // the user is scrolling: don't pull the text back for a while
    body.addEventListener("wheel", hold, { passive: true });
    body.addEventListener("touchmove", hold, { passive: true });
    const first = lo ? [...body.children].find((x) => +x.dataset.t >= lo - 1) : null;
    if (first) body.scrollTop = first.offsetTop - 8;
    syncTx();
  }

  function toggleTx(date, ti, btn) {
    const key = date + ":" + ti, t = S.days[date].tasks[ti];
    const panel = document.querySelector(`.txp[data-key="${key}"]`); if (!panel) return;
    if (openTx.has(key)) { openTx.delete(key); panel.hidden = true; btn.textContent = "📄 原文 + 中文"; return; }
    if (t.kind === "int" && !t.steps[0]) flash("建议先不看原文盲听一遍，再打开原文对照。");
    openTx.add(key); panel.hidden = false; btn.textContent = "📄 收起原文";
    fillTx(panel);
  }

  function syncTx() {
    if (!active) return;
    const panel = document.querySelector(`.txp[data-key="${active.date}:${active.ti}"]`);
    if (!panel || panel.hidden || !panel.dataset.ready) return;
    const rows = panel.querySelectorAll(".s"); if (!rows.length) return;
    const now = audio.currentTime + 0.15;
    let a = 0, b = rows.length - 1, idx = -1;
    while (a <= b) { const m = (a + b) >> 1; if (+rows[m].dataset.t <= now) { idx = m; a = m + 1; } else b = m - 1; }
    const row = idx >= 0 ? rows[idx] : null;
    if (row === lastRow) return;
    if (lastRow) lastRow.classList.remove("cur");
    lastRow = row;
    if (!row) return;
    row.classList.add("cur");
    const pop = $("#gloss");
    if (S.txFollow && Date.now() > holdScroll && !(pop && !pop.hidden)) {
      const body = panel.querySelector(".txbody");
      body.scrollTo({ top: Math.max(0, row.offsetTop - body.clientHeight / 3), behavior: "smooth" });
    }
  }

  function seekToRow(row) {
    const panel = row.closest(".txp"); const [date, ti] = panel.dataset.key.split(":");
    const t = S.days[date].tasks[+ti], at = Math.max(0, +row.dataset.t - 0.2);
    if (t.kind === "ext" && t.end && at >= t.end) { flash("这一句不在今天这部分里"); return; }
    if (!(active && active.date === date && active.ti === +ti)) t.pos = at;     // activate() starts from t.pos
    activate(date, +ti);
    if (audio.readyState >= 1) audio.currentTime = at;
    else audio.addEventListener("loadedmetadata", () => { audio.currentTime = at; }, { once: true });
    if (audio.paused) { audio.playbackRate = S.speed || 1; audio.play().catch((e) => flash("播放失败：" + e.message)); }
  }

  function showGloss(mk) {
    const panel = mk.closest(".txp"); if (!panel || mk.classList.contains("demo")) return;
    const [date, ti] = panel.dataset.key.split(":"); const t = S.days[date].tasks[+ti];
    const d = TXC[txOf(t)]; const w = mk.dataset.w, g = (d && d.w && d.w[w]) || "";
    let pop = $("#gloss");
    if (!pop) { pop = document.createElement("div"); pop.id = "gloss"; document.body.appendChild(pop); }
    pop.innerHTML = `<b>${esc(w)}</b><div>${esc(g)}</div><div class="btnrow">
      ${t.kind === "int" ? `<button data-g="note">加到笔记</button>` : ""}<button data-g="known">认识了，不再标</button><button data-g="close">关闭</button></div>`;
    pop.hidden = false;
    const r = mk.getBoundingClientRect(), pw = Math.min(300, window.innerWidth - 24);
    pop.style.width = pw + "px";
    pop.style.left = Math.max(12, Math.min(window.innerWidth - pw - 12, r.left)) + "px";
    pop.style.top = (r.bottom + window.scrollY + 6) + "px";
    pop.onclick = (e) => {
      const k = e.target.dataset.g; if (!k) return;
      if (k === "note") {
        const line = `${w}：${g}`;
        if (!(t.notes || "").includes(line)) t.notes = (t.notes ? t.notes.replace(/\s*$/, "") + "\n" : "") + line;
        const ta = document.querySelector(`textarea[data-date="${date}"][data-ti="${ti}"]`); if (ta) ta.value = t.notes;
        save(); flash("已加到笔记");
      } else if (k === "known") {
        S.known = S.known || {}; S.known[w] = 1; save();
        document.querySelectorAll(`mark.v[data-w="${CSS.escape(w)}"]`).forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
      }
      pop.hidden = true;
    };
  }
  document.addEventListener("click", (e) => {
    const pop = $("#gloss");
    if (pop && !pop.hidden && !pop.contains(e.target) && !e.target.closest("mark.v")) pop.hidden = true;
  });

  // ------------------------------------------------------------------ rendering
  function flash(msg) {
    let el = $("#flash");
    if (!el) { el = document.createElement("div"); el.id = "flash"; document.body.appendChild(el);
      Object.assign(el.style, { position: "fixed", left: "50%", bottom: "20px", transform: "translateX(-50%)", background: "#1b2333",
        color: "#fff", padding: "8px 14px", borderRadius: "8px", zIndex: 50, maxWidth: "90vw", fontSize: "14px" }); }
    el.textContent = msg; el.style.display = "block";
    clearTimeout(el._t); el._t = setTimeout(() => (el.style.display = "none"), 3200);
  }

  function playerHtml(date, ti, t) {
    const speeds = [0.75, 0.9, 1, 1.1, 1.25];
    return `<div class="player" data-date="${date}" data-ti="${ti}">
      <div class="row">
        <button class="play primary" data-act="play" title="播放 / 暂停（空格键）">▶</button>
        <button data-act="back" title="后退 5 秒（← 键）">⟲5</button>
        <button data-act="fwd" title="前进 5 秒（→ 键）">5⟳</button>
        <input type="range" step="0.1" data-act="seek">
        <span class="time"></span>
      </div>
      <div class="row">
        <label class="muted">语速 <select data-act="speed">${speeds.map((s) => `<option value="${s}" ${s === (S.speed || 1) ? "selected" : ""}>${s}×</option>`).join("")}</select></label>
        ${t.kind === "int" ? `<button data-act="a" title="把当前位置设为循环起点">A</button><button data-act="b" title="把当前位置设为循环终点">B</button><button data-act="clearab" title="取消循环">✕</button><span class="ab"></span>` : ""}
        ${t.kind === "ext" && t.parts > 1 ? `<span class="muted">第 ${t.part}/${t.parts} 部分：${fmt(t.start)}–${t.end ? fmt(t.end) : "结束"}</span>` : ""}
      </div>
    </div>`;
  }

  function linksHtml(t, key) {
    const e = t.ep, out = [];
    if (txOf(t)) {
      const [d, i] = key.split(":");
      out.push(`<button class="txbtn" data-act="tx" data-date="${d}" data-ti="${i}">📄 ${openTx.has(key) ? "收起原文" : "原文 + 中文"}</button>`);
      if (e.transcript) out.push(`<a class="muted" href="${esc(e.transcript)}" target="_blank" rel="noopener">官网原文</a>`);
    } else if (e.transcript) out.push(`<a href="${esc(e.transcript)}" target="_blank" rel="noopener">📄 原文</a>`);
    else out.push(`<span class="muted">这个节目没有原文，专心听大意</span>`);
    if (e.link) out.push(`<a href="${esc(e.link)}" target="_blank" rel="noopener">打开原页面</a>`);
    return `<div class="links">${out.join("")}</div>`;
  }

  function sliderHtml(date, ti, label, val) {
    const v = val == null ? 50 : val;
    return `<div class="field"><label>${label}</label>
      <div class="slider"><input type="range" min="0" max="100" step="5" value="${v}" data-act="score" data-date="${date}" data-ti="${ti}">
      <b>${val == null ? "—" : v + "%"}</b></div></div>`;
  }

  function cardHtml(date, ti, t, editable) {
    if (t.kind === "chk") {
      return `<article class="card chk ${t.done ? "done" : ""}">
        <div class="kind">阶段测验 · 约 30–40 分钟</div>
        <h3>ETS 官方免费托福模拟题：只做听力部分</h3>
        <p class="desc">每 4 周用官方题测一次，看真实进步。做完把正确题数记下来，下次对比。今天可以不做泛听。</p>
        <div class="links"><a href="${ETS}" target="_blank" rel="noopener">打开 ETS 官方免费模拟题</a></div>
        <ul class="steps"><li><input type="checkbox" data-act="step" data-date="${date}" data-ti="${ti}" data-si="0" ${t.steps[0] ? "checked" : ""} ${editable ? "" : "disabled"}>
          <div><b>完成听力部分</b><div class="hint">模拟真实考试：每段只听一遍，可以记笔记。</div></div></li></ul>
        <div class="field"><label>成绩（例如：正确 21 / 28）</label>
          <input data-act="field" data-k="score" data-date="${date}" data-ti="${ti}" value="${esc(t.score)}" ${editable ? "" : "disabled"}></div>
        ${finishHtml(date, ti, t, editable)}
      </article>`;
    }
    if (!t.ep) {
      return `<article class="card ${t.kind === "ext" ? "ext" : ""}"><div class="kind">${t.kind === "int" ? "精听" : "泛听"}</div>
        <p class="muted">暂时没有可用的节目（节目单还没加载到）。请联网后刷新。</p></article>`;
    }
    const e = t.ep;
    const isInt = t.kind === "int";
    const head = isInt
      ? `精听 · 约 15 分钟${t.how === "segment" ? ` · 选 ${t.seg} 分钟片段` : ""}`
      : `泛听 · 约 ${PART_MIN} 分钟${t.parts > 1 ? ` · 第 ${t.part}/${t.parts} 部分` : ""}`;
    const steps = isInt
      ? INT_STEPS.map(([b, h], si) => `<li><input type="checkbox" data-act="step" data-date="${date}" data-ti="${ti}" data-si="${si}" ${t.steps[si] ? "checked" : ""} ${editable ? "" : "disabled"}>
          <div><b>${si + 1}. ${b}</b><div class="hint">${si === 1 && t.how === "segment" ? SEG_HINT + "<br>" : ""}${h}</div></div></li>`).join("")
      : [["原速听完，不看原文", "听不懂的地方不要停，抓大意就行。可以边做别的事边听，但要专心。"],
         ["用英文写一两句概括", "写下这部分主要讲了什么。写不出来说明需要再听一遍。"]]
          .map(([b, h], si) => `<li><input type="checkbox" data-act="step" data-date="${date}" data-ti="${ti}" data-si="${si}" ${t.steps[si] ? "checked" : ""} ${editable ? "" : "disabled"}>
          <div><b>${si + 1}. ${b}</b><div class="hint">${h}</div></div></li>`).join("");
    return `<article class="card ${isInt ? "" : "ext"} ${t.done ? "done" : ""}">
      <div class="kind">${head}</div>
      <h3>${esc(e.title)}</h3>
      <div class="src">${esc(e.srcName)}${e.date ? " · " + e.date : ""}${e.dur ? " · 全长 " + fmt(e.dur) : ""}</div>
      ${SRC[t.src] ? `<div><span class="pill">${SRC[t.src][0]}</span><span class="pill">${SRC[t.src][1]}</span></div>` : ""}
      ${e.desc ? `<p class="desc">${esc(e.desc)}</p>` : ""}
      ${linksHtml(t, date + ":" + ti)}
      ${playerHtml(date, ti, t)}
      ${txOf(t) ? `<div class="txp" data-key="${date}:${ti}" ${openTx.has(date + ":" + ti) ? "" : "hidden"}></div>` : ""}
      <ul class="steps">${steps}</ul>
      ${sliderHtml(date, ti, isInt ? "第一遍（盲听）大概听懂了多少？" : "大概听懂了多少？", t.score)}
      <div class="field"><label>${isInt ? "笔记：要点、生词、没听出来的地方和原因" : "英文概括"}</label>
        <textarea data-act="field" data-k="${isInt ? "notes" : "summary"}" data-date="${date}" data-ti="${ti}" ${editable ? "" : "disabled"}
          placeholder="${isInt ? "例如：microplastics, ingest（生词）; 'want to' 连读成 wanna 没听出来" : "This part is about…"}">${esc(isInt ? t.notes : t.summary)}</textarea></div>
      ${finishHtml(date, ti, t, editable)}
    </article>`;
  }

  function finishHtml(date, ti, t, editable) {
    if (t.done) return `<div class="finish"><span class="donebadge">✓ 已完成</span>${editable ? `<button data-act="undo" data-date="${date}" data-ti="${ti}">撤销</button>` : ""}</div>`;
    const ready = t.steps.every(Boolean);
    return `<div class="finish"><span class="muted">${ready ? "" : "勾完上面的步骤后可以打卡"}</span>
      <button class="primary" data-act="finish" data-date="${date}" data-ti="${ti}" ${ready && editable ? "" : "disabled"}>完成打卡</button></div>`;
  }

  function renderStatus() {
    const st = streaks();
    const d = S.days[today()];
    const ph = d ? PHASES[d.phase - 1] : phaseFor(completedBefore(today()) + 1);
    $("#status").textContent = `${ph.name} · 连续 ${st.cur} 天`;
  }

  function renderToday() {
    const el = $("#tab-today");
    const t = today();
    const d = ensureToday();
    if (!d) {
      el.innerHTML = `<div class="empty">${dataError ? "节目单加载失败：" + esc(dataError) + "<br>请联网后刷新页面。" : "正在加载节目单…"}</div>`;
      return;
    }
    const ph = PHASES[d.phase - 1];
    const doneN = d.tasks.filter((x) => x.done).length;
    const allDone = doneN === d.tasks.length;
    el.innerHTML = `<div class="hero">
        <h2>${cnDate(t)} · 第 ${d.studyDay} 个学习日</h2>
        <div class="muted"><span class="pill">${ph.name}</span><span class="pill">今天完成 ${doneN}/${d.tasks.length}</span>
        ${allDone ? "🎉 今天的任务都完成了！明天继续。" : "先做精听，再做泛听。精听要专心，泛听可以在通勤时做。"}</div>
      </div>
      ${d.tasks.map((x, i) => cardHtml(t, i, x, true)).join("")}
      <p class="muted">提示：电脑上可用 空格 播放/暂停，← / → 后退/前进 5 秒。节目单更新于 ${DATA ? esc(DATA.updated.replace("T", " ").slice(0, 16)) + " UTC" : "—"}。</p>`;
    paintPlayer();
    document.querySelectorAll(".txp:not([hidden])").forEach(fillTx);
  }

  function renderProgress() {
    const el = $("#tab-progress");
    const st = streaks();
    const days = Object.keys(S.days).sort();
    const doneDays = days.filter((k) => dayDone(S.days[k]));
    const tasksDone = days.reduce((n, k) => n + S.days[k].tasks.filter((t) => t.done && t.kind !== "chk").length, 0);
    const t = today();
    const curPh = S.days[t] ? PHASES[S.days[t].phase - 1] : phaseFor(completedBefore(t) + 1);

    // calendar: last 12 weeks, Monday first
    const end = parseYmd(t); const back = (end.getDay() + 6) % 7;
    const first = addDays(t, -(11 * 7 + back));
    let cells = "一二三四五六日".split("").map((w) => `<div class="wd">${w}</div>`).join("");
    for (let i = 0; i < 84; i++) {
      const k = addDays(first, i);
      if (k > t) { cells += `<div></div>`; continue; }
      const d = S.days[k];
      const cls = dayDone(d) ? "full" : d && d.tasks.some((x) => x.done) ? "half" : "";
      cells += `<div class="${cls} ${k === t ? "today" : ""}" title="${k}">${parseYmd(k).getDate()}</div>`;
    }

    // weekly averages of comprehension scores
    const weeks = [];
    for (let w = 0; w < 12; w++) {
      const ints = [], exts = [];
      for (let i = 0; i < 7; i++) {
        const d = S.days[addDays(first, w * 7 + i)]; if (!d) continue;
        d.tasks.forEach((x) => { if (x.done && x.score != null && x.score !== "") (x.kind === "int" ? ints : x.kind === "ext" ? exts : []).push(+x.score); });
      }
      const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
      weeks.push({ int: avg(ints), ext: avg(exts) });
    }
    const W = 560, H = 180, P = 28;
    const xs = (i) => P + i * ((W - P * 2) / 11), ys = (v) => H - P - v / 100 * (H - P * 2);
    const line = (k, color) => {
      const pts = weeks.map((w, i) => (w[k] == null ? null : [xs(i), ys(w[k])])).filter(Boolean);
      return pts.length ? `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${pts.map((p) => p.join(",")).join(" ")}"/>` +
        pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${color}"/>`).join("") : "";
    };
    const grid = [0, 25, 50, 75, 100].map((v) => `<line x1="${P}" x2="${W - P}" y1="${ys(v)}" y2="${ys(v)}" stroke="currentColor" opacity=".12"/><text x="2" y="${ys(v) + 4}" font-size="10" fill="currentColor" opacity=".6">${v}%</text>`).join("");
    const chart = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="每周平均理解程度">${grid}${line("int", "#3d5a80")}${line("ext", "#2a9d8f")}
      <text x="${P}" y="${H - 6}" font-size="10" fill="currentColor" opacity=".6">12 周前</text><text x="${W - P - 24}" y="${H - 6}" font-size="10" fill="currentColor" opacity=".6">本周</text></svg>`;

    const checks = days.flatMap((k) => S.days[k].tasks.filter((x) => x.kind === "chk" && x.done).map((x) => `<li>${k}：${esc(x.score || "未记录")}</li>`));

    el.innerHTML = `<div class="stats">
        <div class="stat"><b>${st.cur}</b><span>连续天数</span></div>
        <div class="stat"><b>${st.best}</b><span>最长连续</span></div>
        <div class="stat"><b>${doneDays.length}</b><span>完成的学习日</span></div>
        <div class="stat"><b>${Math.round(tasksDone * 15 / 60 * 10) / 10}</b><span>累计听力（小时）</span></div>
      </div>
      <div class="panel"><h3>最近 12 周</h3><div class="cal">${cells}</div>
        <div class="legend">深绿：两项都完成 · 浅绿：完成一项 · 红框：今天</div></div>
      <div class="panel chart"><h3>理解程度（每周平均）</h3>${chart}
        <div class="legend"><span style="color:#3d5a80">●</span> 精听第一遍 &nbsp; <span style="color:#2a9d8f">●</span> 泛听。
        进入新阶段时材料变难，分数会先降一点再回升，这很正常。</div></div>
      <div class="panel"><h3>阶段测验成绩</h3>${checks.length ? `<ul>${checks.join("")}</ul>` : `<p class="muted">第 28、56、84 个学习日各做一次 ETS 官方模拟题，成绩会显示在这里。</p>`}</div>
      <div class="panel"><h3>学习计划</h3>
        <table class="phases"><tr><th>阶段</th><th>精听（15 分钟）</th><th>泛听（15 分钟）</th></tr>
        ${PHASES.map((p) => `<tr class="${p === curPh ? "cur" : ""}"><td><b>${p.name}</b><br><span class="muted">${p.weeks}</span></td><td>${p.intText}</td><td>${p.extText}<br><span class="muted">${p.goal}</span></td></tr>`).join("")}
        </table>
        <p class="muted">阶段按「完成的学习日」推进：漏掉的日子不会让你直接跳到更难的材料。</p></div>`;
  }

  function renderHistory() {
    const el = $("#tab-history");
    const keys = Object.keys(S.days).sort().reverse();
    if (!keys.length) { el.innerHTML = `<div class="empty">还没有记录</div>`; return; }
    el.innerHTML = `<div class="hist">${keys.map((k) => {
      const d = S.days[k];
      return `<details ${k === today() ? "open" : ""}><summary><b>${cnDate(k)}</b> · 第 ${d.studyDay} 个学习日 · ${dayDone(d) ? "✓ 完成" : `完成 ${d.tasks.filter((x) => x.done).length}/${d.tasks.length}`}</summary>
        ${d.tasks.map((t) => {
          if (t.kind === "chk") return `<div class="t">🧪 ETS 模拟题：${esc(t.score || "—")}</div>`;
          if (!t.ep) return "";
          const note = t.kind === "int" ? t.notes : t.summary;
          return `<div class="t">${t.kind === "int" ? "🎯 精听" : "🎧 泛听"}：<a href="${esc(t.ep.transcript || t.ep.link || "#")}" target="_blank" rel="noopener">${esc(t.ep.title)}</a>
            <span class="muted">（${esc(t.ep.srcName)}${t.parts > 1 ? ` 第 ${t.part}/${t.parts} 部分` : ""}${t.score != null ? ` · 听懂约 ${t.score}%` : ""}）</span></div>
            ${note ? `<div class="note">${esc(note)}</div>` : ""}`;
        }).join("")}</details>`;
    }).join("")}</div>`;
  }

  function renderSettings() {
    const el = $("#tab-settings");
    el.innerHTML = `<div class="panel"><h3>为什么这样练有效</h3>
        <p><b>精听</b>解决「听不出来」：反复听同一段、对照原文找出没听出来的地方（多半是连读、弱读，而不是生词），再跟读，让耳朵和嘴巴都熟悉真实语速。</p>
        <p><b>泛听</b>解决「反应慢、听不久」：每天原速听 15 分钟以上的完整内容，练习抓大意，也是在积累托福常考的科普、社科、学术话题。</p>
        <p>材料每天在<b>美音和英音</b>、<b>日常生活、职场对话、科普和学术</b>之间轮换，既为日常和工作交流打基础，也覆盖托福常考话题。</p>
        <p>材料比现在的水平稍难一点，每天坚持，比偶尔听几个小时有效得多。一般坚持 6–8 周会明显感到原速英语变「慢」了。</p></div>
      <div class="panel"><h3>难度</h3>
        <div class="field"><label>阶段（默认按完成的学习日自动升级；觉得太难或太简单可以手动选）</label>
          <select id="phaseSel"><option value="auto">自动</option>${PHASES.map((p) => `<option value="${p.n}">${p.name}</option>`).join("")}</select></div>
        <div class="btnrow"><button id="redo">按新难度重新安排今天的任务</button></div>
        <p class="muted">只有今天还没打卡任何一项时才能重新安排。</p></div>
      <div class="panel"><h3>生词</h3>
        <p class="muted">原文里黄色标出的是比较少见的词。点一下看中文释义；点「认识了」以后就不再标出。已标为认识：${Object.keys(S.known || {}).length} 个。</p>
        <div class="btnrow"><button id="clearKnown">重新标出全部生词</button></div></div>
      <div class="panel"><h3>在电脑和手机之间同步进度</h3>
        <p class="muted">进度保存在当前这台设备的浏览器里。换设备时：在旧设备「导出」，把文件发到新设备，再「导入」。</p>
        <div class="btnrow"><button id="exp">导出进度</button><button id="imp">导入进度</button><input id="impFile" type="file" accept=".json,application/json" hidden></div></div>
      <div class="panel"><h3>节目单</h3>
        <p class="muted">更新于 ${DATA ? esc(DATA.updated.replace("T", " ").slice(0, 16)) + " UTC" : "—"}。每天自动更新。音频来自 BBC、NPR、TED 等官方播客。App 里的原文、每句的时间、中文翻译和生词，也是每天自动生成的（中文是机器翻译，仅供参考）。</p>
        <div class="btnrow"><button id="reset">清除全部进度</button></div></div>`;
    $("#phaseSel").value = String(S.phase);
    $("#phaseSel").onchange = (e) => { S.phase = e.target.value; save(true); renderStatus(); flash("已保存。新的难度从下一次安排任务开始生效。"); };
    $("#redo").onclick = () => {
      const t = today(), d = S.days[t];
      if (d && d.tasks.some((x) => x.done || (x.steps && x.steps.some(Boolean)))) { flash("今天已经开始做了，明天再生效。"); return; }
      if (d) {
        d.tasks.forEach((x) => {
          if (!x.ep) return;
          if (x.kind === "ext" && x.part > 1) S.cont[x.src] = { ep: x.ep, part: x.part, parts: x.parts };   // keep the series going
          else { delete S.used[x.ep.id]; if (x.kind === "ext") delete S.cont[x.src]; }
        });
        delete S.days[t];
      }
      audio.pause(); active = null; save(true); renderAll(); showTab("today");
    };
    $("#clearKnown").onclick = () => { S.known = {}; save(true); renderAll(); flash("已恢复，全部生词会重新标出"); };
    $("#exp").onclick = () => {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `listening-progress-${today()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    $("#imp").onclick = () => $("#impFile").click();
    $("#impFile").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const s = JSON.parse(await f.text());
        if (!s || s.v !== 1 || !s.days) throw new Error("不是本 App 导出的文件");
        if (!confirm("导入会覆盖这台设备上的进度，确定吗？")) return;
        S = Object.assign(blank(), s); audio.pause(); active = null; save(true); renderAll(); flash("导入成功");
      } catch (err) { flash("导入失败：" + err.message); }
      e.target.value = "";
    };
    $("#reset").onclick = () => {
      if (!confirm("清除这台设备上的全部进度和笔记？不能恢复。建议先导出备份。")) return;
      S = blank(); audio.pause(); active = null; save(true); renderAll();
    };
  }

  function renderAll() { renderStatus(); renderToday(); renderProgress(); renderHistory(); renderSettings(); }

  // ------------------------------------------------------------------ events
  function showTab(name) {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
    document.querySelectorAll(".tab").forEach((s) => s.classList.toggle("on", s.id === "tab-" + name));
    if (name === "progress") renderProgress();
    if (name === "history") renderHistory();
    window.scrollTo(0, 0);
  }
  $(".tabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) showTab(b.dataset.tab); });

  const today$ = $("#tab-today");
  today$.addEventListener("click", (e) => {
    if (e.target.classList.contains("desc")) { e.target.classList.toggle("open"); return; }
    const mk = e.target.closest("mark.v");
    if (mk) { showGloss(mk); return; }
    const row = e.target.closest(".txp .s");
    if (row) { seekToRow(row); return; }
    const b = e.target.closest("[data-act]"); if (!b || b.tagName === "INPUT" || b.tagName === "SELECT" || b.tagName === "TEXTAREA") return;
    const host = b.closest("[data-date]") || b;
    const date = host.dataset.date || b.dataset.date, ti = +(host.dataset.ti ?? b.dataset.ti);
    const t = S.days[date] && S.days[date].tasks[ti]; if (!t) return;
    const act = b.dataset.act;
    if (act === "play") toggle(date, ti);
    else if (act === "tx") toggleTx(date, ti, b);
    else if (act === "back" || act === "fwd") { activate(date, ti); seekBy(act === "back" ? -5 : 5); }
    else if (act === "a") { activate(date, ti); t.a = audio.currentTime; if (t.b != null && t.b <= t.a) t.b = null; save(); paintPlayer(); }
    else if (act === "b") { activate(date, ti); if (t.a == null) { flash("先在起点按 A"); return; } if (audio.currentTime <= t.a) { flash("终点要在起点之后"); return; } t.b = audio.currentTime; audio.currentTime = t.a; save(); paintPlayer(); }
    else if (act === "clearab") { t.a = t.b = null; save(); paintPlayer(); }
    else if (act === "finish") {
      if (t.kind !== "chk" && t.score == null) { flash("请先拖动滑块，给理解程度打个分"); return; }
      t.done = true; save(true);
      if (active && active.date === date && active.ti === ti) audio.pause();
      renderStatus(); renderToday();
      if (dayDone(S.days[date])) flash("🎉 今天的听力完成了！连续 " + streaks().cur + " 天");
    } else if (act === "undo") { t.done = false; save(true); renderStatus(); renderToday(); }
  });
  today$.addEventListener("input", (e) => {
    const el = e.target, act = el.dataset.act; if (!act || act === "txzh" || act === "txfollow") return;
    const host = el.closest("[data-date]");
    const date = el.dataset.date || host.dataset.date, ti = +(el.dataset.ti ?? host.dataset.ti);
    const t = S.days[date] && S.days[date].tasks[ti]; if (!t) return;
    if (act === "seek") { activate(date, ti); audio.currentTime = +el.value; }
    else if (act === "score") { t.score = +el.value; el.parentElement.querySelector("b").textContent = el.value + "%"; save(); }
    else if (act === "field") { t[el.dataset.k] = el.value; save(); }
  });
  today$.addEventListener("change", (e) => {
    const el = e.target, act = el.dataset.act;
    if (act === "txzh" || act === "txfollow") {
      S[act === "txzh" ? "txZh" : "txFollow"] = el.checked; save();
      document.querySelectorAll(".txp").forEach((p) => { p.classList.toggle("nozh", !S.txZh); const c = p.querySelector(`[data-act=${act}]`); if (c) c.checked = el.checked; });
      if (act === "txfollow" && el.checked) { lastRow = null; syncTx(); }
      return;
    }
    if (act === "speed") { S.speed = +el.value; audio.playbackRate = S.speed; document.querySelectorAll("select[data-act=speed]").forEach((s) => (s.value = el.value)); save(); }
    else if (act === "step") {
      const t = S.days[el.dataset.date].tasks[+el.dataset.ti]; t.steps[+el.dataset.si] = el.checked; save(true);
      const card = el.closest(".card"); const fin = card.querySelector(".finish");
      fin.outerHTML = finishHtml(el.dataset.date, +el.dataset.ti, t, true);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.type !== "range") return;
    if (!$("#tab-today").classList.contains("on")) return;
    if (e.code === "Space") { e.preventDefault(); if (active) toggle(active.date, active.ti); else { const d = S.days[today()]; const i = d && d.tasks.findIndex((x) => x.ep && !x.done); if (i >= 0) toggle(today(), i); } }
    else if (e.code === "ArrowLeft" && active) { e.preventDefault(); seekBy(-5); }
    else if (e.code === "ArrowRight" && active) { e.preventDefault(); seekBy(5); }
  });
  window.addEventListener("pagehide", () => save(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save(true);
    else if (!S.days[today()] && DATA) renderAll();       // new day while the app stayed open
  });

  // ------------------------------------------------------------------ start
  async function loadData() {
    try {
      const r = await fetch("data/episodes.json", { cache: "no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      DATA = await r.json();
      EPI = {};
      Object.values(DATA.sources).forEach((s) => s.items.forEach((i) => (EPI[i.id] = i)));
    } catch (e) { dataError = e.message; }
    renderAll();
  }
  renderAll();
  loadData();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();

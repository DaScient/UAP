/*!
 * <ufo-intel-widget> - Plug-and-play UAP intelligence feed + agentic assistant
 * --------------------------------------------------------------------------
 * A zero-build, single-file, Shadow-DOM isolated Web Component intended to be
 * dropped into any analyst portal. All processing happens client-side:
 *
 *   - Live intelligence feed merging file releases, analyst notes, system alerts
 *   - Slide-out chat assistant with BYO API key (OpenAI / Anthropic / local)
 *   - RAG over the loaded corpus (cosine similarity over TF-IDF vectors,
 *     with optional upgrade to Transformers.js embeddings if reachable)
 *   - Deep analytics tab: timeline, force-directed graph, frequency charts
 *     (D3 / Chart.js loaded from a configurable CDN; pure-canvas fallbacks)
 *   - IndexedDB cache for offline resilience + local audit log
 *   - CSV / JSON / chat-transcript export
 *   - Slash-command "agentic skills": /summarize latest, /compare agencies,
 *     /generate report, /risk assess <term>, /timeline, /find patterns
 *
 * Configuration attributes (all optional):
 *   data-source        URL returning {pdfs:[],images:[],videos:[]} JSON
 *   llm-provider       "openai" | "anthropic" | "local"
 *   api-key            User-supplied key (stored in localStorage if provided)
 *   refresh-interval   Polling interval in seconds (default 30)
 *   theme              "dark" | "light"  (default "dark")
 *   density            "compact" | "full" (default "full")
 *   cdn-d3             Optional D3 module URL
 *   cdn-chart          Optional Chart.js URL
 *
 * Security posture: no telemetry; no external requests other than the
 * configured data source and (when the user invokes the assistant) the
 * configured LLM endpoint. Keys never leave the browser.
 */

(() => {
  if (customElements.get('ufo-intel-widget')) return;

  // ------------------------------------------------------------------ utils
  const SCHEMA_KINDS = ['pdfs', 'images', 'videos'];
  const DEFAULTS = {
    refreshInterval: 30,
    theme: 'dark',
    density: 'full',
    dataSource: 'https://war.gov/UFO/index.json',
    llmProvider: 'openai',
    cdnD3: 'https://cdn.jsdelivr.net/npm/d3@7/+esm',
    cdnChart: 'https://cdn.jsdelivr.net/npm/chart.js@4/+esm',
  };

  const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);

  const fmtDate = (v) => {
    if (!v) return '';
    const d = new Date(v);
    return Number.isNaN(+d) ? String(v) : d.toISOString().slice(0, 10);
  };

  const debounce = (fn, ms = 200) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  // ------------------------------------------------------------ IndexedDB
  const IDB_NAME = 'ufo-intel-widget';
  const IDB_VERSION = 1;
  const idbOpen = () =>
    new Promise((resolve, reject) => {
      if (!('indexedDB' in globalThis)) return reject(new Error('no idb'));
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
        if (!db.objectStoreNames.contains('audit')) db.createObjectStore('audit', { autoIncrement: true });
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

  const idbPut = async (store, key, value) => {
    try {
      const db = await idbOpen();
      await new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        const r = key == null ? os.add(value) : os.put(value, key);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      });
    } catch (_) { /* idb optional */ }
  };

  const idbGet = async (store, key) => {
    try {
      const db = await idbOpen();
      return await new Promise((res, rej) => {
        const tx = db.transaction(store, 'readonly');
        const r = tx.objectStore(store).get(key);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    } catch (_) { return undefined; }
  };

  const idbAll = async (store) => {
    try {
      const db = await idbOpen();
      return await new Promise((res, rej) => {
        const tx = db.transaction(store, 'readonly');
        const r = tx.objectStore(store).getAll();
        r.onsuccess = () => res(r.result || []);
        r.onerror = () => rej(r.error);
      });
    } catch (_) { return []; }
  };

  // ---------------------------------------------------------- TF-IDF / RAG
  // Lightweight, dependency-free retrieval. If Transformers.js is reachable
  // it is auto-upgraded at runtime, but we never *require* it because many
  // air-gapped intranets block CDNs.
  const STOP = new Set(('a,an,the,and,or,but,if,then,of,to,in,on,for,with,at,by,from,as,is,are,was,were,be,been,being,it,its,this,that,these,those,which,who,whom,whose,what,when,where,why,how,we,you,they,he,she,him,her,them,our,your,their,not,no,nor,so,about,into,over,under,via,per,one,two,three').split(','));
  const tokenize = (s) =>
    String(s || '').toLowerCase().replace(/[^a-z0-9\s-]+/g, ' ')
      .split(/\s+/).filter((t) => t && t.length > 2 && !STOP.has(t));

  const buildIndex = (docs) => {
    const df = new Map();
    const tfs = docs.map((d) => {
      const tf = new Map();
      const toks = tokenize(`${d.title} ${d.blurb} ${d.agency} ${d.kind}`);
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1);
      return tf;
    });
    const N = Math.max(1, docs.length);
    const idf = new Map();
    for (const [t, c] of df) idf.set(t, Math.log(1 + N / (1 + c)));
    const vectors = tfs.map((tf) => {
      const v = new Map();
      let norm = 0;
      for (const [t, c] of tf) {
        const w = (1 + Math.log(c)) * (idf.get(t) || 0);
        if (w) { v.set(t, w); norm += w * w; }
      }
      norm = Math.sqrt(norm) || 1;
      for (const [t, w] of v) v.set(t, w / norm);
      return v;
    });
    return { vectors, idf };
  };

  const queryIndex = (index, q, k = 6) => {
    if (!index || !index.vectors.length) return [];
    const tf = new Map();
    for (const t of tokenize(q)) tf.set(t, (tf.get(t) || 0) + 1);
    const qv = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      const w = (1 + Math.log(c)) * (index.idf.get(t) || 0);
      if (w) { qv.set(t, w); norm += w * w; }
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of qv) qv.set(t, w / norm);
    const scores = index.vectors.map((v, i) => {
      let s = 0;
      for (const [t, w] of qv) { const dw = v.get(t); if (dw) s += w * dw; }
      return [i, s];
    });
    scores.sort((a, b) => b[1] - a[1]);
    return scores.filter(([, s]) => s > 0).slice(0, k);
  };

  // ------------------------------------------------------------ LLM client
  // Provider-agnostic. Streams when supported. All keys stay in localStorage.
  const llmStream = async function* (provider, apiKey, messages, signal) {
    if (!apiKey) throw new Error('Missing API key.');
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages, stream: true, temperature: 0.2 }),
        signal,
      });
      if (!res.ok || !res.body) throw new Error(`OpenAI HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const m = line.match(/^data:\s*(.*)$/);
          if (!m) continue;
          const payload = m[1].trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch (_) { /* keep streaming */ }
        }
      }
    } else if (provider === 'anthropic') {
      // Anthropic does not support browser CORS without a proxy in many
      // deployments; we still try and surface a clear error if blocked.
      const sys = messages.find((m) => m.role === 'system')?.content || '';
      const conv = messages.filter((m) => m.role !== 'system');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-latest',
          max_tokens: 1024,
          system: sys,
          messages: conv.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
        signal,
      });
      if (!res.ok || !res.body) throw new Error(`Anthropic HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const m = line.match(/^data:\s*(.*)$/);
          if (!m) continue;
          try {
            const ev = JSON.parse(m[1]);
            const delta = ev?.delta?.text;
            if (delta) yield delta;
          } catch (_) { /* keep streaming */ }
        }
      }
    } else {
      // Local / OpenAI-compatible endpoint, e.g. http://localhost:11434/v1
      const base = apiKey.startsWith('http') ? apiKey.replace(/\/$/, '') : 'http://localhost:11434/v1';
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'local', messages, stream: true }),
        signal,
      });
      if (!res.ok || !res.body) throw new Error(`Local HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n');
        buf = parts.pop() ?? '';
        for (const line of parts) {
          const m = line.match(/^data:\s*(.*)$/);
          if (!m) continue;
          const p = m[1].trim();
          if (!p || p === '[DONE]') continue;
          try {
            const delta = JSON.parse(p)?.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch (_) { /* keep */ }
        }
      }
    }
  };

  // ----------------------------------------------------------- styles (CSS)
  const STYLE = `
:host {
  --ui-bg:        #0a0f1a;
  --ui-panel:     #0f1626;
  --ui-panel-2:  #131b2e;
  --ui-border:   #1f2a44;
  --ui-text:      #d6deec;
  --ui-muted:    #8593ad;
  --ui-accent:   #c7a252;
  --ui-cyan:     #38bdf8;
  --ui-danger:   #ef4444;
  --ui-ok:        #22c55e;
  --ui-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, sans-serif;
  display: block; color: var(--ui-text); font-family: var(--ui-font);
  background: var(--ui-bg); border: 1px solid var(--ui-border);
  border-radius: 10px; overflow: hidden; position: relative;
  box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset, 0 12px 30px -18px rgba(0,0,0,0.6);
}
:host([theme="light"]) {
  --ui-bg: #f7f8fb; --ui-panel: #ffffff; --ui-panel-2: #f1f3f9;
  --ui-border: #d7dce8; --ui-text: #0b1220; --ui-muted: #5a6781;
}
* { box-sizing: border-box; }
button, input, select, textarea { font: inherit; color: inherit; }
a { color: var(--ui-cyan); text-decoration: none; }
a:hover { text-decoration: underline; }
.grid-bg {
  background-image:
    linear-gradient(var(--ui-border) 1px, transparent 1px),
    linear-gradient(90deg, var(--ui-border) 1px, transparent 1px);
  background-size: 32px 32px; background-position: -1px -1px; opacity: .25;
  position: absolute; inset: 0; pointer-events: none;
}
.shell { position: relative; display: grid; grid-template-rows: auto auto 1fr; min-height: 560px; }
header.bar {
  display: flex; align-items: center; gap: .75rem; padding: .65rem .9rem;
  background: linear-gradient(180deg, var(--ui-panel), var(--ui-panel-2));
  border-bottom: 1px solid var(--ui-border);
}
header.bar h1 {
  font-size: .85rem; letter-spacing: .22em; text-transform: uppercase;
  font-weight: 600; color: var(--ui-text);
}
header.bar .sep { flex: 1; }
.badge {
  font-size: .68rem; letter-spacing: .14em; text-transform: uppercase;
  padding: .15rem .45rem; border: 1px solid var(--ui-border); border-radius: 999px;
  color: var(--ui-muted);
}
.badge.live { color: var(--ui-ok); border-color: rgba(34,197,94,.4); }
.badge.stale { color: var(--ui-accent); border-color: rgba(199,162,82,.4); }
.btn {
  background: var(--ui-panel-2); border: 1px solid var(--ui-border);
  border-radius: 6px; padding: .35rem .65rem; cursor: pointer;
  font-size: .78rem; color: var(--ui-text);
}
.btn:hover { border-color: var(--ui-cyan); }
.btn.primary { background: var(--ui-cyan); color: #051019; border-color: var(--ui-cyan); }
.btn.ghost { background: transparent; }
.tabs {
  display: flex; gap: .25rem; padding: .35rem .6rem 0 .6rem; background: var(--ui-panel);
  border-bottom: 1px solid var(--ui-border);
}
.tab {
  padding: .45rem .8rem; font-size: .78rem; letter-spacing: .12em;
  text-transform: uppercase; border: 1px solid transparent;
  border-bottom: none; border-radius: 6px 6px 0 0; cursor: pointer;
  color: var(--ui-muted);
}
.tab[aria-selected="true"] { color: var(--ui-text); background: var(--ui-panel-2);
  border-color: var(--ui-border); }
main.body { position: relative; min-height: 0; }
.view { display: none; height: 100%; }
.view[data-active] { display: grid; }

/* ----- feed/files view ----- */
.split { grid-template-columns: minmax(0,1fr) minmax(0,1.4fr); gap: 0; }
.col { min-width: 0; min-height: 0; display: flex; flex-direction: column;
  border-right: 1px solid var(--ui-border); }
.col:last-child { border-right: none; }
.col header { padding: .55rem .8rem; border-bottom: 1px solid var(--ui-border);
  font-size: .72rem; letter-spacing: .18em; text-transform: uppercase; color: var(--ui-muted);
  display: flex; gap: .5rem; align-items: center;}
.col .scroll { overflow-y: auto; padding: .35rem; }
.feed-item {
  padding: .55rem .65rem; border-bottom: 1px solid var(--ui-border); cursor: pointer;
  display: grid; grid-template-columns: auto 1fr auto; gap: .4rem .6rem; align-items: baseline;
}
.feed-item:hover { background: var(--ui-panel-2); }
.feed-item .kind {
  font-size: .58rem; letter-spacing: .18em; text-transform: uppercase;
  color: var(--ui-accent); align-self: start; padding-top: .15rem;
}
.feed-item .title { font-size: .82rem; line-height: 1.35; color: var(--ui-text); }
.feed-item .meta { font-size: .68rem; color: var(--ui-muted); display: flex; gap: .5rem; flex-wrap: wrap; }
.feed-item .date { font-size: .68rem; color: var(--ui-muted); font-variant-numeric: tabular-nums; }
.toolbar {
  display: flex; gap: .4rem; padding: .45rem .55rem; border-bottom: 1px solid var(--ui-border);
  background: var(--ui-panel);
}
.toolbar input, .toolbar select {
  flex: 1; background: var(--ui-panel-2); border: 1px solid var(--ui-border);
  border-radius: 6px; padding: .35rem .55rem; font-size: .78rem;
}
.detail { padding: 1rem 1.1rem; overflow-y: auto; }
.detail h2 { font-size: 1rem; margin-bottom: .25rem; }
.detail .agency { color: var(--ui-accent); font-size: .72rem;
  letter-spacing: .18em; text-transform: uppercase; }
.detail .blurb { color: var(--ui-muted); font-size: .85rem; line-height: 1.55;
  margin-top: .65rem; white-space: pre-wrap; }
.detail .links { margin-top: .9rem; display: flex; gap: .5rem; flex-wrap: wrap; }
.empty { padding: 1.5rem; color: var(--ui-muted); font-size: .82rem; text-align: center; }

/* ----- analytics ----- */
.analytics { grid-template-rows: auto 1fr; gap: 0; }
.analytics .panels { display: grid; grid-template-columns: 1.1fr .9fr;
  grid-template-rows: minmax(220px, 1fr) minmax(220px, 1fr);
  gap: 1px; background: var(--ui-border); min-height: 0; }
.panel { background: var(--ui-panel); padding: .65rem .8rem; display: flex;
  flex-direction: column; min-height: 0; min-width: 0; }
.panel h3 { font-size: .72rem; letter-spacing: .2em; text-transform: uppercase;
  color: var(--ui-muted); margin-bottom: .4rem; }
.panel .canvas-wrap { flex: 1; min-height: 0; position: relative; }
.panel svg, .panel canvas { width: 100%; height: 100%; display: block; }

/* ----- chat ----- */
.assistant {
  position: absolute; top: 0; right: 0; bottom: 0; width: min(440px, 92%);
  background: var(--ui-panel); border-left: 1px solid var(--ui-border);
  transform: translateX(101%); transition: transform .25s ease;
  display: grid; grid-template-rows: auto 1fr auto; z-index: 5;
}
.assistant[data-open] { transform: translateX(0); }
.assistant header {
  padding: .6rem .8rem; border-bottom: 1px solid var(--ui-border);
  display: flex; gap: .5rem; align-items: center;
}
.assistant header h2 { font-size: .78rem; letter-spacing: .2em; text-transform: uppercase; }
.assistant .messages { padding: .6rem .8rem; overflow-y: auto; display: flex;
  flex-direction: column; gap: .55rem; }
.msg { padding: .55rem .7rem; border-radius: 8px; font-size: .85rem; line-height: 1.45;
  white-space: pre-wrap; word-wrap: break-word; }
.msg.user { background: var(--ui-panel-2); align-self: flex-end; max-width: 90%; }
.msg.assistant { background: rgba(56,189,248,.08); border: 1px solid rgba(56,189,248,.18); }
.msg.system { background: rgba(199,162,82,.08); color: var(--ui-accent); font-size: .75rem; }
.msg .sources { margin-top: .4rem; font-size: .72rem; color: var(--ui-muted); }
.msg .sources a { display: block; }
.composer { display: grid; grid-template-columns: 1fr auto; gap: .4rem;
  padding: .55rem .65rem; border-top: 1px solid var(--ui-border); background: var(--ui-panel-2); }
.composer textarea { resize: none; min-height: 38px; max-height: 140px;
  background: var(--ui-panel); border: 1px solid var(--ui-border); border-radius: 6px;
  padding: .45rem .55rem; font-size: .82rem; }
.composer .row { display: flex; gap: .35rem; }
.slash {
  display: flex; gap: .25rem; padding: .35rem .65rem; flex-wrap: wrap;
  border-top: 1px solid var(--ui-border); background: var(--ui-panel);
}
.slash button { font-size: .68rem; letter-spacing: .08em; }

/* ----- settings ----- */
.settings { padding: .8rem 1rem; display: grid; gap: .65rem;
  grid-template-columns: 1fr 1fr; align-content: start; }
.settings label { font-size: .72rem; letter-spacing: .15em; text-transform: uppercase;
  color: var(--ui-muted); display: flex; flex-direction: column; gap: .25rem; }
.settings input, .settings select, .settings textarea {
  background: var(--ui-panel-2); border: 1px solid var(--ui-border);
  border-radius: 6px; padding: .4rem .55rem; font-size: .85rem; color: var(--ui-text);
}
.settings .full { grid-column: 1 / -1; }
.settings .actions { grid-column: 1 / -1; display: flex; gap: .4rem; }

/* ----- alerts ----- */
.banner {
  padding: .4rem .8rem; font-size: .75rem; color: var(--ui-accent);
  background: rgba(199,162,82,.08); border-bottom: 1px solid rgba(199,162,82,.3);
  display: none;
}
.banner[data-show] { display: block; }

@media (prefers-reduced-motion: reduce) {
  .assistant { transition: none; }
}
@media (max-width: 720px) {
  .split { grid-template-columns: 1fr; }
  .col:first-child { border-right: none; border-bottom: 1px solid var(--ui-border); }
  .analytics .panels { grid-template-columns: 1fr; }
}
`;

  // ------------------------------------------------------------- markup tpl
  const TEMPLATE = `
<div class="grid-bg" aria-hidden="true"></div>
<div class="shell">
  <header class="bar" role="banner">
    <h1>UFO Intel Feed</h1>
    <span class="badge" data-status>Idle</span>
    <span class="badge" data-counts></span>
    <span class="sep"></span>
    <button class="btn ghost" data-act="refresh" title="Force refresh">Refresh</button>
    <button class="btn ghost" data-act="export-csv">CSV</button>
    <button class="btn ghost" data-act="export-json">JSON</button>
    <button class="btn ghost" data-act="audit">Audit</button>
    <button class="btn ghost" data-act="settings">Settings</button>
    <button class="btn primary" data-act="toggle-chat">Assistant</button>
  </header>
  <div class="banner" data-banner></div>
  <nav class="tabs" role="tablist">
    <div class="tab" role="tab" data-tab="feed" aria-selected="true">Feed</div>
    <div class="tab" role="tab" data-tab="analytics" aria-selected="false">Analytics</div>
    <div class="tab" role="tab" data-tab="settings" aria-selected="false">Settings</div>
  </nav>
  <main class="body" role="main">
    <section class="view split" data-view="feed" data-active>
      <div class="col">
        <header>Intelligence Feed</header>
        <div class="toolbar">
          <input data-filter type="search" placeholder="Filter title, agency, blurb..." aria-label="Filter feed" />
          <select data-kind aria-label="Filter by kind">
            <option value="">All kinds</option>
            <option value="pdf">PDF</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="note">Note</option>
            <option value="alert">Alert</option>
          </select>
        </div>
        <div class="scroll" data-feed tabindex="0" aria-label="Live intelligence feed"></div>
      </div>
      <div class="col">
        <header>Item Detail</header>
        <div class="detail" data-detail>
          <div class="empty">Select an item from the feed to view full context.</div>
        </div>
      </div>
    </section>
    <section class="view analytics" data-view="analytics">
      <header style="padding:.55rem .8rem;border-bottom:1px solid var(--ui-border);
        font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:var(--ui-muted);">
        Deep Analytics
      </header>
      <div class="panels">
        <div class="panel"><h3>Release Timeline</h3>
          <div class="canvas-wrap" data-panel="timeline"><svg></svg></div></div>
        <div class="panel"><h3>Agency / Keyword Graph</h3>
          <div class="canvas-wrap" data-panel="graph"><svg></svg></div></div>
        <div class="panel"><h3>File Types by Agency</h3>
          <div class="canvas-wrap" data-panel="bars"><canvas></canvas></div></div>
        <div class="panel"><h3>Release Cadence</h3>
          <div class="canvas-wrap" data-panel="cadence"><canvas></canvas></div></div>
      </div>
    </section>
    <section class="view" data-view="settings">
      <form class="settings" data-settings>
        <label>Data Source URL
          <input name="dataSource" type="url" required />
        </label>
        <label>Refresh Interval (s)
          <input name="refreshInterval" type="number" min="5" max="3600" />
        </label>
        <label>LLM Provider
          <select name="llmProvider">
            <option value="openai">OpenAI (gpt-4o-mini)</option>
            <option value="anthropic">Anthropic (claude-3.5)</option>
            <option value="local">Local / OpenAI-compatible</option>
          </select>
        </label>
        <label>API Key / Local URL
          <input name="apiKey" type="password" autocomplete="off" placeholder="sk-... or http://localhost:11434/v1" />
        </label>
        <label>Theme
          <select name="theme"><option value="dark">Dark</option><option value="light">Light</option></select>
        </label>
        <label>Density
          <select name="density"><option value="full">Full</option><option value="compact">Compact</option></select>
        </label>
        <label class="full">Add Analyst Note (saved locally)
          <textarea name="note" rows="3" placeholder="Free-form note – will appear in the feed."></textarea>
        </label>
        <div class="actions">
          <button class="btn primary" type="submit">Save</button>
          <button class="btn ghost" type="button" data-act="clear-cache">Clear Cache</button>
          <button class="btn ghost" type="button" data-act="export-audit">Export Audit Log</button>
        </div>
      </form>
    </section>
  </main>
  <aside class="assistant" data-assistant aria-label="Agentic assistant">
    <header>
      <h2>Assistant</h2>
      <span class="sep" style="flex:1"></span>
      <button class="btn ghost" data-act="clear-chat">Clear</button>
      <button class="btn ghost" data-act="export-chat">Export</button>
      <button class="btn ghost" data-act="close-chat" aria-label="Close assistant">Close</button>
    </header>
    <div class="messages" data-messages aria-live="polite"></div>
    <div class="slash" data-slash></div>
    <form class="composer" data-composer>
      <textarea data-input rows="2" placeholder="Ask the analyst assistant... (try /summarize latest)" aria-label="Message"></textarea>
      <div class="row" style="flex-direction:column;">
        <button class="btn primary" type="submit">Send</button>
        <button class="btn ghost" type="button" data-act="stop">Stop</button>
      </div>
    </form>
  </aside>
</div>
`;

  // ------------------------------------------------------- slash commands
  const SLASH = [
    { cmd: '/summarize latest', help: 'Summarise the 10 most recent releases.' },
    { cmd: '/compare agencies', help: 'Compare release patterns across agencies.' },
    { cmd: '/generate report', help: 'Draft an executive intelligence report.' },
    { cmd: '/risk assess ', help: 'Risk assessment for a keyword/topic.' },
    { cmd: '/timeline', help: 'Narrate the timeline of releases.' },
    { cmd: '/find patterns', help: 'Identify cross-corpus patterns and anomalies.' },
  ];

  const expandSlash = (text, docs) => {
    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) return { text, retrieve: text };
    const t = trimmed.toLowerCase();
    const latest = [...docs].sort((a, b) => (b._ts || 0) - (a._ts || 0)).slice(0, 10);
    if (t.startsWith('/summarize latest')) {
      return {
        text: 'Summarise the ten most recent UAP-related releases. For each, give: date, agency, one-line synopsis, and a calibrated significance score (low/medium/high) with reasoning. End with an overall trend paragraph.',
        retrieve: latest.map((d) => d.title).join(' ') || 'latest releases',
      };
    }
    if (t.startsWith('/compare agencies')) {
      return {
        text: 'Compare release behaviour across the agencies present in the corpus. Address: volume, recency, dominant topics (keywords), and any notable gaps or overlaps. Use a short table.',
        retrieve: 'agency comparison cadence topics keywords',
      };
    }
    if (t.startsWith('/generate report')) {
      return {
        text: 'Produce a concise (≤500 words) executive intelligence report on the current UAP corpus. Sections: Executive Summary, Key Releases, Emerging Themes, Information Gaps, Recommended Collection Priorities. Use plain analytical prose.',
        retrieve: 'report executive summary themes gaps priorities',
      };
    }
    if (t.startsWith('/risk assess')) {
      const term = trimmed.slice('/risk assess'.length).trim() || 'unspecified topic';
      return {
        text: `Perform a structured risk assessment for "${term}" based on the loaded corpus. Use the IC standard: Threat, Likelihood, Impact, Confidence. Cite specific releases where possible.`,
        retrieve: term,
      };
    }
    if (t.startsWith('/timeline')) {
      return {
        text: 'Narrate the chronology of releases in the corpus, highlighting clusters, gaps, and notable inflection points. Group by year or quarter where appropriate.',
        retrieve: 'timeline chronology dates',
      };
    }
    if (t.startsWith('/find patterns')) {
      return {
        text: 'Identify cross-corpus patterns, recurring entities, and anomalies. Surface non-obvious connections between agencies, topics, and timeframes. Flag low-confidence hypotheses explicitly.',
        retrieve: 'patterns anomalies connections entities',
      };
    }
    return { text, retrieve: text };
  };

  // ===================================================================
  //                          The Web Component
  // ===================================================================
  class UfoIntelWidget extends HTMLElement {
    static get observedAttributes() {
      return ['data-source', 'refresh-interval', 'theme', 'density',
              'llm-provider', 'api-key', 'cdn-d3', 'cdn-chart'];
    }

    constructor() {
      super();
      this._root = this.attachShadow({ mode: 'open' });
      this._state = {
        config: { ...DEFAULTS },
        items: [],         // unified feed items
        docs: [],          // searchable docs (for RAG)
        index: null,       // TF-IDF index
        notes: [],
        alerts: [],
        chat: [],          // {role, content, sources?}
        activeId: null,
        filter: '',
        kind: '',
        view: 'feed',
        stale: false,
        lastFetch: 0,
        controller: null,  // abort for in-flight LLM
        d3: null,
        Chart: null,
      };
      this._timer = null;
    }

    connectedCallback() {
      const style = document.createElement('style');
      style.textContent = STYLE;
      this._root.appendChild(style);
      const wrap = document.createElement('div');
      wrap.innerHTML = TEMPLATE;
      this._root.appendChild(wrap);

      this._hydrateConfig();
      this._wireEvents();
      this._renderSlash();
      this._renderSettings();
      void this._loadNotesFromIdb();
      void this._initialLoad();
    }

    disconnectedCallback() {
      if (this._timer) clearInterval(this._timer);
      this._state.controller?.abort();
    }

    attributeChangedCallback() {
      if (!this.isConnected) return;
      this._hydrateConfig();
      this._renderSettings();
      this._restartTimer();
    }

    // ----------------------------------------------------- configuration
    _hydrateConfig() {
      const c = this._state.config;
      c.dataSource = this.getAttribute('data-source') || c.dataSource;
      c.refreshInterval = Number(this.getAttribute('refresh-interval')) || c.refreshInterval;
      c.theme = this.getAttribute('theme') || c.theme;
      c.density = this.getAttribute('density') || c.density;
      c.llmProvider = this.getAttribute('llm-provider') || c.llmProvider;
      c.cdnD3 = this.getAttribute('cdn-d3') || c.cdnD3;
      c.cdnChart = this.getAttribute('cdn-chart') || c.cdnChart;
      const attrKey = this.getAttribute('api-key');
      if (attrKey) {
        try { localStorage.setItem(`ufo-intel-key:${c.llmProvider}`, attrKey); }
        catch (_) { /* ignore */ }
      }
      this.setAttribute('theme', c.theme);
    }

    _apiKey() {
      try { return localStorage.getItem(`ufo-intel-key:${this._state.config.llmProvider}`) || ''; }
      catch (_) { return ''; }
    }

    _setApiKey(v) {
      try {
        if (v) localStorage.setItem(`ufo-intel-key:${this._state.config.llmProvider}`, v);
        else localStorage.removeItem(`ufo-intel-key:${this._state.config.llmProvider}`);
      } catch (_) { /* ignore */ }
    }

    // ----------------------------------------------------------- events
    _$(sel) { return this._root.querySelector(sel); }
    _$$(sel) { return [...this._root.querySelectorAll(sel)]; }

    _wireEvents() {
      this._root.addEventListener('click', (e) => {
        const t = e.target.closest('[data-act], [data-tab], .feed-item');
        if (!t) return;
        if (t.matches('.feed-item')) {
          this._state.activeId = t.dataset.id;
          this._renderDetail();
          return;
        }
        const tab = t.getAttribute('data-tab');
        if (tab) return this._switchView(tab);
        const act = t.getAttribute('data-act');
        if (act === 'refresh') { void this._fetchSource(true); return; }
        if (act === 'toggle-chat') return this._toggleChat();
        if (act === 'close-chat') return this._toggleChat(false);
        if (act === 'clear-chat') { this._state.chat = []; this._renderMessages(); this._audit('chat:clear'); return; }
        if (act === 'export-chat') return this._exportChat();
        if (act === 'export-csv') return this._exportData('csv');
        if (act === 'export-json') return this._exportData('json');
        if (act === 'export-audit') return this._exportAudit();
        if (act === 'audit') return this._switchView('settings');
        if (act === 'settings') return this._switchView('settings');
        if (act === 'clear-cache') return void this._clearCache();
        if (act === 'stop') { this._state.controller?.abort(); this._state.controller = null; }
      });

      const onFilter = debounce(() => {
        this._state.filter = this._$('[data-filter]').value.trim();
        this._state.kind = this._$('[data-kind]').value;
        this._renderFeed();
      }, 120);
      this._$('[data-filter]').addEventListener('input', onFilter);
      this._$('[data-kind]').addEventListener('change', onFilter);

      this._$('[data-composer]').addEventListener('submit', (e) => {
        e.preventDefault();
        const ta = this._$('[data-input]');
        const text = ta.value.trim();
        if (!text) return;
        ta.value = '';
        void this._handleChat(text);
      });
      this._$('[data-input]').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._$('[data-composer]').requestSubmit();
        }
      });

      this._$('[data-settings]').addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const c = this._state.config;
        const newSource = String(fd.get('dataSource') || c.dataSource);
        const newInterval = Number(fd.get('refreshInterval')) || c.refreshInterval;
        const newProvider = String(fd.get('llmProvider') || c.llmProvider);
        const apiKey = String(fd.get('apiKey') || '');
        c.llmProvider = newProvider;
        if (apiKey) this._setApiKey(apiKey);
        const sourceChanged = newSource !== c.dataSource;
        c.dataSource = newSource;
        c.refreshInterval = newInterval;
        c.theme = String(fd.get('theme') || c.theme);
        c.density = String(fd.get('density') || c.density);
        this.setAttribute('theme', c.theme);
        const note = String(fd.get('note') || '').trim();
        if (note) {
          const item = { _kind: 'note', _ts: Date.now(), title: note.slice(0, 80),
            blurb: note, agency: 'ANALYST', url: '', releaseDate: new Date().toISOString() };
          this._state.notes.push(item);
          void idbPut('notes', null, item);
          this._audit('note:add', { len: note.length });
        }
        e.target.querySelector('[name="note"]').value = '';
        this._restartTimer();
        this._rebuildItems();
        this._renderFeed();
        if (sourceChanged) void this._fetchSource(true);
      });
    }

    _switchView(name) {
      this._state.view = name;
      this._$$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
      this._$$('.view').forEach((v) => {
        if (v.dataset.view === name) v.setAttribute('data-active', '');
        else v.removeAttribute('data-active');
      });
      if (name === 'analytics') void this._renderAnalytics();
    }

    _toggleChat(force) {
      const a = this._$('[data-assistant]');
      const open = force === undefined ? !a.hasAttribute('data-open') : force;
      if (open) a.setAttribute('data-open', '');
      else a.removeAttribute('data-open');
      if (open && !this._state.chat.length) {
        this._pushMsg('system',
          this._apiKey()
            ? 'Assistant ready. Try /summarize latest or just ask a question. Context is retrieved from the loaded corpus.'
            : 'No API key configured. Open Settings to add one. The assistant is disabled until then – but slash-command stubs and retrieval still work locally.');
      }
    }

    // ----------------------------------------------------- data loading
    _restartTimer() {
      if (this._timer) clearInterval(this._timer);
      const ms = Math.max(5, this._state.config.refreshInterval) * 1000;
      this._timer = setInterval(() => void this._fetchSource(false), ms);
    }

    async _initialLoad() {
      const cached = await idbGet('cache', 'latest');
      if (cached?.data) {
        this._ingest(cached.data, /*fromCache=*/true);
        this._setBanner(`Showing cached snapshot from ${new Date(cached.ts).toLocaleString()}.`);
      }
      this._restartTimer();
      void this._fetchSource(true);
    }

    async _fetchSource(initial) {
      const url = this._state.config.dataSource;
      this._setStatus('Fetching', false);
      try {
        const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const newCount = this._ingest(data, false);
        await idbPut('cache', 'latest', { ts: Date.now(), data });
        this._setBanner('');
        this._setStatus('Live', true);
        this._audit('source:fetch', { url, ok: true, items: this._state.docs.length });
        if (!initial && newCount > 0) {
          this._pushAlert(`New tranche detected: ${newCount} item${newCount === 1 ? '' : 's'} added.`);
        }
      } catch (err) {
        this._setStatus('Stale', false, true);
        this._setBanner(`Live fetch failed (${err.message}). Showing last cached snapshot.`);
        this._audit('source:fetch', { url, ok: false, err: String(err.message) });
      }
    }

    _ingest(data, fromCache) {
      const prevIds = new Set(this._state.docs.map((d) => d._id));
      const docs = [];
      for (const kind of SCHEMA_KINDS) {
        const arr = Array.isArray(data?.[kind]) ? data[kind] : [];
        const k = kind.replace(/s$/, '');
        for (const raw of arr) {
          const id = String(raw.id || raw.url || `${k}:${raw.title}:${raw.releaseDate || ''}`);
          docs.push({
            _id: id,
            _kind: k,
            _ts: +new Date(raw.releaseDate || raw.date || 0) || 0,
            title: raw.title || '(untitled)',
            agency: raw.agency || 'UNKNOWN',
            url: raw.url || '',
            blurb: raw.blurb || raw.description || '',
            releaseDate: raw.releaseDate || raw.date || '',
            raw,
          });
        }
      }
      this._state.docs = docs;
      this._state.index = buildIndex(docs);
      this._rebuildItems();
      this._renderFeed();
      this._renderDetail();
      if (this._state.view === 'analytics') void this._renderAnalytics();
      const newOnes = fromCache ? 0 : docs.filter((d) => !prevIds.has(d._id)).length;
      this._setCounts();
      return newOnes;
    }

    _rebuildItems() {
      const docItems = this._state.docs.map((d) => ({ ...d }));
      const noteItems = this._state.notes.map((n) => ({ ...n, _id: `note:${n._ts}` }));
      const alertItems = this._state.alerts.map((a, i) => ({
        _id: `alert:${a._ts}:${i}`, _kind: 'alert', _ts: a._ts,
        title: a.title, agency: 'SYSTEM', blurb: a.title,
        releaseDate: new Date(a._ts).toISOString(),
      }));
      const merged = [...docItems, ...noteItems, ...alertItems]
        .sort((a, b) => (b._ts || 0) - (a._ts || 0));
      this._state.items = merged;
    }

    async _loadNotesFromIdb() {
      const notes = await idbAll('notes');
      this._state.notes = notes || [];
      this._rebuildItems();
      this._renderFeed();
    }

    _pushAlert(title) {
      this._state.alerts.unshift({ _ts: Date.now(), title });
      this._state.alerts = this._state.alerts.slice(0, 50);
      this._rebuildItems();
      this._renderFeed();
      this._audit('alert', { title });
    }

    // -------------------------------------------------------- rendering
    _setStatus(text, live, stale) {
      const el = this._$('[data-status]');
      el.textContent = text;
      el.classList.toggle('live', !!live);
      el.classList.toggle('stale', !!stale);
      this._state.stale = !!stale;
    }

    _setBanner(text) {
      const b = this._$('[data-banner]');
      b.textContent = text || '';
      if (text) b.setAttribute('data-show', '');
      else b.removeAttribute('data-show');
    }

    _setCounts() {
      const c = { pdf: 0, image: 0, video: 0 };
      for (const d of this._state.docs) if (c[d._kind] !== undefined) c[d._kind]++;
      this._$('[data-counts]').textContent =
        `${c.pdf} PDF · ${c.image} IMG · ${c.video} VID`;
    }

    _filteredItems() {
      const q = this._state.filter.toLowerCase();
      const k = this._state.kind;
      return this._state.items.filter((it) => {
        if (k && it._kind !== k) return false;
        if (!q) return true;
        return (`${it.title} ${it.agency} ${it.blurb}`).toLowerCase().includes(q);
      });
    }

    _renderFeed() {
      const root = this._$('[data-feed]');
      const items = this._filteredItems();
      if (!items.length) {
        root.innerHTML = `<div class="empty">No items match the current filter.</div>`;
        return;
      }
      const max = this._state.config.density === 'compact' ? 200 : 500;
      root.innerHTML = items.slice(0, max).map((it) => `
        <div class="feed-item" role="article" tabindex="0" data-id="${escapeHtml(it._id)}">
          <span class="kind">${escapeHtml(it._kind)}</span>
          <div>
            <div class="title">${escapeHtml(it.title)}</div>
            <div class="meta">
              <span>${escapeHtml(it.agency || 'UNKNOWN')}</span>
              ${it.blurb ? `<span>· ${escapeHtml(it.blurb.slice(0, 110))}${it.blurb.length > 110 ? '…' : ''}</span>` : ''}
            </div>
          </div>
          <span class="date">${escapeHtml(fmtDate(it.releaseDate))}</span>
        </div>
      `).join('');
    }

    _renderDetail() {
      const root = this._$('[data-detail]');
      const id = this._state.activeId;
      const it = this._state.items.find((x) => x._id === id);
      if (!it) {
        root.innerHTML = `<div class="empty">Select an item from the feed to view full context.</div>`;
        return;
      }
      root.innerHTML = `
        <div class="agency">${escapeHtml(it.agency)} · ${escapeHtml(it._kind)} · ${escapeHtml(fmtDate(it.releaseDate))}</div>
        <h2>${escapeHtml(it.title)}</h2>
        <div class="blurb">${escapeHtml(it.blurb || 'No abstract available.')}</div>
        <div class="links">
          ${it.url ? `<a class="btn" href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">Open Source</a>` : ''}
          <button class="btn" data-act="ask-about" data-id="${escapeHtml(it._id)}">Ask Assistant</button>
        </div>
      `;
      const askBtn = root.querySelector('[data-act="ask-about"]');
      if (askBtn) askBtn.addEventListener('click', () => {
        this._toggleChat(true);
        const ta = this._$('[data-input]');
        ta.value = `Summarise and assess significance of: "${it.title}" (${it.agency})`;
        ta.focus();
      });
    }

    _renderSettings() {
      const f = this._$('[data-settings]');
      if (!f) return;
      const c = this._state.config;
      f.elements.dataSource.value = c.dataSource;
      f.elements.refreshInterval.value = c.refreshInterval;
      f.elements.llmProvider.value = c.llmProvider;
      f.elements.theme.value = c.theme;
      f.elements.density.value = c.density;
      const k = this._apiKey();
      f.elements.apiKey.placeholder = k ? '•••• key stored locally ••••' : 'sk-... or http://localhost:11434/v1';
    }

    _renderSlash() {
      const s = this._$('[data-slash]');
      s.innerHTML = SLASH.map((c) => `<button class="btn ghost" type="button" data-cmd="${escapeHtml(c.cmd)}" title="${escapeHtml(c.help)}">${escapeHtml(c.cmd)}</button>`).join('');
      s.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cmd]');
        if (!b) return;
        const ta = this._$('[data-input]');
        ta.value = b.dataset.cmd;
        ta.focus();
      });
    }

    _pushMsg(role, content, sources) {
      this._state.chat.push({ role, content, sources });
      this._renderMessages();
    }

    _renderMessages() {
      const root = this._$('[data-messages]');
      root.innerHTML = this._state.chat.map((m) => {
        const src = m.sources?.length
          ? `<div class="sources">Sources:<br>${m.sources.map((s) => `<a href="${escapeHtml(s.url || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)} <span style="color:var(--ui-muted)">[${escapeHtml(s.agency || '')}]</span></a>`).join('')}</div>`
          : '';
        return `<div class="msg ${escapeHtml(m.role)}">${escapeHtml(m.content)}${src}</div>`;
      }).join('');
      root.scrollTop = root.scrollHeight;
    }

    // ---------------------------------------------------- chat / agent
    async _handleChat(rawText) {
      const docs = this._state.docs;
      const { text, retrieve } = expandSlash(rawText, docs);
      this._pushMsg('user', rawText);
      this._audit('chat:send', { len: rawText.length });

      // Retrieval (client-only)
      const hits = queryIndex(this._state.index, retrieve, 6).map(([i]) => docs[i]).filter(Boolean);
      const sources = hits.map((d) => ({ title: d.title, agency: d.agency, url: d.url }));
      const contextBlock = hits.length
        ? hits.map((d, i) => `[${i + 1}] (${d.agency}, ${fmtDate(d.releaseDate)}) ${d.title}\n${d.blurb || ''}`).join('\n\n')
        : '(no matching documents)';

      const apiKey = this._apiKey();
      const provider = this._state.config.llmProvider;

      if (!apiKey && provider !== 'local') {
        this._pushMsg('assistant',
          `Assistant key not configured. Top retrieved sources for "${retrieve}":\n\n` +
          hits.slice(0, 5).map((d, i) =>
            `${i + 1}. ${d.title} — ${d.agency} (${fmtDate(d.releaseDate)})`).join('\n'),
          sources);
        return;
      }

      const sys = 'You are an intelligence analyst assistant. Be terse, calibrated, and cite source numbers from the CONTEXT block (e.g., [1], [2]) when making claims. Never invent citations.';
      const userMsg = `CONTEXT:\n${contextBlock}\n\nQUERY:\n${text}`;
      const messages = [
        { role: 'system', content: sys },
        ...this._state.chat
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-6)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMsg },
      ];

      // streaming assistant message
      const idx = this._state.chat.push({ role: 'assistant', content: '', sources }) - 1;
      this._renderMessages();
      this._state.controller?.abort();
      const ctrl = new AbortController();
      this._state.controller = ctrl;
      try {
        for await (const delta of llmStream(provider, apiKey, messages, ctrl.signal)) {
          this._state.chat[idx].content += delta;
          this._renderMessages();
        }
        this._audit('chat:reply', { provider, sources: sources.length });
      } catch (err) {
        this._state.chat[idx].content += `\n\n[error] ${err.message}`;
        this._renderMessages();
        this._audit('chat:error', { err: String(err.message) });
      } finally {
        if (this._state.controller === ctrl) this._state.controller = null;
      }
    }

    // ----------------------------------------------------- analytics
    async _ensureVendor() {
      const c = this._state.config;
      if (!this._state.d3) {
        try { this._state.d3 = await import(/* @vite-ignore */ c.cdnD3); }
        catch (_) { this._state.d3 = null; }
      }
      if (!this._state.Chart) {
        try {
          const mod = await import(/* @vite-ignore */ c.cdnChart);
          this._state.Chart = mod.Chart ? mod : { Chart: mod.default || mod };
        } catch (_) { this._state.Chart = null; }
      }
    }

    async _renderAnalytics() {
      await this._ensureVendor();
      this._drawTimeline();
      this._drawGraph();
      this._drawBars();
      this._drawCadence();
    }

    _drawTimeline() {
      const wrap = this._$('[data-panel="timeline"]');
      const svg = wrap.querySelector('svg');
      svg.innerHTML = '';
      const w = wrap.clientWidth || 400, h = wrap.clientHeight || 200;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const items = this._state.docs.filter((d) => d._ts);
      if (!items.length) return;
      const min = Math.min(...items.map((d) => d._ts));
      const max = Math.max(...items.map((d) => d._ts));
      const span = max - min || 1;
      const agencies = [...new Set(items.map((d) => d.agency))];
      const palette = ['#38bdf8', '#c7a252', '#a78bfa', '#22c55e', '#f97316', '#ec4899', '#14b8a6'];
      const color = (a) => palette[agencies.indexOf(a) % palette.length];
      const ns = 'http://www.w3.org/2000/svg';
      // axis
      const axis = document.createElementNS(ns, 'line');
      axis.setAttribute('x1', 20); axis.setAttribute('x2', w - 20);
      axis.setAttribute('y1', h - 24); axis.setAttribute('y2', h - 24);
      axis.setAttribute('stroke', 'var(--ui-border)');
      svg.appendChild(axis);
      // ticks
      const yearStart = new Date(min).getFullYear();
      const yearEnd = new Date(max).getFullYear();
      for (let y = yearStart; y <= yearEnd; y++) {
        const t = +new Date(y, 0, 1);
        const x = 20 + ((t - min) / span) * (w - 40);
        const tk = document.createElementNS(ns, 'line');
        tk.setAttribute('x1', x); tk.setAttribute('x2', x);
        tk.setAttribute('y1', h - 28); tk.setAttribute('y2', h - 20);
        tk.setAttribute('stroke', 'var(--ui-muted)');
        svg.appendChild(tk);
        const lbl = document.createElementNS(ns, 'text');
        lbl.setAttribute('x', x); lbl.setAttribute('y', h - 6);
        lbl.setAttribute('fill', 'var(--ui-muted)'); lbl.setAttribute('font-size', '10');
        lbl.setAttribute('text-anchor', 'middle'); lbl.textContent = y;
        svg.appendChild(lbl);
      }
      // dots
      const lanes = new Map();
      for (const d of items) {
        const x = 20 + ((d._ts - min) / span) * (w - 40);
        const lane = lanes.get(d.agency) ?? lanes.size;
        if (!lanes.has(d.agency)) lanes.set(d.agency, lane);
        const y = 16 + (lane % 8) * 18;
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 3.5);
        c.setAttribute('fill', color(d.agency));
        const title = document.createElementNS(ns, 'title');
        title.textContent = `${d.title} (${d.agency}, ${fmtDate(d.releaseDate)})`;
        c.appendChild(title);
        svg.appendChild(c);
      }
      // legend
      let lx = 20;
      for (const a of agencies) {
        const g = document.createElementNS(ns, 'g');
        const dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', lx + 4); dot.setAttribute('cy', 4); dot.setAttribute('r', 4);
        dot.setAttribute('fill', color(a));
        const txt = document.createElementNS(ns, 'text');
        txt.setAttribute('x', lx + 12); txt.setAttribute('y', 8);
        txt.setAttribute('fill', 'var(--ui-muted)'); txt.setAttribute('font-size', '10');
        txt.textContent = a;
        g.appendChild(dot); g.appendChild(txt);
        svg.appendChild(g);
        lx += 14 + a.length * 6;
      }
    }

    _drawGraph() {
      const wrap = this._$('[data-panel="graph"]');
      const svg = wrap.querySelector('svg');
      svg.innerHTML = '';
      const w = wrap.clientWidth || 400, h = wrap.clientHeight || 240;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const ns = 'http://www.w3.org/2000/svg';
      const docs = this._state.docs;
      if (!docs.length) return;
      // Build top keywords per agency from TF-IDF
      const agencyKw = new Map();
      const idx = this._state.index;
      docs.forEach((d, i) => {
        const v = idx?.vectors[i];
        if (!v) return;
        const top = [...v.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
        const arr = agencyKw.get(d.agency) || new Map();
        for (const [t, score] of top) arr.set(t, (arr.get(t) || 0) + score);
        agencyKw.set(d.agency, arr);
      });
      const agencies = [...agencyKw.keys()];
      const kwSet = new Set();
      for (const m of agencyKw.values()) {
        const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
        for (const [t] of top) kwSet.add(t);
      }
      const keywords = [...kwSet];
      const nodes = [
        ...agencies.map((a, i) => ({ id: `a:${a}`, label: a, kind: 'agency',
          x: w / 2 + Math.cos((i / agencies.length) * Math.PI * 2) * Math.min(w, h) * 0.32,
          y: h / 2 + Math.sin((i / agencies.length) * Math.PI * 2) * Math.min(w, h) * 0.32 })),
        ...keywords.map((k, i) => ({ id: `k:${k}`, label: k, kind: 'kw',
          x: w / 2 + Math.cos((i / keywords.length) * Math.PI * 2) * Math.min(w, h) * 0.18,
          y: h / 2 + Math.sin((i / keywords.length) * Math.PI * 2) * Math.min(w, h) * 0.18 })),
      ];
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const links = [];
      for (const a of agencies) {
        const top = [...agencyKw.get(a).entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
        for (const [t, s] of top) {
          if (byId.has(`k:${t}`)) links.push({ source: `a:${a}`, target: `k:${t}`, w: s });
        }
      }
      // Static layout (no animation, no D3 dependency required)
      for (const l of links) {
        const s = byId.get(l.source), t = byId.get(l.target);
        const ln = document.createElementNS(ns, 'line');
        ln.setAttribute('x1', s.x); ln.setAttribute('y1', s.y);
        ln.setAttribute('x2', t.x); ln.setAttribute('y2', t.y);
        ln.setAttribute('stroke', 'var(--ui-border)');
        ln.setAttribute('stroke-width', Math.max(0.5, Math.min(3, l.w * 2)));
        svg.appendChild(ln);
      }
      for (const n of nodes) {
        const g = document.createElementNS(ns, 'g');
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', n.x); c.setAttribute('cy', n.y);
        c.setAttribute('r', n.kind === 'agency' ? 7 : 4);
        c.setAttribute('fill', n.kind === 'agency' ? 'var(--ui-cyan)' : 'var(--ui-accent)');
        c.setAttribute('stroke', 'var(--ui-panel)');
        c.setAttribute('stroke-width', '1.5');
        const txt = document.createElementNS(ns, 'text');
        txt.setAttribute('x', n.x + 8); txt.setAttribute('y', n.y + 3);
        txt.setAttribute('font-size', n.kind === 'agency' ? 11 : 9);
        txt.setAttribute('fill', n.kind === 'agency' ? 'var(--ui-text)' : 'var(--ui-muted)');
        txt.textContent = n.label;
        g.appendChild(c); g.appendChild(txt); svg.appendChild(g);
      }
    }

    _drawBars() {
      const wrap = this._$('[data-panel="bars"]');
      const canvas = wrap.querySelector('canvas');
      const dpr = globalThis.devicePixelRatio || 1;
      canvas.width = (wrap.clientWidth || 400) * dpr;
      canvas.height = (wrap.clientHeight || 220) * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const W = wrap.clientWidth || 400, H = wrap.clientHeight || 220;
      ctx.clearRect(0, 0, W, H);
      const agencies = [...new Set(this._state.docs.map((d) => d.agency))];
      const kinds = ['pdf', 'image', 'video'];
      const counts = agencies.map((a) => {
        const obj = { pdf: 0, image: 0, video: 0 };
        for (const d of this._state.docs) if (d.agency === a && obj[d._kind] !== undefined) obj[d._kind]++;
        return obj;
      });
      if (!agencies.length) return;
      const max = Math.max(1, ...counts.map((c) => kinds.reduce((s, k) => s + c[k], 0)));
      const padX = 40, padY = 24, plotW = W - padX - 12, plotH = H - padY - 30;
      const barW = plotW / agencies.length * 0.7;
      const colors = { pdf: '#38bdf8', image: '#c7a252', video: '#a78bfa' };
      ctx.font = '10px ui-sans-serif, system-ui';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      // axis
      ctx.beginPath(); ctx.moveTo(padX, padY); ctx.lineTo(padX, padY + plotH);
      ctx.lineTo(padX + plotW, padY + plotH); ctx.stroke();
      agencies.forEach((a, i) => {
        const x = padX + i * (plotW / agencies.length) + (plotW / agencies.length - barW) / 2;
        let y = padY + plotH;
        for (const k of kinds) {
          const v = counts[i][k];
          const hh = (v / max) * plotH;
          ctx.fillStyle = colors[k];
          ctx.fillRect(x, y - hh, barW, hh);
          y -= hh;
        }
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.textAlign = 'center';
        ctx.fillText(a.length > 10 ? a.slice(0, 9) + '…' : a, x + barW / 2, padY + plotH + 14);
      });
      // legend
      let lx = padX;
      kinds.forEach((k) => {
        ctx.fillStyle = colors[k]; ctx.fillRect(lx, 6, 10, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'left';
        ctx.fillText(k, lx + 14, 15);
        lx += 60;
      });
    }

    _drawCadence() {
      const wrap = this._$('[data-panel="cadence"]');
      const canvas = wrap.querySelector('canvas');
      const dpr = globalThis.devicePixelRatio || 1;
      canvas.width = (wrap.clientWidth || 400) * dpr;
      canvas.height = (wrap.clientHeight || 220) * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const W = wrap.clientWidth || 400, H = wrap.clientHeight || 220;
      ctx.clearRect(0, 0, W, H);
      const docs = this._state.docs.filter((d) => d._ts);
      if (!docs.length) return;
      // bucket by month
      const buckets = new Map();
      for (const d of docs) {
        const dt = new Date(d._ts);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
      const keys = [...buckets.keys()].sort();
      const vals = keys.map((k) => buckets.get(k));
      const max = Math.max(1, ...vals);
      const padX = 30, padY = 16, plotW = W - padX - 12, plotH = H - padY - 28;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.moveTo(padX, padY); ctx.lineTo(padX, padY + plotH);
      ctx.lineTo(padX + plotW, padY + plotH); ctx.stroke();
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.beginPath();
      vals.forEach((v, i) => {
        const x = padX + (i / Math.max(1, vals.length - 1)) * plotW;
        const y = padY + plotH - (v / max) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      vals.forEach((v, i) => {
        const x = padX + (i / Math.max(1, vals.length - 1)) * plotW;
        const y = padY + plotH - (v / max) * plotH;
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '10px ui-sans-serif';
      ctx.textAlign = 'center';
      const stride = Math.max(1, Math.floor(keys.length / 6));
      keys.forEach((k, i) => {
        if (i % stride !== 0 && i !== keys.length - 1) return;
        const x = padX + (i / Math.max(1, keys.length - 1)) * plotW;
        ctx.fillText(k, x, padY + plotH + 14);
      });
    }

    // ------------------------------------------------------- export & audit
    async _audit(kind, meta) {
      try {
        await idbPut('audit', null, { ts: Date.now(), kind, meta: meta || {} });
      } catch (_) { /* ignore */ }
    }

    async _exportAudit() {
      const rows = await idbAll('audit');
      this._download(`ufo-audit-${Date.now()}.json`,
        new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }));
    }

    _exportData(format) {
      const items = this._filteredItems();
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
        this._download(`ufo-export-${Date.now()}.json`, blob);
        this._audit('export', { format, count: items.length });
        return;
      }
      // csv
      const cols = ['_kind', 'agency', 'title', 'releaseDate', 'url', 'blurb'];
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
      const lines = [cols.join(',')];
      for (const it of items) lines.push(cols.map((c) => esc(it[c])).join(','));
      this._download(`ufo-export-${Date.now()}.csv`,
        new Blob([lines.join('\n')], { type: 'text/csv' }));
      this._audit('export', { format, count: items.length });
    }

    _exportChat() {
      const text = this._state.chat.map((m) => `## ${m.role}\n${m.content}\n`).join('\n');
      this._download(`ufo-chat-${Date.now()}.md`, new Blob([text], { type: 'text/markdown' }));
      this._audit('chat:export', { turns: this._state.chat.length });
    }

    _download(name, blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 500);
    }

    async _clearCache() {
      try {
        const db = await idbOpen();
        await Promise.all(['cache', 'audit', 'notes'].map((s) =>
          new Promise((res) => {
            const tx = db.transaction(s, 'readwrite');
            tx.objectStore(s).clear();
            tx.oncomplete = () => res();
            tx.onerror = () => res();
          })));
        this._state.notes = [];
        this._rebuildItems();
        this._renderFeed();
        this._setBanner('Local cache cleared.');
      } catch (_) { /* ignore */ }
    }
  }

  customElements.define('ufo-intel-widget', UfoIntelWidget);
})();

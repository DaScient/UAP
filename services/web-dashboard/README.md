# Web Dashboard

This directory is reserved for the public-facing dashboard and interactive sighting experience.

The dashboard is expected to be implemented with TypeScript and Next.js in a way that supports static export for GitHub Pages. It should present public visualisations, schema references, and interactive reconstruction tools while remaining disciplined about provenance, confidence signalling, and the distinction between raw reports and derived analysis.

## GitHub Pages deployment

The site is published at `https://<owner>.github.io/UAP/` by the
`Deploy Static Hub & Model Artifacts to Pages` workflow. Because the site
lives under a `/UAP/` sub-path:

- `next.config.js` sets `basePath`/`assetPrefix` from `NEXT_PUBLIC_BASE_PATH`
  (default `/UAP`). Override with `NEXT_PUBLIC_BASE_PATH=''` for local dev or
  a custom domain.
- Runtime asset URLs (e.g. the WASM math engine) are prefixed with the same
  value at render time.

To make the deployment work end-to-end, **set the Pages source to "GitHub
Actions"** under `Settings → Pages`. The workflow uploads a Pages artifact
and publishes it through `actions/deploy-pages`; it does not push to a
`gh-pages` branch.

The job can also be triggered manually via the **Run workflow** button on
the Actions tab (`workflow_dispatch`).

## UFO Intel Widget

A self-contained, embeddable Web Component lives under
`public/widgets/ufo-intel-widget.js`. It is loaded by the dashboard page
(see `components/UfoIntelWidget.tsx`) and can also be dropped into any
external intranet portal without a build step:

```html
<script src="/widgets/ufo-intel-widget.js" defer></script>
<ufo-intel-widget
  data-source="https://war.gov/UFO/index.json"
  refresh-interval="30"
  theme="dark"
  llm-provider="openai">
</ufo-intel-widget>
```

The widget renders inside a Shadow DOM (no CSS collisions) and provides:

- A merged, filterable intelligence feed (releases + analyst notes + system alerts).
- A slide-out agentic assistant with BYO API key (OpenAI / Anthropic / local
  OpenAI-compatible endpoint) and streaming responses. By default the key is
  held in `sessionStorage` (cleared when the tab closes); add
  `key-storage="local"` to persist it across sessions in `localStorage`.
  Either way the key never leaves the browser except to the LLM endpoint
  the user chose.
- Client-side RAG using a built-in TF-IDF index over the loaded corpus, with
  slash-command skills: `/summarize latest`, `/compare agencies`,
  `/generate report`, `/risk assess <term>`, `/timeline`, `/find patterns`.
- A deep-analytics tab with a release timeline, agency/keyword graph, and
  bar/line charts that update live with new data.
- IndexedDB cache for offline resilience, CSV/JSON/chat-transcript export,
  and an in-browser audit log for all LLM queries and refresh events.

Open `public/widgets/ufo-intel-demo.html` directly in a browser for a
zero-build demo.


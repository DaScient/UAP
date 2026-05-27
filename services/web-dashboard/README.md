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

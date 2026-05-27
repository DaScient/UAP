/**
 * The dashboard is published to GitHub Pages as a project site at
 * https://<owner>.github.io/UAP/. Project pages live underneath a sub-path,
 * so every asset that Next.js emits must be prefixed accordingly or the
 * browser will receive 404s for `_next/*` chunks and the page will appear
 * blank/broken.
 *
 * `NEXT_PUBLIC_BASE_PATH` is exposed to the browser so runtime-loaded
 * resources (e.g. the Rust→WASM math engine) can build URLs that respect
 * the same prefix without hard-coding the repo name.
 */
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/UAP';
const basePath = rawBasePath === '' || rawBasePath === '/' ? '' : rawBasePath;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  typedRoutes: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

module.exports = nextConfig;

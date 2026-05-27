import ClassificationViewer from '../components/ClassificationViewer';
import UfoIntelWidget from '../components/UfoIntelWidget';

export default function HomePage() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const wasmModulePath = `${basePath}/wasm-engine/math_engine.js`;
  const widgetScript = `${basePath}/widgets/ufo-intel-widget.js`;
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_35%),linear-gradient(180deg,_#020617,_#020617)] px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="space-y-4">
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Global UAP Intelligence Hub</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white">Static Analysis Dashboard</h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-300">
            This dashboard is built for static deployment on GitHub Pages and demonstrates how browser-side
            analytics, WebAssembly geometry, and backend classification payloads align under one contract.
          </p>
        </header>
        <ClassificationViewer wasmModulePath={wasmModulePath} />
        <section className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/90">Live Intelligence Feed</p>
            <h2 className="text-2xl font-semibold tracking-tight text-white">UFO Intel Widget</h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-300">
              An embeddable, Shadow-DOM isolated Web Component that polls a UFO release
              mirror, indexes its contents client-side, and exposes an agentic assistant
              with bring-your-own-key LLM support. All processing &mdash; including
              retrieval over loaded files &mdash; happens in your browser.
            </p>
          </div>
          <UfoIntelWidget src={widgetScript} />
        </section>
      </div>
    </main>
  );
}

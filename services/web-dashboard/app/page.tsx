import ClassificationViewer from '../components/ClassificationViewer';

export default function HomePage() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const wasmModulePath = `${basePath}/wasm-engine/math_engine.js`;
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
      </div>
    </main>
  );
}

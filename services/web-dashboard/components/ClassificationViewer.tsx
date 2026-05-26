'use client';

import { useMemo, useState } from 'react';

type WasmModule = {
  default?: (input?: string | URL | Request) => Promise<unknown>;
  calculate_intersection_geocentric_js?: (a: unknown, b: unknown) => [number, number, number];
};

type Props = {
  wasmModulePath: string;
};

const stationObservations = [
  {
    station_id: 'station-alpha',
    lat_rad: 0.7105724077,
    lon_rad: -1.2916483662,
    alt_m: 12.0,
    azimuth_rad: 1.0471975512,
    elevation_rad: 0.4363323129,
  },
  {
    station_id: 'station-bravo',
    lat_rad: 0.7123171030,
    lon_rad: -1.2881574178,
    alt_m: 18.0,
    azimuth_rad: 1.2566370614,
    elevation_rad: 0.4886921906,
  },
];

export default function ClassificationViewer({ wasmModulePath }: Props) {
  const [moduleHandle, setModuleHandle] = useState<WasmModule | null>(null);
  const [loading, setLoading] = useState(false);
  const [intersection, setIntersection] = useState<[number, number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classificationPayload = useMemo(
    () => ({
      event_id: 'demo-event-001',
      classification_metadata: {
        assigned_shape: 'SPHERE',
        confidence_score: 0.87,
        anomalous_flag: true,
        speed_profile: 'Hypersonic',
      },
      storage_routing_path: 'data/processed/Hypersonic/SPHERE/demo-event-001/',
    }),
    [],
  );

  async function handleLoad() {
    setLoading(true);
    setError(null);
    try {
      const wasmModule = (await import(/* webpackIgnore: true */ wasmModulePath)) as WasmModule;
      const wasmBinaryPath = wasmModulePath.replace(/\.js$/, '_bg.wasm');
      if (typeof wasmModule.default === 'function') {
        await wasmModule.default(wasmBinaryPath);
      }
      setModuleHandle(wasmModule);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load WASM module.');
    } finally {
      setLoading(false);
    }
  }

  function handleCalculate() {
    setError(null);
    if (!moduleHandle?.calculate_intersection_geocentric_js) {
      setError('Load the math engine before calculating an intersection.');
      return;
    }
    try {
      const result = moduleHandle.calculate_intersection_geocentric_js(
        stationObservations[0],
        stationObservations[1],
      );
      setIntersection(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Intersection calculation failed.');
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-cyan-950/20">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Simulation Interface</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Parallax Classification Viewer</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            This panel demonstrates the data path between the static dashboard and the Rust-generated
            WebAssembly math engine.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            classificationPayload.classification_metadata.anomalous_flag
              ? 'bg-red-500/20 text-red-300'
              : 'bg-emerald-500/20 text-emerald-300'
          }`}
        >
          anomalous_flag: {String(classificationPayload.classification_metadata.anomalous_flag)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleLoad}
              disabled={loading}
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Loading…' : 'Load Math Engine'}
            </button>
            <button
              type="button"
              onClick={handleCalculate}
              className="rounded-lg border border-cyan-400/40 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:border-cyan-300 hover:text-cyan-100"
            >
              Calculate Intersection
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {stationObservations.map((station) => (
              <div key={station.station_id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-xs text-slate-300">
                <p className="mb-2 font-semibold uppercase tracking-[0.2em] text-slate-400">{station.station_id}</p>
                <pre className="overflow-auto whitespace-pre-wrap text-[11px] leading-5">
                  {JSON.stringify(station, null, 2)}
                </pre>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-slate-800 bg-black/40 p-4 text-sm text-slate-200">
            <p className="mb-2 font-medium text-white">Intersection Result</p>
            {intersection ? (
              <pre className="overflow-auto text-xs text-cyan-100">{JSON.stringify({ ecef: intersection }, null, 2)}</pre>
            ) : (
              <p className="text-slate-400">No intersection has been computed yet.</p>
            )}
          </div>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="mb-3 text-sm font-medium text-white">Backend Classification Payload Shape</p>
          <pre className="overflow-auto text-xs leading-5 text-slate-300">
            {JSON.stringify(classificationPayload, null, 2)}
          </pre>
        </div>
      </div>
    </section>
  );
}

# UAP

## Agentic UAP Intelligence and Data Centralization Hub

UAP is a polyglot, decentralised, open-source platform for ingesting, classifying, enriching, and publicly visualising Unidentified Anomalous Phenomena observations gathered from sensors, eyewitnesses, and declassified government data sources. This repository now serves as the authoritative specification and initial repository scaffold for that platform.

The project is designed to support both rigorous technical analysis and responsible public transparency. Its architecture is intentionally modular, language-diverse, and contract-driven so that each subsystem can evolve according to the operational demands of its domain without fragmenting the overall data model.

## Architecture philosophy

The platform follows a polyglot architecture because no single runtime is the best fit for every operational concern in a system that must simultaneously handle numerical modelling, machine-learning-assisted ingestion, high-throughput API traffic, and public-facing visualisation.

Each major service is assigned the implementation language that best matches its workload:

| Service | Language | Rationale |
| --- | --- | --- |
| `services/math-engine` | Rust with WebAssembly output | Provides numerically stable, memory-safe geometry and intercept calculations that can run both in controlled backend contexts and in-browser for client-side parallax and reconstruction. |
| `services/ingestion-worker` | Python 3.11+ | Supports document parsing, computer vision, text classification, and downstream enrichment using the mature scientific and machine-learning ecosystem. |
| `services/api-gateway` | Go | Offers efficient fan-in for sensor uploads, witness submissions, and service-to-service APIs with strong concurrency support and low runtime overhead. |
| `services/web-dashboard` | TypeScript with Next.js | Delivers a static-exportable public dashboard that can be deployed cleanly to GitHub Pages while preserving a modern frontend development model. |
| `data-schemas/*.proto` | Protocol Buffers | Defines the canonical cross-service contract so that every implementation binds to one shared event model. |

The canonical data contract for the platform is intended to live under `data-schemas/`. No service should invent a competing internal representation for the core UAP event payload. Repository growth should continue to reinforce that invariant.

## Planned system topology

The target deployment model combines a static public surface with conventional cloud compute for heavier processing workloads.

```text
                ┌──────────────────┐
                │  web-dashboard   │
                │   (TS / WASM)    │
                └────────▲─────────┘
                         │
                ┌────────┴─────────┐
                │   api-gateway    │
                └────────▲─────────┘
                         │
        ┌────────────────┼──────────────────┐
        │                │                  │
┌───────▼──────┐ ┌───────▼──────┐  ┌────────▼────────┐
│ ingestion-   │ │  math-engine │  │ object / vector │
│ worker (Py)  │ │   (Rust)     │  │ store           │
└──────────────┘ └──────────────┘  └─────────────────┘
```

The public dashboard presents visualisations, witness tooling, and static schema artefacts. The API gateway handles uploads and route-level orchestration. The ingestion worker performs enrichment, classification, and mapping from external sources. The math engine provides deterministic geometry and intercept calculations. Object and vector storage preserve raw artefacts and semantic embeddings.

## Repository structure

This repository now includes an initial scaffold that reflects the intended architectural layout:

- `docs/` contains policy and integration guidance.
- `services/api-gateway/` defines the scope of the gateway service.
- `services/ingestion-worker/` defines the scope of the ingestion and analytics worker.
- `services/math-engine/` defines the scope of the Rust and WebAssembly mathematics module.
- `services/web-dashboard/` defines the scope of the public web experience.
- `data-schemas/` describes the shared schema boundary.
- `docker/` describes the local and production orchestration targets that should exist as the implementation matures.

These directories are presently specification-oriented. They establish the target shape of the repository and document the expected responsibilities of each subsystem.

## Local development expectations

Contributors working across the full stack should expect to install the following baseline toolchain:

| Tool | Expected version |
| --- | --- |
| Python | 3.11 or later |
| Node.js | 20 LTS or later |
| Rust | stable 1.75 or later |
| `wasm-pack` | current stable release |
| Go | 1.22 or later |
| Docker | 24 or later |
| Docker Compose | v2 |
| `protoc` | 25 or later |

Native document and media processing dependencies are also expected for the Python ingestion worker where file parsing, OCR, and media normalisation are required.

## Development and deployment model

The long-term development model assumes an end-to-end local environment driven by Docker Compose for object storage, vector storage, ingestion processing, and frontend development. The long-term production model is hybrid: static assets and WebAssembly bundles are intended for GitHub Pages, while compute-bound services run on conventional container infrastructure.

One deployment invariant deserves explicit emphasis: any GitHub Pages workflow must preserve a `.nojekyll` file at the publish root so that framework artefacts stored under underscore-prefixed paths are not stripped during publication.

## Feature modules

The architecture roadmap currently centres on four major functional themes:

1. **Three-dimensional spatial reconstruction.** The web dashboard should support direction-of-observation capture, sky-dome interaction, and map-backed scene reconstruction suitable for witness submissions and analyst review.
2. **Collaborative triangulation.** The API gateway should cluster temporally and geographically related witness reports, derive community incident nodes, and forward eligible clusters to the math engine for intercept estimation.
3. **Tactical analytics.** The ingestion worker should classify events against order-of-battle baselines, detect anomalous gaps, and separate likely conventional activity from genuinely unexplained cases.
4. **Unified schema cross-mapping.** External source formats should be normalised into the canonical event contract through data-driven mapping rather than per-source bespoke code paths.

## Governance and contribution guidance

Before contributing data-source integrations or operational workflows, review the following documents:

- `/tmp/workspace/DaScient/UAP/docs/LEGAL_COMPLIANCE.md`
- `/tmp/workspace/DaScient/UAP/docs/GOVERNMENT_API_MAP.md`

These documents establish the legal, ethical, and operational expectations for expanding the platform.

## Current repository state

At this stage, the repository is intentionally specification-first. It does not yet contain working service implementations, generated schema bindings, deployment pipelines, or production-ready orchestration manifests. Instead, it now provides a professional, explicit foundation for the platform's architecture, governance, and future implementation structure.

This state is appropriate for early coordination because it gives contributors one clear description of system boundaries, delivery expectations, and documentation responsibilities before implementation begins.

## License

This project is distributed under the MIT License. See `LICENSE` for the complete terms.

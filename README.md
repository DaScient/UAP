# Global UAP Intelligence Hub

Global UAP Intelligence Hub is an agentic, polyglot, and decentralised platform for collecting, normalising, analysing, and publicly visualising Unidentified Anomalous Phenomena observations across heterogeneous sources. The system is designed to unify eyewitness submissions, automated sensor feeds, historical document archives, and curated government datasets under one canonical contract while preserving provenance, legal controls, and scientific traceability.

The repository is intentionally structured as a modular codebase rather than a monolith. Each service is assigned the language and runtime best suited to its workload, while shared data contracts and deployment rules keep the platform coherent.

---

## 1. Polyglot architecture philosophy

The hub follows a polyglot architecture because the problem domain spans workloads with fundamentally different operational characteristics. High-precision spatial maths, machine-learning-heavy ingestion, API coordination, and static public visualisation each benefit from different ecosystems.

| Service | Language | Purpose |
| --- | --- | --- |
| `services/math-engine` | Rust with WebAssembly output | Provides deterministic, numerically stable spatial calculations for parallax, intercept estimation, and browser-side geometry. |
| `services/ingestion-worker` | Python 3.11+ | Handles file-type-agnostic ingestion, classification, feature extraction, vectorisation, and tactical analytics. |
| `services/api-gateway` | Go | Provides low-latency intake, clustering, routing, and real-time notification fan-out. |
| `services/web-dashboard` | TypeScript with Next.js | Delivers the public dashboard, spatial reconstruction interface, and static-exportable Pages deployment target. |
| `data-schemas` | Protocol Buffers and JSON mappings | Establishes the universal contract for every event and source translation path. |

This design prevents the project from collapsing into one runtime that is poorly suited to at least one critical responsibility. It also encourages contributor diversity by allowing domain specialists to work in the ecosystem most appropriate to their area.

The canonical cross-service record is `data-schemas/telemetry.proto`. All downstream processing, whether human-generated or machine-generated, should ultimately map back to that schema.

---

## 2. Prerequisite installations

Contributors do not need every tool if they are working on only one subsystem, but a full-stack contributor should expect the following baseline environment.

| Tool | Version target | Notes |
| --- | --- | --- |
| Python | 3.11 or later | Required for the ingestion worker, analytics pipeline, and document-processing tasks. |
| Node.js | 20 LTS or later | Required for the static dashboard and local frontend development. |
| Rust | Stable 1.75 or later | Required for the math engine and WebAssembly builds. |
| `wasm-pack` | Current stable release | Required to compile the Rust engine for browser delivery. |
| Go | 1.22 or later | Required for the API gateway and triangulation router. |
| Docker | 24 or later | Required for local orchestration. |
| Docker Compose | v2 | Used by the local development stack. |
| `protoc` | 25 or later | Required when generating schema bindings. |

For the Python ingestion worker, native libraries such as `libmagic`, `ffmpeg`, `poppler`, and `tesseract` are typically required for MIME detection, OCR, and media processing.

---

## 3. Single-command local startup

The repository includes a development Compose definition at `docker/dev.docker-compose.yml`. The intent of this environment is to provide a zero-cloud, developer-local system for object storage, vector storage, ingestion processing, and dashboard development.

To start the local stack:

```bash
docker compose -f docker/dev.docker-compose.yml up --build
```

That command is expected to start the following development services:

1. MinIO as a local S3-compatible object store on ports `9000` and `9001`.
2. ChromaDB as a local vector database on port `8000`.
3. The Python ingestion worker with the local object and vector stores wired in through environment variables.
4. The Next.js dashboard on port `3000` for interactive frontend development.

To stop the local environment:

```bash
docker compose -f docker/dev.docker-compose.yml down
```

To wipe persisted local state:

```bash
rm -rf volumes/local-s3-mock/* volumes/local-vector-db/*
```

---

## 4. Cloud deployment model

The production architecture is intentionally hybrid.

| Layer | Target runtime | Deployment mode |
| --- | --- | --- |
| Web dashboard | GitHub Pages | Static export from Next.js |
| Rust math engine | GitHub Pages artifact delivery | WebAssembly bundle consumed by the browser |
| Shared schemas | GitHub Pages artifact delivery | Published alongside the static site for public integration |
| API gateway | Conventional cloud runtime | Container deployment to a service such as Cloud Run, Fly.io, ECS, or Kubernetes |
| Ingestion worker | Conventional cloud runtime | Containerised worker tied to queues and external object and vector stores |
| Object store | Managed cloud object storage | S3, GCS, or compatible endpoint |
| Vector store | Managed or self-hosted vector database | External service referenced by environment variables |

The static analysis dashboard is explicitly designed for GitHub Pages. That deployment path is mission-critical, and the repository therefore treats `.nojekyll` generation as a non-negotiable deployment invariant. GitHub Pages will otherwise process the site with Jekyll and silently strip underscore-prefixed paths such as `_next/`, which would break a Next.js static export.

The workflow at `.github/workflows/static_deploy.yml` therefore creates a single deployment root, copies in the static site, the WebAssembly artifacts, and the schema files, and explicitly runs `touch gh-pages-root/.nojekyll` before publishing.

---

## 5. Repository guide

- `.github/ISSUE_TEMPLATE/` contains issue forms for field data and processing defects.
- `.github/workflows/` contains the GitHub Pages publication workflow.
- `data-schemas/` contains the canonical Protocol Buffers contract and cross-source mapping dictionary.
- `docker/` contains development and production orchestration references.
- `docs/` contains compliance, ethics, and government-source onboarding guidance.
- `services/api-gateway/` contains the Go gateway and triangulation router.
- `services/ingestion-worker/` contains the ingestion pipeline, classifier, analytics modules, and model definitions.
- `services/math-engine/` contains the Rust and WebAssembly-enabled spatial maths engine.
- `services/web-dashboard/` contains the Next.js dashboard and client-side spatial tooling.
- `volumes/` contains local persistent development mounts for the object and vector stores.

---

## 6. Operating principles

This platform is intended to advance disciplined analysis, not sensationalism. Every record should preserve provenance. Every classification should distinguish between raw inputs and inferred outputs. Every government-source integration should be justified by lawful access. Every public-facing experience should reflect confidence, uncertainty, and context rather than implying unwarranted certainty.

Before adding data-source integrations or publishing new operational capabilities, contributors should review the compliance and onboarding guidance in `docs/LEGAL_COMPLIANCE.md` and `docs/GOVERNMENT_API_MAP.md`.

---

## 7. License

This repository is licensed under the MIT License. See `LICENSE` for the full text.

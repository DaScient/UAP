# Government Data Source Integration Map

## Purpose

This document describes how government-originated UAP, aviation, atmospheric, and sensor-adjacent data sources should be evaluated and integrated into the platform. Its purpose is to create a disciplined intake process so that new sources are added consistently, legally, and with a clear path into the canonical schema model.

## Integration principles

Government data integrations should be designed around traceability, lawful use, and reversible ingestion. Every source should be attributable, versionable, and removable if its access terms change. Integrations should favour reproducible mappings over ad hoc parsing logic.

Each new source should answer five questions before implementation begins:

1. What agency or public body owns the data?
2. What legal or policy basis permits access and reuse?
3. What transport mechanism exposes the data?
4. How does the source map into the canonical UAP event schema?
5. What quality, latency, and provenance characteristics should downstream consumers understand?

## Source classification model

Government and public-sector sources should be grouped into one of the following categories:

- **Direct UAP disclosure sources**, such as official reports, dashboards, or declassified case files.
- **Aviation and airspace sources**, such as incident records, NOTAM-related material, or publicly exposed radar-adjacent feeds where legally permitted.
- **Environmental and space-weather sources**, such as meteorological, astronomical, or atmospheric context feeds used for false-positive reduction.
- **Geospatial reference sources**, such as terrain, administrative boundary, or public infrastructure data used to contextualise events.

This classification should be recorded for each source so that downstream consumers understand whether the source contributes primary evidence, supporting context, or exclusionary baseline data.

## Standard intake workflow

Every proposed source should move through the following workflow:

1. **Discovery and legal review.** Confirm that the source is legitimate, public, and suitable for the repository's mission.
2. **Access review.** Document the API, feed, bulk-download endpoint, or publication mechanism and capture its operational constraints.
3. **Schema review.** Identify how the source fields map into the canonical UAP event model and what information cannot be represented directly.
4. **Provenance review.** Define how source identifiers, timestamps, licensing, and collection method will be preserved.
5. **Operational review.** Determine polling cadence, retry policy, rate limiting, and acceptable failure modes.
6. **Publication review.** Decide whether raw source material, transformed records, derived metadata, or only links should be exposed publicly.

No government source should move to implementation before these six concerns are documented.

## Required metadata for each source

Every integrated source should be documented with the following metadata, whether the eventual implementation is data-driven or code-driven:

- source name;
- owning agency or institution;
- jurisdiction;
- access URL or API base;
- authentication requirements;
- usage restrictions or license terms;
- polling or refresh expectations;
- record format;
- canonical schema mapping summary;
- provenance fields preserved verbatim;
- publication constraints;
- maintainer or review owner.

## Mapping expectations

Source mappings should be expressed declaratively wherever possible. The preferred model is to record field-level mappings, transformation rules, constant values, and provenance handling in data files under `data-schemas/` rather than embedding source-specific logic throughout the ingestion worker.

When a source cannot be mapped cleanly to the canonical contract, contributors should document whether the gap requires:

- a schema extension;
- a lossy but acceptable transformation;
- a source-specific enrichment stage;
- or rejection of the source until the data model is revised.

## Provenance and confidence handling

Government data often carries institutional weight that may not reflect evidentiary certainty. Downstream representations should preserve the distinction between source authority and event confidence. A record can originate from a credible agency while still containing incomplete, low-confidence, or unverified observations.

To support that distinction, integrations should preserve source citations, acquisition timestamps, original record identifiers, and any source-provided confidence or disposition markers.

## Recommended initial source families

As the implementation evolves, maintainers may prioritise source families such as:

- declassified national archives and records portals;
- official UAP or anomaly reporting releases where available;
- civil aviation safety publications and incident databases;
- meteorological and astronomical context feeds;
- public geospatial reference datasets useful for terrain and line-of-sight analysis.

These examples are directional rather than exhaustive. The admissibility of any specific source still depends on legal review and operational suitability.

## Change management

Government sources change frequently. Endpoints move, publication formats drift, and access policies tighten or relax over time. For that reason, every integration should be reviewed periodically, and every source definition should be written so that a maintainer can disable or replace it without disturbing unrelated ingestion paths.

## Final note

This document establishes the repository's expected discipline for government-source integration. It is intended to reduce ambiguity, improve provenance quality, and ensure that data-source growth remains aligned with the project's legal and scientific standards.

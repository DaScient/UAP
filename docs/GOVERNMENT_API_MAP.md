# Government API Map

## Purpose

This document provides a contributor-facing scaffold for integrating public, lawfully accessible government-originated UAP and adjacent data sources into the platform. It is designed to make onboarding repeatable, legally reviewable, and contract-driven.

## Global source onboarding workflow

When adding a new national or institutional source, contributors should follow this sequence.

### Step 1. Confirm legal access

Document the source owner, the publication or API URL, the governing terms of use, any licensing restrictions, and whether redistribution is allowed. Do not continue if lawful public access is unclear.

### Step 2. Record operational details

Document authentication requirements, rate limits, response format, pagination behaviour, and historical backfill limits.

### Step 3. Map to the canonical contract

Identify how source fields map into `data-schemas/telemetry.proto`. Record timestamp format, coordinate model, source identifiers, attachments, classification labels, and provenance fields.

### Step 4. Preserve provenance

Capture the original source identifier, acquisition timestamp, source URL, and any declared confidence or disposition fields. Government authority should not be conflated with evidentiary certainty.

### Step 5. Add the source to the cross-map dictionary

Extend `data-schemas/cross_map_dictionary.json` with the source name, stream kind, source endpoint, field map, and post-map rules.

### Step 6. Add implementation hooks

Create or extend the ingestion worker logic required to pull, normalise, and validate the source. Avoid bespoke one-off transformations where declarative mappings are sufficient.

### Step 7. Update documentation and tests

Document any special handling rules, publication limits, and required retention or redaction rules. Add representative tests where appropriate.

---

## Template for a new nation's API

Use the following blank scaffold when proposing a new source.

### Source name

- **Country or institution:**
- **Owning agency:**
- **Access URL:**
- **Authentication model:**
- **Public data status:**
- **Terms or license reference:**
- **Supported record types:**
- **Historical backfill availability:**
- **Canonical mapping summary:**
- **Publication constraints:**
- **Maintainer contact or review owner:**

### Contributor checklist

1. Verify that the endpoint is public and legally reusable.
2. Record authentication and quota requirements.
3. Capture example payloads for mapping work.
4. Map all required fields to `UapEvent`.
5. Preserve original record identifiers and provenance metadata.
6. Add cross-map dictionary entries.
7. Add or update ingestion worker code.
8. Document any national legal or policy caveats.

---

## Initial source entry: AARO (USA)

### Overview

- **Country or institution:** United States
- **Owning agency:** All-domain Anomaly Resolution Office (AARO)
- **Source category:** Government-originated UAP disclosures and associated historical materials where publicly released
- **Expected access pattern:** Public website content, declassified historical document references, and any future formal APIs or bulk-download endpoints

### Setup guidance

1. Confirm whether AARO offers an official public API, bulk feed, or only web-published documents at the time of integration.
2. If an API key is required, obtain it through the official registration or developer-access path published by the source owner.
3. Store the key only in deployment secrets or local environment variables. Never commit credentials into the repository.
4. Document base URLs, rate limits, and allowed use in the source metadata.
5. Establish a historical backfill job that pulls only records that are explicitly public or declassified.
6. Preserve the original publication URL, release date, record identifier, and any official case disposition fields.
7. Map the source fields into `UapEvent`, leaving fields empty rather than fabricating values when the source is incomplete.
8. Apply the legal-compliance screening in `docs/LEGAL_COMPLIANCE.md` before enabling publication or redistribution.

### Historical data pull sequence

1. Identify the official archive or release index for declassified or publicly released records.
2. Download only those records whose public status is explicit.
3. Store raw artifacts in object storage with provenance metadata.
4. Extract timestamps, geospatial references, classification labels, attachments, and narrative text.
5. Map them into the canonical schema and preserve any ambiguity in a provenance or notes field rather than flattening it away.
6. Re-run the ingestion pipeline only against explicit public releases as the source archive evolves.

---

## Additional source placeholders

### GEIPAN (France)

- Public aviation and anomaly-reporting source placeholder.
- Add legal basis, endpoint details, mapping notes, and publication constraints here.

### CEFAA (Chile)

- Public Chilean source placeholder.
- Add authentication, acquisition workflow, mapping notes, and operational caveats here.

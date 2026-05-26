# Legal Compliance and Data Ethics Guide

## Purpose

This guide defines the legal, ethical, and operational rules for contributors who wish to submit data, connect new sources, or expand the platform's ingestion capabilities. Because the repository may interact with sensitive aerospace, defence-adjacent, geospatial, or government-originated information, contributors must treat compliance as a mandatory entry condition for participation.

This document is a project policy baseline and not a substitute for legal advice. If a source, dataset, or operational idea raises material uncertainty, implementation must pause until a responsible maintainer or qualified advisor reviews it.

## Core rule

No contributor may submit or integrate material that is plausibly classified, export-controlled, unlawfully obtained, or redistributed in violation of applicable law, source terms, or public-interest obligations.

## Submission screening procedure

Every proposed dataset, file collection, API integration, media archive, or witness submission workflow should be screened using the following sequence before code is merged or data is published.

### 1. Provenance verification

Contributors must identify the origin of the material and document how it was acquired. If the acquisition path cannot be explained clearly, the material must be rejected.

Minimum provenance questions:

- Who created or published the material?
- Where was it obtained?
- Under what terms is it made available?
- Does the contributor have a lawful right to provide it to this project?
- Is the material public, licensed, permitted, or merely leaked?

Any material described as leaked, unofficially obtained, anonymously sourced from restricted systems, or copied from access-controlled environments must be rejected.

### 2. Export-control screening

Contributors must review whether the material could plausibly contain data subject to export-control regimes such as ITAR or EAR.

Reject or escalate immediately if the submission includes or appears to include:

- technical data about defence articles, weapons systems, guidance systems, targeting systems, propulsion, or military sensor packages;
- controlled schematics, engineering drawings, performance envelopes, or subsystem specifications;
- integration details for military avionics, radar, SIGINT, EW, or ISR platforms;
- source documents marked with export-control legends, distribution statements, or restrictions on foreign access;
- datasets whose release status is unclear but whose content appears to describe controlled defence capabilities.

If a contributor is not certain whether a submission may be ITAR- or EAR-controlled, the correct action is to stop and escalate rather than guess.

### 3. Classification and restricted-marking screening

Contributors must inspect source material for markings that indicate classified or otherwise restricted handling. Examples include classification banners, dissemination controls, caveats, handling notices, or watermarks.

Reject and escalate any submission containing indicators such as:

- `CONFIDENTIAL`, `SECRET`, `TOP SECRET`, or equivalent national security labels;
- caveats such as `NOFORN`, `FOUO`, `CUI`, `REL TO`, `ORCON`, or comparable national markings;
- document watermarks, footer legends, or cover-page notices indicating restricted dissemination;
- scan artefacts showing redaction patterns suggestive of partial release paired with unofficial reconstruction;
- internal routing stamps, access-control identifiers, or repository paths suggesting non-public systems.

The project must never attempt to “clean,” redact around, or normalise restricted markings in order to make a dataset acceptable. Material is either demonstrably lawful and public, or it is not accepted.

### 4. Unlawfully obtained defence or government data

Contributors must reject data that appears to come from unauthorised disclosures, compromised networks, scraped restricted portals, or contractual sources that do not permit redistribution.

Immediate rejection conditions include:

- claims that the material was copied from military, intelligence, or contractor systems without authorisation;
- records downloaded with personal credentials from portals that prohibit redistribution;
- material obtained through hacking, credential sharing, scraping against source terms, or insider disclosure;
- defence imagery, telemetry, or documentation with no verifiable public release chain.

### 5. Privacy and safety screening

The platform may receive witness submissions or media containing personal data. Contributors must minimise personally identifiable information and must not publish names, direct contact details, or precise home locations unless there is a clear lawful basis and explicit permission.

The default expectation is data minimisation, provenance preservation, and careful redaction.

## Required rejection workflow

If any of the above screens fail, the contributor or reviewer must:

1. stop processing immediately;
2. avoid copying the material into new files, commits, or issue comments;
3. notify a maintainer with a minimal description of the concern;
4. avoid public discussion of sensitive content while the review is pending;
5. permanently reject the material if lawful public status cannot be established.

The repository must not become a laundering path for dubious or restricted data simply because it is technically possible to ingest it.

## Contributor code of conduct for data ethics

Every contributor is expected to follow these ethical rules:

- act in good faith and preserve scientific integrity;
- distinguish between evidence, inference, and speculation;
- avoid sensational framing that overstates the evidentiary value of a record;
- protect witness privacy and avoid doxxing, coercive outreach, or intrusive collection;
- preserve provenance and source context for every transformed record;
- avoid introducing integrations that encourage scraping, unlawful acquisition, or evasive access patterns;
- report legal or ethical uncertainty early rather than proceeding optimistically.

## Open-source contribution expectations

Before submitting a pull request that adds a source, connector, or ingestion path, contributors should document:

- the legal basis for access and reuse;
- any source license or terms-of-use constraints;
- the provenance chain of the records;
- the mapping path into the canonical schema;
- whether any personal, defence-adjacent, or restricted information may be present;
- the proposed redaction, retention, and publication approach.

## Enforcement posture

Maintainers may reject any submission that creates meaningful legal, ethical, or reputational risk, even if the contributor believes the material is already public. The burden of demonstrating lawful and appropriate use rests with the contributor proposing the integration.

## Final note

The mission of the project is public-interest analysis grounded in traceable evidence and responsible engineering. That mission is incompatible with classified content, export-controlled material, and unlawfully obtained defence data.

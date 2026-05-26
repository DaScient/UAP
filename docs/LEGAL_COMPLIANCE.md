# Legal Compliance Guidance

## Purpose

This document defines the legal and ethical baseline for collecting, ingesting, processing, and publishing UAP-related data within this repository and any downstream deployments derived from it. The project is intended to support legitimate research, public-interest transparency, and responsible data stewardship. It is not intended to facilitate surveillance abuse, unlawful data acquisition, or the publication of material that would place contributors, witnesses, or third parties at avoidable risk.

## General compliance principles

All contributors should treat legal compliance as a design constraint rather than an after-the-fact review activity. Every ingestion path, storage workflow, and publication feature should be evaluated against the laws and regulations that govern the jurisdiction in which the data is collected, processed, stored, and displayed.

Contributors should assume that at least four categories of law may apply:

1. privacy and personal data protection law;
2. copyright and database-right restrictions;
3. terms-of-service and API licensing restrictions;
4. export control, national security, and public-records limitations.

If there is any reasonable doubt about whether a proposed data source may be collected or redistributed, the data source should not be integrated until the concern has been resolved.

## Personal data and witness protection

Witness submissions and observational records may contain names, contact details, precise home locations, device identifiers, or other information that can directly or indirectly identify an individual. Contributors must minimise the collection of personally identifiable information and must not publish such information unless there is a clear legal basis and explicit permission to do so.

At minimum, the implementation should be designed to support the following practices:

- separation of public event data from private contact data;
- redaction or generalisation of exact residential coordinates where appropriate;
- retention limits for raw witness-submitted material;
- deletion or correction workflows for submitted data;
- auditability of moderation and publication decisions.

If the platform later accepts submissions from jurisdictions subject to GDPR, UK GDPR, CCPA, or similar laws, maintainers should ensure that the deployed system includes appropriate notices, lawful-processing justifications, and subject-rights handling procedures.

## Government and public-sector data

Government-originated records may be public, restricted, licensed, delayed, or partially releasable depending on the issuing authority. Contributors must verify the legal status of each source before ingesting it. A source should not be treated as freely reusable merely because it is publicly reachable on the internet.

Before integrating a government source, verify:

- whether the records are public-domain, open-licensed, or otherwise redistributable;
- whether rate limits, attribution rules, or downstream-use conditions apply;
- whether the material contains sensitive infrastructure, defence, or personal information;
- whether republication creates additional legal or ethical risk beyond linking to the source.

## Third-party content and media

Images, videos, PDFs, and article excerpts may be protected by copyright even when they are widely circulated. The platform should prefer linking, metadata extraction, or permission-based use over wholesale republication where rights are uncertain.

Where content is ingested for analysis rather than publication, the storage and display model should still be reviewed for compliance with applicable law and platform terms. Internal availability to contributors does not eliminate copyright or licensing obligations.

## API and terms-of-service compliance

Every automated integration must respect the terms of the source system. Contributors must not bypass authentication boundaries, scrape prohibited content, evade rate limits, or misrepresent the project as an official government or institutional endpoint.

Proposed integrations should document:

- the source owner and access method;
- any formal API terms or data-use policy;
- authentication and quota expectations;
- whether redistribution is permitted or restricted;
- what attribution text, if any, must accompany downstream publication.

## Security and operational handling

Compliance also depends on secure handling. Sensitive source credentials, unpublished datasets, and internal moderation notes must not be committed to the repository. Deployments should use standard secret-management practices and should enforce least-privilege access to administrative tooling.

If the project later processes privileged or embargoed datasets, those datasets should be isolated from public publication workflows and governed by separate operational controls.

## Moderation and misinformation risk

Because UAP-related material can attract sensational or misleading claims, maintainers should ensure that publication layers distinguish clearly between raw reports, machine-generated classifications, analyst annotations, and verified evidence. The platform should not present speculative conclusions as established fact.

Where possible, public displays should preserve provenance, confidence indicators, and caveats so that consumers understand the evidentiary quality of each record.

## Contributor expectations

By contributing to this repository, contributors are expected to:

- use only data they are lawfully permitted to submit or process;
- avoid adding integrations with unclear legal status;
- preserve provenance and attribution requirements;
- escalate material legal uncertainty before implementation or publication;
- prioritise witness safety and privacy over dataset completeness.

## Final note

This document is a project-level compliance baseline, not legal advice. If a proposed integration, workflow, or publication path raises material legal uncertainty, the work should pause until a qualified advisor or responsible maintainer has reviewed the issue.

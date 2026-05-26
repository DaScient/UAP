# Data Schemas

This directory is reserved for the canonical schema definitions and declarative mapping artefacts that bind the platform together.

Protocol Buffers are expected to define the shared event contract consumed by every service. Additional data-driven mapping files may live alongside those schemas so that external sources can be normalised into the canonical model without proliferating one-off parsing branches throughout the codebase.

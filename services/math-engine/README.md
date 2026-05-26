# Math Engine

This directory is reserved for the numerically stable geometry and intercept engine that underpins triangulation, parallax, and spatial reconstruction features.

The math engine is expected to be implemented in Rust and compiled to WebAssembly where appropriate. This design allows the same trusted mathematical routines to be used in controlled backend workflows and in browser-based visual reconstruction tools. The long-term goal is to make this module the authoritative home for deterministic calculations that must not drift across implementations.

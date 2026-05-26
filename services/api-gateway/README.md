# API Gateway

This directory is reserved for the high-throughput gateway that will sit between external clients and the platform's downstream processing services.

The API gateway is expected to be implemented in Go. Its responsibilities should include request validation, upload intake, service-to-service coordination, canonical schema enforcement, and routing for collaborative triangulation workflows. As the repository matures, this service should remain deliberately thin: it should orchestrate, validate, and expose interfaces, but it should avoid owning independent domain models that diverge from the shared schema contract.

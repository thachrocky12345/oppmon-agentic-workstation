# Data flow tactics

- Trace requests from entry points to services, then to persistence layers.
- Identify authoritative data sources vs. derived or cached values.
- Note how data is validated, transformed, and serialized across boundaries.
- Capture side effects (notifications, payments, external calls) explicitly.
- Confirm token/session handling and retry logic for network calls.

Hints / next steps: Add a small sequence diagram or call chain list when flow is complex.

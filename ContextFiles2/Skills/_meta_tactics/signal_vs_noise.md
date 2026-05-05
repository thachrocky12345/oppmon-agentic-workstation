# Signal vs. noise tactics

- De-prioritize tests, samples, and generated code until core flow is mapped.
- Validate “unused” code before ignoring it; check for reflection or config wiring.
- Prefer recent, actively referenced modules over legacy folders.
- Be cautious with vendor or build artifacts; treat them as noise by default.
- Confirm main execution path before discarding alternative entry points.

Hints / next steps: Keep a short “ignored paths” list so future work is consistent.

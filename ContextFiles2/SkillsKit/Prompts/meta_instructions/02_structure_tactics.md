# Structure Discovery Tactics

Once you know where execution begins, you need to infer the architecture. Use these heuristics:

- Study the folder layout and namespaces. Conventional names such as `Controllers`, `Services`, `Repositories`, `Models` and `Views` often indicate layers in the system. Namespaces mirror this structure.
- Look for cross cutting concerns such as logging, configuration or security. These often live in dedicated folders or projects and reveal global patterns.
- Identify whether the system is monolithic or composed of separate modules. Independent projects with clear boundaries suggest a modular design. A single large project with mixed responsibilities may indicate a monolith.
- Watch for partial rewrites. Coexistence of VB.NET and C#, or both WebForms and MVC, suggests that new code was layered alongside legacy code. Note the seams between these parts.
- Examine references and coupling. Projects that depend on many others or that are referenced from everywhere can be hotspots. Use call graphs or dependency diagrams to visualise the connections.
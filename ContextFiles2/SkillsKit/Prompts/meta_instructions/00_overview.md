# Overview: Meta Tactics Aggregation

This folder contains instructions for a post‑run consolidation process that captures how you analysed and navigated a codebase. After you finish a full project analysis and produce skill style markdown files, run this meta process. Its purpose is to extract the tactics, heuristics and working patterns you used so that future agents can repeat your success on a different .NET or VB.NET system.

Treat this as an internal playbook rather than documentation of the business logic. The next agent should read these files before starting the aggregation pass. They explain how to identify entry points, discover architecture, trace data, separate signal from noise, write reusable skill files and avoid common mistakes.

During this pass you will create a duplicate of the skills directory under a new folder (for example `ContextFiles/Skills/_meta_tactics`). For each tactic group described here, create a markdown file that formalises the tactic. Each file should be concise, actionable and portable. Do not refer to specific business entities. Focus on the method rather than the subject.

Always iterate and audit yourself. The new set of files should match or exceed the quality of your initial pass. Use the checklist in the meta tactics file to ensure completeness and consistency.

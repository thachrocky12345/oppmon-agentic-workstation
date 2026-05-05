# Self‑Audit and Iterative Improvement

This file describes how to audit your own work and improve the skills you have generated. Use it after you complete the first version of the skill files.

## Audit Checklist

- **Coverage**: Have you documented tactics for all stages of analysis? Check the entry, structure, language, data flow, noise filtering, documentation and error avoidance categories.
- **Portability**: Are your instructions free of business logic and specific names? Replace or generalise any project specific references.
- **Clarity**: Are the instructions clear, imperative and concise? Avoid long paragraphs and ambiguous statements.
- **Consistency**: Do the files use a consistent tone and structure? Each file should start with a heading, use bullet points where appropriate and end with hints or next steps.

## Iteration Process

1. Duplicate the `ContextFiles/Skills` folder into a new folder, for example `ContextFiles/Skills/_meta_tactics`.
2. In the new folder, create markdown files that correspond to the categories above, following the checklist.
3. Compare each new file against the original skill files. Ensure that the new version captures the method rather than the domain.
4. If you identify overlapping or redundant tactics, consolidate them into a single file. Remove duplicates.
5. Test the tactics by applying them to a different .NET or VB.NET codebase. Note any gaps or confusion, then refine the files accordingly.
6. Document any additional insights, such as coverage metrics (how often each tactic proved useful), examples and anti‑examples, or extensions to other languages.
7. Save the updated files and treat them as versioned documentation. When future analyses uncover new patterns, update these files.

By following this self‑audit and iteration process, each generation of skill files becomes more reliable and effective. The goal is to produce a playbook that allows any agent to quickly understand and document a complex system.

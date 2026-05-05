# Signal vs Noise Heuristics

Large codebases contain dead code and artifacts that should be ignored. Use these heuristics to focus on meaningful content:

- Exclude test and sample projects. Folders and project names ending in `.Tests`, `.Test`, `.Sample` or `Demo` usually do not contribute to production behaviour.
- Treat generated code as read only. Files with names ending in `.Designer.vb`, `.Designer.cs`, `.g.i.cs` or similar are auto generated. Review them to understand wiring but do not document them as skills.
- Identify dead or unreachable code. If a class or method has no references, or if build tools mark it as unused, it may be leftover from previous versions. Confirm before discarding by searching for dynamic invocation (reflection) or configuration based wiring.
- Ignore legacy folders that are clearly obsolete. For example, `Old`, `Legacy`, `vb6` or `v1` may contain code that is no longer used. Validate by checking whether the projects compile without them.
- When in doubt, treat the code as noise only after you have traced the main execution path and ensured that removing it does not break the system.
# Error Avoidance and Self‑Correction

Even experienced engineers make mistakes when exploring unfamiliar code. Use these tactics to avoid errors and to correct yourself when you do:

- Validate assumptions. When you think you have found the entry point or a key service, search for references or run the application to confirm. Do not rely on naming alone.
- Compare multiple sources. If configuration files, code and documentation disagree, investigate further. The presence of conflicting patterns often signals a transition phase in the codebase.
- Use static analysis and compiler warnings to identify unused or unreachable code. Do not document a pattern that appears only in dead code.
- Keep notes on potential mistakes you avoided. For example, if you almost confused a test controller for a production one, record that and explain how you caught it.
- When you encounter conflicting signals, explore both paths briefly before choosing. For instance, if two `Sub Main` methods exist, determine which one is referenced in the project settings.
- Review your skill files at the end of the analysis. Ensure that they are accurate, coherent and do not contain outdated insights.
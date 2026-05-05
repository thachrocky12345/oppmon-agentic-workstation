# Data Flow and State Tactics

Understanding how data moves through the system is critical. Use these tactics:

- Start at the entry method (controller action, page handler or form event) and trace calls through services and repositories. Tools like call hierarchy in your IDE or grep can reveal method chains.
- Track how request data is bound to models. In MVC this happens through model binding; inspect the action parameters and validate attributes. In WebForms, controls populate properties on the code behind.
- Follow data access code. Identify repositories or data access classes that call the database through an ORM or raw SQL. Look for methods that call `SaveChanges`, `ExecuteReader` or similar functions.
- Distinguish between authoritative and derived data. Authoritative data is persisted in the database or retrieved from external services. Derived data is computed or cached in memory. Document which layers generate each type to avoid circular dependencies.
- Pay attention to state management. In WebForms, state can live in view state or session variables. In WinForms, state may live in form fields. Note when state is reset or persisted across requests.
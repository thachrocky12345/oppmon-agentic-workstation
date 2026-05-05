# Codebase Entry Tactics

To understand a new .NET or VB.NET system you must locate the true entry points and avoid noise. The following tactics will help:

- Identify the solution and project files first. Use `dotnet sln list` or Visual Studio to list all projects. Look for executable projects (web, service or console) rather than test or sample libraries.
- For web applications, inspect `Program.cs`, `Startup.cs` or `Global.asax` to find the bootstrapping code. In ASP.NET MVC or WebForms projects, the routing configuration or page markup points to controllers and pages that handle requests.
- In VB.NET WinForms applications, search for `Sub Main` in modules and for classes inheriting from `System.Windows.Forms.Form`. The `.Designer.vb` files reveal event hookups and control initialisation.
- Avoid diving into tests, samples or legacy folders until you know the main execution path. Test projects often end with `.Tests` or `.Test`. Sample code may live in folders named `Sample` or `Demo`.
- Note which projects reference each other. Follow dependencies from entry projects to supporting libraries to understand the high level architecture before digging deeper.
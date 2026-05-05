# Onboarding (Breadcrumb)

Summary: Use Node 18+ and Python 3.8.10; set up `.env` files for both repos; install backend deps, migrate, and optionally load fixtures; install frontend deps and run `yarn dev`; backend runs on 8000, frontend on 3000; key commands include `python manage.py test`, `yarn test-all`, and REST/GraphQL base at `/api/v1`.

Links: [Onboarding Guide](../OnboardingGuide.md)

KeyQuestions
- Which env var values are used in each environment (dev/stage/prod)?
- Do we standardize Docker/CI to make setup reproducible?
- Are there seeded demo accounts for quick QA?

NextSteps
- Add sample `.env.local` for RG-Frontend and clarify backend `.env.example` fields.
- Script `python manage.py loaddata` for core fixtures.
- Add CI job to run `yarn test-all` and `python manage.py test`.

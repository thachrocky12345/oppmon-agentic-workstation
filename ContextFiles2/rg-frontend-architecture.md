# RG-Frontend Architecture (Breadcrumb)

Summary: Next.js 13 (pages router) with React 18/TypeScript, MUI/Emotion, Redux Toolkit store, Apollo Client for GraphQL, Axios REST client with JWT interceptor/refresh, and Mixpanel. Routes in `src/pages`, UI in `components`/`containers`, state in `src/store` slices, data helpers in `src/graphql` and `src/restapis`, constants including backend base URL in `src/lib/constants.ts`.

Links: [Architecture - RG-Frontend](../Architecture-RG-Frontend.md)

KeyQuestions
- Are we standardizing on Redux only or also keeping Zustand/legacy slices?
- What is the authoritative auth flow (token storage/expiry UX)?
- Where should tests live when added (colocated vs. `__tests__`)?

NextSteps
- Document `.env.local` variables with examples and defaults.
- Add Jest/RTL setup and smoke tests for key pages/hooks.
- Consolidate duplicate Apollo client setups and clean unused dependencies.

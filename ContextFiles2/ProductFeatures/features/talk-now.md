# Feature: Talk Now

## Purpose
- Inferred from code: flag/filter to surface providers who are currently available for immediate sessions ("Talk Now").

## User journey / key actions
- Client filters or clicks "Talk Now" in provider schedule/filters to show only currently available providers.
- Provider availability is marked via `is_talk_now` in provider data.

## Glossary / UI terms
- Talk Now
- Show Only Available

## Entry points
- Screens/routes: `RG-Frontend/src/containers/cp-detail-preview/cp-schedule/cp-schedule.tsx`, `RG-Frontend/src/mixPanelEvents/navigation.ts`, `RG-Frontend/src/mixPanelEvents/careProvider.ts`
- API/GraphQL: `Lumy-Backend/apps/care_provider/queries.py`, `Lumy-Backend/apps/serp_result/queries.py`, `Lumy-Backend/apps/care_provider/mutations.py`

## Data entities
- `Lumy-Backend/apps/care_provider/models.py` (`is_talk_now`)

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/List of Features.txt

## Technical mapping
- [Technical doc](../technical/talk-now-technical.md)

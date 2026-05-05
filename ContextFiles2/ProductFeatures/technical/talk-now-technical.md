# Technical: Talk Now

## Screens / routes
- `RG-Frontend/src/containers/cp-detail-preview/cp-schedule/cp-schedule.tsx`
- `RG-Frontend/src/mixPanelEvents/navigation.ts`
- `RG-Frontend/src/mixPanelEvents/careProvider.ts`

## Frontend components/modules
- `RG-Frontend/src/containers/cp-detail-preview/cp-schedule/cp-schedule.tsx`
- `RG-Frontend/src/containers/landing-screen/sub-header/index.tsx` (talk-now CTA tracking)

## Backend apps/modules
- `Lumy-Backend/apps/care_provider/`
- `Lumy-Backend/apps/serp_result/`

## APIs / GraphQL operations
- `Lumy-Backend/apps/care_provider/queries.py` (`is_talk_now` filter, `talk_now` payload)
- `Lumy-Backend/apps/serp_result/queries.py` (`is_talk_now` filter)
- `Lumy-Backend/apps/care_provider/mutations.py` (updates `is_talk_now`)

## Key files and directories
- `Lumy-Backend/apps/care_provider/models.py` (`is_talk_now` field)
- `Lumy-Backend/apps/care_provider/object_types.py` (`talk_now` JSON field)

## Tests
- Not found in repo. Search evidence: `rg -n "talk_now|talk now|is_talk" Lumy-Backend/apps -g '*test*'` (0 matches)

## Config / env
- `Lumy-Backend/lumy_global/settings.py`

## Known risks / open questions
- Not found in repo. Search evidence: `rg -n "Open Questions|Risks" ContextFiles/HumanDocuments/Features/_extracted/List of Features.txt` (0 matches)

## Source docs
- ContextFiles/HumanDocuments/Features/_extracted/List of Features.txt

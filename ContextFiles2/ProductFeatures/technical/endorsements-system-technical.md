# Endorsements System — Technical

## Architecture
- **App**: `Lumy-Backend/apps/endorsement/`
- **API**: REST only (no GraphQL mutations/queries)
- **Frontend**: Page + containers + Redux slice

## Models (`apps/endorsement/models.py`)

| Model | Purpose | Key Fields |
|---|---|---|
| `BaseModel` | Abstract base (created_at, updated_at) | timestamps |
| `Endorsement` | Endorsement record | endorser (FK → User), endorsed (FK → User), text, is_active |

## REST API (`apps/endorsement/urls.py`, `views.py`, `serializers.py`)

- CRUD operations for endorsements
- Filtering by endorser and endorsed user
- Serializer handles User FK resolution for display

## Frontend

| File/Directory | Purpose |
|---|---|
| `src/pages/endorsements/index.tsx` | `/endorsements` route — manage endorsements |
| `src/containers/Endorsements/` | Endorsement management container |
| `src/containers/cp-detail-preview/cp-endorsement/` | Endorsement display on provider profile |
| `src/store/slices/endorsementSlice.ts` | Redux state management |

## Data Flow
1. Provider submits endorsement via REST API
2. Endorsement stored with endorser/endorsed FKs
3. Provider profile page fetches endorsements for display
4. `cp-detail-preview/cp-endorsement/` renders endorsement cards
5. Endorsement management page shows given/received endorsements

## Seed Data
- `seed_complete_dev.py` creates 10 endorsements between providers
- See [SeedData/pipeline-architecture.md](../../Docs/SeedData/pipeline-architecture.md)

## Testing
- Test directory: `apps/endorsement/tests/`

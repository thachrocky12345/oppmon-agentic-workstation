# Team Management — Technical

## Architecture
- **App**: `Lumy-Backend/apps/my_teams/`
- **API**: REST only (no GraphQL mutations/queries)
- **Frontend**: Page + containers + component + Redux slice

## Models (`apps/my_teams/models.py`)

| Model | Purpose | Key Fields |
|---|---|---|
| `BaseModel` | Abstract base (created_at, updated_at) | timestamps |
| `MyTeam` | Client-provider team pairing | client (FK → User), provider (FK → User), is_active |

## REST API (`apps/my_teams/urls.py`, `views.py`, `serializers.py`)

- CRUD operations for team relationships
- Filtering by client and provider
- List client's team members
- List provider's team connections

## Frontend

| File/Directory | Purpose |
|---|---|
| `src/pages/my-team/index.tsx` | `/my-team` route — team management page |
| `src/containers/MyTeam/` | Team management container |
| `src/containers/cp-detail-preview/my-care-team/` | Care team display on provider profile |
| `src/components/TeamTable/` | Team data table component |
| `src/store/slices/teamSlice.ts` | Redux state management |

## Data Flow
1. Client adds provider to team via REST API
2. MyTeam record created with client/provider FKs
3. Client's `/my-team` page fetches team list
4. Provider profile page fetches team connections for display
5. `TeamTable` component renders team data in tabular format

## Seed Data
- `seed_complete_dev.py` creates 5 team pairings between clients and providers
- See [SeedData/pipeline-architecture.md](../../Docs/SeedData/pipeline-architecture.md)

## Testing
- Test directory: `apps/my_teams/tests/`

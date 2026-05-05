# Team Management

## Overview
Care team management feature that allows clients to build a personal team of providers. Clients add providers to "My Team" for easy access. Providers see which clients have them on their team. Teams are displayed on provider profile pages, showing the provider's care team connections.

## User Journey

### Client Flow
1. Client browses provider profiles
2. Client clicks "Add to My Team" on a provider's profile
3. Provider added to client's team list at `/my-team`
4. Client can view, manage, and remove team members
5. Team provides quick access to booking and messaging with familiar providers

### Provider Flow
1. Provider logs in and sees team relationship notifications
2. Provider profile page shows "My Care Team" section with team connections
3. Team relationships signal ongoing client engagement

## Glossary
| Term | Definition |
|---|---|
| MyTeam | A client-provider pairing representing an ongoing care relationship |
| Care Team | The collection of providers a client has added to their team |

## Data Entities
| Entity | Model | Key Fields |
|---|---|---|
| MyTeam | `my_teams.MyTeam` | client (FK → User), provider (FK → User), created_at |

## Entry Points
- **Backend**: `Lumy-Backend/apps/my_teams/`
- **Frontend page**: `/my-team` (`RG-Frontend/src/pages/my-team/index.tsx`)
- **Frontend containers**: `containers/MyTeam/`, `containers/cp-detail-preview/my-care-team/`
- **Frontend component**: `components/TeamTable/`
- **Redux**: `teamSlice`
- **API**: REST endpoints via `apps/my_teams/urls.py`

## Related Features
- [Client Profiles](client-profiles.md) — team is part of client's profile
- [Provider Profiles](provider-profiles.md) — team displayed on provider profile
- [Endorsements System](endorsements-system.md) — related social feature
- [Scheduling & Appointments](scheduling-appointments.md) — team provides shortcut to booking

## Module
[client-portal](../modules/client-portal.md)

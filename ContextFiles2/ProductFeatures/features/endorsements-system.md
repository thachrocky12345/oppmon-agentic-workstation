# Endorsements System

## Overview
Provider-to-provider endorsement system that allows care providers to publicly endorse colleagues. Endorsements appear on provider profile pages as trust signals, helping clients evaluate providers based on peer recommendations.

## User Journey
1. Provider views another provider's profile
2. Provider clicks "Endorse" and writes endorsement text
3. Endorsement is saved and immediately visible on the endorsed provider's public profile
4. Clients browsing provider profiles see endorsement cards in the endorsement section
5. Providers can manage received and given endorsements from `/endorsements` page

## Glossary
| Term | Definition |
|---|---|
| Endorsement | A public recommendation from one provider to another |
| Endorser | The provider writing the endorsement |
| Endorsed | The provider receiving the endorsement |

## Data Entities
| Entity | Model | Key Fields |
|---|---|---|
| Endorsement | `endorsement.Endorsement` | endorser (FK → User), endorsed (FK → User), text, created_at |

## Entry Points
- **Backend**: `Lumy-Backend/apps/endorsement/`
- **Frontend page**: `/endorsements` (`RG-Frontend/src/pages/endorsements/index.tsx`)
- **Frontend containers**: `containers/Endorsements/`, `containers/cp-detail-preview/cp-endorsement/`
- **Redux**: `endorsementSlice`
- **API**: REST endpoints via `apps/endorsement/urls.py`

## Related Features
- [Provider Profiles](provider-profiles.md) — endorsements displayed on profile pages
- [Review System](review-system.md) — related trust/credibility feature (client → provider)
- [Team Management](team-management.md) — related social feature

## Module
[reviews-and-trust](../modules/reviews-and-trust.md)

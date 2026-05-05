# Wiley Treatment Planner

## Overview
Integration with Wiley Practice Planners — standardized clinical treatment planning tools used by therapists and counselors. Provides structured diagnosis selection, goal-setting, intervention planning, objective tracking, and homework assignment capabilities within the provider portal.

## User Journey
1. Provider selects a client for treatment planning
2. Provider searches or browses the Wiley diagnosis library
3. Provider selects relevant diagnoses and presentation patterns
4. System suggests evidence-based goals, objectives, and interventions
5. Provider customizes the treatment plan (add/remove/edit items)
6. Provider assigns homework to client
7. Treatment plan is saved and associated with the client record

## Glossary
| Term | Definition |
|---|---|
| Planner | A complete treatment plan document for a client |
| Diagnosis | Clinical diagnosis from the Wiley library (e.g., DSM-5 categories) |
| BehavioralDefinition | Observable behaviors associated with a diagnosis |
| PresentationGroup | Grouping of presentation patterns (symptoms/behaviors) |
| Goal | High-level treatment goal tied to a diagnosis |
| Objective | Measurable objective under a goal |
| Intervention | Clinical intervention technique |
| Homework | Structured assignment for the client between sessions |
| Problem | Clinical problem statement |

## Data Entities
| Entity | Model | Purpose |
|---|---|---|
| Planner | `wiley.Planner` | Root treatment plan document |
| Diagnosis | `wiley.Diagnosis` | Clinical diagnosis entry |
| BehavioralDefinition | `wiley.BehavioralDefinition` | Observable behavior for a diagnosis |
| PresentationGroup | `wiley.PresentationGroup` | Symptom/behavior grouping |
| PresentationNotes | `wiley.PresentationNotes` | Notes on presentation patterns |
| Goal | `wiley.Goal` | Treatment goal |
| Objective | `wiley.Objective` | Measurable objective under a goal |
| Intervention | `wiley.Intervention` | Clinical intervention technique |
| InterventionNotes | `wiley.InterventionNotes` | Notes on interventions |
| ObjectiveIntervention | `wiley.ObjectiveIntervention` | M2M linking objectives to interventions |
| Problem | `wiley.Problem` | Clinical problem statement |
| ProblemGroup | `wiley.ProblemGroup` | Grouping of related problems |
| Homework | `wiley.Homework` | Client homework assignment |
| HomeworkProblem | `wiley.HomeworkProblem` | Problem-homework linkage |

## Entry Points
- **Backend**: `Lumy-Backend/apps/wiley/`
- **Frontend page**: `/wiley` (`RG-Frontend/src/pages/wiley/index.tsx`)
- **Frontend component**: `RG-Frontend/src/components/Wiley/`
- **API**: REST endpoints via `apps/wiley/urls.py`

## Related Features
- [Provider Profiles](provider-profiles.md) — treatment plans linked to provider-client relationships
- [Video Sessions (Twilio)](video-sessions-twilio.md) — treatment plans used during sessions
- [Session Notifications](session-notifications.md) — homework reminders

## Module
[provider-portal](../modules/provider-portal.md)

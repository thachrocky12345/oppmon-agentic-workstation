# Wiley Treatment Planner — Technical

## Architecture
- **App**: `Lumy-Backend/apps/wiley/`
- **API**: REST only (no GraphQL mutations/queries)
- **Models**: 16 models covering the full Wiley treatment planning data structure
- **Frontend**: Page at `/wiley`, component at `src/components/Wiley/`

## Models (`apps/wiley/models.py`)

| Model | Purpose | Key Relationships |
|---|---|---|
| `Planner` | Root treatment plan | FK → User (provider), FK → Client |
| `Planner_2` | Alternative planner version | FK → User |
| `Diagnosis` | Clinical diagnosis | M2M ↔ BehavioralDefinition |
| `BehavioralDefinition` | Observable behaviors | M2M ↔ Diagnosis |
| `PresentationGroup` | Symptom grouping | FK → Diagnosis |
| `PresentationNotes` | Presentation notes | FK → PresentationGroup |
| `Goal` | Treatment goal | FK → Diagnosis |
| `Objective` | Measurable objective | FK → Goal |
| `Intervention` | Clinical intervention | M2M ↔ Objective (via ObjectiveIntervention) |
| `Intervention_2` | Alternative intervention model | FK → Goal |
| `InterventionNotes` | Intervention notes | FK → Intervention |
| `ObjectiveIntervention` | Objective-Intervention junction | FK → Objective, FK → Intervention |
| `Problem` | Clinical problem statement | FK → Planner |
| `ProblemGroup` | Problem grouping | FK → Diagnosis |
| `Homework` | Client homework | FK → Planner |
| `HomeworkProblem` | Problem-homework junction | FK → Homework, FK → Problem |

## REST API (`apps/wiley/urls.py`, `views.py`, `serializers.py`)

Full CRUD via DRF ViewSets:
- Planner CRUD
- Diagnosis lookup/search
- Goal/Objective/Intervention management
- Homework assignment and tracking

## Key Files
| File | Purpose |
|---|---|
| `apps/wiley/models.py` | 16 model definitions |
| `apps/wiley/views.py` | DRF views |
| `apps/wiley/serializers.py` | DRF serializers |
| `apps/wiley/urls.py` | URL routing |
| `apps/wiley/admin.py` | Admin registration |
| `apps/wiley/tests.py` | Tests |
| `RG-Frontend/src/pages/wiley/index.tsx` | Page route |
| `RG-Frontend/src/components/Wiley/` | UI components |

## Data Flow
1. Wiley clinical library data loaded into Diagnosis, BehavioralDefinition, etc.
2. Provider creates Planner for a client
3. Provider selects diagnoses, goals, interventions from library
4. System creates ObjectiveIntervention linkages
5. Provider assigns Homework via HomeworkProblem junctions
6. Client receives homework assignments

## Notes
- Contains `Planner_2` and `Intervention_2` models suggesting an in-progress schema evolution
- REST-only integration (no GraphQL) — simpler maintenance for clinical content CRUD
- Wiley content is proprietary — fixture data for clinical library not included in dev seed

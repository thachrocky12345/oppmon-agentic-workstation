# Risk Screening

## Overview
Mental health risk assessment questionnaire system that evaluates client safety needs before or during the provider matching process. Configurable question flows with branching logic capture user responses and can trigger safety interventions or route clients to crisis resources.

## User Journey
1. Client encounters a screening trigger (signup, booking, or specific search query)
2. System presents a configurable questionnaire flow
3. Each question may have multiple options with branching paths
4. Responses are recorded and evaluated against risk thresholds
5. Low-risk: continue normal flow (provider matching, booking)
6. High-risk: surface crisis resources (see [suicide-crisis-hotline-pages](suicide-crisis-hotline-pages.md)) and/or flag for review
7. Client can choose to ignore screening and continue (`ClientScreeningIgnore`)

## Glossary
| Term | Definition |
|---|---|
| Flow | A named sequence of questions (e.g., "Initial Screening", "PHQ-9") |
| FlowQuestionSequence | Ordering of questions within a flow, with branching rules |
| QuestionType | Category of question (multiple choice, scale, yes/no, etc.) |
| OptionType | Category of answer option |
| Question | Individual screening question with configurable type |
| QuestionOption | Answer choice for a question, may trigger branching |
| UserResponse | A client's completed screening session |
| ResponseDetail | Individual answer within a UserResponse |

## Data Entities
| Entity | Model | Key Fields |
|---|---|---|
| Flow | `risk_screening.Flow` | name, description, is_active |
| Question | `risk_screening.Question` | text, question_type, flow |
| QuestionOption | `risk_screening.QuestionOption` | text, option_type, question, score |
| UserResponse | `risk_screening.UserResponse` | user, flow, completed_at, risk_level |
| ResponseDetail | `risk_screening.ResponseDetail` | user_response, question, selected_option |

## Entry Points
- **Backend**: `Lumy-Backend/apps/risk_screening/`
- **GraphQL mutations**: `CascadeResponseMutation`, `ClientScreeningIgnoreMutation`
- **Frontend**: Triggered during client flows (onboarding, search)

## Related Features
- [Suicide/Crisis Hotline Pages](suicide-crisis-hotline-pages.md) — crisis resource display
- [Client Onboarding](client-onboarding.md) — screening may be part of onboarding flow
- [Find Matches Survey](find-matches-survey.md) — related survey/questionnaire pattern

## Module
[compliance-and-safety](../modules/compliance-and-safety.md)

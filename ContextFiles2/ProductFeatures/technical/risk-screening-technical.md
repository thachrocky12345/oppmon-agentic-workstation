# Risk Screening — Technical

## Architecture
- **App**: `Lumy-Backend/apps/risk_screening/`
- **API**: GraphQL mutations (via `graphqlapp` schema aggregation)
- **Models**: 8 models covering question definition, flow sequencing, and response capture

## Models (`apps/risk_screening/models.py`)

| Model | Purpose | Key Fields |
|---|---|---|
| `QuestionType` | Enum/lookup for question categories | name |
| `OptionType` | Enum/lookup for option categories | name |
| `Question` | Individual screening question | text, question_type (FK), order |
| `QuestionOption` | Answer choice for a question | text, option_type (FK), question (FK), score, next_question (FK, nullable) |
| `Flow` | Named questionnaire sequence | name, description, is_active |
| `FlowQuestionSequence` | Ordering + branching within a flow | flow (FK), question (FK), sequence_order, is_terminal |
| `UserResponse` | Client's completed screening | user (FK), flow (FK), created_at, is_complete |
| `ResponseDetail` | Individual answer | user_response (FK), question (FK), selected_option (FK) |

## GraphQL

### Mutations (`apps/risk_screening/mutations.py`)
- `CascadeResponseMutation` — Submit screening responses (cascading through flow sequence)
- `ClientScreeningIgnoreMutation` — Client opts to skip/ignore screening

### Schema Registration
Registered in `apps/graphqlapp/schema.py` root Mutation class.

## Key Files
| File | Purpose |
|---|---|
| `apps/risk_screening/models.py` | Model definitions |
| `apps/risk_screening/mutations.py` | GraphQL mutations |
| `apps/risk_screening/views.py` | REST views |
| `apps/risk_screening/urls.py` | URL routing |
| `apps/risk_screening/admin.py` | Admin registration |
| `apps/risk_screening/tests/` | Test directory |

## Data Flow
1. Admin configures Flow + Questions + Options via Django admin
2. Frontend requests flow for current context
3. Client progresses through questions (CascadeResponseMutation per answer)
4. Branching logic follows `next_question` FK on selected option
5. Completed response evaluated for risk level
6. High-risk triggers crisis resource display or intervention

## Testing
- Test directory: `apps/risk_screening/tests/`
- Test mutations with mock flows and question sequences

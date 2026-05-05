# Calendar Integration (External Sync) — Technical

## Architecture
- **App**: `Lumy-Backend/apps/calendar_integration/`
- **API**: REST only (no GraphQL, no models)
- **Pattern**: Stateless integration layer — communicates with external calendar APIs without local model storage

## Files

| File | Purpose |
|---|---|
| `apps/calendar_integration/views.py` | REST views for calendar sync operations |
| `apps/calendar_integration/urls.py` | URL routing |
| `apps/calendar_integration/tests/` | Test directory |

## Key Observations
- **No models.py**: This app does not define its own Django models
- **No serializers.py**: Likely uses raw API communication
- **No GraphQL**: REST-only integration
- Views handle OAuth callbacks and sync triggers
- Sync state may be stored on related models (CareProvider or User) rather than in dedicated models

## Data Flow
1. Provider initiates OAuth connection from frontend
2. Backend redirects to external calendar OAuth (Google, Microsoft)
3. OAuth callback stores refresh token
4. Sync job reads external calendar events
5. Events converted to blocked slots in `calendar_functionality.Slot` model
6. New ReallyGlobal appointments pushed to external calendar via API

## Integration Points
- **Google Calendar API**: OAuth 2.0 + Calendar v3 API
- **Microsoft Graph API**: OAuth 2.0 + Calendar endpoints
- **Slot model**: `calendar_functionality.Slot` used to represent blocked time

## Testing
- Test directory: `apps/calendar_integration/tests/`

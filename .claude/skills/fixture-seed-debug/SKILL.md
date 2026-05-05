---
name: fixture-seed-debug
description: Debug and fix Django fixture loading failures. Use when asked about "fixture errors", "loaddata failed", "seed data broken", "null constraint", or "FK violation".
argument-hint: [fixture-name-or-error-message]
---

# Fixture & Seed Data Debugging

## Common failure patterns

### 1. `null value in column "created_at"` (or `modified_at`)
**Cause**: Model uses `auto_now_add=True` / `auto_now=True`. Django's `loaddata` sets `raw=True` which bypasses these auto-fields, inserting NULL.

**Fix**: Don't use `loaddata`. Create an ORM-based management command:
```python
# apps/<app>/management/commands/seed_<app>.py
from django.core.management.base import BaseCommand
from apps.<app>.models import MyModel

class Command(BaseCommand):
    def handle(self, *args, **options):
        MyModel.objects.update_or_create(pk=1, defaults={...})
```
Use `update_or_create` for idempotency.

**Cannot fix by**: Adding timestamps to fixture JSON — `djmoney`'s deserializer rejects unknown fields, and `auto_now_add` fields have `editable=False`.

### 2. FK constraint violation
**Cause**: Fixtures loaded in wrong order. Child records reference parent PKs that don't exist yet.

**Fix**: Load in dependency order:
```bash
# Parent tables first
python manage.py loaddata fixtures/parent.json
# Then children
python manage.py loaddata fixtures/child.json
```

The entrypoint.sh handles this with multiple passes. See `docker-dev-stack` skill for the full sequence.

### 3. `duplicate key value violates unique constraint`
**Cause**: Data already exists (e.g., re-running loaddata).

**Fix**: Use `--ignorenonexistent` flag or wrap in try/except. For management commands, use `update_or_create`.

### 4. `DeserializationError: field does not exist`
**Cause**: Fixture includes a field name that doesn't match the model (e.g., `updated_at` vs `modified_at`).

**Fix**: Check actual field names:
```bash
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py shell -c "
from apps.<app>.models import MyModel
for f in MyModel._meta.get_fields():
    print(f.name, type(f).__name__)
"
```

### 5. Fixture file has no data / empty list
**Cause**: `dumpdata` ran against empty table.

**Fix**: Populate data via ORM first, then dump:
```bash
python manage.py dumpdata <app>.<Model> --indent 4 > fixtures/<name>.json
```

## Inspecting fixture dependencies
```python
# Show FK relationships for a model
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py shell -c "
from apps.<app>.models import MyModel
for f in MyModel._meta.get_fields():
    if hasattr(f, 'related_model') and f.related_model:
        print(f'{f.name} -> {f.related_model.__name__}')
"
```

## Testing fixture load in container
```bash
# Single fixture
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py loaddata fixtures/<name>.json

# All fixtures (uses entrypoint ordering)
docker compose down -v && docker compose up
```

## Generating missing migrations
```bash
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py makemigrations <app_name>
# Copy to host:
docker cp reallyglobal-backend-1:/app/apps/<app>/migrations/ /c/Projects/ReallyGlobal/Lumy-Backend/apps/<app>/migrations/
# Clean up nested dirs and __pycache__:
rm -rf apps/<app>/migrations/migrations apps/<app>/migrations/__pycache__
```

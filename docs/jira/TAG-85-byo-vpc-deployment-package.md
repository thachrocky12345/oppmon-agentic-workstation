# TAG-85: BYO-VPC Deployment Package + Runbook

## Description

**Suggested Points:** 5
**Type:** Story
**Epic:** [TAG-78](./TAG-78-residency-governance-hardening-epic.md)
**Status:** Open

[ADR-0013](../decisions/ADR-0013-byo-vpc-upgrade-channel.md) locks in the
upgrade-channel shape (semver-pinned, separate security track, no
auto-update) and the **config bundle** structure for BYO-VPC. This story
ships the customer-facing mechanism: a `tag deploy byo-vpc` CLI command
that renders a complete customer stack from a config bundle, plus the
runbook the customer follows to operate it.

## Objective

Ship in `packages/cli/`:

```bash
tag deploy byo-vpc <bundle.yaml>                 # render stack files
tag deploy byo-vpc <bundle.yaml> --dry-run       # render to stdout, no writes
tag deploy byo-vpc <bundle.yaml> --air-gap       # forbid any outbound
                                                 # except customer-pinned LLM
tag check-updates --channel security             # query manifest feed
```

Ship in `docs/runbooks/deployment/`:

- `byo-vpc.md` — the deployment runbook with worked examples for AWS and
  Azure.

## Requirements

### Bundle shape

Take the structure from ADR-0013 verbatim:

```yaml
# byo-vpc-bundle/config.yaml
version: 1
image_tag: v2.3.1
db_dsn_ref: aws-secrets-manager:arn:...
storage:
  type: s3                              # | azure-blob
  region: us-east-1
  bucket_ref: aws-secrets-manager:arn:...
embedding:
  provider: openai-compatible
  base_url: https://customer-embed.example
  api_key_ref: aws-secrets-manager:arn:...
  dim: 1536
llm:
  providers: [anthropic, azure-openai, bedrock]
  keys_ref: aws-secrets-manager:arn:...
telemetry:
  mode: local-only                      # | customer-collector
  collector_url: null                   # required if mode=customer-collector
jwt_secret_ref: aws-secrets-manager:arn:...
air_gap: false                          # toggled via --air-gap flag
```

Validate the bundle with Zod (`packages/cli/src/lib/byo-vpc-schema.ts`).

### Render targets

The command renders the customer's deployment stack as files in a
`./byo-vpc-out/` directory:

- `docker-compose.byo-vpc.yml` (default target)
- `k8s/` directory with Deployment + Service + ConfigMap + Secret refs
  (alternative target via `--target k8s`)
- `swarm/docker-stack.byo-vpc.yml` (alternative target via `--target swarm`)

The rendered files MUST:

- Pin the image tag to the bundle's `image_tag`. Never `:latest`.
- Inject env vars from the bundle (with `_ref` fields resolved at the
  customer's secret manager — emit the indirection, don't try to fetch
  secrets ourselves).
- Set `STORAGE_BACKEND`, `STORAGE_REGION` (TAG-79).
- Set `OPENAI_API_KEY`, `OPENAI_EMBED_API_BASE`, `EMBED_DIM` (TAG-80).
- Set the LLM provider chain (TAG-83).
- Wire JWT_SECRET parity check against `apps/api` and the Python
  service (carried over from TAG-65).

### Air-gap mode

When `--air-gap` is passed:

- Emit a NetworkPolicy (k8s) or compose network config blocking outbound
  except to:
  - the customer's secret manager
  - the customer's pinned LLM endpoint
  - the customer's storage endpoint
  - the customer's embedding endpoint
- Disable the telemetry export (set `telemetry.mode=local-only` if not
  already).
- Add a banner comment at the top of the rendered file noting air-gap
  mode.

### Manifest feed

`tag check-updates --channel security`:

- Fetches a signed JSON manifest from `https://updates.arkon.example/v2/manifest.json`
  (the URL is configurable via `tag config set updates_url ...`).
- Verifies the signature.
- Compares the customer's pinned `image_tag` against the available
  security-track patches.
- Outputs a table of available updates with release-note URLs.

(The actual hosting + signing of the manifest feed is operational work
outside this story's code surface; the CLI side of the contract ships
here.)

### Runbook

`docs/runbooks/deployment/byo-vpc.md` covers:

- Prereqs (k8s/swarm/compose; secret manager; egress allowlist).
- Step-by-step worked example on AWS (S3 + Bedrock + RDS).
- Step-by-step worked example on Azure (Blob + Azure OpenAI + Postgres).
- How to upgrade (pull `v2.x.y-sec.n`, restart, smoke).
- How to roll back.
- How to verify residency post-deploy (the `tag check` smoke).
- What to do when the boot region assertion fires.

## Implementation Notes

- `packages/cli/` already uses Commander + Chalk + Ora. Follow the
  patterns from the existing `tag` commands.
- Templates live under `packages/cli/src/commands/deploy/templates/`.
  Use a simple string-template (e.g. Mustache, already a dep) — do not
  introduce Helm or kustomize.
- The bundle schema is the contract with the customer. Bump the
  `version` field on any breaking change.
- For the signed manifest, use Ed25519 (libsodium / tweetnacl style,
  consistent with `packages/shared` crypto).
- Do NOT fetch the customer's secrets. The CLI emits `_ref` indirections
  and lets the customer's deployment runner resolve them at apply time.

## Tests

| File | Test | Assertion |
|---|---|---|
| `packages/cli/src/commands/deploy/byo-vpc.test.ts` | valid bundle → renders compose | output file exists, has image tag |
| `packages/cli/src/commands/deploy/byo-vpc.test.ts` | `--dry-run` → no writes, stdout only | filesystem unchanged |
| `packages/cli/src/commands/deploy/byo-vpc.test.ts` | `--air-gap` → NetworkPolicy + banner | banner present |
| `packages/cli/src/commands/deploy/byo-vpc.test.ts` | invalid bundle → clear error | exit 1 with line ref |
| `packages/cli/src/commands/deploy/byo-vpc.test.ts` | missing required field → schema error | named field in error |
| `packages/cli/src/commands/deploy/byo-vpc.test.ts` | image_tag `:latest` → reject | "no floating tags" error |
| `packages/cli/src/commands/check-updates.test.ts` | mocked manifest → table output | shows available patches |
| `packages/cli/src/commands/check-updates.test.ts` | bad signature on manifest → reject | clear error, exit 1 |

## Acceptance Criteria

- [ ] `tag deploy byo-vpc --dry-run sample-bundle.yaml` runs cleanly
      against a checked-in sample bundle.
- [ ] All eight CLI tests pass.
- [ ] `docs/runbooks/deployment/byo-vpc.md` exists with both AWS and
      Azure worked examples.
- [ ] No secret VALUES appear in rendered output — only `_ref`
      indirections.
- [ ] `image_tag: latest` is rejected at the schema layer.
- [ ] `--air-gap` mode adds a visible banner to the rendered output and
      disables telemetry export.
- [ ] `docs/residency/architecture.md` "BYO-VPC deployment package" row
      flipped to ✅ with the merged commit SHA.

## Dependencies

**Depends on:**
- [TAG-79](./TAG-79-region-pinned-storage.md) (storage envs the bundle wires)
- [TAG-80](./TAG-80-ts-embedding-baseurl-parity.md) (embedding envs)
- [TAG-83](./TAG-83-azure-bedrock-llm-clients.md) (LLM providers in bundle)
- [TAG-84](./TAG-84-telemetry-redaction-layer.md) (telemetry mode field)

**Blocks:** [TAG-86](./TAG-86-ui-residency-surface.md), regulated-sector pilots

## Risk Factors

| Risk | Mitigation |
|---|---|
| Customer environments vary too widely for a single template | Three target shapes (compose, k8s, swarm) cover the realistic surface; document any customizations in the runbook. |
| The manifest feed URL hard-codes Arkon | `tag config set updates_url` allows the customer to override (useful for staging or for customers running their own mirror). |
| Customer secrets-manager APIs differ (AWS Secrets Manager vs Azure Key Vault vs HashiCorp Vault) | The CLI emits `_ref` strings; the customer's deployment runner resolves them. We don't fetch secrets. |
| Bundle schema drift over time | `version` field is explicit; the CLI rejects unknown versions with an upgrade hint. |
| Air-gap mode customers can't fetch updates | They use `tag check-updates` from an outside-the-airgap workstation and physically move images. This is the explicit operational model — document it in the runbook. |

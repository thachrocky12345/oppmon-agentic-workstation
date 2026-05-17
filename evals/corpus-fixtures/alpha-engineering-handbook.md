# Alpha Co. Engineering Handbook

This handbook covers engineering standards for code review, deployment,
incident response, post-mortems, and observability at Alpha Co. It is
the source of truth for the engineering organization and is updated
quarterly by the Eng Operations team.

## Code Review SLA

All pull requests must receive an initial review within 24 hours during
business days. PRs opened on weekends or holidays start the clock the
following business day. Reviewers are expected to leave at least one
substantive comment per review pass.

## Deployment Approvals

Production deployments require approval from a senior engineer or staff
engineer. Approval is recorded in the PR via a `/approve-deploy` comment.
Hotfixes follow the same rule but may be approved asynchronously.

## Production Incident Response

When a production incident is detected, the alerting system pages the
on-call engineer first. If the on-call does not acknowledge within five
minutes, the secondary on-call is paged. Severity-1 incidents
automatically escalate to the engineering manager.

## Post-Mortem Requirements

A post-mortem document must be filed within five business days after
any Severity-1 or Severity-2 incident. The document must include a
timeline, root cause, contributing factors, and concrete remediation
items with owners.

## Observability Standards

Every service must export Prometheus metrics at `/metrics`. Required
metrics include request rate, error rate, and 95th percentile latency.
Services that do not expose these metrics will fail the pre-production
readiness review.

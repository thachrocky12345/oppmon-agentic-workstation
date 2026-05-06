# V2 Planning

**Created:** 2026-05-05
**Sprint Review:** Days 21-33 Complete

## V1 Status

### Completed Features
- Multi-tenant architecture with RBAC
- User registration and authentication
- OAuth device flow for CLI
- Skills registry with CRUD
- MCP server registry
- RAG pipeline with hybrid search
- Usage analytics (privacy-first)
- CLI tool with comprehensive commands
- Admin UI with full navigation
- `tag doctor` diagnostic tool

### Known Issues
- Pre-existing test failures in request-auth middleware
- Windows symlink warnings in Next.js build
- Some loading states need polish

### Security Status
- Cross-tenant isolation: Implemented
- RBAC: Implemented
- JWT auth: Implemented
- Credential storage: **Plaintext (needs encryption)**
- Rate limiting: **Not implemented for signup**

---

## V2 Priorities

### P0 - Must Have (Before Production)

| Feature | Description | Effort | Notes |
|---------|-------------|--------|-------|
| Stripe Integration | Real billing, trial tracking | 3-5 days | Start with simple plans |
| Rate Limiting | Prevent signup abuse | 1 day | Use Redis or in-memory |
| Credential Encryption | Encrypt stored API keys | 2 days | AES-256-GCM |
| Fix Test Failures | All tests passing | 1 day | Pre-existing issues |

### P1 - Should Have (First 30 Days)

| Feature | Description | Effort | Notes |
|---------|-------------|--------|-------|
| Email Verification | Verify email addresses | 2 days | SendGrid or similar |
| Password Reset | Self-service password reset | 2 days | Token-based flow |
| Improved Onboarding | Welcome wizard, tooltips | 3 days | First-run experience |
| Dashboard Metrics | Real-time agent stats | 3 days | WebSocket updates |

### P2 - Nice to Have (First 60 Days)

| Feature | Description | Effort | Notes |
|---------|-------------|--------|-------|
| SSO (OIDC) | Enterprise SSO | 2 weeks | Okta, Auth0, etc. |
| Multi-region | Geo-distributed deployment | 1 week | CDN + edge caching |
| Custom Domains | Vanity domains for teams | 3 days | SSL provisioning |
| Webhooks | Event notifications | 3 days | Retry + delivery tracking |

### P3 - Future (V3+)

| Feature | Description | Notes |
|---------|-------------|-------|
| SAML SSO | Legacy enterprise auth | Customer-driven |
| On-premise | Self-hosted option | Enterprise tier |
| Advanced Analytics | ML-powered insights | Usage patterns |
| Marketplace | Skill sharing | Community features |

---

## Technical Debt

### Must Address
1. **Test Coverage** - Fix failing tests, add missing coverage
2. **Error Handling** - Consistent error format across all endpoints
3. **Logging** - Structured logging with correlation IDs
4. **Monitoring** - APM, error tracking, alerting

### Should Address
1. **Code Splitting** - Better bundle optimization
2. **Caching** - Redis caching for hot paths
3. **Database** - Query optimization, indexes
4. **Documentation** - API docs with OpenAPI

### Can Defer
1. **Microservices** - Current monolith is fine for scale
2. **GraphQL** - REST is sufficient for now
3. **i18n** - English-only for v1

---

## Infrastructure Plan

### Current State
- Single server (Hetzner)
- PostgreSQL + TimescaleDB
- Docker Compose deployment

### V2 Target
- Load balancer (nginx/Caddy)
- Redis for caching + rate limiting
- S3-compatible storage for bundles
- Automated backups
- CI/CD pipeline with staging

### V3 Target (If Growth)
- Kubernetes cluster
- Multi-region deployment
- CDN for static assets
- Managed database (RDS/Cloud SQL)

---

## Timeline

### Week 1-2: Production Hardening
- Day 1-2: Fix test failures
- Day 3-4: Implement rate limiting
- Day 5-7: Stripe integration (basic)
- Day 8-10: Credential encryption
- Day 11-14: QA and staging deploy

### Week 3-4: Polish
- Email verification
- Password reset
- Onboarding improvements
- Dashboard metrics

### Week 5-6: Launch Prep
- Load testing
- Security audit
- Documentation review
- Marketing site updates

---

## Success Metrics

### V2 Launch Goals
- 0 critical bugs
- 100% test coverage on auth flows
- <500ms p95 API response time
- 99.9% uptime target

### User Metrics
- 100 registered users
- 10 active teams
- 1000 skill syncs
- <5 min onboarding time

---

## Resources Needed

### Engineering
- 1 full-stack developer (current)
- 0.5 DevOps (can be same person)

### External Services
- Stripe (billing)
- SendGrid (email)
- Sentry (error tracking)
- PlanetScale/Neon (managed DB, optional)

### Budget (Monthly)
- Hosting: $50-100
- Services: $50-100
- Domain/SSL: $10
- **Total: ~$150/month**

---

## Open Questions

1. **Pricing model** - Usage-based vs seat-based vs hybrid?
2. **Free tier limits** - How generous? What converts?
3. **Enterprise features** - What triggers enterprise tier?
4. **Support model** - Community vs paid support?

---

## Next Steps

1. [ ] Review this plan with stakeholders
2. [ ] Prioritize P0 items
3. [ ] Create detailed tickets for Week 1-2
4. [ ] Set up staging environment
5. [ ] Schedule security review

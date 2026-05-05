# Skill: privacy-compliance-checker

## When to use
Use this skill when:
- Building or reviewing a feature that collects, stores, displays, or transmits user data
- Writing or auditing Mixpanel event tracking
- Adding third-party integrations
- Designing consent flows, deletion workflows, data access UIs, or notification systems
- Reviewing code that handles PHI, PII, or sensitive health data
- Answering "can we do X with user data?" questions

## Primary source
`ContextFiles2/CompanyContext/privacy-data-handling.md`

## Steps

### 1. Identify data category
Classify what data the feature touches:
- **Account / identity data** (name, email, phone, emergency contact)
- **Client Engagement Data** (login timing, message counts — NOT content)
- **Mental Health Services Data** (messages, notes, session content — highest sensitivity)
- **Transactional Data** (payments, cancellations)
- **Interaction Data** (pages, clicks, IP)
- **Company / Provider Data** (credentials, banking, licensing)

### 2. Apply data-handling rules

| Data type | Rules |
|---|---|
| Mental Health Services Data | Never expose to third parties. RG QA access requires client consent. Retained 10 years minimum regardless of erasure request. |
| Session content (messages, recordings) | Client + provider only. No third-party sharing ever. |
| Sensitive identity (health, orientation, ethnicity) | GDPR special category — explicit consent or health/social care basis required |
| Location | IP-based only. No GPS. Used for autocomplete and service availability display only. |
| Analytics (Mixpanel events) | Must not capture PII or session content. IP may be shared with Mixpanel per opt-in. |
| Payment data | Must flow through approved processors (Stripe, PayPal). RG does not store raw card data. |

### 3. Check third-party usage

Approved Data Processors only:
- **Storage/hosting**: Microsoft Azure
- **Video/audio**: Twilio
- **Payments**: Stripe, PayPal
- **Email**: Mailmodo
- **Analytics**: Mixpanel
- **Security**: ReCAPTCHA

If a new third party is needed, flag for legal/privacy review — not a developer decision.

### 4. Verify retention/erasure compliance

- Any new data store must support **deletion within 24 hours** for non-clinical data
- Clinical Health Record data: retained 10 years; cannot honor erasure requests
- Erasure path: `Menu > My Account > My Personal Information` — feature must not bypass this flow

### 5. Run the feature checklist

```
[ ] Data collection minimized to what's necessary for the feature
[ ] Sensitive data encrypted at rest (database-level) and in transit (TLS)
[ ] No session content exposed to analytics or third parties
[ ] No GPS/precise location collected
[ ] Calendar integration requires explicit Google OAuth grant
[ ] New Mixpanel events avoid PII and session content
[ ] Deletion/erasure path preserved and tested
[ ] Third parties are in the approved list
[ ] No advertising use of any collected data
[ ] Minor-specific flows handle parental consent variation by jurisdiction
```

### 6. Flag GDPR / CCPA surface area

Features deployed to EEA/UK users must support:
- Right to access (data export)
- Right to rectification
- Right to erasure (with clinical exception)
- Right to portability
- Right to object to automated profiling

California users additionally get: CCPA "know + delete" rights, Shine the Light disclosure rights.

## Common issues to catch

| Pattern | Problem |
|---|---|
| Logging message content in analytics | Violates Mental Health Services Data policy |
| Collecting device GPS | Not permitted — IP only |
| Sharing user data with unapproved third-party SDK | Requires legal review first |
| New email vendor added without DPA | Must be contracted as Data Processor |
| Storing card numbers or PAN | Must flow through Stripe/PayPal only |
| Soft-deleting user accounts without PII erasure | Erasure must permanently remove or obfuscate PII |
| Assuming all minors need parental consent | Rules vary by jurisdiction — see privacy doc section 22 |

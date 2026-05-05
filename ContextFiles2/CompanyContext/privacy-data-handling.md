# Privacy Policy & Data Handling — Really Global

**Source**: `Copy of Privacy Policy v6.pdf` (InputFolder) — Last Updated: June 23, 2025

> Engineering reference: Use this doc when building features that collect, store, display, or transmit user data, or when designing consent flows, deletion workflows, or data access screens.

---

## Key Definitions

| Term | Meaning |
|---|---|
| **Technology Platform** | The Really Global website and/or mobile app |
| **Company** | The care provider entity — solely responsible for the Mental Health Services they deliver |
| **Client** | Person seeking mental health services |
| **Data Processor** | Third party contracted by Really Global to process data, under RG's instructions only |
| **Third Party** | Any entity that is not Really Global, a Data Processor, or a Company |
| **Processing** | Any operation on data: collection, storage, usage |

---

## Data Types Collected

| Category | What it includes |
|---|---|
| **Client Interaction Data** | Pages visited, features used, time spent, errors, device/browser type, IP address |
| **Onboarding Data** | Questionnaire responses, initial assessments |
| **Account Data** | Account name, email, age, phone, emergency contact details |
| **Client Identifier** | Sequentially-generated unique ID per account |
| **Transactional Data** | Payment completion, cancellations, discounts, refunds, account creation |
| **Client Engagement Data** | Login timing, message count/length/timing, session count/duration, feature usage (worksheets, journals, goals) — **NOT** content of messages or sessions |
| **Mental Health Services Data** | Clinical notes, diagnosis, symptoms, treatment plans; session recordings/transcriptions/summaries; messages, worksheets, journals |
| **Company Quality Data** | Client ratings/reviews, session availability, cancellations, no-shows |
| **Customer Service & Communications Data** | All CS team interactions |
| **Company Data** | Name, bank account, contact details, gender, DOB, licensing/credentials, areas of expertise |
| **Company Engagement Data** | Login timing, live sessions count, messages count/content, worksheet/journal sharing |

### Client Health Record (special composite)
Combines:
- Onboarding responses
- Account name, phone, email, emergency contact
- Mental Health Services Data (dates, messages, worksheets, journals, provider notes)

---

## Data Retention Schedule

| Scenario | Retention |
|---|---|
| No MH services, no erasure request | 10 years from last login |
| MH services engaged, no erasure request | 10 years from last login |
| No MH services, erasure requested | Erased within **24 hours** |
| MH services engaged, erasure requested | Non-Clinical Health Record data: 24 hours. Clinical Health Record + legal communications + third-party disclosures: **10 years** |

**Cannot be erased (legal obligations):**
- Records of complaints and erasure/access requests
- Disclosures of PII to third parties
- Clinical Health Records (licensure/legal requirements)
- Data subject to litigation hold

---

## Who Can Access Session Data

- **Client + their provider only** for messages, worksheets, journal entries
- **RG Quality Assurance Team** — with client consent, for QA reviews
- **RG Trust & Safety / Legal** — for security, fraud, or legal investigations
- **No third-party sharing** of messages or live session activity

---

## Data Processors (Third Parties RG Shares With)

| Category | Examples |
|---|---|
| Cloud hosting | Microsoft Azure (Tier 3 data centers) |
| Video/audio | Twilio (live sessions, group meetings) |
| Payments | Stripe, PayPal |
| Email/comms | Mailmodo |
| Analytics | Mixpanel |
| Security | ReCAPTCHA |
| Customer service tools | (not named) |

---

## Security Standards

- **256-bit encryption** for all client-provider messages
- **SSL encryption** in line with modern best practices
- Databases encrypted and scrambled
- Hosted on multiple Tier 3 Microsoft Azure data centers
- 24/7 monitoring (automated + human)
- No GPS/precise location collected — IP-based approximate location only

---

## Privacy Commitments Relevant to Engineering

### No Advertising
> "We are not using your data for advertising."

### No Data Sale
RG does not sell data for money. California CCPA "sale" caveat: opt-in analytics cookies may technically qualify as "sale" under CCPA's broad definition.

### Location
- IP address only — approximate (state/country)
- Used for: onboarding autocomplete, service availability display, ReCAPTCHA
- No GPS, no precise location

### Calendar Integration (Google)
- Provider must explicitly grant OAuth permission
- RG reads provider Google Calendar to check availability
- RG writes events with client name for booked sessions
- Sends automated reminders to both parties
- Complies with Google API Services User Data Policy (Limited Use)

### Anonymity
- Users may use pseudonyms (name fields mandatory but real name not required)
- Email must be provided; pseudonymous email allowed
- True anonymity is difficult given IP processing, device identifiers

### Children / Minors
- Platform not directed at children under age of consent
- Parental consent requirements vary by jurisdiction
- Companies are responsible for jurisdiction-specific minor consent compliance
- RG assists Companies with consent flows

---

## User Rights

### All Users
- **Data erasure** — via account settings: Menu > My Account > My Personal Information
- **Data access/copy** — same path; includes questionnaire answers, messages, journals, emergency contact, etc.
- **Opt-out of marketing** — unsubscribe link in emails
- **Opt-out of analytics cookies** — opt-out instructions page

### California Residents (CCPA/CPRA)
- Right to know what data is collected/shared
- Right to correct inaccurate data
- Right to delete (with exceptions above)
- Identity verified by matching provided info OR FaceID biometrics (iOS)

### EEA / UK / Switzerland (GDPR / UK-GDPR)
- Subject access request (response within 1 month, extendable to 3)
- Right to rectification
- Right to erasure
- Right to data portability
- Right to object (legitimate interests basis)
- Right to object to automated decision-making/profiling
- Right to lodge complaint with supervisory authority

---

## Sensitive Data (GDPR Special Categories)

RG may process:
- Racial or ethnic origin
- Religious or philosophical beliefs
- Data concerning health, sex life, or sexual orientation

Lawful basis: (1) health and social care, (2) establishment/defense of legal rights, (3) substantial public interest, (4) consent.

---

## Mandatory Provider Disclosures

Providers may be **legally required** to disclose information when:
- Reported or suspected abuse
- Serious suicidal potential
- Threatened harm to others
- Court-ordered treatment or evaluation

---

## Feature Engineering Checklist (derived from policy)

When building any feature that handles user data, verify:
- [ ] Is data collection minimized to what's necessary?
- [ ] Is sensitive data (health, identity) handled with encryption at rest and in transit?
- [ ] Does the feature respect the data erasure flow (Menu > My Account > My Personal Information)?
- [ ] Are third-party data processors in the approved list (Azure, Twilio, Stripe, PayPal, Mailmodo, Mixpanel)?
- [ ] Is location collection IP-only (no GPS)?
- [ ] Is calendar integration gated behind explicit Google OAuth?
- [ ] Does any new Mixpanel event avoid capturing PII or session content?
- [ ] Is the "no advertising use" constraint preserved?

---

*Source: Copy of Privacy Policy v6.pdf — InputFolder*

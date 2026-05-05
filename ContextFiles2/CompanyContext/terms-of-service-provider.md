# Really Global Technology Platform Terms of Service — Provider-Facing Engineering Summary

**Source document:** Technology Platform Terms of Service
**Last updated (main agreement):** September 10, 2025
**Last updated (Appendix 1 – Fees):** April 30, 2025
**Last updated (Appendix 2 – Affiliate Commissions):** June 18, 2024

This document is an engineering-focused extraction of all business rules, obligations, and constraints that affect platform behavior. It is not legal advice.

---

## 1. Legal Entity

| Field | Value |
|---|---|
| **Legal name** | Alden Global Inc. |
| **DBA** | Really Global |
| **Referred to in agreement as** | "Really Global" |
| **Counterparty** | The licensed or non-licensed mental health practitioner/company creating the account, referred to as "Company" |
| **Governing law** | State of California, USA |
| **Arbitration venue** | San Francisco County, California |

---

## 2. Fee Structure

### Technology Platform Services Fee (Appendix 1)

| Service type | Fee rate | Basis |
|---|---|---|
| **Telehealth** (audio- or video-based sessions) | **15%** of Adjusted Collections | Booked and delivered through the platform |
| **In-Person services** | **5%** of Adjusted Collections | Booked and delivered through the platform |

**Adjusted Collections definition (Appendix 1 §2):**
Total gross payments actually deposited to Company through the platform, **minus**:
- Patient credits issued contemporaneously with the original charge
- Documented bad-debt write-offs attributable to that period

**Exclusions from deduction:**
- Voluntary refunds initiated by Company after settlement do **not** reduce Adjusted Collections — Really Global retains the fee on the original transaction.

### Processor Fees (Appendix 1 §3)
- Card-processing, currency-conversion, instant-payout, chargeback, and similar fees assessed by PayPal, Stripe, or any integrated processor are **passed through in full to Company**.
- Processor fees do **not** offset the Technology Platform Services Fee.

### No Additional Platform Charges (Appendix 1 §5)
Really Global charges **no** setup, subscription, or maintenance fees beyond:
1. Technology Platform Services Fee (15% / 5%)
2. Processor fees (pass-through to Company)
3. Optional Verification Program fees (if elected)

### Verification Fees (§3.2 / §5.D)
- Company pays all fees charged by Certn (verification partner) plus any RG administrative/processing fees.
- Some fees may not be known in advance.
- Really Global will provide at least **24 hours' notice** before charging Company's on-file payment method for additional fees.
- If automatic collection fails, fees are due within **15 days** of invoice.
- **Non-refundable** regardless of whether Verified status is granted.

### Affiliate Commissions (Appendix 2 — non-licensed coaches only)

| Parameter | Value |
|---|---|
| Commission rate | 5% of transactions |
| Duration | Up to 2 years per referred client or Company |
| Tracking cookie | 60-day window from initial click |
| Payment schedule | Monthly, paid 30 days after end of month earned |
| Eligibility | Non-licensed coaches/mentors only; licensed practitioners are **not** eligible |

---

## 3. Payment Terms

### Fee Payment Timing (§3.1 / Appendix 1 §4)
- **Default:** Technology Platform Services Fee is deducted **automatically at the moment** the underlying client payment is captured (not monthly).
- **Fallback if auto-deduction fails:** Really Global invoices monthly in arrears; due within **15 days** of receipt.
- **Stated due date in main body (§3.1):** "1st of the month" — this appears to be a legacy clause superseded by Appendix 1 §4.1 (automatic deduction at time of capture).
- Company grants Really Global authority to disburse amounts payable via PayPal, Stripe, or other integrated payment software.
- Annual fee adjustment possible based on fair market value, in consultation with Company.

### Held Amounts / Set-Off (§1.D)
Really Global may **withhold, delay, or set off** amounts otherwise payable to Company in connection with:
- Refunds
- Chargebacks
- Fines
- Investigations or claims arising from licensure misrepresentation or failure to update

### Chargebacks (§2.C.2 / Appendix 1 §2)
- The Technology Platform Services Fee is **non-refundable** except when a cardholder dispute reverses the entire transaction; in that event the fee is likewise reversed.
- Chargeback fees from processors are passed through to Company.
- Company indemnifies Really Global against claims arising from Company's refund policy violations (§2.C.6).

### Taxes / Reporting
The agreement does **not** explicitly mention 1099, W-9, or VAT obligations. The following apply by inference:
- Company is an **independent contractor** (§11) — not an employee.
- Each party is solely responsible for compensation, benefits, insurance, and **employer taxes** of its own employees or contractors (§11).
- Tax reporting obligations (1099/W-9/VAT) are not enumerated in the agreement; Company bears sole responsibility for compliance with all applicable laws.

### Records Audit Window (§7.C)
- Each party may review the other's books/records during ordinary business hours with reasonable notice.
- Reviews must occur within **6 months after the end of the calendar year**.
- No challenge to statements or records is permitted after that window.

---

## 4. Cancellation & No-Show Policy

All rules are mandatory platform policy (§2.C.1). Company cannot deviate from them.

### Client-Initiated Cancellation

| Timing | Outcome |
|---|---|
| 24+ hours before session start | No charge to Client; pre-authorized amounts released/voided |
| Less than 24 hours before session start | Client charged in full; Company paid in full |
| Client no-show | Client charged in full; Company paid in full |

### Provider (Company) No-Show / Attendance Rules (§2.C.1.d)

| Session type | No-show definition | Consequence |
|---|---|---|
| **Scheduled session** | Company has not joined within **15 minutes** of published start time | Company no-show |
| **Talk Now (on-demand)** | Call unanswered after **60 seconds** | Request auto-cancelled; Client receives full refund; Company forfeits session fee; Company's Talk Now status set to "unavailable" |

**Talk Now response timing:**
- Answer within **30 seconds** = on-time
- Answer after 30s but before 60s = **late answer** (logged for QoS monitoring)
- After 60s = automatic cancellation (see above)

**Thresholds triggering account review:**
- **3 late answers** in any rolling 30-day period → may trigger corrective action (e.g., temporary Talk Now suspension)
- **2 Company no-shows** in any rolling 30-day period → may trigger corrective action
- Exception: documented emergencies may be excused by the platform

### Prohibition on Unauthorized Refunds (§2.C.2)
Company shall **not** issue:
- Full refund for cancellations made fewer than 24 hours before session start
- Full refund for a Client no-show
- Any refund (full or partial) that reduces the amount payable to Company below 100% of session price under the Platform Refund Policy

Exceptions: required by applicable law, card-network rules, or processor rules.

### Reporting Obligation (§2.C.4)
Company must notify Really Global within **1 business day** of issuing any refund and must provide processor statements on request.

### Breach of Cancellation Policy (§2.C.3)
- Constitutes a **material breach**
- Really Global may suspend/restrict access immediately
- If not cured within **10 days** after written notice → termination

---

## 5. Provider Obligations

### Licensing and Credentials (§1.C)
- Professional category and licensing/supervision status selected on platform must be **truthful, accurate, and complete** at all times.
- Providers must perform services only within their **lawful scope of license** (or under required supervision if pre-licensed).
- Must **update profile and notify Really Global within 24 hours** if any license, supervision arrangement, or qualification lapses, is limited, suspended, or revoked.

### Profile and Platform Conduct
- Must submit profile and/or specialty page including name, bio, photo, and other required information (§1.A).
- Really Global may remove the profile at its sole discretion.
- Profile content must not include false, fraudulent, or misleading statements about qualifications, licensing, or scope of practice (§9.6).

### Service Quality (§1.E)
- Services must be performed in a **competent, professional, and ethical manner**.
- Must conform to prevailing standards of professional practice and/or certification organizations.
- Must comply with all applicable laws, regulations, rules, orders, and directives.

### All Interactions Must Stay On-Platform (§2.D)
- All interactions, communications, scheduling, and payments between Company and Clients must remain **exclusively on the Technology Platform**.
- Company shall not solicit or suggest off-platform activities, share external contact info, or facilitate off-platform payments.
- Obligation persists for the **entire duration of an active account**.
- To take a Client relationship off-platform: Company must first **terminate its account and resolve all outstanding obligations** to Really Global.

### Insurance (§8.A)
- Must maintain professional liability insurance in amounts reasonably recommended by Really Global.
- Must maintain comprehensive general liability insurance.
- **Really Global must be named as an additional insured** on general and professional liability policies.
- Must meet minimum insurance requirements of the jurisdiction where services are provided.

### Availability and Communication
- Must be present for every session listed on the platform, including Talk Now sessions (§2.C.1.d).
- Must cooperate in audits (§1.G): provide information and documentation to any auditor, investigator, or enforcement agency reviewing Really Global's finances.

### Billing Accuracy (§2.B.1.a)
- Ultimate responsibility for billing accuracy rests with Company.
- Must maintain original source documents and professional records.
- Must correct, adjust, or refund any payment regardless of reason.
- Responsible for collecting unpaid/overdue bills from clients.

### Payment Processor Configuration (§2.C.5)
- Company must configure PayPal Standard and/or Stripe Standard account settings per Really Global implementation guidance.
- Company shall not override or disable such settings without Really Global's prior written consent.

### YouTube / Video Content (§9.7)
- Videos uploaded to ReallyHQ YouTube channel must comply with YouTube Community Guidelines.
- Must own or have rights to all uploaded content.
- No duplicate/substantially similar content without clear modification.
- Must not include links, phone numbers, email addresses, calendar links, or external CTAs in videos or descriptions.
- Must protect client identities in all video content.

### Non-Solicitation (§10.B.2)
- During term and for **2 years after termination**, Company shall not solicit or enter discussions with any Really Global director, officer, shareholder, employee, or independent contractor who was with Really Global during the 12 months before termination.

### Non-Disparagement (§10.B.3)
- Must not make derogatory or disparaging remarks about Really Global, its officers, directors, or employees at any time during or after the agreement.

### Covenants (§6)
- Must meet all applicable licensing and registration requirements throughout the term.
- Must conduct services in accordance with all governing laws and regulations.

---

## 6. Platform Obligations to Providers

Really Global is obligated to provide the following services (§2):

| Service | Description |
|---|---|
| **Practice Management / EHR** | Operational software including practice management and electronic health records system |
| **Billing and Payment Processing** | Functionality via PayPal and Stripe; Really Global acts as Company's billing agent |
| **Client Scheduling** | Scheduling system |
| **Telehealth Software** | Video/telehealth delivery infrastructure |
| **Data Access** | Access to data, measures, and metrics |
| **Quality Assurance Tools** | Digital tools for QA, risk management, peer review, utilization review |
| **Education** | Digital education tools on mental health developments and platform capabilities |
| **Compliance Tools** | Digital tools for maintaining general compliance programs |
| **Financial Records / Accounting** | Software to maintain financial records in accordance with applicable standards |
| **Affiliate Marketing** | Affiliate marketing services for eligible non-licensed coaches (Appendix 2) |
| **Non-exclusive IP License** | License to use the Technology Platform and Material during the term |

**No insurance transactions:** RG's payment functionality does not engage in insurance reimbursement or creation of super bills, regardless of jurisdiction (§2.B.1).

**Platform licensed "as is":** Really Global licenses the platform with all defects and without warranty; not liable for damages related to Company's use (§2.F.4).

---

## 7. Prohibited Conduct

Any of the following may result in suspension, account restriction, or termination:

| Prohibited Action | Source |
|---|---|
| Misrepresenting licensing, supervision status, or qualifications | §1.C, §1.D |
| Failing to update profile within 24 hours of credential lapse | §1.C |
| Soliciting or facilitating off-platform communication or payment | §2.D |
| Issuing unauthorized refunds (below 24-hour cancellation threshold) | §2.C.2 |
| Submitting false, fraudulent, or misleading billing data | §2.B.1.a.i |
| Engaging in insurance reimbursement or creating super bills | §2.B.1.a.vi |
| Overriding platform payment processor settings without consent | §2.C.5 |
| Publishing false, fraudulent, or misleading advertising about services or qualifications | §9.6 |
| Uploading YouTube videos with external links, contact info, or prohibited content | §9.7 |
| Bidding on Really Global brand terms in paid advertising without consent | §2.E.3 |
| Using platform software to send spam, upload malicious code, or store unlawful content | §2.F.6 |
| Reverse engineering, decompiling, or distributing the licensed platform/material | §2.F.4 |
| Interfering with platform integrity or attempting unauthorized access | §2.F.6.d, §2.F.6.e |
| Disparaging Really Global or its personnel | §10.B.3 |
| Soliciting Really Global employees/contractors post-termination (within 2-year window) | §10.B.2 |

**Escalating consequences:**
- First response: account review
- Second: temporary suspension
- Uncured material breach within 10 days of written notice: termination

---

## 8. IP / Content Ownership

### Platform IP — Owned by Really Global (§2.F.1)
- All right, title, and interest in the Technology Platform and all associated technology.
- Includes: proprietary EMR software, third-party integrations (Stripe, PayPal, Wiley Treatment Planner, OpenAI, Azure, Aptible, AWS, Sterling/Certn, Twilio, Google Analytics, Google Translate, Mixpanel, Post Affiliate Pro, Socxo).
- All improvements, feedback, and developments based on or derived from the platform remain exclusively with Really Global.
- License is limited, non-transferable, non-assignable, non-exclusive, for the purpose of providing Mental Health Services via the platform only.

### Company Data — Owned by Company (§2.F.2)
- "Company Data" = all marketing language, photographs, videos, images, and other intellectual property **published on the platform by Company**.
- Company retains ownership; Really Global retains a non-exclusive right to use for platform operations.

### Professional Records — Owned by Company (§7.A)
- Company owns all professional records (including images) for services billed in Company's name.
- Company's practitioners make all entries.
- Really Global may maintain, inspect, or copy records in connection with its services.
- After termination, Really Global **retains a copy** of records and may contact clients listed therein, consistent with applicable privacy law.
- Clients have the right to access and obtain copies of their personal mental health data.

### Business Records — Owned by Really Global (§7.B)
- All business and administrative records maintained by Really Global are **Really Global's property**.
- Really Global maintains basic contact information of clients visiting via the platform.
- Really Global may contact clients post-termination for feedback, QA, and future services (subject to HIPAA, GDPR, and applicable law).

### Session Recordings
- Not explicitly addressed in the agreement. The platform includes Twilio (video) as licensed technology. Company Data definition covers videos "published on the platform" — clinical session recordings are not explicitly categorized. Clinical notes and records fall under §7.A (Company-owned professional records).

### Feedback (§2.F.3)
- Feedback provided by Company to Really Global is given voluntarily.
- Really Global may freely use, disclose, reproduce, license, or exploit Feedback without obligation or restriction.
- Feedback does not create confidentiality obligations for Really Global absent a separate signed agreement.

---

## 9. Termination

### Term (§4.A)
- **Initial Term:** 1 year from effective date.
- **Auto-renewal:** Successive 1-year terms unless:
  - Either party is in material breach at renewal time, **or**
  - Either party gives **90 days' written notice** before end of current term.
- If agreement terminates but Company continues accepting services, terms continue to apply until Company gives **30 days' further written notice**.

### Termination for Cause (§4.B.1)
- Either party may terminate upon **material breach**, if not cured within **10 days** following written notice.
- Immediate termination (no cure period) upon:
  - Voluntary or involuntary bankruptcy filing not dismissed within 30 days
  - Appointment of receiver/trustee over substantially all assets not terminated within 30 days
  - Garnishment or attachment of Company's collections
  - Dissolution of either party (if an entity)

### Termination Without Cause (§4.B.2)
- Either party may terminate immediately without cause upon **30 days' written notice**.
- Also triggered by termination of a referenced Sublease Agreement.

### Regulatory Action (§4.B.3)
- If a regulatory board initiates action to sanction/revoke a licensed practitioner's license solely due to this agreement, either party may request amendment.
- If offending provisions cannot be cured to both parties' satisfaction, either party may terminate upon **10 days' written notice**.

### Effect of Termination (§4.C)
- Company must immediately:
  - Return all Confidential Information
  - Cease using Really Global's logos, trade names, marks
  - Cease using the Licensed Technology Platform and Material within **10 days**
  - Certify in writing to Really Global that it has ceased use and returned materials
- Really Global retains authority over collections until all fees owed are paid in full; may deduct from Company's collections.
- Both parties must cooperate to ensure continuation of care for patients/clients.
- Existing obligations for services furnished prior to termination survive.

### Notice Methods (§12.3)
- Overnight courier: effective on delivery date (or next business day)
- Certified U.S. mail: effective on third business day after mailing
- Email: effective on first business day after sending

---

## 10. Dispute Resolution

### Required Sequence (§12.7)
1. **Mediation first** — parties must attempt mediation with a mutually agreeable trained mediator in San Francisco County, CA before initiating arbitration.
2. **Binding arbitration** — if mediation fails, disputes go to binding arbitration in San Francisco County, CA.

### Arbitration Details (§12.7)
- Administered under **AHLA Alternative Dispute Resolution Service Rules** for Arbitration.
- Single arbitrator.
- Arbitrator may allocate all or part of arbitration costs including arbitrator's fees.
- Judgment may be entered in any court of competent jurisdiction.
- Provisional remedies (injunctive relief) may be sought in court while arbitration is pending.

### Jury Trial Waiver
- Both parties waive the right to a jury trial by agreeing to this agreement (§12.7 — written in all caps in original).

### Class Action
- No explicit class action waiver clause stated in the document. The agreement references only individual arbitration.

### Governing Law (§12.6)
- California law (without conflict of law provisions).

### Attorney's Fees (§12.8)
- Prevailing party in any arbitration or action is entitled to recover all costs and reasonable attorney's fees from the other party.

### Injunctive Relief (§10.C)
- For breaches of confidentiality, non-solicitation, and non-disparagement provisions, Really Global may seek injunctive relief in addition to other remedies without the mediation/arbitration prerequisite.

---

## 11. Liability Limits

### Exclusion of Consequential Damages (§12.11)
Really Global is not liable for:
- Consequential damages
- Punitive damages
- Incidental damages
- Damages for harm to business, lost revenues, profits, or goodwill
- Any special or exemplary damages

This applies regardless of theory (negligence, breach of contract, warranty, strict liability, misrepresentation, statute, tort) even if a party knew such damages could result.

### Liability Cap (§12.11)
Really Global's maximum liability to Company for any loss or damage arising out of or in connection with the agreement is capped at:
> **The total value of sums paid by Company to Really Global under this agreement** for the relevant loss/damage.

### "As Is" License (§2.F.4)
- Platform is licensed "as is" with all defects.
- No warranty of merchantability or fitness for particular purpose.
- Company uses the platform at its own risk.

### Indemnification — Company Indemnifies Really Global (§8.B, §8.C, §2.C.6)
Company indemnifies and holds Really Global harmless from:
- Any negligent or intentional acts/omissions by Company, its shareholders, agents, employees, subcontractors
- Any breach of representations/warranties
- False/misleading billing submissions
- Claims arising from cancellation policy violations
- Claims arising from misrepresentation of licensure, supervision, qualifications, insurance, or scope of practice
- Claims related to advertising law violations
- Claims arising from Verification process participation or inaccuracies

### Force Majeure (§12.13)
- Neither party is responsible for failures due to: labor disputes, acts of God, inability to obtain labor/materials, accidents, pandemics, future law/regulation changes.
- **Does not apply** to financial obligations (payments must still be made).
- **Does not include:** economic hardship, reduction in reimbursement, market condition changes, or insufficiency of funds.

---

## 12. Background Checks / Certn Verification

### Optional Program (§5.A)
- Participation in the Verification Program is **voluntary**.
- Grants a "Verified" badge on the provider's profile.
- Does **not** create an employment relationship.

### Verification Partner (§5.B)
- **Certn.io** (referred to as "Verification Partner") conducts background checks and credential verification.

### Scope of Verification (§5.B)

| Provider type | What is verified |
|---|---|
| **Licensed mental health care providers** | Professional licenses, certifications, educational history, and (if applicable for vulnerable populations) background checks |
| **Non-licensed coaches/mentors** | Certifications, educational history, and (if applicable for vulnerable populations) background checks |

### Consent Requirements (§5.C)
- Company consents to collection, use, and processing of personal and professional information by Certn.
- Must provide accurate, complete, up-to-date information.
- Must cooperate with background check process.

### Fee Timing (§5.E)
- Really Global notifies Company at least **24 hours before** automatic debit of additional fees.
- Automatic debit = acceptance of additional fees.
- Verified badge granted upon successful payment completion.

### Grounds for Denial/Revocation of Verified Badge (§5.F)
- Credentials cannot be verified
- Discrepancies or inconsistencies found
- Criminal record that Really Global judges may affect suitability
- Any other reason Really Global deems appropriate for platform integrity/safety

### Disclaimer (§5.F)
> A "Verified" badge indicates only that specified documentation was reviewed as of a point in time by a third-party vendor. It is not a guarantee by Really Global of ongoing licensure, supervision, identity, or suitability. Company authorizes Really Global to display explanatory text to Clients to that effect.

### Responsibility (§5.J)
- Company is responsible for compliance with local laws and regulations regarding background investigations and consumer reporting in their jurisdiction.

---

## 13. Talk Now Rules

Specific rules for on-demand ("Talk Now") sessions (§2.C.1.d):

| Rule | Value |
|---|---|
| Company must be present | Yes — for every Talk Now session listed |
| Answer window (on-time) | Within **30 seconds** |
| Late answer window (logged, not penalized immediately) | After 30s, before **60 seconds** |
| Auto-cancellation threshold | **60 seconds** unanswered |
| On auto-cancellation | Request cancelled; Client receives full refund; Company forfeits session fee; Company's Talk Now status set to "unavailable" |
| Threshold for corrective action | **3 late answers** or **2 no-shows** in any rolling 30-day period |
| Corrective action examples | Temporary suspension of Talk Now access |
| Exception | Documented emergencies may be excused by the platform |

**Engineering implication:** The platform must auto-cancel Talk Now requests after exactly 60 seconds, process a full refund to the client, forfeit the provider's fee, and flip the provider's Talk Now availability status to "unavailable" — all atomically.

---

## 14. Minor / Consent Provisions

The agreement does **not** contain explicit dedicated provisions for working with minors. The following indirect references apply:

- **Verification scope** (§5.B): Background checks may apply specifically to providers "working with vulnerable populations" — minors are implied within this category.
- **Prohibited YouTube content** (§9.7.c.3): Nudity, sexually explicit content, or **exploitation of minors** is expressly prohibited.
- **Professional standards** (§1.E): Company must comply with all applicable laws, which would include laws governing consent for minors in mental health services (e.g., parental consent requirements by jurisdiction).
- **Client records** (§7.A): Clients have the right to access and obtain copies of their personal mental health data — guardianship and minor access rules would apply under applicable law.

No explicit minimum age, guardian consent workflow, or minor-specific session handling rules are defined in this agreement.

---

## 15. Engineering-Relevant Rules and Platform Constraints

These rules directly constrain how platform features must be built or enforced.

### Fee Deduction Timing
- **Fee must be deducted at the moment of payment capture** (Appendix 1 §4.1), not monthly. Platform payment flow must split funds at capture time.
- Stripe Connect destination charges pattern is referenced explicitly: `https://stripe.com/docs/connect/destination-charges#flow-of-funds-app-fee`

### Refund Enforcement
- Platform must **block** Company-initiated refunds that would violate the 24-hour cancellation policy (§2.C.2).
- Company cannot override PayPal/Stripe settings without Really Global's written consent (§2.C.5) — platform must control processor configuration.
- Refund audit trail: Company must notify RG within **1 business day** of any refund → requires event logging and notification system.

### Talk Now Auto-Cancel Logic
- 30-second threshold: log as "late answer" for QoS monitoring.
- 60-second threshold: trigger atomic cancellation (refund client, forfeit provider fee, set provider status to "unavailable").
- Rolling 30-day window tracking for 3 late answers or 2 no-shows → account review trigger.

### Provider Credential Expiry Monitoring
- Platform must support providers updating credentials; profile update must be possible within 24-hour window (§1.C).
- Misrepresentation enforcement (§1.D): platform must be able to suspend/restrict access, remove/modify content, notify clients and/or authorities, and request documentary proof of licensure.

### Off-Platform Enforcement
- Platform must monitor/prevent sharing of external contact info, external links, or alternative payment options in provider-to-client communications (§2.D).
- Profiles must not include external calendar links, phone numbers, or contact information that routes around the platform.

### Verified Badge Display (§5.F)
- "Verified" badge must be accompanied by explanatory text (authorized by Company) indicating it is not a guarantee of ongoing licensure or identity — just a point-in-time check.

### No Insurance / Super Bills (§2.B.1.a.vi)
- Platform must not enable insurance reimbursement or super bill generation. These features are expressly prohibited.

### IP License Restrictions (§2.F.4, §2.F.6)
- Company cannot: download source code, reverse engineer, decompile, copy, distribute, sublicense, or remove proprietary notices from the platform.
- Within **10 days** of discontinuing use or on termination, Company must cease all use and return/delete all copies.

### YouTube Content Pipeline (§9.7.e)
- Provider-uploaded YouTube videos must not contain links, phone numbers, email addresses, calendar links, or any external calls to action in video content or descriptions.
- Platform's video upload workflow must enforce this prohibition.

### Affiliate Tracking (Appendix 2)
- 60-day cookie tracking window must be enforced for affiliate referral attribution.
- Commission calculation runs at end of each calendar month; payout occurs 30 days after month end.
- Affiliate eligibility gate: only non-licensed coaches/mentors qualify; licensed providers must be blocked from affiliate commission features.

### Data / Privacy Architecture (§9.4, §9.5)
- Really Global operates as a **HIPAA Business Associate** (BAA is a separate document incorporated by reference).
- Really Global operates as a **GDPR Data Processor** (DPA is a separate document incorporated by reference).
- Client records are Company-owned but may be accessed by Really Global for its services; after termination Really Global retains copies and may contact clients per applicable privacy law.
- Business records (client contact info) are Really Global-owned and may be used for QA and future services, subject to HIPAA/GDPR.

### Assignment (§12.1)
- Company cannot assign this agreement without RG's written consent.
- Really Global can assign without Company's consent in an acquisition (>50% ownership change or substantially all assets).

### Marks / Branding (§1.F)
- Neither party may use the other's logos/trademarks/service marks without prior written consent, except to identify Really Global as the technology platform used by Company.
- Affiliate marketing: Company may use Really Global's approved branding materials only; cannot alter branding or misrepresent the association (§2.E.2).

---

*Last reviewed against source document: September 10, 2025 version of the Technology Platform Terms of Service.*

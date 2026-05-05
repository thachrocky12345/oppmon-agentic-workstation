---
name: risk-register-synthesis
description: Synthesize findings from all healthcare skills into a consolidated HIPAA risk register. Use when asked to "risk register", "risk analysis", "consolidate findings", "HIPAA risk assessment", or "compliance summary".
argument-hint: [--input-dir path] [--output-format markdown|csv|json] [--include-likelihood]
frequency: quarterly
depends-on: [phi-pii-leak-scan, hipaa-compliance-audit, security-code-review]
---

# Risk Register Synthesis

## When to Use
- After running multiple healthcare skills to consolidate findings
- When preparing for HIPAA risk analysis documentation (45 CFR 164.308(a)(1)(ii)(A))
- When generating compliance reports for auditors
- When prioritizing security remediation work
- When conducting quarterly risk review
- When preparing for SOC 2 Type II audit evidence

## Prerequisites
- Access to skill output files in `ContextFiles2/Library/Sessions/`
- Working directory must be the repository root (`C:\Projects\ReallyGlobal\`)
- Previous runs of source skills (phi-pii-leak-scan, hipaa-compliance-audit, security-code-review, etc.)

## Regulatory Basis

45 CFR 164.308(a)(1)(ii)(A) requires an **"accurate and thorough assessment of the potential risks and vulnerabilities to the confidentiality, integrity, and availability of electronic protected health information"** held by the covered entity.

Individual skill outputs are checklists and findings. A risk register transforms these into a quantified risk analysis suitable for regulatory review.

## Workflow

### Step 1: Input Aggregation

Collect output files from all healthcare skills:

```bash
# Find all skill output files
ls -la ContextFiles2/Library/Sessions/*_Results_*.md 2>/dev/null
ls -la ContextFiles2/Library/Sessions/hipaa-compliance_Results_*.md 2>/dev/null
ls -la ContextFiles2/Library/Sessions/phi-pii-leak-scan_Results_*.md 2>/dev/null
ls -la ContextFiles2/Library/Sessions/security-code-review_Results_*.md 2>/dev/null
ls -la ContextFiles2/Library/Sessions/breach-notification-readiness_Results_*.md 2>/dev/null
ls -la ContextFiles2/Library/Sessions/crisis-response-protocol_Results_*.md 2>/dev/null
ls -la ContextFiles2/Library/Sessions/deployment-readiness_*.md 2>/dev/null

# Count total findings across all outputs
grep -c 'FAIL\|CRITICAL\|HIGH\|MEDIUM\|WARNING\|GAP\|MISSING' \
  ContextFiles2/Library/Sessions/*_Results_*.md 2>/dev/null
```

**Source skills and their output types:**

| Source Skill | Output File Pattern | Finding Types |
|---|---|---|
| `phi-pii-leak-scan` | `phi-pii-leak-scan_Results_*.md` | PHI/PII exposure findings |
| `hipaa-compliance-audit` | `hipaa-compliance_Results_*.md` | HIPAA safeguard gaps |
| `security-code-review` | `security-code-review_Results_*.md` | OWASP vulnerability findings |
| `api-response-sanitizer` | `api-response-sanitizer_Results_*.md` | Data leakage in API responses |
| `credential-verification-workflow` | `credential-verification_Results_*.md` | Expired/invalid credentials |
| `patient-data-integrity-check` | `data-integrity_Results_*.md` | Data consistency issues |
| `consent-tracking-audit` | `consent-tracking_Results_*.md` | Consent gaps |
| `backend-endpoint-security-test` | `endpoint-security_Results_*.md` | Auth/authz failures |
| `deployment-readiness-check` | `deployment-readiness_*.md` | Configuration issues |
| `crisis-response-protocol` | `crisis-response-protocol_Results_*.md` | Crisis workflow gaps |
| `incident-response-breach-notification` | `breach-notification-readiness_Results_*.md` | Breach preparedness gaps |

### Step 2: Risk Register Fields

Each finding is transformed into a risk register entry with the following fields:

| Field | Description | Example |
|---|---|---|
| **Risk ID** | Unique identifier | `RISK-2026-001` |
| **Risk Description** | Plain-language description | "Clinical notes stored unencrypted in PostgreSQL" |
| **Source Skill** | Which skill identified this risk | `phi-pii-leak-scan` |
| **Source Finding** | Finding ID reference | `FINDING-PHI-003` |
| **HIPAA Requirement** | CFR section | `164.312(a)(2)(iv)` |
| **Likelihood** | 1 (Rare) to 5 (Almost Certain) | 4 |
| **Impact** | 1 (Negligible) to 5 (Critical) | 5 |
| **Risk Score** | Likelihood x Impact | 20 |
| **Current Controls** | Existing mitigations | "Database behind VPN, TLS in transit" |
| **Control Effectiveness** | Effective / Partially / Ineffective / None | Partially Effective |
| **Planned Controls** | Remediation plan | "Implement django-encrypted-model-fields" |
| **Owner** | Responsible team/role | "Backend Engineering" |
| **Target Date** | Remediation deadline | "2026-Q2" |
| **Status** | Open / In Progress / Mitigated / Accepted | Open |

### Step 3: Likelihood Scoring Guide

Score likelihood based on attack surface, existing controls, and known exploitation patterns:

| Score | Label | Criteria | Healthcare Example |
|---|---|---|---|
| **1** | Rare | Requires physical access + specialized knowledge | Attacker must compromise both VPN and DB credentials |
| **2** | Unlikely | Requires authenticated access + specific conditions | Authenticated user must find undocumented API endpoint AND exploit timing window |
| **3** | Possible | Requires authenticated access, conditions are common | Any authenticated provider can access the vulnerable endpoint during normal use |
| **4** | Likely | Exploitable by any authenticated user | IDOR vulnerability allows any logged-in user to enumerate records by changing UUID |
| **5** | Almost Certain | Exploitable without authentication | Unauthenticated endpoint exposes PHI, publicly accessible |

### Step 4: Impact Scoring Guide

Score impact based on PHI exposure, regulatory penalty, and patient harm potential:

| Score | Label | Criteria | Healthcare Example |
|---|---|---|---|
| **1** | Negligible | No PHI exposure, no regulatory impact | Internal metadata exposed (server version, timestamps) |
| **2** | Minor | Limited PII exposure (demographic), minor regulatory finding | Email addresses or phone numbers exposed for a small number of users |
| **3** | Moderate | PHI exposure affecting single user, reportable incident | One patient's clinical notes accessed by unauthorized provider |
| **4** | Major | PHI exposure affecting multiple users, mandatory breach notification | Database query returns clinical notes for all patients of a provider |
| **5** | Critical | Clinical data breach, patient safety risk, potential harm | Crisis/suicidality data exposed, risk of patient harm, class-action liability |

### Step 5: HIPAA Requirement Mapping

Every risk must map to at least one HIPAA requirement:

| CFR Section | Category | Description |
|---|---|---|
| **164.308** | Administrative Safeguards | Risk analysis, workforce training, contingency planning, evaluation |
| **164.310** | Physical Safeguards | Facility access, workstation security, device controls |
| **164.312** | Technical Safeguards | Access control, audit controls, integrity, transmission security |
| **164.314** | Organizational Requirements | BAA terms, group health plan requirements |
| **164.316** | Policies and Procedures | Documentation, retention (6 years) |
| **164.520** | Privacy Rule -- NPP | Notice of Privacy Practices |
| **164.524** | Privacy Rule -- Access | Right of access (30-day deadline) |
| **164.526** | Privacy Rule -- Amendment | Right to amend (60-day deadline) |
| **164.528** | Privacy Rule -- Accounting | Accounting of disclosures (6-year coverage) |
| **164.404-408** | Breach Notification | Individual, HHS, media notification requirements |

**Common mappings for this platform:**

| Risk Pattern | Primary HIPAA Mapping |
|---|---|
| Unencrypted PHI at rest | 164.312(a)(2)(iv) -- Encryption and decryption |
| Missing audit logs | 164.312(b) -- Audit controls |
| No access controls on PHI endpoints | 164.312(a)(1) -- Access control |
| Missing BAAs with vendors | 164.314(a)(2)(i) -- BA agreements |
| No breach notification plan | 164.404(a)(1) -- Individual notification |
| No consent tracking | 164.520(a) -- NPP provision |
| Hardcoded secrets | 164.312(a)(2)(i) -- Unique user identification |
| No data retention policy | 164.316(b)(2)(i) -- Documentation retention |

### Step 6: Generate Risk Register Output

**Markdown format** (for human review):

```markdown
# HIPAA Risk Register -- [DATE]

## Summary Statistics
- Total Risks: [N]
- Critical (Score >= 20): [N]
- High (Score 12-19): [N]
- Medium (Score 6-11): [N]
- Low (Score 1-5): [N]
- Risks with No Current Controls: [N]
- Risks Past Target Date: [N]

## Top 10 Risks by Score

| # | Risk ID | Description | Score | HIPAA | Status |
|---|---|---|---|---|---|
| 1 | RISK-2026-001 | [description] | 25 | 164.312(a)(2)(iv) | Open |
| ... | ... | ... | ... | ... | ... |

## Full Risk Register

### RISK-2026-001: [Title]
- **Description**: [detailed description]
- **Source**: [skill] / [finding ID]
- **HIPAA**: [CFR section]
- **Likelihood**: [score] -- [justification]
- **Impact**: [score] -- [justification]
- **Risk Score**: [L x I]
- **Current Controls**: [description]
- **Control Effectiveness**: [rating]
- **Planned Controls**: [description]
- **Owner**: [team]
- **Target Date**: [date]
- **Status**: [status]

[Repeat for each risk...]

## Risks by HIPAA Category

### 164.312 Technical Safeguards
| Risk ID | Description | Score | Status |
|---|---|---|---|
| ... | ... | ... | ... |

### 164.308 Administrative Safeguards
| Risk ID | Description | Score | Status |
|---|---|---|---|
| ... | ... | ... | ... |

[Continue for each category...]
```

**JSON format** (for automated tracking):

```json
{
  "generated_at": "2026-03-01T00:00:00Z",
  "source_files": ["list of input files"],
  "summary": {
    "total_risks": 0,
    "by_severity": {"critical": 0, "high": 0, "medium": 0, "low": 0},
    "by_status": {"open": 0, "in_progress": 0, "mitigated": 0, "accepted": 0}
  },
  "risks": [
    {
      "risk_id": "RISK-2026-001",
      "description": "",
      "source_skill": "",
      "source_finding": "",
      "hipaa_requirement": "",
      "likelihood": 0,
      "impact": 0,
      "risk_score": 0,
      "current_controls": "",
      "control_effectiveness": "",
      "planned_controls": "",
      "owner": "",
      "target_date": "",
      "status": ""
    }
  ]
}
```

## Output
- **File (Markdown)**: `ContextFiles2/Library/Sessions/risk-register_{YYYY-MM-DD}.md`
- **File (JSON)**: `ContextFiles2/Library/Sessions/risk-register_{YYYY-MM-DD}.json`
- **Format**: Consolidated risk register with quantified likelihood and impact
- **Delta**: If a previous risk register exists, highlight new risks, resolved risks, and score changes

## Known Patterns & Gotchas

1. **Risk analysis is NOT a checklist**: 45 CFR 164.308(a)(1)(ii)(A) requires an "accurate and thorough assessment" with quantified risk levels. A simple pass/fail checklist does not meet this requirement. Each finding must have likelihood, impact, and a risk score.

2. **Risk acceptance must be documented**: If a risk is accepted (not mitigated), the acceptance decision must be documented with: who accepted, when, justification, and planned review date. This is required by 164.308(a)(1)(ii)(B) -- risk management.

3. **Review frequency**: The risk register should be reviewed at least quarterly and updated whenever a new skill run produces findings. HIPAA requires periodic evaluation (164.308(a)(8)) but does not specify frequency.

4. **Input files may not exist**: If a source skill has never been run, its output file will not exist. The synthesis should note which skills have not been run and recommend running them.

5. **Duplicate findings across skills**: Multiple skills may identify the same underlying risk (e.g., unencrypted PHI flagged by both `phi-pii-leak-scan` and `hipaa-compliance-audit`). Deduplicate by root cause, not by finding.

6. **Risk score thresholds for action**: Recommend the following action thresholds:
   - Score >= 20 (Critical): Immediate remediation required, executive notification
   - Score 12-19 (High): Remediation within 30 days
   - Score 6-11 (Medium): Remediation within 90 days
   - Score 1-5 (Low): Accept or remediate at next opportunity

7. **SOC 2 alignment**: SOC 2 Trust Service Criteria (CC3.2, CC3.3, CC3.4) require risk assessment processes. The risk register output format is designed to serve both HIPAA and SOC 2 documentation requirements.

## Example Invocations

```
/risk-register-synthesis
/risk-register-synthesis --output-format json
/risk-register-synthesis --include-likelihood
/risk-register-synthesis --input-dir ContextFiles2/Library/Sessions/
/risk-register-synthesis --output-format csv
```

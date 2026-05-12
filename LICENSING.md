# Licensing — OppMon

OppMon is **source-available** under the **Business Source License 1.1**.
This file is a plain-English guide. The legally binding text is in [LICENSE](./LICENSE).

---

## TL;DR

✅ **You can:**
- Read the code, fork it, study it, modify it.
- Run it inside your own organization (production or otherwise) for your own internal purposes.
- Use it for development, research, evaluation, education, and personal projects.
- Redistribute it, with the BSL 1.1 license attached and unchanged.

❌ **You cannot:**
- Offer the Licensed Work to third parties on a hosted, embedded, or managed basis where that offering competes with a paid product or service provided by Licensor (the maintainers).

⏱ **What happens after May 11, 2030:**
- The version of OppMon as of that date automatically converts to **Apache License 2.0**.
- Every release made under BSL 1.1 converts to Apache 2.0 four years after that release's first public availability.
- This is non-revocable.

💬 **Need a commercial license** to do something the BSL forbids (e.g. run OppMon as part of a competing managed service)?  Contact: **thach.bui@gmail.com**

---

## What "competes with a paid product or service" means

The Additional Use Grant in the LICENSE limits one specific scenario: standing up OppMon as a hosted service and selling access to it (or bundling it inside a product) where that offering is in commercial competition with what Licensor sells.

If you're not running OppMon as a multi-tenant SaaS product for paying customers, you're almost certainly fine. The classic forbidden case: "I'm going to fork this, stand it up at example.com, and charge $50/month for it." The classic allowed case: "My company runs OppMon on our internal infrastructure for our engineers."

When in doubt, email and ask — we'd rather have a 2-minute conversation than have you guess.

---

## Why BSL 1.1 and not MIT / Apache?

OppMon previously shipped under MIT. We switched to BSL to keep the code public and contributable while preventing a specific failure mode that has hit many MIT-licensed infrastructure products: a third party (often a hyperscaler) takes the open code, hosts it as their own managed service, and captures the commercial upside without contributing back.

BSL keeps everything visible, lets developers and organizations self-host freely, and only restricts the narrow scenario above. After four years, each release becomes proper Apache 2.0 — so this isn't a permanent enclosure, it's a time-boxed defense for the maintainers.

References for the curious:
- Sentry: https://blog.sentry.io/introducing-the-functional-source-license-freedom-without-free-riding/
- HashiCorp: https://www.hashicorp.com/blog/hashicorp-adopts-business-source-license
- CockroachDB: https://www.cockroachlabs.com/blog/oss-relicensing-cockroachdb/

---

## Contributing

By submitting a pull request you agree your contribution is licensed under the BSL 1.1 (and, after the Change Date, the Apache 2.0 license that BSL converts to).

We currently use **DCO** (Developer Certificate of Origin) rather than a CLA. Sign off every commit:

```bash
git commit -s -m "..."
```

That's it — no extra paperwork. If you maintain something significant in OppMon and we later need to update the licensing arrangement, we'll reach out and discuss it then.

---

## Trademarks

"OppMon" is not (currently) a registered trademark. The Business Source License does not grant rights in any trademark or logo. If we register a mark later, this section will be updated.

---

## Questions

Anything unclear in this document? Open an issue or email **thach.bui@gmail.com** — we'll answer in plain English.

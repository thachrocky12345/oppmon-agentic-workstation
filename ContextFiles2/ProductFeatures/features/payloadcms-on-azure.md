# Feature: PayloadCMS on Azure

## Purpose
- Stand up PayloadCMS on Azure as the future content platform for large‑scale SEO pages and blogs. (BRD summary)

## User journey / key actions
- Engineering deploys PayloadCMS + Next.js on Azure; content team manages SEO pages and blogs in CMS. (BRD summary)

## Glossary / UI terms
- PayloadCMS on Azure
- Not found in repo. Search evidence: `rg -n "Glossary|Definitions|Key Terms" ContextFiles/HumanDocuments/Features/_extracted/BRD - PayloadCMS on Azure.txt` (0 matches)

## Entry points
- Screens/routes: Not found in repo. Search evidence: `rg -n "payloadcms" RG-Frontend/src` (0 matches). Current CMS in repo is Django `manage_pages`.
- API/GraphQL: Not found in repo. Search evidence: `rg -n "payloadcms" Lumy-Backend/apps` (0 matches). Current CMS uses `Lumy-Backend/apps/manage_pages`.

## Data entities
- Not found in repo. Search evidence: `rg -n "payloadcms" Lumy-Backend/apps` (0 matches). Current CMS entity: `Lumy-Backend/apps/manage_pages/models.py`.

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/BRD - PayloadCMS on Azure.txt

## Technical mapping
- [Technical doc](../technical/payloadcms-on-azure-technical.md)

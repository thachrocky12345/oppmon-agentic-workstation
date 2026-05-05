import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from "docx";
import { writeFile, mkdir, readFile } from "fs/promises";
import path from "path";

const outDir = path.resolve("/mnt/c/Projects/ReallyGlobal/ContextFiles/ProductFeatures/confluence-docx/v6");
await mkdir(outDir, { recursive: true });

const queryPath = "/mnt/c/Projects/ReallyGlobal/RG-Frontend/src/graphql/query/query.ts";
const mutationPath = "/mnt/c/Projects/ReallyGlobal/RG-Frontend/src/graphql/mutation/mutation.ts";
const queryText = await readFile(queryPath, "utf8");
const mutationText = await readFile(mutationPath, "utf8");

const extractGql = (text, name) => {
  const re = new RegExp(`export const ${name}\\s*=\\s*gql\`([\\s\\S]*?)\``, "m");
  const m = text.match(re);
  return m ? m[1].trim() : null;
};

const gqlByName = (name) => extractGql(queryText, name) || extractGql(mutationText, name);

const metaTable = (rows) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([k, v]) =>
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: k, bold: true })] })] }),
          new TableCell({ children: [new Paragraph(v)] }),
        ],
      })
    ),
  });

const section = (title, body = []) => [
  new Paragraph({ text: title, heading: HeadingLevel.HEADING_2 }),
  ...body,
];

const subSection = (title, body = []) => [
  new Paragraph({ text: title, heading: HeadingLevel.HEADING_3 }),
  ...body,
];

const bullet = (text) => new Paragraph({ text, bullet: { level: 0 } });

const codeBlock = (text) =>
  new Paragraph({
    children: [new TextRun({ text, font: "Consolas" })],
  });

const docFor = (title, data) =>
  new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
          metaTable([
            ["Status", data.status],
            ["Owner", data.owner],
            ["Stakeholders", data.stakeholders],
            ["Last Updated", data.updated],
          ]),
          ...section("Overview", [new Paragraph(data.overview)]),
          ...section("Goals", data.goals.map(bullet)),
          ...section("Non‑Goals", data.nonGoals.map(bullet)),
          ...section("User Stories", data.userStories.map(bullet)),
          ...section("Scope & Dependencies", data.scope.map(bullet)),
          ...section("Engineering Design Plan", [
            ...subSection("System Boundaries", data.design.boundaries.map(bullet)),
            ...subSection("Data Ownership", data.design.ownership.map(bullet)),
            ...subSection("Data Model (ERD)", [
              new Paragraph("Entities and relationships:"),
              codeBlock(data.design.erd),
            ]),
            ...subSection("Data Flow", data.design.dataFlow.map(bullet)),
            ...subSection("Caching / Indexing", data.design.caching.map(bullet)),
            ...subSection("Migration / Backfill", data.design.migrations.map(bullet)),
          ]),
          ...section("Data Model: Field Definitions", data.fields.map(bullet)),
          ...section("Functional Requirements", data.functional.map(bullet)),
          ...section("Non‑Functional Requirements", data.nonFunctional.map(bullet)),
          ...section("Routing & URL Behavior", data.routing.map(bullet)),
          ...section("Exact GraphQL (Current Repo)", data.graphql.map(codeBlock)),
          ...section("API / GraphQL Contract", data.apis.map(bullet)),
          ...section("Proposed Code Diff (Skeleton)", data.diffs.map(codeBlock)),
          ...section("Implementation Plan (Task‑Level)", data.plan.map(bullet)),
          ...section("Migration / Backfill Steps", data.migrations.map(bullet)),
          ...section("Test Plan", [
            ...subSection("Unit Tests", data.tests.unit.map(bullet)),
            ...subSection("Integration Tests", data.tests.integration.map(bullet)),
            ...subSection("Manual QA", data.tests.qa.map(bullet)),
          ]),
          ...section("QA Test Cases (Expected Results)", data.qaCases.map(bullet)),
          ...section("Analytics / Tracking", data.analytics.map(bullet)),
          ...section("Risks & Dependencies", data.risks.map(bullet)),
          ...section("Assumptions / Unknowns", data.assumptions.map(bullet)),
          ...section("Open Questions", data.questions.map(bullet)),
          ...section("Acceptance Criteria", data.acceptance.map(bullet)),
          ...section("Rollout / Release", data.rollout.map(bullet)),
          ...section("Code References", data.refs.map(bullet)),
        ],
      },
    ],
  });

const shared = {
  status: "Draft",
  owner: "Product + Eng",
  stakeholders: "Product, Design, Engineering, SEO",
  updated: new Date().toISOString().slice(0, 10),
};

const base = (overview) => ({
  ...shared,
  overview,
  goals: [],
  nonGoals: [],
  userStories: [],
  scope: [],
  design: { boundaries: [], ownership: [], erd: "", dataFlow: [], caching: [], migrations: [] },
  fields: [],
  functional: [],
  nonFunctional: [],
  routing: [],
  graphql: ["Not found in repo"],
  apis: [],
  diffs: [],
  plan: [],
  migrations: [],
  tests: { unit: [], integration: [], qa: [] },
  qaCases: [],
  analytics: [],
  risks: [],
  assumptions: [],
  questions: [],
  acceptance: [],
  rollout: [],
  refs: [],
});

const diff = (path, patch) => `diff --git a/${path} b/${path}\n${patch}`;

const features = [
  {
    name: "PayloadCMS on Azure",
    file: "PayloadCMS_on_Azure_Confluence.docx",
    data: {
      ...base("Deploy PayloadCMS + Next.js on Azure and integrate as the content platform for structured pages."),
      goals: ["Azure-hosted PayloadCMS environment", "Stable content delivery for CMS-driven pages"],
      nonGoals: ["Data migration from WordPress/v13"],
      scope: ["Azure infrastructure, CMS deployment, environment configuration"],
      design: {
        boundaries: ["Azure hosts Payload + Next.js", "CMS provides content via API"],
        ownership: ["CMS data owned by Payload collections"],
        erd: "Payload Collections 1---* Documents\nMedia 1---* Documents",
        dataFlow: ["Editor writes in CMS → API → Next.js renders"],
        caching: ["ISR + Azure CDN caching"],
        migrations: ["Provision DB + storage; no content import"],
      },
      fields: [
        "collections.Payload: collection config (slug, fields[], access rules)",
        "Media: { id, filename, url, mimeType, size, createdAt }",
      ],
      functional: ["Deploy PayloadCMS", "Expose REST/GraphQL APIs"],
      nonFunctional: ["High availability", "Secure secrets storage"],
      routing: ["CMS routes handled in Next.js"],
      graphql: ["Not found in repo"],
      apis: ["Payload REST/GraphQL endpoints"],
      diffs: [diff("payload.config.ts", "+// Define Payload collections and Azure storage adapter\n")],
      plan: ["Provision Azure resources", "Deploy Payload", "Wire Next.js to CMS"],
      migrations: ["Provision DB schemas", "Create admin user"],
      tests: { unit: ["CMS health check"], integration: ["Fetch content via API"], qa: ["Manual publish → render check"] },
      qaCases: ["Publish CMS entry → verify render in Next.js"],
      risks: ["Infrastructure misconfig"],
      acceptance: ["CMS accessible and serving content"],
      rollout: ["Deploy staging then production"],
      refs: ["ContextFiles/HumanDocuments/Features/BRD - PayloadCMS on Azure.docx"],
    },
  },
  {
    name: "Update Therapist URLs",
    file: "Update_Therapist_URLs_Confluence.docx",
    data: {
      ...base("Update therapist URL routing to use curated flat slugs from Navigation Bar 2.3.5 (Therapists tab) while preserving visual menu hierarchy."),
      goals: ["Flat therapist URLs", "Legacy redirects", "Geo path support"],
      nonGoals: ["Other verticals"],
      userStories: ["Shareable URLs"],
      scope: ["Use Column F for target URL"],
      design: {
        boundaries: ["Frontend menu", "Backend nav data", "Redirect layer"],
        ownership: ["Navigation Bar 2.3.5 Excel"],
        erd: "NavigationCategory 1---* NavigationSubCategory 1---* NavigationSubSubCategory",
        dataFlow: ["Excel → nav tables → MegaMenu → slug router"],
        caching: ["Cache nav queries"],
        migrations: ["Backfill targetUrl field"],
      },
      fields: [
        "NavigationCategory: { id, name, slug }",
        "NavigationSubCategory: { id, name, slug, parentId }",
        "NavigationSubSubCategory: { id, name, slug, parentId }",
        "NavItem.targetUrl: string (from Column F)",
      ],
      functional: ["Decouple menu hierarchy and URL"],
      routing: ["/{flat_slug}", "/{country}/{state}/{city}/{flat_slug}"],
      graphql: [
        gqlByName("NAVIGATION_CATEGORY") || "Not found",
        gqlByName("NAVIGATION_SUB_CATEGORY") || "Not found",
        gqlByName("NAVIGATION_SUB_2_CATEGORY") || "Not found",
        gqlByName("NAVIGATION_SUB_3_CATEGORY") || "Not found",
        gqlByName("NAVIGATION_SUB_SUB_CATEGORY") || "Not found",
        gqlByName("GET_NAME_SLUG") || "Not found",
        gqlByName("SERP_PAGE_NEW") || "Not found",
      ],
      apis: ["GET_NAME_SLUG, SERP_PAGE_NEW"],
      diffs: [
        diff("RG-Frontend/src/components/MegaMenu/MegaMenu.tsx", "+// use item.targetUrl instead of nested path\n"),
        diff("RG-Frontend/src/pages/[...slug].tsx", "+// resolve flat slug + redirectSlug\n"),
      ],
      plan: ["Update ingestion", "Expose targetUrl", "Update MegaMenu", "Add redirects"],
      migrations: ["Backfill targetUrl for Therapists", "Generate redirect map"],
      tests: { unit: ["Slug resolver"], integration: ["Menu click routes to flat URL"], qa: ["10 item spot check"] },
      qaCases: ["Old nested URL returns 301 to flat URL"],
      acceptance: ["All therapist URLs flat + redirects"],
      rollout: ["Therapists only"],
      refs: ["RG-Frontend/src/pages/[...slug].tsx"],
    },
  },
  {
    name: "Custom Support Chatbots",
    file: "Custom_Support_Chatbots_Confluence.docx",
    data: {
      ...base("Replace Microsoft Copilot with a cheaper chatbot grounded in internal Word docs using OpenAI managed files/retrieval (MVP)."),
      goals: ["Answer support FAQs from Word docs", "No fine-tuning"],
      nonGoals: ["Custom retrieval infra"],
      scope: ["Word doc ingestion to managed file store"],
      design: {
        boundaries: ["Ingestion pipeline", "Chat UI", "OpenAI retrieval"],
        ownership: ["Docs as source of truth"],
        erd: "Document 1---* Chunk 1---* Embedding\nChatSession 1---* Message",
        dataFlow: ["Upload docs → index → chat query → response"],
        caching: ["Cache embeddings"],
        migrations: ["One-time doc import"],
      },
      fields: ["Document: { id, title, sourceUrl, uploadedAt }", "Chunk: { id, docId, text, embeddingId }"],
      functional: ["Upload Word docs", "Query retrieval + chat response"],
      graphql: ["Not found in repo"],
      diffs: [diff("RG-Frontend/src/components/SupportChatbot.tsx", "+// chat UI and retrieval call\n")],
      plan: ["Implement ingestion", "Build chat UI", "Wire retrieval"],
      migrations: ["Import Word docs as files"],
      tests: { unit: ["Retriever returns top chunks"], integration: ["Chat response with citations"], qa: ["Compare against Copilot answers"] },
      qaCases: ["Ask known FAQ → response cites correct doc"],
      refs: ["ContextFiles/HumanDocuments/Features/BRD – Customer Support Chatbots.txt"],
    },
  },
  {
    name: "Calendar Improvements",
    file: "Calendar_Improvements_Confluence.docx",
    data: {
      ...base("Enhance provider scheduling to manage availability and booking slots."),
      goals: ["Better availability controls"],
      scope: ["Calendar functionality app"],
      design: {
        boundaries: ["Frontend calendar UI", "Backend calendar_functionality"],
        ownership: ["Calendar data in calendar_functionality models"],
        erd: "CareProvider 1---* Slot 1---* Appointment",
        dataFlow: ["Provider sets availability → slots → client booking"],
        caching: ["Cache slot queries"],
        migrations: ["Backfill new slot fields if needed"],
      },
      fields: ["Slot: { id, providerId, start, end, type, status }", "Appointment: { id, slotId, clientId, status }"],
      functional: ["Manage recurring availability", "Book slots"],
      routing: ["/cp-calendar"],
      graphql: ["Not found in repo"],
      diffs: [diff("RG-Frontend/src/pages/cp-calendar/index.tsx", "+// add recurring availability UI\n")],
      plan: ["Update slot model", "Update calendar UI", "Update booking flow"],
      migrations: ["Backfill slot types"],
      tests: { unit: ["Slot generation"], integration: ["Book appointment"], qa: ["Provider availability changes reflected"] },
      qaCases: ["Recurring availability creates expected slots"],
      refs: ["RG-Frontend/src/pages/cp-calendar/index.tsx"],
    },
  },
  {
    name: "Session Notifications",
    file: "Session_Notifications_Confluence.docx",
    data: {
      ...base("Send session reminders (email/popup) tied to appointments and calendar integration."),
      goals: ["Reduce no-shows"],
      design: {
        boundaries: ["Frontend calendar event creation", "Backend scheduling system"],
        ownership: ["Appointment + reminder settings"],
        erd: "Appointment 1---* Reminder",
        dataFlow: ["Booking → reminder config → calendar event"],
        caching: ["N/A"],
        migrations: ["Add reminder fields if missing"],
      },
      fields: ["Reminder: { method, minutesBefore, appointmentId }"],
      functional: ["Create reminders on booking"],
      diffs: [diff("RG-Frontend/src/components/Popup/SelectAppointmentModal.tsx", "+// send reminder payload\n")],
      plan: ["Add reminder settings", "Integrate with calendar"],
      migrations: ["Add reminder defaults"],
      tests: { unit: ["Reminder payload"], integration: ["Calendar event includes reminders"], qa: ["Email reminder received"] },
      qaCases: ["Calendar event contains email + popup reminders"],
      refs: ["RG-Frontend/src/components/Popup/SelectAppointmentModal.tsx"],
    },
  },
  {
    name: "Therapists - SERPs",
    file: "Therapists_SERPs_Confluence.docx",
    data: {
      ...base("SEO-focused SERP pages for therapist keywords with schema + breadcrumbs."),
      goals: ["Indexable SERP pages", "Schema markup"],
      design: {
        boundaries: ["SERP page template", "Backend SERP data"],
        ownership: ["SERP data in serp_result models"],
        erd: "SerpResult 1---* Faq",
        dataFlow: ["Keyword → SERP query → page render"],
        caching: ["ISR for SERP pages"],
        migrations: ["Populate SERP data"],
      },
      fields: ["SerpResult: { id, title, content, categoryIds[] }", "Faq: { question, answer, serpResultId }"],
      functional: ["Breadcrumb schema", "FAQ schema"],
      graphql: [gqlByName("SERP_PAGE_NEW") || "Not found"],
      diffs: [diff("RG-Frontend/src/pages/[...slug].tsx", "+// inject breadcrumb schema\n")],
      plan: ["Implement SERP schema", "Add metadata"],
      migrations: ["Backfill SERP content"],
      tests: { unit: ["Schema JSON output"], integration: ["SERP renders"], qa: ["Rich results test passes"] },
      qaCases: ["Rich Results Test has 0 errors"],
      refs: ["ContextFiles/HumanDocuments/Features/BRD - Therapists - SERPs.txt"],
    },
  },
  {
    name: "Suicide Hotline Pages",
    file: "Suicide_Hotline_Pages_Confluence.docx",
    data: {
      ...base("Publish country-specific crisis hotline pages with manual data entry and schema injection."),
      goals: ["100% fidelity", "SEO-ready"],
      design: {
        boundaries: ["Payload CMS", "Next.js ISR", "Middleware routing"],
        ownership: ["CMS content"],
        erd: "Regions 1---* Hotline_Pages\nHotline_Pages 1---* Hotline_Entries 1---* Contact_Methods",
        dataFlow: ["Editor → CMS → ISR render"],
        caching: ["ISR 60s"],
        migrations: ["Manual entry"],
      },
      fields: ["Hotline_Page: { countryCode, regionId, content, schemaJson }", "Hotline_Entry: { orgName, description, tags[] }", "Contact_Method: { type, label, value, smsBody, isPrimary }"],
      graphql: [gqlByName("RETRIEVE_MANAGEPAGE_BY_SLUG") || "Not found"],
      diffs: [diff("RG-Frontend/src/pages/[...slug].tsx", "+// render hotline CMS schema and CTAs\n")],
      plan: ["Create Payload collections", "Implement routing middleware", "Build page template"],
      migrations: ["Manual migration per country"],
      tests: { unit: ["Middleware regex"], integration: ["CMS render"], qa: ["Phone CTA works"] },
      qaCases: ["tel: link opens dialer with correct digits"],
      refs: ["ContextFiles/HumanDocuments/Features/BRD - Global Suicide & Crisis Hotline Pages - English V2.docx"],
    },
  },
  {
    name: "Nav Bar UX/UI improvements",
    file: "Nav_Bar_UX_UI_Improvements_Confluence.docx",
    data: {
      ...base("Replace plugin nav with custom mega-menu based on Navigation Bar 2.4 data."),
      goals: ["Clean mega menu"],
      design: {
        boundaries: ["MegaMenu component", "Nav GraphQL"],
        ownership: ["Nav data from spreadsheet"],
        erd: "NavigationCategory 1---* NavigationSubCategory 1---* NavigationSubSubCategory",
        dataFlow: ["Nav query → MegaMenu"],
        caching: ["Cache nav queries"],
        migrations: ["None"],
      },
      fields: ["NavItem: { label, targetUrl, parentId }"],
      graphql: [
        gqlByName("NAVIGATION_CATEGORY") || "Not found",
        gqlByName("NAVIGATION_SUB_CATEGORY") || "Not found",
        gqlByName("NAVIGATION_SUB_2_CATEGORY") || "Not found",
        gqlByName("NAVIGATION_SUB_3_CATEGORY") || "Not found",
        gqlByName("NAVIGATION_SUB_SUB_CATEGORY") || "Not found",
      ],
      diffs: [diff("RG-Frontend/src/components/MegaMenu/MegaMenu.tsx", "+// new column layout algorithm\n")],
      plan: ["Implement layout", "Keyboard nav", "QA spacing"],
      migrations: ["None"],
      tests: { unit: ["Column layout"], integration: ["Menu renders"], qa: ["Spacing check vs Etsy"] },
      qaCases: ["No empty columns for single-link groups"],
      refs: ["RG-Frontend/src/components/MegaMenu/MegaMenu.tsx"],
    },
  },
  {
    name: "Approve Verified Badge in Admin Tool",
    file: "Approve_Verified_Badge_Admin_Tool_Confluence.docx",
    data: {
      ...base("Add admin approval flow for verified badge override."),
      goals: ["Admin can approve verified badge"],
      design: {
        boundaries: ["Admin UI", "Care provider model"],
        ownership: ["Verification status"],
        erd: "CareProvider 1---1 VerificationStatus",
        dataFlow: ["Admin action → update provider"],
        caching: ["Invalidate provider cache"],
        migrations: ["Add verified_override field if missing"],
      },
      fields: ["CareProvider: { is_verified, verified_override, verified_by, verified_at }"],
      diffs: [diff("Lumy-Backend/apps/care_provider/mutations.py", "+# add admin override mutation\n")],
      plan: ["Add admin UI action", "Expose mutation"],
      migrations: ["Backfill verified_override = false"],
      tests: { unit: ["Mutation updates status"], integration: ["Admin UI changes badge"], qa: ["Badge visible on profile"] },
      qaCases: ["Override persists after re-login"],
      refs: ["ContextFiles/HumanDocuments/Features/BRD - RG Admin Tool Improvements.txt"],
    },
  },
  {
    name: "Certn Additional Access Fees Automation",
    file: "Certn_Additional_Access_Fees_Automation_Confluence.docx",
    data: {
      ...base("Automate Certn additional access fee handling during provider verification."),
      goals: ["Reduce manual processing"],
      design: {
        boundaries: ["Certn integration", "Billing/fees"],
        ownership: ["Certn fee data"],
        erd: "CertnApplication 1---* Fee",
        dataFlow: ["Certn response → fee flag → invoice"],
        caching: ["N/A"],
        migrations: ["Add fee tracking fields"],
      },
      fields: ["CertnFee: { amount, currency, reason, status }"],
      diffs: [diff("Lumy-Backend/apps/certn/handlers.py", "+# create CertnFee and trigger billing\n")],
      plan: ["Parse Certn fees", "Trigger billing"],
      migrations: ["Create CertnFee table"],
      tests: { unit: ["Fee parsing"], integration: ["Fee triggers billing"], qa: ["Compare manual vs automated"] },
      qaCases: ["Additional fee causes invoice creation"],
      refs: ["ContextFiles/HumanDocuments/Features/BRD - Certn Additional Access Fees Automation.txt"],
    },
  },
  {
    name: "Symantec Search",
    file: "Symantec_Search_Confluence.docx",
    data: {
      ...base("Assumed to mean Semantic Search (term ambiguous). Confirm naming in source docs."),
      goals: ["Improve search relevance"],
      design: {
        boundaries: ["Search API", "Indexing pipeline"],
        ownership: ["Search index"],
        erd: "SearchIndex 1---* IndexedDocument",
        dataFlow: ["Content → embeddings → search results"],
        caching: ["Cache top queries"],
        migrations: ["Backfill embeddings"],
      },
      fields: ["IndexedDocument: { id, sourceId, embeddingId, text }"],
      graphql: [gqlByName("SEMANTIC_SEARCH") || "Not found"],
      diffs: [diff("RG-Frontend/src/graphql/query/query.ts", "+// add semantic search query usage\n")],
      plan: ["Confirm feature scope", "Implement embeddings", "Wire search endpoint"],
      migrations: ["Backfill embeddings"],
      tests: { unit: ["Embedding generation"], integration: ["Search query returns results"], qa: ["Relevance spot check"] },
      assumptions: ["Assumed typo for Semantic Search"],
      questions: ["Is this a typo for Semantic Search?"],
    },
  },
  {
    name: "Find Matches",
    file: "Find_Matches_Confluence.docx",
    data: {
      ...base("Survey-driven matching flow to recommend providers."),
      goals: ["Improve match quality"],
      design: {
        boundaries: ["Survey UI", "Matching algorithm"],
        ownership: ["Survey responses"],
        erd: "SurveyResponse 1---* MatchResult",
        dataFlow: ["Survey → scoring → results"],
        caching: ["Cache match results"],
        migrations: ["Add survey fields"],
      },
      fields: ["SurveyResponse: { userId, answers[], createdAt }", "MatchResult: { providerId, score }"],
      diffs: [diff("RG-Frontend/src/pages/find-matches/index.tsx", "+// render survey + results\n")],
      plan: ["Define survey schema", "Implement scoring", "Render results"],
      migrations: ["Create survey tables"],
      tests: { unit: ["Scoring logic"], integration: ["Survey submits"], qa: ["Result list accuracy"] },
      qaCases: ["Same inputs produce deterministic ranking"],
    },
  },
  {
    name: "US Booking Location Confirmation",
    file: "US_Booking_Location_Confirmation_Confluence.docx",
    data: {
      ...base("Confirm user is located in the US state at booking time for in-person sessions."),
      goals: ["Compliance check"],
      design: {
        boundaries: ["Booking flow", "Location capture"],
        ownership: ["Address fields"],
        erd: "Appointment 1---1 Location",
        dataFlow: ["User address → booking confirmation"],
        caching: ["N/A"],
        migrations: ["Add location attestation field"],
      },
      fields: ["Appointment: { location_state, location_country, attested_at }"],
      diffs: [diff("RG-Frontend/src/pages/booking/index.tsx", "+// add US attestation checkbox\n")],
      plan: ["Add attestation checkbox", "Persist state"],
      migrations: ["Add attestation field"],
      tests: { unit: ["Validation rules"], integration: ["Cannot book without confirm"], qa: ["Correct wording"] },
      qaCases: ["Attestation required for US in-person booking"],
      refs: ["RG-Frontend/src/pages/cp/profile/InPersonGoogleLoaction.tsx"],
    },
  },
  {
    name: "Mailmodo kicking off wrong email after signup",
    file: "Mailmodo_Wrong_Email_After_Signup_Confluence.docx",
    data: {
      ...base("Fix incorrect Mailmodo journey triggers after signup."),
      goals: ["Right email journey triggered"],
      design: {
        boundaries: ["Signup flow", "Mailmodo triggers"],
        ownership: ["Email trigger mapping"],
        erd: "User 1---* EmailTrigger",
        dataFlow: ["Signup → trigger selection → Mailmodo API"],
        caching: ["N/A"],
        migrations: ["Update trigger mapping"],
      },
      fields: ["EmailTrigger: { eventName, journeyId, userType }"],
      diffs: [diff("RG-Frontend/src/lib/api.ts", "+// send correct Mailmodo event\n")],
      plan: ["Trace trigger logic", "Fix mapping", "Backfill?"],
      migrations: ["Update journey mapping table"],
      tests: { unit: ["Trigger selection"], integration: ["Mailmodo API receives correct event"], qa: ["Email received"] },
      qaCases: ["Client signup triggers client journey, not provider journey"],
    },
  },
  {
    name: "Customer Support Blog",
    file: "Customer_Support_Blog_Confluence.docx",
    data: {
      ...base("Launch customer support blog (WordPress preferred) for help content."),
      goals: ["Support content discovery"],
      design: {
        boundaries: ["WordPress CMS", "Frontend integration"],
        ownership: ["WordPress content"],
        erd: "Post 1---* Category 1---* Tag",
        dataFlow: ["WP publish → API → frontend render"],
        caching: ["Cache blog pages"],
        migrations: ["Initial content import if any"],
      },
      fields: ["Post: { id, title, slug, content, excerpt, publishedAt }"],
      diffs: [diff("RG-Frontend/src/pages/support-blog/[slug].tsx", "+// render WordPress post\n")],
      plan: ["Provision WP", "Integrate API", "Build listing + detail pages"],
      migrations: ["Import existing posts"],
      tests: { unit: ["API fetch"], integration: ["Render post"], qa: ["SEO metadata"] },
      qaCases: ["Post renders with correct canonical URL"],
      refs: ["ContextFiles/HumanDocuments/Features/BRD - Customer Support Blog.txt"],
    },
  },
  {
    name: "Location-based navigation content",
    file: "Location_Based_Navigation_Content_Confluence.docx",
    data: {
      ...base("Adjust navigation or SERP content based on user location."),
      goals: ["More relevant navigation"],
      design: {
        boundaries: ["Geo detection", "Nav content"],
        ownership: ["Location settings"],
        erd: "Location 1---* NavContent",
        dataFlow: ["Geo detect → fetch nav content"],
        caching: ["Geo cache"],
        migrations: ["Populate location content"],
      },
      fields: ["NavContent: { locationCode, navOverrides }"],
      diffs: [diff("RG-Frontend/src/components/MegaMenu/MegaMenu.tsx", "+// apply location overrides\n")],
      plan: ["Define geo rules", "Implement lookup", "Update nav render"],
      migrations: ["Create nav overrides table"],
      tests: { unit: ["Geo parsing"], integration: ["Nav changes by location"], qa: ["Manual geo spoof" ] },
      qaCases: ["User in CA sees CA-specific nav nodes"],
    },
  },
  {
    name: "Talk Now",
    file: "Talk_Now_Confluence.docx",
    data: {
      ...base("Immediate availability filter for providers (is_talk_now)."),
      goals: ["Show only available providers"],
      design: {
        boundaries: ["Frontend filter", "Backend provider query"],
        ownership: ["is_talk_now flag"],
        erd: "CareProvider (is_talk_now)",
        dataFlow: ["Provider status → SERP filter"],
        caching: ["Short TTL"],
        migrations: ["Ensure is_talk_now field"],
      },
      fields: ["CareProvider: { is_talk_now: boolean }"],
      graphql: [gqlByName("SERP_PAGE_NEW") || "Not found"],
      diffs: [diff("Lumy-Backend/apps/care_provider/queries.py", "+# add is_talk_now filter\n")],
      plan: ["Expose filter", "Update SERP query", "Add UI toggle"],
      migrations: ["Backfill is_talk_now=false"],
      tests: { unit: ["Filter logic"], integration: ["SERP filtered"], qa: ["UI toggle works"] },
      qaCases: ["Toggle show-only-available returns subset"],
      refs: ["Lumy-Backend/apps/care_provider/models.py"],
    },
  },
  {
    name: "Review System",
    file: "Review_System_Confluence.docx",
    data: {
      ...base("Implement review system with moderation rules (per BRD)."),
      goals: ["Collect verified reviews"],
      design: {
        boundaries: ["Review UI", "Moderation pipeline"],
        ownership: ["Review data"],
        erd: "Review 1---1 Appointment\nReview 1---* ModerationFlag",
        dataFlow: ["Submit review → moderation → publish"],
        caching: ["Cache reviews"],
        migrations: ["Create review tables"],
      },
      fields: ["Review: { id, appointmentId, rating, text, status }", "ModerationFlag: { rule, severity }"],
      diffs: [diff("Lumy-Backend/apps/review/models.py", "+# define Review + ModerationFlag\n")],
      plan: ["Create review model", "Add submission UI", "Add moderation rules"],
      migrations: ["Create review tables"],
      tests: { unit: ["Profanity/flag rules"], integration: ["Review publish flow"], qa: ["Review appears on profile"] },
      qaCases: ["Flagged review enters moderation queue"],
      refs: ["ContextFiles/HumanDocuments/Features/BRD - Review System V6.txt"],
    },
  },
  {
    name: "Therapy and Support Groups",
    file: "Therapy_and_Support_Groups_Confluence.docx",
    data: {
      ...base("Surface therapy/support group categories and scheduling for group sessions."),
      goals: ["Group session discoverability"],
      design: {
        boundaries: ["Navigation", "Calendar session types"],
        ownership: ["SessionType constants"],
        erd: "SessionType (group) 1---* Session",
        dataFlow: ["Nav → SERP → booking"],
        caching: ["Cache group SERPs"],
        migrations: ["Ensure group session types"],
      },
      fields: ["SessionType: { code, label }", "Session: { id, type, slots[] }"],
      diffs: [diff("Lumy-Backend/apps/calendar_functionality/constants.py", "+# add group session types\n")],
      plan: ["Add nav items", "Map to SERPs", "Add booking flow"],
      migrations: ["Insert group session types"],
      tests: { unit: ["Session type mapping"], integration: ["Group booking"], qa: ["Nav links"] },
      qaCases: ["Group category page renders correctly"],
      refs: ["Lumy-Backend/apps/calendar_functionality/constants.py"],
    },
  },
  {
    name: "Direct Booking Link",
    file: "Direct_Booking_Link_Confluence.docx",
    data: {
      ...base("Create a shareable direct booking link for providers."),
      goals: ["Book without search"],
      design: {
        boundaries: ["Booking landing route", "Appointment creation"],
        ownership: ["Provider public booking URL"],
        erd: "CareProvider 1---1 BookingLink",
        dataFlow: ["Link → booking flow → appointment"],
        caching: ["Cache provider lookup"],
        migrations: ["Add booking link field"],
      },
      fields: ["BookingLink: { providerId, slug, isActive }"],
      diffs: [diff("RG-Frontend/src/pages/book/[provider].tsx", "+// booking landing page\n")],
      plan: ["Define URL format", "Create booking landing page", "Wire appointment creation"],
      migrations: ["Backfill booking links"],
      tests: { unit: ["Link parser"], integration: ["Booking via link"], qa: ["Link works for providers"] },
      qaCases: ["Booking link opens correct provider calendar"],
    },
  },
  {
    name: "Offsite Booking Link",
    file: "Offsite_Booking_Link_Confluence.docx",
    data: {
      ...base("Support provider offsite booking links (external scheduling)."),
      goals: ["Allow external booking"],
      design: {
        boundaries: ["Provider profile", "External URL handling"],
        ownership: ["Offsite URL field"],
        erd: "CareProvider 1---1 OffsiteBookingLink",
        dataFlow: ["Profile CTA → external URL"],
        caching: ["N/A"],
        migrations: ["Add offsite link field"],
      },
      fields: ["OffsiteBookingLink: { providerId, url, label }"],
      diffs: [diff("RG-Frontend/src/containers/cp-detail-preview/cp-schedule/cp-schedule.tsx", "+// render external booking CTA\n")],
      plan: ["Add field to provider profile", "Render CTA", "Track outbound clicks"],
      migrations: ["Backfill if needed"],
      tests: { unit: ["URL validation"], integration: ["CTA redirects"], qa: ["No broken links"] },
      qaCases: ["External link opens new tab"],
    },
  },
];

for (const feat of features) {
  const document = docFor(feat.name, feat.data);
  const buf = await Packer.toBuffer(document);
  await writeFile(path.join(outDir, feat.file), buf);
}

console.log(`Wrote ${features.length} docs to ${outDir}`);

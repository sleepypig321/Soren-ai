Soren is a new, independent AI business intelligence partner developed during the October 26–November 4, 2026 hackathon by **Rachel Croxton, a working retail store manager**. It was born from firsthand operational problems—not a hypothetical startup exercise. After managing stores, rebuilding underperforming sales floors, handling merchandising and staffing problems, changing operating hours, upselling customers, and trying to make sense of incomplete point-of-sale reports, I kept encountering the same gap: a store can have plenty of numbers and still lack a clear understanding of what to do next.

A manager knows the context behind a sales spike, a slow day, an out-of-stock shelf, or an employee who never offers an add-on. A POS report knows the transactions it recorded. **Neither has the whole picture by itself.** Soren is designed to connect those two sources: the reported data and the human operational knowledge behind it.

Soren combines a private, evolving business workspace, retained reporting history, deterministic retail analysis, dated management notes, and a distinctly candid AI conversational partner. His value is not merely telling a manager what revenue was. It is helping them investigate **why the business might be changing, what the evidence can actually support, and what action is worth taking next**—without fabricating causes or pretending missing data exists.

**Live app:** https://soren-ai.fern-croxton.workers.dev

## The real retail problem

Independent retailers often lack a dedicated analyst, purchasing team, or business intelligence department. The manager is the person greeting customers, training staff, merchandising, tracking stockouts, making sales, changing displays, and then trying to interpret a spreadsheet after closing.

These are pain points I have personally dealt with:

- **Revenue is not the whole story.** A stronger sales day doesn't necessarily mean higher profit, better conversion, or healthier inventory. If cost, traffic, and transaction data are absent, the right answer is to identify that gap.
- **Frontline decisions are lost.** Managers remember when they reorganized shelves, changed hours, launched promotions, or started upselling. A static sales export does not record those decisions. Soren can retain dated management context alongside reported sales to investigate changes over time.
- **Reports are fragmented and short-lived.** Businesses accumulate separate exports instead of an evolving operational record. Soren stores multiple reports within a selected workspace, reconciles their dates, and builds a longer sales timeline.
- **Low-margin products and stockouts complicate decisions.** Something can drive traffic without delivering meaningful contribution. Soren uses actual supplied costs and inventory records where available, and flags what cannot be concluded without them.
- **Owners and managers need a thinking partner, not another dashboard full of unexplained graphs.** Soren turns observed patterns into a conversation about tradeoffs, next steps, and measurable questions. He can be blunt and funny without inventing evidence.

The longer-term vision is a business intelligence partner that **evolves as the owner and business evolve**: each import extends the record, each saved operational decision adds context, and future questions can be grounded in more of the business's actual history. Soren currently supports that foundation through retained sales reports and business notes; it is not an automatic integration with every POS or inventory platform.

## Intelligence architecture: universal core, retail specialization

Soren now separates **universal business reasoning** from its first **industry specialization: retail**. The Worker composes both at runtime from `worker/intelligence.ts`, alongside its independent conversational voice. Other industry modules are a future roadmap, **not active capabilities in this submission**.

The universal core sets an explicit evidence hierarchy: verified records and authoritative retrieved sources, owner-reported observations, inspectable calculations, tentative interpretations, and unconfirmed hypotheses. It requires accurate time periods and denominators, honest uncertainty, careful source attribution, and reversible recommendations with measurable outcomes. It cannot claim to have performed live external research when no retrieval capability was provided.

The retail specialization adds domain checks for conversion, basket economics, product contribution, merchandising, inventory, staffing, reporting completeness, and product-specific regulatory questions. It must ask for missing traffic or transaction counts instead of inventing them, and avoid calling a timing correlation proof of a business decision's impact.

The architecture is designed to grow into additional industry-specific modules while preserving the same evidence standards. This is a **prompt-level reasoning framework**, not a guarantee of expert accuracy; deterministic calculations, real data, tests, and human review remain essential.

## What Soren can do today

### Build an evolving, private business history

- Google and email authentication; separate private business workspaces.
- Clover Daily Sales Report CSV import, with date and reported-total validation.
- Multiple saved Clover reports, merged into a chronological history; later imports supersede overlapping daily dates instead of double-counting them.
- Custom daily financial CSV import (date, revenue, transactions, COGS), with separately retained report history and period-appropriate optional fixed costs.
- Private account-scoped data import synchronization when online, with a browser-local copy as fallback. Avoid using shared devices for sensitive business reports.

### Investigate retail performance without fake certainty

- Business overview and evidence-based investigation panels using imported figures, including recent-versus-prior seven-day net sales where a complete comparison is available.
- Dated management notes that provide context for before-and-after sales comparisons. A timing relationship is meaningful to investigate but does **not prove causation**.
- Inventory CSV analysis of supplied products, unit costs, prices, on-hand stock and sales velocity. Inventory is browser-local, not yet cloud-synced; Soren never supplies a fictional product catalog.

### Talk to a business partner with a personality

- Meta Muse Spark-powered chat when enabled and authenticated, grounded in supplied business records and relevant saved notes.
- A direct, witty, action-first voice informed by the founder's own retail management judgment: practical, curious, occasionally cheeky, and willing to push back.
- Clear distinctions among recorded figures, the manager's firsthand observations, calculated comparisons, reasonable hypotheses, and unanswered questions. No public page pretends canned example dialogue came from the live model.
- A server-side D1 request reservation guard that separates development and judging phases. Reservations are protective internal accounting, not provider billing figures.

## What works

## Quick judge walkthrough

1. Open the live app and sign in; choose or create a private business workspace.
2. Open Data Sources and import a genuine Clover Daily Sales Report CSV in **Daily** view. The business overview and retail investigation update from these records.
3. Import another reporting period to see the retained report archive and merged timeline. Overlapping dates are replaced by the most recent report.
4. In Business DNA, save a dated management observation (for example, a changed store schedule). Ask Soren to examine sales before and after the date. He should distinguish factual net-sales movements from unproven causes.
5. Ask a practical operational question to see the combination of evidence-based judgment and blunt conversational voice.

**Important:** The site does not ship with fabricated sales, costs, inventory, or preview AI answers. Demonstrate with your own authorized data. Avoid exposing confidential details in the public submission video.

## Data requirements and limits

Clover's Daily Sales Report supports reported **net sales**, not automatically transactions, COGS, employee conversion, actual store opening hours, or causation. Profit and margin require separate real cost information. A business with no imported data should show missing/unknown states, not zero-dollar results or invented forecasts.

Custom financial CSV uses columns such as:

```csv
date,revenue,transactions,cogs
2026-10-01,124,7,73
2026-10-02,89,5,54
```

Inventory CSV requires `sku,name,unit_cost,price,on_hand,sold_30d` (optional `reorder_point,lead_days`). Sales/line-items exports alone cannot establish live stock on hand.

## Run and build

Requires Node.js 20+.

```bash
npm install
npm run build
npm run dev
```

The frontend uses TypeScript and Vite, with a Cloudflare Worker chat endpoint and Supabase authentication/private persistence. Never commit API keys. The Meta API key belongs in a Cloudflare secret. Model calls are guarded and can be disabled by deployment configuration.

## Independent authorship and AI-assisted development

Soren is an **independent, solo project created and directed by Rachel Croxton** for the October 26–November 4, 2026 hackathon. I identified the retail problems through my own management experience, defined the product vision, selected the features, guided the design and behavior, made the product decisions, and evaluated the results. **There are no additional human teammates or co-founders on this submission.**

**AI-assisted development disclosure:** I used AI coding assistance to help implement, refine, debug, and review the application. This assistance does not represent an additional human teammate. The project concept, requirements, direction, and submission responsibility are mine. AI-generated or AI-assisted code was reviewed and iterated against the intended real-world use cases.

The submitted implementation was developed during the hackathon, and the code and application are contained in this public repository.

Soren is a decision-support product, not an accounting system or a source of independently verified explanations for business results. Its voice is deliberately distinctive, but no static canned dialogue is presented as a live AI answer.

## Submission checklist

- [x] Public source repository
- [x] Deployed application with account and business workspaces
- [x] Real-data CSV imports and retained report history
- [x] Evidence-based investigation and contextual AI conversation
- [ ] Record and review a video of **three minutes or less**
- [ ] Verify one signed-in end-to-end scenario, if judging credits allow
- [ ] Submit the project link, repository, and video before the official deadline

License not selected; all rights reserved unless a license is added.

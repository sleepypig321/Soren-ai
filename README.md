# SOREN — Intelligence With Intention

**Meta Global AI Developer Hackathon 2026 · AI business intelligence partner for independent retailers**

Soren is a new, independent project built during the October 26–November 4, 2026 hackathon. It combines a private, multi-business workspace, retained sales-report history, deterministic retail analysis, dated operational memory, and a candid conversational AI persona. The goal is to help a manager connect what happened on the floor with what the numbers actually show—without confusing a plausible explanation with proof.

**Live app:** https://soren-ai.fern-croxton.workers.dev

## What works

- Google and email authentication; separate private business workspaces.
- Clover Daily Sales Report CSV import, with date and reported-total validation.
- Multiple saved Clover reports, merged into a chronological history; later imports supersede overlapping daily dates instead of double-counting them.
- Custom daily financial CSV import (date, revenue, transactions, COGS), with separately retained report history and period-appropriate optional fixed costs.
- Business overview and evidence-based investigation panels using imported figures, including recent-versus-prior seven-day net sales where a complete comparison is available.
- Inventory CSV analysis for actual supplied product, cost, stock, and sales-velocity fields; no fictional catalog. Inventory is browser-local, not synced to the cloud.
- Soren chat powered by Meta Muse Spark when enabled and authenticated. The AI is instructed to distinguish observed figures, owner-provided observations, hypotheses, and missing information, while speaking with a frank, playful, action-first personality.
- Business notes and relevant dated milestones used as context for sales comparisons. Timing can suggest hypotheses, **not prove causality**.
- Private account-scoped data import synchronization when online, with a browser-local copy as fallback. Avoid using shared devices for sensitive business reports.
- A server-side D1 request reservation guard that separates development and judging phases. Reservations are protective accounting, not actual provider billing figures.

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

## Originality and boundaries

Soren is an original implementation developed during the October 26–November 4, 2026 hackathon. The submitted code and application are contained in this public repository.

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

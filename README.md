# SOREN — Intelligence With Intention

**AI business development partner · Meta Global AI Developer Hackathon 2026**

Soren is an original, independent build started during the **October 26 – November 4, 2026** hackathon. It helps business owners inspect sales data, detect opportunities worth investigating, and turn evidence into strategic action. The personality is confident, sharp, warm, and sometimes funny; it never substitutes attitude for evidence.

## What's implemented (October 27)

- Responsive midnight-navy dashboard.
- Synthetic retail sample data (no real customer or store records).
- Local CSV import with schema and numeric validation.
- Deterministic financial analysis: revenue, gross profit, gross margin, average transaction value, modeled operating result, and break-even revenue.
- Variability findings that distinguish observations from causal claims.
- A **fail-closed** Cloudflare Worker API scaffold. Live Meta calls are deliberately **disabled** until an enforceable request/spending guard is deployed. The app can be explored without consuming API credits.

**Not implemented yet:** working Muse Spark inference, a quota guard, deployment, and automated test coverage. Do not describe these as finished in a hackathon demo.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open the Vite URL shown in your terminal. Build with:

```bash
npm run build
```

The public demo uses a synthetic dataset until you import your own CSV. The expected columns are:

```csv
date,revenue,transactions,cogs
2026-10-01,124,7,73
2026-10-02,89,5,54
```

Enter **fixed costs for the same reporting period** as the CSV. If you upload 14 days, enter fixed costs for those 14 days, not a whole month. Operating result is a scenario computed as gross profit minus the entered fixed costs; other operating expenses may be missing. This is not accounting advice.

## Meta integration plan

Intended model: `muse-spark-1.3`, using Meta Model API's Chat Completions endpoint `https://api.meta.ai/v1/chat/completions`. Meta documents bearer-token authorization with `MODEL_API_KEY`: https://dev.meta.ai/docs/cookbook/quickstart-chat-completions

**Never commit a key.** Store it as a Cloudflare secret; enable live usage only after implementing and verifying a durable, atomic quota guard and reviewing billing behavior. Promotional credits may permit Meta to use prompts and responses for product improvement. Do not upload confidential business data.

## Hackathon originality

This repository contains only new work developed for the event. Soren is a separate product and does not import code from SYION or Ostara. The demo should begin by identifying any pre-existing ideas and clearly stating that the submitted implementation was developed during the hackathon.

## Next milestones

1. Automated tests for CSV parsing and calculations.
2. Secure quota/rate-limit service and controlled Meta calls.
3. AI response evaluation using synthetic business scenarios.
4. Deployed demo, documentation, and three-minute submission video.

License not selected yet; all rights reserved until an explicit license is added.

-- Soren shared, fail-closed AI spending reservation ledger.
-- Meta promotional credits: $150.00. Reserve $50 outside this app.
-- This $100 reservation ceiling is conservative bookkeeping, NOT a provider-enforced dollar limit.
-- With a $0.20 reservation per approved request, at most 500 requests can be approved.
-- Do not enable live AI until server validation and Meta account billing safety are confirmed.
CREATE TABLE IF NOT EXISTS ai_budget (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  remaining_cents INTEGER NOT NULL CHECK (remaining_cents >= 0),
  requests_approved INTEGER NOT NULL DEFAULT 0 CHECK (requests_approved >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO ai_budget (id, remaining_cents, requests_approved)
VALUES (1, 10000, 0);

-- Atomic reservation pattern, performed by the Worker only after auth & validation:
-- UPDATE ai_budget
-- SET remaining_cents = remaining_cents - 20,
--     requests_approved = requests_approved + 1,
--     updated_at = CURRENT_TIMESTAMP
-- WHERE id = 1 AND remaining_cents >= 20
-- RETURNING remaining_cents;

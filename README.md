# SculptOS-clinic-
AI assisted dental management software for all your clinical needs.

### Clinic Performance monthly reporting

The `finance` route is labelled **Clinic Performance**. Treatment price management remains in Admin. Reports use `clinic_monthly_performance(clinic_id, month)`; its private aggregate implementation requires the current user's branch `finance.view` permission. Entry creation still requires `finance.manage` through RLS.

- Cash metrics include every recorded transaction in the selected branch/month, independent of ledger pagination. Pending and void entries are excluded. Net cash movement is income minus expenses, not accounting profit.
- Treatment counts use server-stamped completion dates in the branch timezone. Reopening clears the date; completing again stamps the new completion. Pre-migration completions remain undated and are disclosed, never guessed.
- Discounts are current item discounts plus negative plan adjustments on active estimates created in that month (cancelled/deferred items excluded). They are offered estimate discounts, not cash deductions or an immutable historical snapshot. Source edits can change past reports.
- Inventory purchase ledger charges are counted once and allocated across item categories in proportion to purchase-line costs. Missing detail stays unallocated. Existing free-text expense categories are mapped conservatively; unknown categories are Other expenses. New entries store an explicit reporting category.
- Charts, exact daily data, and a monthly CSV use the same aggregate payload. No sample records or fallback figures ship with the report.

`npm run test:permissions` also verifies report totals above 80 transactions, branch isolation, finance-only access, timezone boundaries, pending/void exclusion, inventory reconciliation, leap-month empty states and completion-date integrity in disposable PostgreSQL fixtures.

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

### Pharmacy and prescriptions

Pharmacy reads eight sourced adult dental medicine references from `dental_medicine_references`, plus branch-specific `clinic_medicines`. Reference links and review dates are stored with the data. These are prescribing references, not stock balances, automatic treatment recommendations, or patient seed records. SDCEP/NHS and manufacturer reference doses require clinician review against local product information and each patient's circumstances. Custom medicines can be added, edited and archived with Admin-controlled pharmacy permissions. New pharmacy and prescribing capabilities are admin-only by default; staff require explicit per-member grants.

The treatment plan and pharmacy patient selector open a separate prescription editor. Strength/concentration and administration notes come from the catalogue; dose, frequency and duration require explicit entry. Saving creates an immutable, branch-scoped prescription snapshot with server-stamped author and patient identity. Catalogue edits do not rewrite old prescriptions. Print CSS isolates the saved medication sheet and excludes treatment costs, clinical notes and navigation. Saved versions can be reprinted; changes are saved as new versions.

Financial entries now persist payer/payee, invoice/receipt/UTR reference, subcategory, optional patient link and the expense's related month. Monthly cash reporting still uses the payment date. Doctor calendar cards use the assigned colour at full opacity with luminance-selected black/white text. The redundant Reports navigation and shortcut have been removed.

Clinic letterhead and compact prescriptions: Admin → Clinic setup now saves a branch address, phone and private logo (PNG/JPG/WebP, up to 1 MB). Only branch admins can upload or change branding. Saved prescriptions retain their medication snapshots and use the branch’s current letterhead when reprinted. Pharmacy and prescription choices show medicine, dose, route and frequency code; the doctor confirms the patient-specific regimen before saving.

Expanded medicines: 26 source-backed reference formulations include distinct Pantop D and Pantop D SR strengths, pediatric liquids and labelled emergency medicines. Patient-specific dose/frequency fields stay blank for pediatric and emergency entries. Short administration instructions populate new prescription items, remain editable and are saved in the printed snapshot; existing saved prescriptions and clinic custom medicines are unchanged. The prescription page uses one medicine dropdown without a separate search field.

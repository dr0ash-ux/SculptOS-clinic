# SculptOS Clinic — Build Plan v0.1

## Phase gates

### Phase 1 — Architecture
- [x] Architecture document
- [x] Data model
- [x] RBAC model
- [x] DMS specification
- [ ] Threat model
- [ ] Production data/compliance review

### Phase 2 — Design system
- SculptOS tokens
- Light/dark themes
- Layout primitives
- Navigation
- Forms/tables/cards/modals
- Appointment blocks
- Patient chart components

### Phase 3 — Identity & tenancy
- Supabase project
- Email/password auth
- Google OAuth
- user profiles
- organization/clinic membership
- roles/permissions
- RLS
- audit events

### Phase 4 — Patient/DMS
- patient registration
- health history
- examination
- clinical notes
- diagnoses
- treatment plans
- consent/refusal
- media/documents
- timeline

### Phase 5 — Appointment engine
- week grid
- doctor/room filters
- full-duration coloured blocks
- drag/reschedule with permission
- check-in/waiting/completed/no-show/cancelled
- treatment-plan linkage

### Phase 6 — Pharmacy & inventory
- clinic formulary
- prescription builder
- stock ledger
- consumption
- reorder rules
- monthly comparison

### Phase 7 — Finance
- treatment pricing
- invoices
- discounts
- payments
- expenses
- receivables
- production and collection analytics

### Phase 8 — CRM & communications
- lead pipeline
- follow-ups
- recall
- communication log
- call scheduling integration

### Phase 9 — Imaging
- secure media upload
- OPG viewer foundation
- Orthanc
- OHIF
- DICOM metadata
- pre/post-op comparison

### Phase 10 — AI
- AI gateway
- clinical summarization
- differential suggestions
- OPG assistance
- treatment-plan assistance
- daily report generation
- CRM assistance

### Phase 11 — Hardening
- security review
- RLS tests
- permission tests
- audit tests
- backup/restore test
- signed URL tests
- rate limiting
- monitoring
- dependency/security scanning
- incident response runbook

### Phase 12 — Pilot
- synthetic-data acceptance test
- staff usability test
- one-clinic pilot
- bug triage
- performance review
- clinical workflow review
- production go/no-go

## Development loop
For every feature:
1. Define acceptance criteria.
2. Design the data contract.
3. Implement backend authorization.
4. Implement UI.
5. Add unit/integration tests.
6. Test unauthorized access explicitly.
7. Test empty/loading/error states.
8. Review visually.
9. Commit with a focused message.
10. Move to the next feature only when the gate passes.

## First engineering milestone
The next implementation milestone is **Phase 3: Identity & tenancy**. Do not connect real patient data until authentication, clinic membership, RLS and audit logging are functioning and tested.
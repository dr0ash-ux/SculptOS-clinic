# SculptOS Clinic — RBAC v0.1

## Model
Use role-based access control plus explicit permission overrides. Permissions are enforced server-side and mirrored in the UI only for usability.

Permission format: `module.action`.

Examples:
- `patients.read`
- `patients.create`
- `patients.update_demographics`
- `clinical_notes.create`
- `clinical_notes.sign`
- `treatment_plans.create`
- `treatment_plans.approve`
- `appointments.manage`
- `billing.read`
- `billing.manage`
- `inventory.manage`
- `reports.read`
- `ai.use`
- `users.manage`
- `permissions.manage`
- `audit.read`
- `records.export`

## System roles

### Owner / Admin
Full clinic administration. Can manage users, roles, permissions, integrations, financials, inventory and clinical configuration. Cannot silently alter finalized clinical history.

### Doctor
Can access assigned clinic patients, create/update clinical notes, diagnoses, treatment plans, procedures, prescriptions, consents and appointments according to clinic policy. Financial access is configurable.

### Receptionist
Can register patients, manage demographics, appointments, communications, check-in/out and permitted CRM fields. No clinical-note editing or diagnosis/treatment-plan signing.

### Dental Assistant
Can access operational and clinical information required for assigned work, upload permitted images/documents, update chair-side workflow and inventory usage. No diagnosis or clinical-signoff permission.

### Accountant
Financial records, invoices, payments, expenses and finance reports. No clinical notes or diagnostic data unless explicitly granted.

## Scope rules
A permission may be scoped to:
- entire organization
- specific clinic
- assigned patients
- assigned doctors/rooms
- specific module

## Sensitive actions
Require elevated permission and audit event:
- delete/archive patient
- export records
- download bulk imaging
- amend finalized clinical records
- change user roles
- change permissions
- change billing after payment
- modify inventory opening balances
- change clinic formulary

## Permission evaluation
1. Authenticate user.
2. Resolve active clinic membership.
3. Resolve role and explicit overrides.
4. Evaluate action permission.
5. Evaluate resource scope.
6. Execute transaction.
7. Write audit event for sensitive operations.

## UI rule
A hidden button is not a security control. API/database authorization must independently reject unauthorized operations.

## Admin delegation
The admin UI should show a matrix of modules x actions with Allow / Deny / Inherit. System-protected permissions cannot be delegated if doing so would violate platform safety constraints.

## Default principle
When uncertain, deny access. New permissions should not silently grant access to existing users.
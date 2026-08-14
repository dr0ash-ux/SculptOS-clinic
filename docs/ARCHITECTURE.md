# SculptOS Clinic — Architecture v0.1

## Product boundary
SculptOS Clinic is the clinical operating system layer for dental practices. It owns practice operations, patient records, appointments, treatment plans, clinical documentation, imaging metadata, prescriptions, inventory, CRM, finance and controlled AI assistance.

The architecture is intentionally reusable by future SculptOS products (Ortho, MaxFac, Aesthetics).

## Core principles
1. **Tenant isolation first.** Every clinic-owned record is scoped to an organization/clinic and protected server-side.
2. **Clinical record integrity.** Clinical entries are attributable, timestamped and auditable. Corrections create history rather than silently overwriting history.
3. **Least privilege.** UI visibility is never the security boundary; authorization is enforced by the backend/database.
4. **Clinical and financial separation.** Financial ledgers remain separate from the clinical record, while treatment/procedure references can connect them.
5. **Files are objects, not database blobs.** DICOM, OPG, photos, STL and PDFs live in object storage with controlled access; PostgreSQL stores metadata and relationships.
6. **AI is assistive.** AI suggestions require clinician review for diagnosis, treatment decisions and patient-facing clinical content.
7. **Interoperability-ready.** Data structures should map cleanly to ABDM/FHIR-style exchange later without making the first release dependent on an external health-network integration.
8. **Environment separation.** Development, staging and production use separate credentials and data.

## Target stack
- Frontend: React + TypeScript + Vite
- UI: SculptOS design system + accessible component primitives
- Auth: Supabase Auth with email/password and Google OAuth
- Data: PostgreSQL via Supabase
- Authorization: PostgreSQL Row Level Security + application permission model
- Object storage: S3-compatible object storage; Cloudflare R2 is the initial candidate
- DICOM: Orthanc + OHIF
- AI: SculptOS AI Gateway, provider-agnostic
- Hosting: Vercel or equivalent for web; managed backend services initially
- Monitoring: structured application logs, error tracking and uptime monitoring

## Environment model
`development -> staging -> production`

Production patient data must never be copied into development. Synthetic patients and de-identified test images are used during development and automated tests.

## High-level topology
```text
Browser
  |
  v
SculptOS Web App
  |
  +--> Supabase Auth
  |
  +--> API / server-side functions
  |       |
  |       +--> PostgreSQL + RLS
  |       +--> Object storage
  |       +--> AI Gateway
  |       +--> Orthanc / DICOM services
  |
  +--> OHIF viewer (through authenticated imaging access)
```

## Domain boundaries
- Identity & Access
- Organizations & Clinics
- Patients & Clinical Records
- Treatment Planning
- Appointments
- Prescriptions & Formulary
- Inventory
- Billing & Finance
- CRM
- Imaging & Documents
- AI
- Communications / Calling
- Reporting
- Audit & Compliance

Each domain should expose typed service functions rather than allowing arbitrary UI code to write directly to unrelated tables.

## Security boundary
The browser is untrusted. Never place service-role credentials, storage master credentials or model provider secrets in frontend code. Sensitive operations run server-side. File downloads use short-lived signed URLs after authorization.

## Clinical record rule
A note, diagnosis, treatment record, consent, prescription, imaging finding or procedure record must identify its author and timestamps. Editing a finalized clinical entry creates an audit event and preserves the prior state.

## Future interoperability
Store stable identifiers and structured clinical concepts where practical. Keep an interoperability adapter layer separate from core domain logic so ABDM/FHIR integration can be added without rewriting the patient system.

## Non-goals for v1
- Autonomous diagnosis
- Autonomous treatment planning
- Fully automated radiology reporting
- Full insurance claims clearinghouse
- Nationwide ABDM certification before the core clinic workflow is stable

## Definition of production-ready foundation
The foundation is not considered production-ready until tenant isolation, authentication, authorization, audit logging, backups, file access controls, error monitoring, environment separation and recovery procedures are tested.
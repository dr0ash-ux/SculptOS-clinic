# SculptOS Clinic — DMS foundation

This is the product baseline for the first clinic-management build. It is intentionally a structured foundation rather than a claim that one document captures every jurisdictional requirement.

## Clinical record
- Patient demographics and contact details
- Medical and dental history, allergies and current medications
- Clinical findings and progress/visit notes
- Diagnoses and treatment plans
- Tooth-level charting with a future FDI/Universal mapping layer
- Diagnostic records: radiographs, OPG, photographs, intraoral photographs, study models and documents
- Prescriptions with medication, dose, quantity, directions and refills
- Informed consent/refusal and postoperative instructions
- Referral and consultation records
- Missed/cancelled appointments, complaints and follow-up records
- Author, date/time, sign-off and immutable audit history for clinical entries

## Practice operations
- Week/day/month appointment calendar
- Multi-doctor and chair/resource scheduling
- Appointment duration and treatment-driven scheduling
- Check-in, status and rescheduling
- Patient communication and recall/follow-up
- CRM pipeline for enquiries and treatment acceptance
- Inventory, consumption, reorder signals and equipment records
- Pharmacy/formulary management feeding prescription dropdowns
- Billing, collections, discounts, expenses and practice KPIs
- Daily/weekly/monthly reports

## Access and security
- Clinic/organization tenancy
- Admin-controlled roles and permissions
- Doctor, clinical staff, receptionist and restricted roles
- Least-privilege access and field/action-level permission design
- Audit logs for clinical and administrative changes
- Secure file access for imaging and documents
- Backups, recovery, session controls and MFA-ready authentication

## AI / imaging foundation
- AI-assisted clinical documentation and summaries
- Differential-diagnosis assistance as clinician support, not autonomous diagnosis
- OPG analysis pipeline with clinician review
- DICOM/CBCT integration through an imaging service such as Orthanc + OHIF
- AI receptionist/call scheduling pipeline
- Daily report generation and operational insights

## Product principles
1. Clinical data and financial data remain separate domains even when surfaced in one application.
2. Treatment-plan entries can drive appointment treatment labels and duration suggestions.
3. Imaging files live in object storage; relational records hold metadata and permissions.
4. Every clinic-facing feature should be usable in dark and light mode.
5. SculptOS brand tokens are centralized so Ortho, MaxFac and Aesthetics can share the same design language.
6. AI suggestions are visibly assistive and require clinician review before becoming part of the signed record.

## Standards grounding
The initial clinical-record model follows the American Dental Association's published guidance that dental records commonly include personal data, histories, progress/treatment notes, treatment-plan discussions, diagnostic records, prescriptions, radiographs, photographs, treatment-plan notes, complaints, referrals, missed appointments, follow-ups, postoperative instructions and consent/refusal documents. The ADA also emphasizes dated/initialed entries, accurate record changes and regular chart audits.

The product should additionally support standardized dental terminology as the data model matures; ADA's SNODENT is an ANSI-recognized dental terminology designed for electronic dental records and harmonized with SNOMED CT.

Jurisdiction-specific legal/compliance requirements for India must be validated before production use with identifiable patient data.

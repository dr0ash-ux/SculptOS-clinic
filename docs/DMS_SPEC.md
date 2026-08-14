# SculptOS Clinic — Dental Management System Specification v0.1

## Purpose
The DMS is the longitudinal clinical record and operational record for a dental patient. It should make the clinically relevant story of the patient understandable without forcing the doctor to search across unrelated screens.

ADA guidance describes the dental record as the official document containing diagnostic information, health history, clinical notes, treatment performed and patient-related communications. Typical content includes personal data, medical/dental histories, progress and treatment notes, diagnostic records, prescriptions, radiographs, photographs, treatment-plan notes, complaints/resolutions, referrals, missed appointments, follow-up records, postoperative instructions and informed consent/refusal. citeturn0search0turn0search1

## Patient chart structure

### 1. Header
- Patient name
- Patient number
- Age/date of birth
- Contact
- Alerts: allergies, important medical conditions, medications
- Primary dentist
- Last visit
- Next appointment
- Quick actions: appointment, note, prescription, upload, invoice

### 2. Overview
- Chief complaint
- Active problems
- Current treatment plans
- Recent encounters
- Outstanding follow-ups
- Recent imaging
- Financial summary kept visually separate from clinical summary

### 3. History
- Medical history
- Dental history
- Medication list
- Allergies/adverse reactions
- Surgical history
- Family/social history where clinically relevant
- Vital signs where used by the practice
- Versioned history with reviewer/date

The treating dentist remains responsible for obtaining, maintaining and reviewing current health history; history changes should be documented with date and responsible staff member. citeturn0search9

### 4. Examination
Support structured and free-text findings:
- Extraoral
- TMJ
- Muscles/fascia
- Lymph nodes
- Intraoral soft tissues
- Periodontal
- Hard tissue / odontogram
- Occlusion
- Prosthodontic findings
- Implant findings
- Surgical findings
- Vitality / percussion / palpation
- Vitals

The exact templates should be configurable by specialty without changing the core patient model.

### 5. Clinical notes
Default structured note template:
- Subjective
- Objective
- Assessment
- Plan

Notes must show author and timestamps. Corrections to prior entries should be amendments/addenda, not silent replacement. ADA guidance emphasizes accurate attribution and dated handling of belated/corrected entries. citeturn0search0

### 6. Diagnosis
- Diagnosis text
- Structured concept/code when available
- Site/tooth
- Primary vs differential
- Status: suspected / confirmed / resolved
- Author
- Date

AI-generated suggestions are never automatically saved as a clinician diagnosis.

### 7. Treatment planning
Each plan should capture:
- Problem/diagnosis
- Proposed procedure(s)
- Tooth/site
- Alternatives
- Benefits
- Material risks
- No-treatment option
- Estimated duration
- Estimated fee
- Sequence
- Status: draft / presented / accepted / partially accepted / declined / completed
- Patient discussion notes
- Consent linkage

ADA guidance specifically recommends documenting discussions of treatment nature, benefits, risks, alternatives and no treatment. citeturn0search1

### 8. Procedure / encounter history
Each performed procedure should capture:
- Date/time
- Treating clinician
- Procedure
- Site/tooth
- Materials/medications when relevant
- Anaesthesia when relevant
- Findings
- Complications
- Post-op instructions
- Follow-up plan
- Clinical note

### 9. Imaging and media
Patient media supports:
- OPG
- CBCT/DICOM study references
- Intraoral photos
- Extraoral photos
- Pre-op photos
- Post-op photos
- STL/3D files
- PDFs and referral documents

Each asset needs category, author/uploader, capture date where known, MIME type, storage key, checksum and patient/encounter linkage.

### 10. Prescriptions
Prescription records should retain:
- Drug
- Strength
- Dosage form
- Route
- Dose
- Frequency
- Duration
- Quantity
- Instructions
- Refills
- Prescriber
- Date

### 11. Consent / refusal
Store the consent/refusal event and its versioned document where applicable. Record what was discussed, who signed/witnessed, date/time and linked treatment plan.

### 12. Communications
Record clinically relevant communications:
- patient phone call
- WhatsApp/SMS/email where integrated
- appointment communications
- treatment discussion
- complaint/resolution
- referral communications
- post-op follow-up

The record should distinguish operational messages from clinically material communication.

### 13. Follow-up / recalls
- Recall interval
- Due date
- reason
- responsible clinician/team member
- outcome
- next action

### 14. Record export
The patient chart should support a controlled export containing the permitted clinical record and associated documents/images. Export must be permissioned and audited. Patient access and transfer workflows should be designed around applicable Indian law and clinic policy; ADA guidance is used here as a clinical-record completeness reference, not as Indian legal advice. citeturn0search4turn0search5

## UX rule
The chart should be timeline-first: a doctor should be able to understand what happened, why it happened, what was proposed, what was done, what remains and what is next without opening ten unrelated pages.

## Financial separation
Do not put payment ledger details inside the clinical note. Show a compact financial summary and link to the separate billing domain.

## Interoperability
ABDM describes consent-based exchange and provider-controlled storage of health records. SculptOS should therefore preserve provenance and consent metadata and keep an adapter layer ready for future ABDM integration. citeturn0search3turn0search11
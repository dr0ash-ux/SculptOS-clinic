# SculptOS Clinic — Data Model v0.1

## Tenant hierarchy
```text
organization
  └── clinics
       ├── users / memberships
       ├── patients
       ├── appointments
       ├── treatment plans
       ├── clinical records
       ├── prescriptions
       ├── inventory
       ├── invoices / payments
       └── files / imaging
```

All clinic-owned tables carry `clinic_id` directly or derive it through a parent relationship. Security policies must be written so a user can only access rows belonging to clinics where they have an active membership.

## Core tables

### organizations
`id, name, legal_name, status, created_at, updated_at`

### clinics
`id, organization_id, name, code, address, timezone, phone, email, settings_json, created_at, updated_at`

### users
Identity is owned by Supabase Auth. Application profile data lives separately:
`id, display_name, phone, avatar_path, professional_role, registration_number, created_at, updated_at`

### memberships
`id, user_id, clinic_id, role_id, status, joined_at, invited_by, created_at, updated_at`

### roles
`id, clinic_id nullable, name, description, is_system_role, created_at`

### permissions
`id, key, module, action, description`

### role_permissions
`role_id, permission_id, effect`

### patients
`id, clinic_id, patient_number, first_name, middle_name, last_name, date_of_birth, sex, phone, email, address_json, emergency_contact_json, occupation, referral_source, abha_id nullable, status, created_at, updated_at`

### patient_identifiers
`id, patient_id, type, value, issuer, is_primary, created_at`

### medical_histories
`id, patient_id, version, allergies_json, medications_json, conditions_json, surgeries_json, family_history_json, social_history_json, vitals_json, reviewed_by, reviewed_at, created_at`

### dental_histories
`id, patient_id, chief_complaint, previous_dental_history, oral_hygiene_notes, habits_json, last_dental_visit, reviewed_by, reviewed_at, created_at`

### clinical_notes
`id, patient_id, author_user_id, note_type, encounter_id nullable, subjective, objective, assessment, plan, status, signed_at, created_at, updated_at`

### diagnoses
`id, patient_id, encounter_id nullable, author_user_id, concept_code nullable, diagnosis_text, certainty, status, created_at, updated_at`

### treatment_plans
`id, patient_id, author_user_id, title, diagnosis_context, alternatives, risks, benefits, no_treatment_notes, status, accepted_at, rejected_at, created_at, updated_at`

### treatment_plan_items
`id, treatment_plan_id, procedure_code nullable, treatment_name, tooth_site_json, clinician_notes, estimated_duration_minutes, estimated_fee, status, sequence, created_at, updated_at`

### appointments
`id, clinic_id, patient_id, doctor_user_id, treatment_plan_item_id nullable, room_id nullable, start_at, end_at, status, appointment_type, notes, colour_token, created_by, created_at, updated_at`

### encounters
`id, clinic_id, patient_id, appointment_id nullable, treating_user_id, started_at, ended_at, status, created_at, updated_at`

### procedures
`id, encounter_id, treatment_plan_item_id nullable, procedure_code nullable, procedure_name, tooth_site_json, performed_by, performed_at, notes, status, created_at`

### consents
`id, patient_id, treatment_plan_id nullable, consent_type, document_path nullable, version, signed_by_patient, signed_at, witnessed_by, status, created_at`

### prescriptions
`id, patient_id, encounter_id nullable, prescriber_user_id, status, prescribed_at, notes, created_at, updated_at`

### prescription_items
`id, prescription_id, medication_id, strength, dosage, route, frequency, duration_value, duration_unit, quantity, instructions, refills`

### medications
Clinic formulary entries:
`id, clinic_id, generic_name, brand_name, strength, dosage_form, route, unit_price, active, inventory_item_id nullable, created_at, updated_at`

### inventory_items
`id, clinic_id, sku, name, category, unit, reorder_level, target_level, unit_cost, supplier_id nullable, active, created_at, updated_at`

### inventory_transactions
`id, clinic_id, inventory_item_id, transaction_type, quantity, unit_cost, reference_type, reference_id, performed_by, occurred_at, notes`

### invoices
`id, clinic_id, patient_id, treatment_plan_id nullable, invoice_number, status, subtotal, discount, tax, total, balance_due, issued_at, due_at, created_by`

### payments
`id, invoice_id, amount, method, reference, received_at, received_by, status`

### crm_leads
`id, clinic_id, patient_id nullable, source, stage, owner_user_id, estimated_value, next_follow_up_at, notes, created_at, updated_at`

### files
`id, clinic_id, patient_id nullable, encounter_id nullable, category, storage_provider, object_key, mime_type, size_bytes, checksum, uploaded_by, captured_at, metadata_json, created_at`

### imaging_studies
`id, clinic_id, patient_id, modality, study_uid nullable, accession_number nullable, orthanc_reference nullable, study_date, body_region, status, created_at`

### audit_events
`id, clinic_id nullable, actor_user_id nullable, action, entity_type, entity_id, before_json nullable, after_json nullable, ip_hash nullable, user_agent_hash nullable, occurred_at`

## Clinical vs financial separation
Clinical tables should not contain ledger/payment details. Treatment plan items may reference a fee estimate, but invoices/payments are separate financial records. This separation follows the principle that financial records should be maintained separately from the clinical record. citeturn0search1

## Record lifecycle
Draft -> signed/finalized -> amended/corrected (with history) -> archived according to the clinic's retention policy.

## File lifecycle
Upload -> virus/type validation -> metadata extraction -> object storage -> authorization check -> short-lived signed access -> audit event.

## Appointment linkage
`patient -> treatment_plan -> treatment_plan_item -> appointment -> encounter -> procedure`.
The appointment duration and displayed treatment are derived from the selected treatment-plan item, while staff can override the schedule with an explicit audit trail.

## Interoperability notes
ABDM describes a federated model in which providers retain health records and consent enables secure exchange. SculptOS therefore treats the clinic as the source of the clinical record and plans an interoperability layer rather than centralizing all patient data in an external network. citeturn0search3turn0search12
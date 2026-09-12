import { FormEvent, useEffect, useState } from "react";
import { Plus, Pill, Search, ExternalLink, X } from "lucide-react";
import { supabase } from "./lib/supabase";
import { usePermission, Workspace } from "./clinicAccess";
import { ControlDialog } from "./ControlDialog";
import "./Pharmacy.css";
export type Medicine = {
  id?: string;
  code?: string;
  key: string;
  name: string;
  strength: string;
  form: string;
  category: string;
  route: string;
  adult_reference: string;
  default_dose: string;
  frequency: string;
  instructions: string;
  cautions: string;
  source_url?: string;
  source_label?: string;
  reviewed_on?: string;
  active: boolean;
};
export type RxPatient = {
  id: string;
  first_name: string;
  last_name: string | null;
  patient_title: string | null;
  patient_number: string;
  date_of_birth: string | null;
  allergies?: string | null;
  current_medications?: string | null;
  medical_history?: string | null;
};
export const fullName = (p: RxPatient) =>
  [p.patient_title, p.first_name, p.last_name].filter(Boolean).join(" ");
export const pharmacyError = (e: unknown) =>
  typeof e === "object" && e && "message" in e
    ? String(e.message)
    : "The request could not be completed. Please try again.";
export async function loadMedicines(clinicId: string): Promise<Medicine[]> {
  const [references, custom] = await Promise.all([
    supabase.from("dental_medicine_references").select("*").order("name"),
    (async () => {
      const all: Medicine[] = [];
      for (let start = 0; ; start += 500) {
        const r = await supabase
          .from("clinic_medicines")
          .select("*")
          .eq("clinic_id", clinicId)
          .order("name")
          .order("id")
          .range(start, start + 499);
        if (r.error) throw r.error;
        all.push(...r.data);
        if (r.data.length < 500) return all;
      }
    })(),
  ]);
  if (references.error) throw references.error;
  return [
    ...references.data.map((m) => ({
      ...m,
      key: "ref:" + m.code,
      active: true,
    })),
    ...custom.map((m) => ({ ...m, key: "custom:" + m.id })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}
export function PharmacyPage({
  workspace,
  patients,
  onPrescription,
}: {
  workspace: Workspace;
  patients: RxPatient[];
  onPrescription: (id: string) => void;
}) {
  const [meds, setMeds] = useState<Medicine[]>([]),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All medicines"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [edit, setEdit] = useState<Medicine | null | undefined>(),
    [selected, setSelected] = useState("");
  const manage = usePermission("pharmacy.manage"),
    write = usePermission("prescriptions.write"),
    viewPatients = usePermission("patients.view");
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setMeds([]);
    loadMedicines(workspace.clinicId)
      .then((m) => {
        if (alive) setMeds(m);
      })
      .catch((e) => {
        if (alive) setError(pharmacyError(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [workspace.clinicId, revision]);
  const visible = meds.filter(
    (m) =>
      (filter === "Archived" ? !m.active : m.active) &&
      (filter !== "Clinic medicines" || !!m.id) &&
      (filter !== "Reference medicines" || !!m.code) &&
      `${m.name} ${m.strength} ${m.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="pharmacy clinic-controls">
      <header className="pharmacy-heading">
        <div>
          <span className="eyebrow">{workspace.clinicName} · MEDICINES</span>
          <h1>Pharmacy & Rx</h1>
          <p>
            A shared medicine catalogue for clear, consistent prescriptions.
          </p>
        </div>
        {manage && (
          <button className="primary" onClick={() => setEdit(null)}>
            <Plus size={16} />
            Add medicine
          </button>
        )}
      </header>
      {viewPatients && (
        <div className="pharmacy-prescribe">
          <div>
            <h2>Patient prescriptions</h2>
            <p>Choose a patient to write or view saved prescriptions.</p>
          </div>
          <div>
            <select
              aria-label="Patient for prescription"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select patient</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {fullName(p)} · {p.patient_number}
                </option>
              ))}
            </select>
            <button
              className="primary"
              disabled={!selected}
              onClick={() => onPrescription(selected)}
            >
              {write ? "Open prescription" : "View prescriptions"}
            </button>
          </div>
        </div>
      )}
      <p className="pharmacy-muted">
        Prescriber confirms dose · OD once daily · BID twice daily · TID three
        times daily · QID four times daily · PRN as needed.
      </p>
      <div className="pharmacy-filters">
        <label>
          <Search size={16} />
          <input
            aria-label="Search medicines"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, strength or category"
          />
        </label>
        <select
          aria-label="Medicine filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {[
            "All medicines",
            "Clinic medicines",
            "Reference medicines",
            "Archived",
          ].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <span>{visible.length} medicines</span>
        <button className="ghost" onClick={() => setRevision((v) => v + 1)}>
          Refresh
        </button>
      </div>
      {error ? (
        <div role="alert" className="control-alert error">
          {error}
        </div>
      ) : loading ? (
        <p role="status">Loading medicines…</p>
      ) : !visible.length ? (
        <div className="pharmacy-empty">
          <Pill size={25} />
          <p>No medicines match this view.</p>
        </div>
      ) : (
        <div className="medicine-table-wrap">
          <table className="medicine-table">
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Dose</th>
                <th>Route</th>
                <th>Frequency</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr key={m.key}>
                  <td>
                    <b>{m.name}</b>
                    <small>
                      {m.strength} · {m.form}
                      {!m.active ? " · Archived" : ""}
                    </small>
                  </td>
                  <td>{m.default_dose || "Patient-specific"}</td>
                  <td>{m.route}</td>
                  <td>
                    <span className="medicine-tag">
                      {m.frequency || "Clinician-set"}
                    </span>
                  </td>
                  <td>
                    {m.source_url && (
                      <a
                        href={m.source_url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Source for ${m.name}`}
                        title="Prescribing reference"
                      >
                        <ExternalLink size={15} />
                      </a>
                    )}
                    {m.id && manage && (
                      <button className="ghost" onClick={() => setEdit(m)}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit !== undefined && (
        <MedicineForm
          medicine={edit}
          clinicId={workspace.clinicId}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined);
            setRevision((v) => v + 1);
          }}
        />
      )}
    </section>
  );
}
export function MedicineForm({
  medicine,
  clinicId,
  onClose,
  onSaved,
}: {
  medicine: Medicine | null;
  clinicId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const payload = Object.fromEntries(
      [
        "name",
        "strength",
        "form",
        "category",
        "route",
        "default_dose",
        "frequency",
        "instructions",
        "cautions",
      ].map((k) => [k, String(f.get(k) || "").trim()]),
    );
    try {
      const q = medicine?.id
        ? supabase
            .from("clinic_medicines")
            .update({ ...payload, active: f.get("active") === "on" })
            .eq("clinic_id", clinicId)
            .eq("id", medicine.id)
        : supabase
            .from("clinic_medicines")
            .insert({ ...payload, clinic_id: clinicId });
      const r = await q.select("id").single();
      if (r.error) throw r.error;
      onSaved();
    } catch (e) {
      setError(pharmacyError(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <ControlDialog
      label={medicine ? "Edit medicine" : "Add medicine"}
      busy={saving}
      onClose={onClose}
    >
      <form onSubmit={save}>
        <div className="pharmacy-dialog-head">
          <div>
            <h2>{medicine ? "Edit medicine" : "Add medicine"}</h2>
            <p>Available in this branch’s prescription dropdown.</p>
          </div>
          <button
            className="ghost"
            type="button"
            disabled={saving}
            aria-label="Close medicine form"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        {error && (
          <div className="control-alert error" role="alert">
            {error}
          </div>
        )}
        <fieldset disabled={saving} className="pharmacy-fieldset">
          <div className="control-fields">
            {[
              [
                "name",
                "Medicine / brand name",
                "e.g. Generic name or clinic brand",
              ],
              [
                "strength",
                "Strength / concentration",
                "e.g. 500 mg or 100 mg/5 mL",
              ],
              ["form", "Dosage form", "Tablet, capsule, suspension…"],
            ].map(([key, label, placeholder]) => (
              <label key={key}>
                {label}
                <input
                  name={key}
                  defaultValue={
                    (medicine?.[key as keyof Medicine] as string) || ""
                  }
                  placeholder={placeholder}
                  maxLength={key === "name" ? 160 : 80}
                  required
                />
              </label>
            ))}
            <label>
              Route
              <select name="route" defaultValue={medicine?.route || "Oral"}>
                {Array.from(
                  new Set(
                    [
                      "Oral",
                      "IV",
                      "IM",
                      "Topical",
                      "Mouth rinse",
                      "Oromucosal",
                      "Buccal",
                      "Sublingual",
                      "Inhalation",
                      medicine?.route,
                    ].filter(Boolean),
                  ),
                ).map((route) => (
                  <option key={route}>{route}</option>
                ))}
              </select>
            </label>
            <label>
              Dose per administration
              <input
                name="default_dose"
                defaultValue={medicine?.default_dose || ""}
                placeholder="e.g. 500 mg (1 tablet)"
                maxLength={120}
                required
              />
            </label>
            <label>
              Frequency
              <select
                name="frequency"
                defaultValue={medicine?.frequency || ""}
                required
              >
                <option value="" disabled>
                  Select frequency
                </option>
                {Object.entries(frequencyLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {code} · {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-all">
              Category
              <select
                name="category"
                defaultValue={medicine?.category || "Other"}
              >
                {[
                  "Analgesic",
                  "Antibiotic",
                  "Antifungal",
                  "Antiseptic",
                  "Gastrointestinal",
                  "Antihistamine",
                  "Pediatric liquids",
                  "Emergency",
                  "Other",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            {[
              ["instructions", "Administration instructions"],
              ["cautions", "Clinical notes / cautions"],
            ].map(([key, label]) => (
              <label key={key} className="span-all">
                {label}
                <textarea
                  name={key}
                  defaultValue={
                    (medicine?.[key as keyof Medicine] as string) || ""
                  }
                  maxLength={1000}
                  rows={2}
                />
              </label>
            ))}
            {medicine && (
              <label className="pharmacy-check span-all">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={medicine.active}
                />
                Available for new prescriptions
              </label>
            )}
          </div>
        </fieldset>
        <div className="control-footer">
          <button
            type="button"
            className="ghost"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="primary" disabled={saving}>
            {saving ? "Saving…" : "Save medicine"}
          </button>
        </div>
      </form>
    </ControlDialog>
  );
}

export const frequencyLabels: Record<string, string> = {
  OD: "Once daily",
  BID: "Twice daily",
  TID: "Three times daily",
  QID: "Four times daily",
  PRN: "As needed",
  STAT: "Single immediate dose",
};
export const medicineOption = (m: Medicine) =>
  `${m.category === "Emergency" ? "[Emergency] " : m.category === "Pediatric liquids" ? "[Pediatric] " : ""}${m.name} · ${m.default_dose || m.strength} · ${m.route} · ${m.frequency || "Clinician-set"}`;

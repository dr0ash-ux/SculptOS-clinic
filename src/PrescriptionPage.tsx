import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { ArrowLeft, Plus, Printer, Trash2 } from "lucide-react";
import { supabase } from "./lib/supabase";
import { usePermission, Workspace } from "./clinicAccess";
import {
  fullName,
  loadMedicines,
  Medicine,
  MedicineForm,
  pharmacyError,
  RxPatient,
} from "./PharmacyPage";
import "./Pharmacy.css";
type RxItem = {
  medicine_key: string;
  name: string;
  strength: string;
  form: string;
  route: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
};
type Prescription = {
  id: string;
  prescribed_on: string;
  prescriber_name: string;
  items: RxItem[];
  patient_name: string;
  patient_number: string;
  clinic_name: string;
  created_at: string;
};
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function PrescriptionPage({
  workspace,
  patient,
  clinicianName,
  onBack,
}: {
  workspace: Workspace;
  patient: RxPatient;
  clinicianName: string;
  onBack: () => void;
}) {
  const [meds, setMeds] = useState<Medicine[]>([]),
    [history, setHistory] = useState<Prescription[]>([]),
    [items, setItems] = useState<RxItem[]>([]),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [date, setDate] = useState(localDate()),
    [doctor, setDoctor] = useState(clinicianName),
    [saved, setSaved] = useState<Prescription | null>(null),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [adding, setAdding] = useState(false),
    [reload, setReload] = useState(0);
  const write = usePermission("prescriptions.write"),
    manage = usePermission("pharmacy.manage"),
    pharmacyView = usePermission("pharmacy.view"),
    busy = useRef(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([
      pharmacyView ? loadMedicines(workspace.clinicId) : Promise.resolve([]),
      supabase
        .from("patient_prescriptions")
        .select("*")
        .eq("clinic_id", workspace.clinicId)
        .eq("patient_id", patient.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ])
      .then(([m, r]) => {
        if (r.error) throw r.error;
        if (alive) {
          setMeds(m.filter((m) => m.active));
          setHistory(r.data || []);
        }
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
  }, [workspace.clinicId, patient.id, reload, pharmacyView]);
  useEffect(() => {
    document.body.classList.add("prescription-active");
    return () =>
      document.body.classList.remove(
        "prescription-active",
        "prescription-print-ready",
      );
  }, []);
  useEffect(() => {
    document.body.classList.toggle(
      "prescription-print-ready",
      !!saved && !dirty && !saving,
    );
  }, [saved, dirty, saving]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(index: number, field: keyof RxItem, value: string) {
    setItems((a) =>
      a.map((m, i) => (i === index ? { ...m, [field]: value } : m)),
    );
    setDirty(true);
  }
  function addMedicine() {
    const m = meds.find((m) => m.key === selected);
    if (!m) return;
    setItems((a) => [
      ...a,
      {
        medicine_key: m.key,
        name: m.name,
        strength: m.strength,
        form: m.form,
        route: m.route,
        dose: "",
        frequency: "",
        duration: "",
        instructions: m.instructions,
      },
    ]);
    setSelected("");
    setDirty(true);
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current || !write) return;
    busy.current = true;
    setSaving(true);
    setError("");
    const print =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "print";
    try {
      if (!items.length) throw new Error("Add at least one medicine.");
      const auth = await supabase.auth.getUser();
      if (!auth.data.user) throw new Error("Please sign in again.");
      const r = await supabase
        .from("patient_prescriptions")
        .insert({
          clinic_id: workspace.clinicId,
          patient_id: patient.id,
          prescribed_on: date,
          prescriber_name: doctor.trim(),
          items,
          created_by: auth.data.user.id,
        })
        .select("*")
        .single();
      if (r.error) throw r.error;
      flushSync(() => {
        setSaved(r.data);
        setDirty(false);
        setHistory((h) => [r.data, ...h]);
        setSaving(false);
      });
      if (print) {
        document.body.classList.add("prescription-print-ready");
        window.print();
      }
    } catch (e) {
      setError(pharmacyError(e));
    } finally {
      setSaving(false);
      busy.current = false;
    }
  }
  function openSaved(id: string) {
    if (dirty && !window.confirm("Discard unsaved prescription changes?"))
      return;
    const r = history.find((r) => r.id === id);
    if (r) {
      setSaved(r);
      setItems(r.items);
      setDate(r.prescribed_on);
      setDoctor(r.prescriber_name);
      setDirty(false);
      setError("");
    }
  }
  const picked = meds.find((m) => m.key === selected);
  return (
    <section className="pharmacy clinic-controls">
      <header className="pharmacy-heading">
        <div>
          <span className="eyebrow">PATIENT CARE · PRESCRIPTION</span>
          <h1>{fullName(patient)}</h1>
          <p>
            {patient.patient_number} · Medicines and administration instructions
          </p>
        </div>
        <button
          className="ghost"
          disabled={saving}
          onClick={() => {
            if (
              !dirty ||
              window.confirm("Leave without saving this prescription?")
            )
              onBack();
          }}
        >
          <ArrowLeft size={16} />
          Back
        </button>
      </header>
      <div className="pharmacy-reference-note">
        <b>Clinical review</b>
        <p>
          Allergies: {patient.allergies || "Not recorded"} · Current medicines:{" "}
          {patient.current_medications || "Not recorded"}
        </p>
        <p>
          Medical history: {patient.medical_history || "Not recorded"}. Confirm
          age/weight, allergies, pregnancy, organ function and interactions.
          Catalogue doses are adult references; enter the patient’s dose and
          duration below.
        </p>
      </div>
      {error && (
        <div className="control-alert error" role="alert">
          {error}
          <button className="ghost" onClick={() => setReload((v) => v + 1)}>
            Refresh
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading prescription records…</p>
      ) : (
        <>
          <div className="pharmacy-filters">
            <label>
              Saved prescriptions
              <select
                aria-label="Saved prescriptions"
                value={saved?.id || ""}
                disabled={saving}
                onChange={(e) => openSaved(e.target.value)}
              >
                <option value="" disabled>
                  New prescription
                </option>
                {history.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.prescribed_on} · {r.prescriber_name} · {r.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <span>Latest 50 saved versions</span>
            {write && (
              <button
                className="ghost"
                disabled={saving}
                onClick={() => {
                  if (
                    dirty &&
                    !window.confirm("Discard unsaved prescription changes?")
                  )
                    return;
                  setItems([]);
                  setSaved(null);
                  setDirty(false);
                  setDate(localDate());
                  setDoctor(clinicianName);
                }}
              >
                New prescription
              </button>
            )}
          </div>
          {write && (
            <form onSubmit={save} className="rx-editor">
              <fieldset disabled={saving} className="pharmacy-fieldset">
                <div className="control-fields">
                  <label>
                    Prescription date
                    <input
                      type="date"
                      value={date}
                      max={localDate()}
                      required
                      onChange={(e) => {
                        setDate(e.target.value);
                        setDirty(true);
                      }}
                    />
                  </label>
                  <label>
                    Prescribing doctor
                    <input
                      value={doctor}
                      maxLength={160}
                      required
                      onChange={(e) => {
                        setDoctor(e.target.value);
                        setDirty(true);
                      }}
                    />
                  </label>
                </div>
                <div className="rx-add">
                  <label>
                    Find medicine
                    <input
                      aria-label="Find prescription medicine"
                      placeholder="Search medicines…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <label>
                    Medicine & strength
                    <select
                      aria-label="Prescription medicine"
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      <option value="">Select from pharmacy</option>
                      {meds
                        .filter(
                          (m) =>
                            `${m.name} ${m.strength}`
                              .toLowerCase()
                              .includes(query.toLowerCase()) ||
                            m.key === selected,
                        )
                        .map((m) => (
                          <option key={m.key} value={m.key}>
                            {m.name} · {m.strength} · {m.form}
                            {m.id ? " · Clinic" : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className="primary"
                    type="button"
                    disabled={!selected || items.length >= 30}
                    onClick={addMedicine}
                  >
                    <Plus size={16} />
                    Add
                  </button>
                  {manage && (
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => setAdding(true)}
                    >
                      Custom medicine
                    </button>
                  )}
                </div>
                {picked && (
                  <div className="rx-reference">
                    <b>Adult reference · {picked.name}</b>
                    <p>
                      {picked.adult_reference ||
                        "Clinic medicine: confirm the dose from product information."}
                    </p>
                    <p>{picked.cautions}</p>
                  </div>
                )}
                {!items.length && (
                  <div className="pharmacy-empty">
                    Select a medicine to begin. No medicines are added
                    automatically.
                  </div>
                )}
                {items.map((m, i) => (
                  <article className="rx-item" key={i}>
                    <div className="pharmacy-dialog-head">
                      <h2>
                        {i + 1}. {m.name}{" "}
                        <span>
                          {m.strength} · {m.form}
                        </span>
                      </h2>
                      <button
                        className="ghost"
                        type="button"
                        aria-label={`Remove medicine ${i + 1}`}
                        onClick={() => {
                          setItems((a) => a.filter((_, n) => n !== i));
                          setDirty(true);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="rx-fields">
                      {[
                        [
                          "dose",
                          "Dose per administration",
                          "e.g. 1 tablet (500 mg)",
                        ],
                        ["route", "Route", "e.g. Oral"],
                        ["frequency", "How often", "e.g. Three times daily"],
                        [
                          "duration",
                          "Duration / stop instructions",
                          "e.g. 5 days; review at 3 days",
                        ],
                      ].map(([key, label, placeholder]) => (
                        <label key={key}>
                          {label}
                          <input
                            aria-label={`${label} for medicine ${i + 1}`}
                            required
                            maxLength={200}
                            value={m[key as keyof RxItem]}
                            placeholder={placeholder}
                            onChange={(e) =>
                              change(i, key as keyof RxItem, e.target.value)
                            }
                          />
                        </label>
                      ))}
                      <label className="span-all">
                        How to take / use
                        <textarea
                          required
                          maxLength={1000}
                          aria-label={`Instructions for medicine ${i + 1}`}
                          rows={2}
                          value={m.instructions}
                          onChange={(e) =>
                            change(i, "instructions", e.target.value)
                          }
                        />
                      </label>
                    </div>
                  </article>
                ))}
                <div className="rx-actions">
                  <span>Saving keeps a dated copy in the patient record.</span>
                  <button
                    className="ghost"
                    disabled={!items.length || (!dirty && !!saved)}
                    type="submit"
                    value="save"
                  >
                    {saving ? "Saving…" : "Save prescription"}
                  </button>
                  <button
                    className="primary"
                    disabled={!items.length || (!dirty && !!saved)}
                    type="submit"
                    value="print"
                  >
                    <Printer size={16} />
                    Save & print
                  </button>
                </div>
              </fieldset>
            </form>
          )}
          {saved && !dirty ? (
            <>
              <div className="pharmacy-heading">
                <h2>Saved patient copy</h2>
                <button
                  className="primary"
                  disabled={saving}
                  onClick={() => window.print()}
                >
                  <Printer size={16} />
                  Print prescription
                </button>
              </div>
              <PrescriptionPaper prescription={saved} />
            </>
          ) : (
            <p className="pharmacy-muted">
              {dirty
                ? "Save the changes to create a printable prescription."
                : "Select a saved prescription to view and print it."}
            </p>
          )}
        </>
      )}
      {adding && (
        <MedicineForm
          medicine={null}
          clinicId={workspace.clinicId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setReload((v) => v + 1);
          }}
        />
      )}
      {createPortal(
        <div className="rx-print-root">
          {saved && !dirty && !saving ? (
            <PrescriptionPaper prescription={saved} />
          ) : (
            <p>Save the prescription before printing.</p>
          )}
        </div>,
        document.body,
      )}
    </section>
  );
}
function PrescriptionPaper({
  prescription: r,
}: {
  prescription: Prescription;
}) {
  return (
    <article className="rx-paper" aria-label="Printable prescription">
      <header>
        <div>
          <b>{r.clinic_name}</b>
          <h2>Prescription</h2>
        </div>
        <span>{r.prescribed_on}</span>
      </header>
      <div className="rx-patient">
        <b>{r.patient_name}</b>
        <span>{r.patient_number}</span>
        <span>Dr: {r.prescriber_name.replace(/^Dr\.?\s*/i, "")}</span>
      </div>
      <ol>
        {r.items.map((m, i) => (
          <li key={i}>
            <h3>
              {m.name} — {m.strength} <small>{m.form}</small>
            </h3>
            <p>
              <b>Dose:</b> {m.dose} · <b>Route:</b> {m.route}
            </p>
            <p>
              <b>Frequency:</b> {m.frequency} · <b>Duration:</b> {m.duration}
            </p>
            <p>{m.instructions}</p>
          </li>
        ))}
      </ol>
      <footer>
        <span>Prescription {r.id.slice(0, 8)}</span>
        <span>Prescriber’s signature</span>
      </footer>
    </article>
  );
}

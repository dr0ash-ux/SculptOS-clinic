import { ClinicLoading } from "./ClinicLoading";
import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Home, Printer, Trash2 } from "lucide-react";
import { supabase } from "./lib/supabase";
import { usePermission, Workspace } from "./clinicAccess";
import {
  fullName,
  frequencyLabels,
  loadMedicines,
  Medicine,
  MedicineForm,
  pharmacyError,
  RxPatient,
} from "./PharmacyPage";
import "./Pharmacy.css";
import "./PrescriptionSimple.css";
import { patientAge, mealTiming, dosageForm } from "./prescriptionPrint";
import {
  ClinicLetterhead,
  loadClinicLetterhead,
  loadClinicLogo,
} from "./clinicLetterhead";
import { prescriptionChoice, choiceSummary, completeChoice, type RxItem } from "./prescriptionChoices";
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
  const [message, setMessage] = useState("");
  const [choices, setChoices] = useState<Record<string, RxItem>>({});
  const [choiceBusy, setChoiceBusy] = useState(false);
  const [meds, setMeds] = useState<Medicine[]>([]),
    [history, setHistory] = useState<Prescription[]>([]),
    [items, setItems] = useState<RxItem[]>([]),
    [selected, setSelected] = useState(""),
    [date, setDate] = useState(localDate()),
    [doctor, setDoctor] = useState(clinicianName),
    [saved, setSaved] = useState<Prescription | null>(null),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [adding, setAdding] = useState(false),
    [reload, setReload] = useState(0);
  const [letterhead, setLetterhead] = useState<ClinicLetterhead | null>(null),
    [logoUrl, setLogoUrl] = useState(""),
    [brandingBusy, setBrandingBusy] = useState(true),
    [brandingError, setBrandingError] = useState("");
  useEffect(() => {
    let alive = true;
    let url = "";
    setBrandingBusy(true);
    setBrandingError("");
    (async () => {
      try {
        const details = await loadClinicLetterhead(workspace.clinicId);
        if (details.logo_path) url = await loadClinicLogo(details.logo_path);
        if (alive) {
          setLetterhead(details);
          setLogoUrl(url);
        }
      } catch (e) {
        if (alive) setBrandingError(pharmacyError(e));
      } finally {
        if (alive) setBrandingBusy(false);
        else if (url) URL.revokeObjectURL(url);
      }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [workspace.clinicId, reload]);
  const printing = useRef(false);
  useEffect(() => {
    const finished = () => {
      if (!printing.current) return;
      printing.current = false;
      setMessage("Print dialog closed. Your prescription remains saved.");
    };
    window.addEventListener("afterprint", finished);
    return () => window.removeEventListener("afterprint", finished);
  }, []);
  function printPrescription() {
    if (!printReady) return;
    printing.current = true;
    window.print();
  }
  const printReady = !!letterhead && !brandingBusy && !brandingError;
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
      (async () => {
        const rows: Prescription[] = [];
        for (let start = 0; ; start += 100) {
          const result = await supabase.from("patient_prescriptions").select("*")
            .eq("clinic_id", workspace.clinicId).eq("patient_id", patient.id)
            .order("prescribed_on", { ascending: false }).order("created_at", { ascending: false }).order("id")
            .range(start, start + 99);
          if (result.error) throw result.error;
          rows.push(...(result.data || []));
          if ((result.data || []).length < 100) break;
        }
        return { data: rows, error: null };
      })(),
      write ? supabase.from("clinic_prescription_choices").select("medicine_key,item").eq("clinic_id", workspace.clinicId) : Promise.resolve({ data: [], error: null }),
    ])
      .then(([m, r, c]) => {
        if (r.error) throw r.error;
        if (c.error) throw c.error;
        if (alive) {
          const rank = (m: Medicine) => m.code === "clinic-amoxiclav-625" ? 0 : m.code === "clinic-zerodol-sp" ? 1 : 2;
          setMeds(m.filter(m => m.active).sort((a,b) => rank(a)-rank(b) || a.name.localeCompare(b.name)));
          setChoices(Object.fromEntries((c.data || []).map(row => [row.medicine_key, row.item as RxItem])));
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
  }, [workspace.clinicId, patient.id, reload, pharmacyView, write]);
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
      !!saved && !dirty && !saving && printReady,
    );
  }, [saved, dirty, saving, printReady]);
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
  function addMedicine(key: string) {
    const m = meds.find(m => m.key === key);
    if (!m || items.length >= 30) return;
    setItems(a => [...a, prescriptionChoice(m, choices[m.key])]);
    setSelected(""); setDirty(true); setMessage("");
  }
  async function rememberChoice(item: RxItem) {
    if (choiceBusy) return;
    if (!completeChoice(item)) { setError("Complete the instructions once before saving this quick choice."); return; }
    setChoiceBusy(true); setError("");
    try {
      const r = await supabase.from("clinic_prescription_choices").upsert({ clinic_id: workspace.clinicId, medicine_key: item.medicine_key, item });
      if (r.error) throw r.error;
      setChoices(current => ({...current, [item.medicine_key]: {...item}}));
      setMessage("Quick choice saved for future prescriptions.");
    } catch(e) { setError(pharmacyError(e)); } finally { setChoiceBusy(false); }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current || !write) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      if (!items.length) throw new Error("Add at least one medicine.");
      if (items.some(item => !completeChoice(item))) throw new Error("Open Edit instructions and complete the medicine before saving.");
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
        setHistory((h) => [r.data, ...h].sort((a,b) => b.prescribed_on.localeCompare(a.prescribed_on) || b.created_at.localeCompare(a.created_at)));
        setSaving(false);
      });
      setMessage("Prescription saved. You can print it or continue here.");
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
      setMessage(`Viewing saved prescription dated ${r.prescribed_on}.`);
    }
  }
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
          <Home size={16} />
          Home · Appointments
        </button>
      </header>
      <details className="pharmacy-reference-note">
        <summary>Clinical review · Allergies: {patient.allergies || "Not recorded"}</summary>
        <p>
          Allergies: {patient.allergies || "Not recorded"} · Current medicines:{" "}
          {patient.current_medications || "Not recorded"}
        </p>
        <p>
          Medical history: {patient.medical_history || "Not recorded"}. Confirm
          age/weight, allergies, pregnancy, organ function and interactions.
          Confirm the patient-specific dose, frequency and duration below.
        </p>
      </details>
      {brandingError && (
        <div className="control-alert error" role="alert">
          Clinic letterhead could not be loaded: {brandingError}
          <button className="ghost" onClick={() => setReload((v) => v + 1)}>
            Retry letterhead
          </button>
        </div>
      )}
      {message && <div className="control-alert" role="status">{dirty && saved ? "Unsaved changes — save to update your prescription." : message}</div>}
      {error && (
        <div className="control-alert error" role="alert">
          {error}
          <button className="ghost" onClick={() => setReload((v) => v + 1)}>
            Refresh
          </button>
        </div>
      )}
      {letterhead && (!letterhead.address || !letterhead.phone) && (
        <p className="pharmacy-muted">
          Add the clinic address and phone in Admin controls → Clinic setup to
          include them on this prescription.
        </p>
      )}
      {loading ? (
        <ClinicLoading />
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
            <span>{history.length} saved prescriptions · newest date first</span>
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
                  setMessage(""); setItems([]);
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
            <form onSubmit={save} className="rx-editor" onInvalidCapture={event => { const details = (event.target as HTMLElement).closest('details'); if (details) details.open = true; }}>
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
                    Quick prescription choices
                    <select
                      aria-label="Prescription medicine"
                      value={selected}
                      onChange={(e) => addMedicine(e.target.value)}
                    >
                      <option value="">Select a medicine to add</option>
                      {meds.map((m) => (
                        <option key={m.key} value={m.key}>
                          {choiceSummary(prescriptionChoice(m, choices[m.key]))}
                        </option>
                      ))}
                    </select>
                  </label>
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
                    <p className="rx-compact-instructions">{choiceSummary(m)}</p>
                    <details className="rx-instruction-edit"><summary>{completeChoice(m) ? "Edit instructions" : "Edit instructions · complete once, then save as a quick choice"}</summary>
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
                          {key === "frequency" ? (
                            <select
                              aria-label={`${label} for medicine ${i + 1}`}
                              required
                              value={m.frequency}
                              onChange={(e) =>
                                change(i, "frequency", e.target.value)
                              }
                            >
                              <option value="" disabled>
                                Select frequency
                              </option>
                              {Object.entries(frequencyLabels).map(
                                ([code, text]) => (
                                  <option key={code} value={code}>
                                    {code} · {text}
                                  </option>
                                ),
                              )}
                              {m.frequency && !frequencyLabels[m.frequency] && (
                                <option>{m.frequency}</option>
                              )}
                            </select>
                          ) : key === "route" ? (
                            <select
                              aria-label={`${label} for medicine ${i + 1}`}
                              required
                              value={m.route}
                              onChange={(e) =>
                                change(i, "route", e.target.value)
                              }
                            >
                              {Array.from(
                                new Set([
                                  "Oral",
                                  "IV",
                                  "IM",
                                  "Topical",
                                  "Mouth rinse",
                                  "Oromucosal",
                                  "Buccal",
                                  "Sublingual",
                                  "Inhalation",
                                  m.route,
                                ]),
                              ).map((route) => (
                                <option key={route}>{route}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              aria-label={`${label} for medicine ${i + 1}`}
                              required
                              maxLength={200}
                              value={m[key as keyof RxItem] || ""}
                              placeholder={placeholder}
                              onChange={(e) =>
                                change(i, key as keyof RxItem, e.target.value)
                              }
                            />
                          )}
                        </label>
                      ))}
                      <label className="span-all">
                        Printed meal timing
                        <input
                          aria-label={`Printed meal timing for medicine ${i + 1}`}
                          maxLength={100}
                          placeholder="e.g. After meals"
                          value={m.print_timing ?? mealTiming(m.instructions)}
                          onChange={(e) =>
                            change(i, "print_timing", e.target.value)
                          }
                        />
                      </label>
                      <label className="span-all">
                        Clinical instructions · not printed
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
                    <button type="button" className="ghost" disabled={choiceBusy} onClick={() => void rememberChoice(m)}>Save as quick choice</button>
                    </details>
                  </article>
                ))}
                <div className="rx-actions">
                  <span>Saving keeps a dated copy in the patient record.</span>
                  <button
                    className="primary"
                    disabled={!items.length || saving || (!dirty && !!saved)}
                    type="submit"
                    value="save"
                  >
                    {saving ? "Saving…" : saved && !dirty ? "Saved ✓" : "Save prescription"}
                  </button>
                  <button className="ghost" type="button" disabled={!saved || dirty || saving || !printReady} onClick={printPrescription}><Printer size={16} />Print prescription</button>
                </div>
              </fieldset>
            </form>
          )}
          {saved && !dirty ? (
            <>
              <details className="rx-saved-preview"><summary>Preview saved prescription</summary>
              {!write && <button type="button" className="ghost" disabled={saving || !printReady} onClick={printPrescription}><Printer size={16} />Print prescription</button>}
              <PrescriptionPaper
                prescription={saved}
                letterhead={letterhead}
                logoUrl={logoUrl}
                patient={patient}
              /></details>
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
          {saved && !dirty && !saving && printReady ? (
            <PrescriptionPaper
              prescription={saved}
              letterhead={letterhead}
              logoUrl={logoUrl}
              patient={patient}
            />
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
  letterhead,
  logoUrl,
  patient,
}: {
  patient: RxPatient;
  prescription: Prescription;
  letterhead: ClinicLetterhead | null;
  logoUrl: string;
}) {
  return (
    <article className="rx-paper" aria-label="Printable prescription">
      <header>
        <div className="rx-letterhead">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={`${letterhead?.name || r.clinic_name} logo`}
            />
          )}
          <div>
            <b>{letterhead?.name || r.clinic_name}</b>
            {letterhead?.address && (
              <p className="rx-clinic-address">{letterhead.address}</p>
            )}
            {letterhead?.phone && <p>Tel: {letterhead.phone}</p>}
            <h2>Prescription</h2>
          </div>
        </div>
        <span>{r.prescribed_on}</span>
      </header>
      <div className="rx-patient">
        <b>{r.patient_name}</b>
        <span>ID: {r.patient_number}</span>
        <span>Age: {patientAge(patient.date_of_birth, r.prescribed_on)}</span>
        <span>Sex: {patient.sex || "Not recorded"}</span>
        {patient.phone && <span>Phone: {patient.phone}</span>}
        <span>Dr: {r.prescriber_name.replace(/^Dr\.?\s*/i, "")}</span>
      </div>
      <ol>
        {r.items.map((m, i) => (
          <li key={i}>
            <h3>
              {dosageForm(m.form)} {m.name} {m.strength}
              {m.dose.trim().toLowerCase() !==
                m.strength.trim().toLowerCase() && ` · ${m.dose}`}
              {m.route !== "Oral" && ` (${m.route})`}
              {(m.print_timing ?? mealTiming(m.instructions)) &&
                ` — ${m.print_timing ?? mealTiming(m.instructions)}`}
            </h3>
            <p>
              {frequencyLabels[m.frequency] || m.frequency} — {m.duration}
            </p>
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

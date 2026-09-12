import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ChevronLeft, Plus, Printer, Trash2 } from 'lucide-react'
import { CatalogueItem, PricingWorkspace } from './TreatmentPricing'
import { supabase } from './lib/supabase'
import './TreatmentPlan.css'

type Patient = { id: string; patient_number: string; patient_title: string | null; first_name: string; last_name: string | null; date_of_birth: string | null; chief_complaint: string | null; sex: string | null; phone: string | null; payer_group: string | null; final_diagnosis: string | null; primary_diagnosis: string | null }
type Plan = { id: string; additional_adjustment: number | null }
type Item = { id: string; treatment_catalogue_id: string | null; treatment_name_snapshot: string; tooth_or_region: string | null; quantity: number; unit_price_snapshot: number; discount_percent: number; discount_amount: number; final_price: number; status: string; custom_price: boolean; price_adjustment_reason: string | null }
const statuses = ['Planned', 'Accepted', 'In Progress', 'Completed', 'Deferred', 'Cancelled']
const money = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
function patientAge(dateOfBirth: string | null, today = new Date()) {
  if (!dateOfBirth) return 'Not recorded'
  const birth = new Date(`${dateOfBirth}T00:00:00`)
  if (!Number.isFinite(birth.getTime()) || birth > today) return 'Not recorded'
  let years = today.getFullYear() - birth.getFullYear()
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) years--
  return `${years} ${years === 1 ? 'year' : 'years'}`
}
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const priceItem = (item: Item): Item => {
  const subtotal = round(item.unit_price_snapshot * item.quantity)
  const discount_amount = round(subtotal * item.discount_percent / 100)
  return { ...item, discount_amount, final_price: round(subtotal - discount_amount) }
}

export function TreatmentPlan({ patient, workspace, clinicianName, onNotice, onBack, onAppointments }: {
  patient: Patient; workspace: PricingWorkspace & { clinicName: string }; clinicianName: string;
  onNotice: (message: string) => void; onBack: () => void; onAppointments: () => void;
}) {
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([])
  const [plan, setPlan] = useState<Plan | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const [adjustmentDirty, setAdjustmentDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const busy = useRef(false)
  const canOverride = workspace.role === 'admin'
  const dirty = dirtyIds.size > 0 || adjustmentDirty
  const [printedDate] = useState(() => new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }))

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [catalogueResult, planResult] = await Promise.all([
          supabase.from('treatment_catalogue').select('*,treatment_categories(name)').eq('clinic_id', workspace.clinicId).eq('active', true).order('name'),
          supabase.from('patient_treatment_plans').select('id,additional_adjustment').eq('patient_id', patient.id).eq('clinic_id', workspace.clinicId).eq('status', 'active').maybeSingle(),
        ])
        if (catalogueResult.error) throw catalogueResult.error
        if (planResult.error) throw planResult.error
        const currentPlan = planResult.data as Plan | null
        const result = currentPlan ? await supabase.from('patient_treatment_items').select('*').eq('treatment_plan_id', currentPlan.id).eq('clinic_id', workspace.clinicId).order('created_at') : { data: [], error: null }
        if (result.error) throw result.error
        if (!active) return
        setCatalogue((catalogueResult.data || []) as CatalogueItem[])
        setPlan(currentPlan)
        setItems((result.data || []) as Item[])
      } catch (err) { if (active) setError(message(err)) }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [patient.id, workspace.clinicId])

  // Only a fully saved plan can appear in the browser's print output.
  useEffect(() => {
    document.body.classList.add('treatment-plan-active')
    return () => { document.body.classList.remove('treatment-plan-active', 'treatment-plan-print-ready') }
  }, [])
  useEffect(() => {
    document.body.classList.toggle('treatment-plan-print-ready', !loading && !saving && !error && !dirty && items.some(item => item.status !== 'Cancelled'))
  }, [loading, saving, error, dirty, items])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function message(err: unknown) { return typeof err === 'object' && err !== null && 'message' in err ? String(err.message) : 'The treatment plan could not be saved. Please try again.' }
  async function run(action: () => Promise<void>) {
    if (busy.current) return
    busy.current = true; setSaving(true); setError(''); setSaved(false)
    try { await action() } catch (err) { setError(message(err)) }
    finally { busy.current = false; setSaving(false) }
  }
  function edit(item: Item, patch: Partial<Item>) {
    setItems(current => current.map(row => row.id === item.id ? priceItem({ ...row, ...patch }) : row))
    setDirtyIds(current => new Set(current).add(item.id)); setSaved(false)
  }
  async function add() {
    const treatment = catalogue.find(item => item.id === selected)
    if (!treatment) return
    await run(async () => {
      if (treatment.standard_price === null) throw new Error('Set a price for this treatment in the clinic price list before adding it.')
      const { data: auth, error: authError } = await supabase.auth.getUser()
      if (authError || !auth.user) throw new Error('Please sign in again before saving the treatment plan.')
      let activePlan = plan
      if (!activePlan) {
        const created = await supabase.from('patient_treatment_plans').insert({ organization_id: workspace.organizationId, clinic_id: workspace.clinicId, patient_id: patient.id, status: 'active', created_by: auth.user.id }).select('id,additional_adjustment').single()
        if (created.error) throw created.error
        if (!created.data) throw new Error('The treatment plan was not created.')
        activePlan = created.data as Plan; setPlan(activePlan)
      }
      const price = Number(treatment.standard_price)
      const result = await supabase.from('patient_treatment_items').insert({ organization_id: workspace.organizationId, clinic_id: workspace.clinicId, patient_id: patient.id, treatment_plan_id: activePlan.id, treatment_catalogue_id: treatment.id, treatment_name_snapshot: treatment.name, unit_price_snapshot: price, quantity: 1, discount_percent: 0, discount_amount: 0, final_price: price, status: 'Planned', created_by: auth.user.id }).select().single()
      if (result.error) throw result.error
      if (!result.data) throw new Error('The treatment was not added.')
      setItems(current => [...current, result.data as Item]); setSelected('')
    })
  }
  async function remove(item: Item) {
    if (!window.confirm(`Remove ${item.treatment_name_snapshot} from this treatment plan?`)) return
    await run(async () => {
      const result = await supabase.from('patient_treatment_items').delete().eq('id', item.id).eq('clinic_id', workspace.clinicId).select('id').single()
      if (result.error) throw result.error
      if (!result.data) throw new Error('The treatment was not removed.')
      setItems(current => current.filter(row => row.id !== item.id))
      setDirtyIds(current => { const next = new Set(current); next.delete(item.id); return next })
    })
  }
  const included = useMemo(() => items.filter(item => item.status !== 'Cancelled'), [items])
  const totals = useMemo(() => included.reduce((sum, item) => ({ subtotal: round(sum.subtotal + item.unit_price_snapshot * item.quantity), discount: round(sum.discount + Number(item.discount_amount)), final: round(sum.final + Number(item.final_price)) }), { subtotal: 0, discount: 0, final: 0 }), [included])
  const adjustment = Number(plan?.additional_adjustment || 0)
  const estimate = round(totals.final + adjustment)
  async function save(print: boolean) {
    await run(async () => {
      if (!plan || !included.length) throw new Error('Add at least one treatment before saving or printing.')
      if (!Number.isFinite(adjustment) || estimate < 0) throw new Error('The adjustment must leave a treatment total of zero or more.')
      const updated = new Map<string, Item>()
      // Save serially so errors retain all drafts for retry and never open print.
      for (const item of items.filter(row => dirtyIds.has(row.id))) {
        if (![item.quantity, item.unit_price_snapshot, item.discount_percent].every(Number.isFinite) || item.quantity < 1 || item.unit_price_snapshot < 0 || item.discount_percent < 0 || item.discount_percent > 100) throw new Error('Check the quantity, unit price and discount for each treatment.')
        const payload = { tooth_or_region: item.tooth_or_region, quantity: item.quantity, discount_percent: item.discount_percent, discount_amount: item.discount_amount, final_price: item.final_price, status: item.status, ...(canOverride ? { unit_price_snapshot: item.unit_price_snapshot, custom_price: item.custom_price } : {}) }
        const result = await supabase.from('patient_treatment_items').update(payload).eq('id', item.id).eq('clinic_id', workspace.clinicId).select().single()
        if (result.error) throw result.error
        if (!result.data) throw new Error('A treatment could not be saved. Please retry.')
        updated.set(item.id, result.data as Item)
      }
      if (adjustmentDirty) {
        const result = await supabase.from('patient_treatment_plans').update({ additional_adjustment: adjustment }).eq('id', plan.id).eq('clinic_id', workspace.clinicId).select('id,additional_adjustment').single()
        if (result.error) throw result.error
        if (!result.data) throw new Error('The adjustment could not be saved.')
        setPlan(result.data as Plan)
      }
      flushSync(() => { setItems(current => current.map(item => updated.get(item.id) || item)); setDirtyIds(new Set()); setAdjustmentDirty(false); setSaved(true) })
      onNotice('Treatment plan saved.')
      if (print) { document.body.classList.add('treatment-plan-print-ready'); window.print() }
    })
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void save((event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'print') }
  function leave(action: () => void) { if (!saving && (!dirty || window.confirm('Leave without saving your treatment plan changes?'))) action() }
  const name = [patient.patient_title, patient.first_name, patient.last_name].filter(Boolean).join(' ')

  return <section className="treatment-plan-page">
    <div className="treatment-page-toolbar"><div><span className="eyebrow">PATIENT CARE · TREATMENT PLAN</span><h1>{name}</h1><p>{patient.patient_number} · Review treatment options and costs with your patient.</p></div><div className="treatment-page-navigation"><button className="ghost" disabled={saving} onClick={() => leave(onBack)}><ChevronLeft size={16}/>Clinical file</button><button className="ghost" disabled={saving} onClick={() => leave(onAppointments)}>Appointments</button></div></div>
    <form className="clinical-section treatment-plan plan-editor" onSubmit={submit}>
      <div className="clinical-section-head"><div><div><h3>Treatments & pricing</h3><p>Add treatments, review the estimate, then save or print the patient copy.</p></div></div><span role="status">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : saved ? 'All changes saved' : ''}</span></div>
      {error && <p className="clinical-save-error" role="alert">{error}</p>}
      {loading ? <p role="status">Loading treatment plan…</p> : <>
        <fieldset disabled={saving} className="plan-fields">
          <div className="plan-add"><select aria-label="Choose treatment" value={selected} onChange={event => setSelected(event.target.value)}><option value="">Choose a treatment…</option>{catalogue.map(item => <option key={item.id} value={item.id} disabled={item.standard_price === null}>{item.name} · {item.standard_price !== null ? money(Number(item.standard_price)) : 'Price not set'}</option>)}</select><button type="button" className="primary" disabled={!selected} onClick={() => void add()}><Plus size={16}/>Add treatment</button></div>
          {!catalogue.length && <p>No active treatments are available. Add them under Admin controls → Finance.</p>}
          {!items.length && <p className="plan-empty">Choose a treatment above to start this patient's plan.</p>}
          {!!items.length && <div className="plan-table-wrap"><div className="plan-table"><div className="plan-row plan-head"><span>Treatment</span><span>Tooth / region</span><span>Qty</span><span>Unit price</span><span>Discount %</span><span>Final</span><span>Status</span><span/></div>{items.map(item => <div className="plan-row" key={item.id}><span><b>{item.treatment_name_snapshot}</b>{item.custom_price && <small>Adjusted price</small>}</span><span><input aria-label={`Tooth or region for ${item.treatment_name_snapshot}`} value={item.tooth_or_region || ''} placeholder="e.g. 46" onChange={event => edit(item, { tooth_or_region: event.target.value || null })}/></span><span><input aria-label={`Quantity for ${item.treatment_name_snapshot}`} type="number" min="1" step="1" required value={item.quantity} onChange={event => edit(item, { quantity: Number(event.target.value) })}/></span><span><input aria-label={`Unit price for ${item.treatment_name_snapshot}`} type="number" min="0" step="0.01" required value={item.unit_price_snapshot} disabled={!canOverride} onChange={event => edit(item, { unit_price_snapshot: Number(event.target.value), custom_price: true })}/></span><span><input aria-label={`Discount percent for ${item.treatment_name_snapshot}`} type="number" min="0" max="100" step="0.01" required value={item.discount_percent} onChange={event => edit(item, { discount_percent: Number(event.target.value) })}/><small>−{money(item.discount_amount)}</small></span><span><b>{money(item.final_price)}</b></span><span><select aria-label={`Status for ${item.treatment_name_snapshot}`} value={item.status} onChange={event => edit(item, { status: event.target.value })}>{statuses.map(status => <option key={status}>{status}</option>)}</select></span><span><button type="button" className="icon-btn danger-icon" aria-label={`Remove ${item.treatment_name_snapshot}`} onClick={() => void remove(item)}><Trash2 size={15}/></button></span></div>)}</div></div>}
          <div className="estimate-summary"><div><span>Subtotal</span><b>{money(totals.subtotal)}</b></div><div><span>Treatment discounts</span><b>−{money(totals.discount)}</b></div><label>Additional adjustment (₹)<input type="number" step="0.01" min={-totals.final} disabled={!plan} value={adjustment} onChange={event => { setPlan(current => current ? { ...current, additional_adjustment: Number(event.target.value) } : current); setAdjustmentDirty(true); setSaved(false) }}/><small>Negative for a reduction</small></label><div className="estimate-total"><span>Estimated treatment total</span><b>{money(estimate)}</b></div></div>
          <div className="estimate-actions"><button type="submit" className="ghost" value="save" disabled={!included.length}>Save treatment plan</button><button type="submit" className="primary" value="print" disabled={!included.length}><Printer size={16}/>Save & print plan</button></div>
        </fieldset>
      </>}
    </form>
    <div className="patient-copy-caption"><span className="eyebrow">PATIENT COPY</span><span>{dirty ? 'Preview · save before printing' : 'Print or save as PDF using Save & print plan'}</span></div>
    <article className="treatment-print-document" aria-label="Patient treatment plan">
      <header className="treatment-print-header"><div><span className="eyebrow">{workspace.clinicName}</span><h2>Treatment plan & estimate</h2></div><div><span>{printedDate}</span><b>{patient.patient_number}</b></div></header>
      <dl className="treatment-print-patient"><div><dt>Patient</dt><dd>{name}</dd></div><div><dt>Age</dt><dd>{patientAge(patient.date_of_birth)}</dd></div><div><dt>Sex</dt><dd>{patient.sex || 'Not recorded'}</dd></div><div><dt>Phone</dt><dd>{patient.phone || '—'}</dd></div><div><dt>Patient group / scheme</dt><dd>{patient.payer_group || 'Self Pay'}</dd></div><div><dt>Prepared by</dt><dd>{clinicianName}</dd></div></dl>
      <div className="treatment-print-context">
      <div className="treatment-print-diagnosis"><b>Chief complaint</b><p>{patient.chief_complaint || 'Not recorded'}</p></div>
      <div className="treatment-print-diagnosis"><b>{!patient.final_diagnosis && patient.primary_diagnosis ? 'Provisional diagnosis' : 'Diagnosis'}</b><p>{patient.final_diagnosis || patient.primary_diagnosis || 'Not recorded'}</p></div>
      </div>
      <h3>Treatment plan</h3>
      <div className="treatment-print-table-wrap"><table className="treatment-print-table"><thead><tr><th scope="col">Treatment / region</th><th scope="col">Qty</th><th scope="col">Unit price</th><th scope="col">Discount</th><th scope="col">Amount</th></tr></thead><tbody>{included.map(item => <tr key={item.id}><td><b>{item.treatment_name_snapshot}</b>{item.tooth_or_region && <span>Tooth / region: {item.tooth_or_region}</span>}<small>{item.status}</small></td><td>{item.quantity}</td><td>{money(item.unit_price_snapshot)}</td><td>{money(item.discount_amount)}<small>{item.discount_percent}%</small></td><td>{money(item.final_price)}</td></tr>)}</tbody></table></div>
      {!included.length && <p className="plan-empty">No treatments in this estimate yet.</p>}
      <div className="treatment-print-totals"><div><span>Subtotal</span><b>{money(totals.subtotal)}</b></div><div><span>Treatment discounts</span><b>−{money(totals.discount)}</b></div>{adjustment !== 0 && <div><span>Additional {adjustment < 0 ? 'reduction' : 'charge'}</span><b>{adjustment < 0 ? '−' : '+'}{money(Math.abs(adjustment))}</b></div>}<div className="treatment-print-total"><span>Estimated total</span><b>{money(estimate)}</b></div></div>
      <footer className="treatment-print-footer"><p>This is a treatment estimate, not a payment receipt. Any changes to the agreed treatment or cost will be discussed with you.</p><div><span>Doctor's signature</span><span>Date</span></div></footer>
    </article>
    <p className="treatment-print-blocked">Please return to the treatment plan and use “Save & print plan” after all changes have been saved.</p>
  </section>
}

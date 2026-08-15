import { FormEvent, useEffect, useState } from 'react'
import { CheckCircle2, ShieldCheck, UserPlus, UsersRound } from 'lucide-react'
import { supabase } from './lib/supabase'

export type Practitioner = {
  id: string
  full_name: string
  practitioner_role: string
  registration_number: string | null
  schedule_color: 'teal' | 'violet' | 'amber'
  active: boolean
}
type Workspace = { organizationId: string; clinicId: string; clinicName: string; role: string }

export function AdminPage({ workspace, onRosterChange, onNotice }: { workspace: Workspace; onRosterChange: (items: Practitioner[]) => void; onNotice: (message: string) => void }) {
  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [values, setValues] = useState({ full_name: '', practitioner_role: 'Doctor', registration_number: '', schedule_color: 'teal' as Practitioner['schedule_color'] })

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('clinic_practitioners').select('id, full_name, practitioner_role, registration_number, schedule_color, active').eq('clinic_id', workspace.clinicId).order('full_name')
    if (error) onNotice(error.message)
    const roster = (data || []) as Practitioner[]
    setPractitioners(roster); onRosterChange(roster); setLoading(false)
  }
  useEffect(() => { void load() }, [workspace.clinicId])

  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (!values.full_name.trim()) return
    setSaving(true)
    const { error } = await supabase.from('clinic_practitioners').insert({
      organization_id: workspace.organizationId, clinic_id: workspace.clinicId,
      full_name: values.full_name.trim(), practitioner_role: values.practitioner_role,
      registration_number: values.registration_number.trim() || null, schedule_color: values.schedule_color,
    })
    setSaving(false)
    if (error) { onNotice(error.message); return }
    setValues({ full_name: '', practitioner_role: 'Doctor', registration_number: '', schedule_color: 'teal' })
    await load()
  }

  const setActive = async (member: Practitioner) => {
    const { error } = await supabase.from('clinic_practitioners').update({ active: !member.active }).eq('id', member.id).eq('clinic_id', workspace.clinicId)
    if (error) { onNotice(error.message); return }
    await load()
  }

  const canManage = workspace.role === 'admin'
  return <section className="admin-page">
    <div className="hero"><div><span className="eyebrow">BRANCH ADMINISTRATION</span><h1>Admin controls</h1><p>Manage the clinicians available to this branch and keep high-risk actions under approved access.</p></div></div>
    {!canManage && <div className="admin-lock"><ShieldCheck size={19}/><div><b>Administrator access required</b><span>Your account can view the branch roster, but only an administrator can make changes.</span></div></div>}
    <div className="admin-grid">
      <div className="panel admin-roster">
        <div className="admin-section-title"><div><span className="eyebrow">SCHEDULING TEAM</span><h2>Clinician roster</h2><p>Added doctors are available in this branch’s appointment picker immediately.</p></div><UsersRound size={22}/></div>
        {canManage && <form className="admin-form" onSubmit={add}>
          <label><span>Doctor / team member name</span><input value={values.full_name} onChange={event => setValues(current => ({...current, full_name: event.target.value}))} placeholder="e.g. Dr. Vijay Kumar" required /></label>
          <label><span>Role</span><select value={values.practitioner_role} onChange={event => setValues(current => ({...current, practitioner_role: event.target.value}))}><option>Doctor</option><option>Specialist</option><option>Visiting consultant</option><option>Hygienist</option><option>Assistant</option></select></label>
          <label><span>Registration / licence no.</span><input value={values.registration_number} onChange={event => setValues(current => ({...current, registration_number: event.target.value}))} placeholder="Optional" /></label>
          <label><span>Schedule colour</span><select value={values.schedule_color} onChange={event => setValues(current => ({...current, schedule_color: event.target.value as Practitioner['schedule_color']}))}><option value="teal">Teal</option><option value="violet">Violet</option><option value="amber">Amber</option></select></label>
          <button className="primary" disabled={saving}><UserPlus size={16}/>{saving ? 'Adding…' : 'Add to branch'}</button>
        </form>}
        <div className="practitioner-list">
          {loading ? <p>Loading clinician roster…</p> : practitioners.length ? practitioners.map(member => <div className="practitioner-row" key={member.id}><i className={`doctor-swatch ${member.schedule_color}`}/><div><b>{member.full_name}</b><span>{member.practitioner_role}{member.registration_number ? ` · Reg. ${member.registration_number}` : ''}</span></div>{canManage ? <button className="ghost small" onClick={() => void setActive(member)}>{member.active ? 'Remove from schedule' : 'Restore to schedule'}</button> : <em>{member.active ? 'Active' : 'Inactive'}</em>}</div>) : <p className="admin-empty">No branch clinicians yet. Add your first doctor to make the appointment grid personal to this clinic.</p>}
        </div>
      </div>
      <div className="panel admin-security">
        <div className="admin-section-title"><div><span className="eyebrow">CONTROLLED ACTIONS</span><h2>Permission safeguards</h2><p>These actions remain restricted to authorised clinic administrators.</p></div><ShieldCheck size={22}/></div>
        <div className="security-list">
          <div><CheckCircle2 size={17}/><span><b>Leave approval</b><small>Approve staff leave before the roster is changed.</small></span></div>
          <div><CheckCircle2 size={17}/><span><b>Patient-file deletion</b><small>Only admins can authorise irreversible record deletion.</small></span></div>
          <div><CheckCircle2 size={17}/><span><b>Diagnosis changes</b><small>Clinical-file updates require a clinician permission.</small></span></div>
          <div><CheckCircle2 size={17}/><span><b>Team access</b><small>Only admins can add, remove or deactivate branch clinicians.</small></span></div>
        </div>
        <p className="admin-security-note">Adding someone to the roster does not automatically create a login or give access to patient data. Login access remains a separate, permission-controlled step.</p>
      </div>
    </div>
  </section>
}

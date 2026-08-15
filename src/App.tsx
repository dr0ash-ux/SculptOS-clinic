import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, FileText,
  LayoutDashboard, LogOut, Menu, Moon, Package, Plus, Search, Settings,
  Sun, UserRound, Users, WalletCards, X,
} from 'lucide-react'
import { signInWithGoogle, signOut, supabase } from './lib/supabase'

type View = 'dashboard' | 'appointments' | 'booking' | 'patients' | 'inventory' | 'finance' | 'crm' | 'ai' | 'prescriptions' | 'reports' | 'settings'
type Workspace = { organizationId: string; clinicId: string; clinicName: string; role: string }
type Patient = {
  id: string; patient_number: string; first_name: string; last_name: string | null; date_of_birth: string | null
  sex: string | null; phone: string | null; email: string | null; location: string | null; occupation: string | null
  referral_source: string | null; chief_complaint: string | null; history_present_illness: string | null
  medical_history: string | null; clinical_findings: string | null; primary_diagnosis: string | null
  final_diagnosis: string | null; treatment_advised: string | null; timeline_notes: string | null; status: string
}
type Appointment = {
  id: string; patient_id: string; clinician_name: string; clinician_color: 'teal' | 'violet' | 'amber'
  scheduled_at: string; duration_minutes: number; treatment_label: string; status: string; notes: string | null
}
type Slot = { date: Date; label: string }

const doctors = [
  { name: 'Dr. Aishwarya Jain', color: 'teal' as const },
  { name: 'Dr. Agarwal', color: 'violet' as const },
  { name: 'Dr. Reddy', color: 'amber' as const },
]
const timeLabels = Array.from({ length: 22 }, (_, index) => {
  const total = 8 * 60 + index * 30
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
})
const emptyPatient = {
  first_name: '', last_name: '', date_of_birth: '', sex: '', phone: '', email: '', location: '', occupation: '',
  referral_source: '', chief_complaint: '', history_present_illness: '', medical_history: '', clinical_findings: '',
  primary_diagnosis: '', final_diagnosis: '', treatment_advised: '', timeline_notes: '',
}

function startOfWeek(input: Date) {
  const date = new Date(input)
  const day = date.getDay() || 7
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - day + 1)
  return date
}
function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
function dateKey(value: Date) {
  return value.toISOString().slice(0, 10)
}
function initials(name?: string | null) {
  return (name || 'SculptOS').split(' ').filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase()
}
function patientName(patient?: Patient) {
  return patient ? `${patient.first_name} ${patient.last_name || ''}`.trim() : 'Unknown patient'
}
function formatShortDate(value: Date) {
  return value.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function App() {
  const [dark, setDark] = useState(true)
  const [view, setView] = useState<View>('dashboard')
  const [sidebar, setSidebar] = useState(true)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [profileName, setProfileName] = useState('Dr. Aishwarya Jain')
  const [email, setEmail] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [patientModalOpen, setPatientModalOpen] = useState(false)
  const [appointmentSlot, setAppointmentSlot] = useState<Slot | null>(null)

  const loadRecords = useCallback(async (activeWorkspace: Workspace) => {
    const [patientResponse, appointmentResponse] = await Promise.all([
      supabase.from('patients').select('*').eq('clinic_id', activeWorkspace.clinicId).order('created_at', { ascending: false }),
      supabase.from('appointments').select('*').eq('clinic_id', activeWorkspace.clinicId).order('scheduled_at'),
    ])
    if (patientResponse.error) setNotice(patientResponse.error.message)
    if (appointmentResponse.error) setNotice(appointmentResponse.error.message)
    setPatients((patientResponse.data || []) as Patient[])
    setAppointments((appointmentResponse.data || []) as Appointment[])
  }, [])

  const initializeWorkspace = useCallback(async (user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) => {
    const fullName = typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : 'Dr. Aishwarya Jain'
    const { data, error } = await supabase.rpc('bootstrap_my_clinic', {
      p_clinic_name: 'My SculptOS Clinic',
      p_full_name: fullName,
    })
    if (error) {
      setNotice(error.message)
      return
    }
    const row = data?.[0]
    if (!row) {
      setNotice('Your clinic workspace could not be opened.')
      return
    }
    const nextWorkspace = {
      organizationId: row.organization_id,
      clinicId: row.clinic_id,
      clinicName: row.clinic_name,
      role: row.role,
    } as Workspace
    const profileResponse = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    setProfileName(profileResponse.data?.full_name || fullName)
    setEmail(user.email || '')
    setWorkspace(nextWorkspace)
    await loadRecords(nextWorkspace)
  }, [loadRecords])

  useEffect(() => {
    let alive = true
    const begin = async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user && alive) await initializeWorkspace(data.session.user)
      if (alive) setLoading(false)
    }
    begin()
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!alive) return
      if (session?.user) {
        setLoading(true)
        await initializeWorkspace(session.user)
        if (alive) setLoading(false)
      } else {
        setWorkspace(null)
        setPatients([])
        setAppointments([])
        setLoading(false)
      }
    })
    return () => {
      alive = false
      listener.subscription.unsubscribe()
    }
  }, [initializeWorkspace])

  const selectedPatient = patients.find(patient => patient.id === selectedPatientId) || null
  const filteredPatients = useMemo(() => patients.filter(patient =>
    `${patientName(patient)} ${patient.patient_number} ${patient.treatment_advised || ''}`.toLowerCase().includes(query.toLowerCase()),
  ), [patients, query])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])

  const openPatient = (patientId: string) => {
    setSelectedPatientId(patientId)
    setView('patients')
  }
  const createAppointment = async (entry: Omit<Appointment, 'id'>) => {
    if (!workspace) return
    const { data, error } = await supabase.from('appointments').insert({
      ...entry,
      organization_id: workspace.organizationId,
      clinic_id: workspace.clinicId,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select().single()
    if (error) {
      setNotice(error.message)
      return
    }
    setAppointments(current => [...current, data as Appointment].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)))
    setAppointmentSlot(null)
    setNotice('Appointment booked and added to the weekly schedule.')
  }
  const createPatient = async (values: typeof emptyPatient) => {
    if (!workspace) return
    const user = (await supabase.auth.getUser()).data.user
    const patientNumber = `SC-${String(Date.now()).slice(-6)}`
    const { data, error } = await supabase.from('patients').insert({
      ...values,
      organization_id: workspace.organizationId,
      clinic_id: workspace.clinicId,
      created_by: user?.id,
      patient_number: patientNumber,
      status: 'active',
      date_of_birth: values.date_of_birth || null,
    }).select().single()
    if (error) {
      setNotice(error.message)
      return
    }
    const patient = data as Patient
    setPatients(current => [patient, ...current])
    setSelectedPatientId(patient.id)
    setPatientModalOpen(false)
    setView('patients')
    setNotice('Patient record saved.')
  }
  const createBooking = async (values: typeof emptyPatient, doctor: typeof doctors[number], duration: number, treatment: string, notes: string) => {
    if (!workspace || !appointmentSlot) return
    const user = (await supabase.auth.getUser()).data.user
    const patientNumber = `SC-${String(Date.now()).slice(-6)}`
    const { data: patientData, error: patientError } = await supabase.from('patients').insert({
      ...values, organization_id: workspace.organizationId, clinic_id: workspace.clinicId, created_by: user?.id,
      patient_number: patientNumber, status: 'active', date_of_birth: values.date_of_birth || null,
    }).select().single()
    if (patientError || !patientData) { setNotice(patientError?.message || 'Could not create patient record.'); return }
    const patient = patientData as Patient
    const { data: appointmentData, error: appointmentError } = await supabase.from('appointments').insert({
      patient_id: patient.id, clinician_name: doctor.name, clinician_color: doctor.color,
      scheduled_at: appointmentSlot.date.toISOString(), duration_minutes: duration, treatment_label: treatment || 'Check-up',
      status: 'confirmed', notes, organization_id: workspace.organizationId, clinic_id: workspace.clinicId, created_by: user?.id,
    }).select().single()
    if (appointmentError) { setNotice(appointmentError.message); return }
    setPatients(current => [patient, ...current])
    setAppointments(current => [...current, appointmentData as Appointment].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)))
    setSelectedPatientId(patient.id); setAppointmentSlot(null); setView('appointments')
    setNotice('Patient record created and appointment confirmed.')
  }

  const handleLogout = async () => {
    const { error } = await signOut()
    if (error) setNotice(error.message)
  }

  if (loading) return <div className={dark ? 'login dark' : 'login'}><div className="loading-card"><div className="brand-mark">S</div><p>Opening your secure clinic workspace…</p></div></div>
  if (!workspace) return <Login dark={dark} setDark={setDark} notice={notice} />

  const nav: Array<[View, string, typeof LayoutDashboard]> = [
    ['dashboard', 'Overview', LayoutDashboard], ['appointments', 'Appointments', CalendarDays], ['patients', 'Patients', Users],
    ['crm', 'CRM', ClipboardList], ['inventory', 'Inventory', Package], ['prescriptions', 'Pharmacy & Rx', FileText],
    ['finance', 'Finance', WalletCards], ['ai', 'AI Studio', Activity], ['reports', 'Reports', FileText],
  ]

  return <div className={dark ? 'app dark' : 'app'}>
    <aside className={sidebar ? 'sidebar' : 'sidebar collapsed'}>
      <div className="brand"><div className="brand-mark">S</div>{sidebar && <div><b>SculptOS</b><span>CLINIC</span></div>}</div>
      {sidebar && <div className="workspace"><span>WORKSPACE</span><button className="clinic-switch" onClick={() => setView('settings')}>{workspace.clinicName}<ChevronRight size={14} /></button></div>}
      <nav>{nav.map(([id, label, Icon]) => <button key={id} className={view === id ? 'nav-item active' : 'nav-item'} onClick={() => setView(id)}><Icon size={18} />{sidebar && <span>{label}</span>}</button>)}</nav>
      <div className="side-bottom">
        <button className={view === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => setView('settings')}><Settings size={18} />{sidebar && <span>Settings</span>}</button>
        <button className="nav-item logout" onClick={handleLogout}><LogOut size={18} />{sidebar && <span>Log out</span>}</button>
        <div className="profile-mini"><div className="avatar">{initials(profileName)}</div>{sidebar && <div><b>{profileName}</b><span>{workspace.role}</span></div>}</div>
      </div>
    </aside>
    <main>
      <header className="topbar">
        <button className="icon-btn" aria-label="Toggle navigation" onClick={() => setSidebar(value => !value)}><Menu size={19} /></button>
        <div className="crumb"><b>{view === 'dashboard' ? `Good morning, ${profileName.replace(/^Dr\.\s*/, 'Dr. ')}` : nav.find(item => item[0] === view)?.[1] || 'Settings'}</b><span>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
        <div className="top-actions"><div className="search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search patients, records..." /></div><button className="icon-btn" aria-label="Toggle theme" onClick={() => setDark(value => !value)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button><button className="avatar large" aria-label="Open settings" onClick={() => setView('settings')}>{initials(profileName)}</button></div>
      </header>
      {notice && <div className="notice">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button></div>}
      <div className="page">
        {view === 'dashboard' && <Dashboard patients={patients} appointments={appointments} setView={setView} setPatientModalOpen={setPatientModalOpen} />}
        {view === 'appointments' && <section><Hero eyebrow="APPOINTMENTS" title="Appointments" copy="Book, review and manage your clinical schedule." action={<button className="primary" onClick={() => { setAppointmentSlot({ date: new Date(), label: '' }); setView('booking') }}><Plus size={16} /> Book appointment</button>} /><Scheduler weekDays={weekDays} setWeekStart={setWeekStart} appointments={appointments} patients={patients} onOpenPatient={openPatient} onOpenSlot={slot => { setAppointmentSlot(slot); setView('booking') }} /></section>}
        {view === 'booking' && appointmentSlot && <BookingPage slot={appointmentSlot} onCancel={() => { setAppointmentSlot(null); setView('appointments') }} onSave={createBooking} />}
        {view === 'patients' && <PatientsPage patients={filteredPatients} selectedPatient={selectedPatient} onSelect={setSelectedPatientId} onNew={() => setPatientModalOpen(true)} onBook={patient => { setSelectedPatientId(patient.id); setAppointmentSlot({ date: new Date(), label: '' }) }} />}
        {view === 'settings' && <SettingsPage profileName={profileName} email={email} clinicName={workspace.clinicName} onSave={async (name, clinicName) => { const [profileResult, clinicResult] = await Promise.all([supabase.from('profiles').upsert({ id: (await supabase.auth.getUser()).data.user?.id, full_name: name }), supabase.from('clinics').update({ name: clinicName, updated_at: new Date().toISOString() }).eq('id', workspace.clinicId)]) ; if (profileResult.error || clinicResult.error) setNotice(profileResult.error?.message || clinicResult.error?.message || 'Could not save settings.'); else { setProfileName(name); setWorkspace(current => current ? { ...current, clinicName } : current); setNotice('Personalization saved.'); } }} onLogout={handleLogout} />}
        {!['dashboard', 'appointments', 'patients', 'settings'].includes(view) && <PlaceholderPage view={view} />}
      </div>
    </main>
    {patientModalOpen && <PatientModal onClose={() => setPatientModalOpen(false)} onSave={createPatient} />}
    {appointmentSlot && view !== 'booking' && <AppointmentModal slot={appointmentSlot} patients={patients} selectedPatientId={selectedPatientId} onClose={() => setAppointmentSlot(null)} onSave={createAppointment} />}
  </div>
}

function Login({ dark, setDark, notice }: { dark: boolean; setDark: (value: boolean) => void; notice: string }) {
  const [working, setWorking] = useState(false)
  const google = async () => {
    setWorking(true)
    const { error } = await signInWithGoogle()
    if (error) setWorking(false)
  }
  return <div className={dark ? 'login dark' : 'login'}>
    <section className="login-visual"><div className="visual-overlay"><span className="eyebrow">SCULPTOS CLINIC</span><h1>Run the clinic.<br /><em>Keep the human.</em></h1><p>Appointments, patient journeys and a calmer clinical day—kept together in one beautiful workspace.</p></div></section>
    <section className="login-panel"><div className="login-head"><div className="brand"><div className="brand-mark">S</div><div><b>SculptOS</b><span>CLINIC</span></div></div><button className="icon-btn" onClick={() => setDark(!dark)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button></div><div className="login-copy"><span>SECURE CLINIC WORKSPACE</span><h2>Welcome back.</h2><p>Sign in with the Google account approved for your clinic.</p>{notice && <p className="login-error">{notice}</p>}<button className="google" onClick={google} disabled={working}><span className="g">G</span>{working ? 'Connecting…' : 'Continue with Google'}</button><small>By continuing, you agree to the SculptOS terms and privacy policy.</small></div></section>
  </div>
}

function Hero({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return <div className="hero-row"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p className="muted">{copy}</p></div>{action}</div>
}

function Dashboard({ patients, appointments, setView, setPatientModalOpen }: { patients: Patient[]; appointments: Appointment[]; setView: (view: View) => void; setPatientModalOpen: (open: boolean) => void }) {
  const today = dateKey(new Date())
  const todayAppointments = appointments.filter(item => item.scheduled_at.slice(0, 10) === today)
  return <section>
    <Hero eyebrow="CLINIC OVERVIEW" title="Your clinic, in rhythm." copy="A focused view of today’s people, plans and progress." action={<button className="primary" onClick={() => setPatientModalOpen(true)}><Plus size={16} /> New patient</button>} />
    <div className="metric-grid"><Metric label="Today’s appointments" value={String(todayAppointments.length)} icon={<CalendarDays size={17} />} /><Metric label="Active patients" value={String(patients.length)} icon={<Users size={17} />} /><Metric label="Pending follow-ups" value="—" icon={<ClipboardList size={17} />} /><Metric label="This month’s revenue" value="—" icon={<WalletCards size={17} />} /></div>
    <div className="content-grid"><div className="panel"><div className="panel-head"><div><h3>Today’s schedule</h3><span>{todayAppointments.length ? 'Live appointments from your clinic calendar' : 'Your day is clear so far'}</span></div><button className="ghost small" onClick={() => setView('appointments')}>Open calendar</button></div><div className="mini-schedule">{todayAppointments.length ? todayAppointments.slice(0, 5).map(item => <div className={`mini-event ${item.clinician_color}`} key={item.id}><span>{formatTime(item.scheduled_at)}</span><div><b>{item.treatment_label}</b><small>{item.clinician_name}</small></div><em>{item.duration_minutes} min</em></div>) : <EmptyState label="No appointments today. Choose a time slot to start your first booking." />}</div></div><div className="panel focus"><div className="panel-head"><div><h3>Patient flow</h3><span>Early clinic snapshot</span></div></div><div className="donut"><div><b>{patients.length}</b><span>records</span></div></div><div className="legend"><span><i className="dot teal" />Active<b>{patients.filter(patient => patient.status === 'active').length}</b></span><span><i className="dot violet" />Appointments<b>{appointments.length}</b></span><span><i className="dot amber" />Needs review<b>—</b></span></div></div></div>
    <div className="panel quick"><div className="panel-head"><div><h3>Quick actions</h3><span>Common clinical workflows</span></div></div><div className="quick-grid"><button onClick={() => setPatientModalOpen(true)}><Users size={18} /><span>Add a patient</span><ChevronRight size={15} /></button><button onClick={() => setView('appointments')}><CalendarDays size={18} /><span>Book appointment</span><ChevronRight size={15} /></button><button onClick={() => setView('ai')}><Activity size={18} /><span>AI diagnosis</span><ChevronRight size={15} /></button><button onClick={() => setView('reports')}><FileText size={18} /><span>Reports</span><ChevronRight size={15} /></button></div></div>
  </section>
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="metric"><div className="metric-icon">{icon}</div><span>{label}</span><b>{value}</b></div>
}

function Scheduler({ weekDays, setWeekStart, appointments, patients, onOpenPatient, onOpenSlot }: { weekDays: Date[]; setWeekStart: (value: Date) => void; appointments: Appointment[]; patients: Patient[]; onOpenPatient: (id: string) => void; onOpenSlot: (slot: Slot) => void }) {
  const goToday = () => setWeekStart(startOfWeek(new Date()))
  const chooseDate = (value: string) => {
    if (!value) return
    const selected = new Date(`${value}T12:00:00`)
    setWeekStart(startOfWeek(selected))
  }

  return <div className="calendar-panel">
    <div className="calendar-toolbar">
      <div className="calendar-title"><b>Schedule</b><span>Week of {formatShortDate(weekDays[0])} – {formatShortDate(weekDays[6])}</span></div>
      <div className="doctor-key">{doctors.map(doctor => <span key={doctor.name}><i className={`dot ${doctor.color}`} />{doctor.name}</span>)}</div>
      <div className="calendar-actions">
        <label className="date-picker" title="Choose a date"><CalendarDays size={15} /><input type="date" aria-label="Choose appointment date" value={dateKey(weekDays[0])} onChange={event => chooseDate(event.target.value)} /></label>
        <button className="ghost small" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekDays[0], -7))}><ChevronLeft size={16} /></button>
        <button className="ghost small" onClick={goToday}>Today</button>
        <button className="ghost small" aria-label="Next week" onClick={() => setWeekStart(addDays(weekDays[0], 7))}><ChevronRight size={16} /></button>
      </div>
    </div>
    <div className="calendar-scroll">
      <div className="calendar">
        <div className="time-col"><div className="corner" />{timeLabels.map(time => <div key={time}>{time}</div>)}</div>
        {weekDays.map(day => <div className="day-col" key={dateKey(day)}>
          <div className={`day-head ${dateKey(day) === dateKey(new Date()) ? 'today' : ''}`}><b>{day.toLocaleDateString('en-IN', { weekday: 'short' })}</b><strong>{formatShortDate(day)}</strong></div>
          {timeLabels.map((time, index) => {
            const slot = new Date(day)
            const [hours, minutes] = time.split(':').map(Number)
            slot.setHours(hours, minutes, 0, 0)
            const cellAppointments = appointments.filter(item => item.scheduled_at.slice(0, 10) === dateKey(day) && Math.floor((new Date(item.scheduled_at).getHours() * 60 + new Date(item.scheduled_at).getMinutes() - 8 * 60) / 30) === index)
            return <div className="hour" key={time}>
              {cellAppointments.length === 0 && <button type="button" className="slot-button" aria-label={`Book an appointment for ${day.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} at ${time}`} onClick={() => onOpenSlot({ date: slot, label: time })}><span>Book appointment</span></button>}
              {cellAppointments.map(item => <button type="button" className={`appointment ${item.clinician_color}`} style={{ height: `calc(${item.duration_minutes / 30 * 56}px - 8px)` }} key={item.id} onClick={() => onOpenPatient(item.patient_id)}><b>{item.treatment_label}</b><span>{patientName(patients.find(patient => patient.id === item.patient_id))}</span><em>{item.clinician_name} · {formatTime(item.scheduled_at)}</em></button>)}
            </div>
          })}
        </div>)}
      </div>
    </div>
  </div>
}

function PatientsPage({ patients, selectedPatient, onSelect, onNew, onBook }: { patients: Patient[]; selectedPatient: Patient | null; onSelect: (id: string) => void; onNew: () => void; onBook: (patient: Patient) => void }) {
  return <section><Hero eyebrow="PATIENTS" title="Patient management" copy="Clinical context stays attached to every appointment." action={<button className="primary" onClick={onNew}><Plus size={16} /> New patient</button>} /><div className={selectedPatient ? 'patient-layout selected' : 'patient-layout'}><div className="panel patient-panel"><div className="filter-row"><div><b>{patients.length} patients</b><span>Search using the top bar</span></div></div>{patients.length ? patients.map(patient => <button className={`patient-row ${selectedPatient?.id === patient.id ? 'selected' : ''}`} key={patient.id} onClick={() => onSelect(patient.id)}><div className="patient-name"><div className="avatar">{initials(patientName(patient))}</div><div><b>{patientName(patient)}</b><span>{patient.patient_number} · {patient.phone || 'No phone saved'}</span></div></div><div><b>{patient.treatment_advised || 'New consultation'}</b><span>{patient.primary_diagnosis || 'No diagnosis recorded'}</span></div><span className="status green">{patient.status}</span><ChevronRight size={16} /></button>) : <EmptyState label="No patient records yet. Add your first patient to begin the clinic workflow." />}</div>{selectedPatient && <PatientDetail patient={selectedPatient} onBook={() => onBook(selectedPatient)} />}</div></section>
}

function PatientDetail({ patient, onBook }: { patient: Patient; onBook: () => void }) {
  const sections: Array<[string, string | null]> = [['Chief complaint', patient.chief_complaint], ['History of present illness', patient.history_present_illness], ['Medical history', patient.medical_history], ['Clinical findings', patient.clinical_findings], ['Primary diagnosis', patient.primary_diagnosis], ['Final diagnosis', patient.final_diagnosis], ['Treatment advised', patient.treatment_advised], ['Timeline / notes', patient.timeline_notes]]
  return <aside className="panel patient-detail"><div className="detail-head"><div className="avatar large">{initials(patientName(patient))}</div><div><h3>{patientName(patient)}</h3><span>{patient.patient_number} · {patient.sex || '—'} · {patient.phone || 'No phone'}</span></div></div><button className="primary full" onClick={onBook}><CalendarDays size={16} /> Book appointment</button><div className="detail-meta"><span>{patient.location || 'Location not added'}</span><span>{patient.occupation || 'Occupation not added'}</span><span>{patient.referral_source || 'No referral source'}</span></div><div className="clinical-notes">{sections.map(([label, value]) => <div key={label}><b>{label}</b><p>{value || 'Not recorded'}</p></div>)}</div></aside>
}

function PatientModal({ onClose, onSave }: { onClose: () => void; onSave: (values: typeof emptyPatient) => Promise<void> }) {
  const [values, setValues] = useState(emptyPatient)
  const [saving, setSaving] = useState(false)
  const update = (key: keyof typeof emptyPatient, value: string) => setValues(current => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!values.first_name.trim()) return; setSaving(true); await onSave(values); setSaving(false) }
  const field = (key: keyof typeof emptyPatient, label: string, textarea = false) => <label key={key}>{label}{textarea ? <textarea value={values[key]} onChange={event => update(key, event.target.value)} /> : <input value={values[key]} onChange={event => update(key, event.target.value)} />}</label>
  return <div className="modal-backdrop" role="presentation"><form className="modal form-modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">NEW PATIENT</span><h2>Create clinical record</h2></div><button type="button" className="icon-btn" onClick={onClose}><X size={18} /></button></div><div className="form-grid two">{field('first_name', 'First name')}{field('last_name', 'Last name')}{field('date_of_birth', 'Date of birth')}{field('sex', 'Sex')}{field('phone', 'Phone number')}{field('email', 'Email')}{field('location', 'Location')}{field('occupation', 'Occupation')}{field('referral_source', 'Referred by')}</div><div className="form-section"><h3>Clinical intake</h3><div className="form-grid">{field('chief_complaint', 'Chief complaint', true)}{field('history_present_illness', 'History of present illness', true)}{field('medical_history', 'Medical history', true)}{field('clinical_findings', 'Clinical findings', true)}{field('primary_diagnosis', 'Primary diagnosis', true)}{field('final_diagnosis', 'Final diagnosis', true)}{field('treatment_advised', 'Treatment advised', true)}{field('timeline_notes', 'Timeline / pre-op and post-op notes', true)}</div></div><div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={saving || !values.first_name.trim()}>{saving ? 'Saving…' : 'Save patient'}</button></div></form></div>
}

function BookingPage({ slot, onCancel, onSave }: { slot: Slot; onCancel: () => void; onSave: (values: typeof emptyPatient, doctor: typeof doctors[number], duration: number, treatment: string, notes: string) => Promise<void> }) {
  const [values, setValues] = useState(emptyPatient)
  const [doctor, setDoctor] = useState(doctors[0]); const [duration, setDuration] = useState('30'); const [treatment, setTreatment] = useState('Check-up'); const [notes, setNotes] = useState(''); const [saving, setSaving] = useState(false)
  const set = (key: keyof typeof emptyPatient, value: string) => setValues(current => ({ ...current, [key]: value }))
  const field = (key: keyof typeof emptyPatient, label: string, area = false) => <label>{label}{area ? <textarea value={values[key]} onChange={event => set(key, event.target.value)} /> : <input value={values[key]} onChange={event => set(key, event.target.value)} />}</label>
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!values.first_name.trim()) return; setSaving(true); await onSave(values, doctor, Number(duration), treatment, notes); setSaving(false) }
  return <section className="booking-page"><Hero eyebrow="NEW APPOINTMENT" title="Book appointment" copy="Create the patient record and confirm the visit in one workflow." action={<button className="ghost" onClick={onCancel}>Cancel</button>} /><form className="panel booking-form" onSubmit={submit}>
    <div className="booking-slot"><CalendarDays size={17} /><div><span>Selected appointment time</span><b>{slot.date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {slot.label || formatTime(slot.date.toISOString())}</b></div></div>
    <div className="booking-section"><div className="section-heading"><span>01</span><div><h3>Patient details</h3><p>Enter the details recorded at reception.</p></div></div><div className="form-grid two">{field('first_name', 'Patient name *')}<label>Patient ID<input value="Generated automatically" disabled /></label>{field('date_of_birth', 'Date of birth / age')}{field('sex', 'Sex')}{field('phone', 'Phone number')}{field('location', 'Address')}{field('occupation', 'Occupation')}{field('email', 'Email ID')}</div><div className="form-grid">{field('chief_complaint', 'Chief complaint', true)}</div></div>
    <div className="booking-section"><div className="section-heading"><span>02</span><div><h3>Appointment details</h3><p>Assign the clinician and define the visit.</p></div></div><div className="form-grid two"><label>Assigned doctor<select value={doctor.name} onChange={event => setDoctor(doctors.find(item => item.name === event.target.value) || doctors[0])}>{doctors.map(item => <option key={item.name}>{item.name}</option>)}</select></label><label>Duration<select value={duration} onChange={event => setDuration(event.target.value)}><option value="30">30 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></label></div><label>Visit type<input value={treatment} onChange={event => setTreatment(event.target.value)} /></label><label>Reception note<textarea value={notes} onChange={event => setNotes(event.target.value)} /></label></div>
    <div className="booking-footer"><p>A patient record and confirmed appointment will be created together.</p><div><button type="button" className="ghost" onClick={onCancel}>Cancel</button><button className="primary" disabled={saving || !values.first_name.trim()}>{saving ? 'Confirming…' : 'Confirm appointment'}</button></div></div>
  </form></section>
}

function AppointmentModal({ slot, patients, selectedPatientId, onClose, onSave }: { slot: Slot; patients: Patient[]; selectedPatientId: string | null; onClose: () => void; onSave: (entry: Omit<Appointment, 'id'>) => Promise<void> }) {
  const [patientId, setPatientId] = useState(selectedPatientId || patients[0]?.id || '')
  const [patientSearch, setPatientSearch] = useState('')
  const [doctor, setDoctor] = useState(doctors[0])
  const [duration, setDuration] = useState('30')
  const [treatment, setTreatment] = useState('Check-up')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const selectedPatient = patients.find(patient => patient.id === patientId)
  const matchingPatients = patients.filter(patient => `${patientName(patient)} ${patient.patient_number} ${patient.phone || ''}`.toLowerCase().includes(patientSearch.toLowerCase()))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!patientId) return
    setSaving(true)
    await onSave({ patient_id: patientId, clinician_name: doctor.name, clinician_color: doctor.color, scheduled_at: slot.date.toISOString(), duration_minutes: Number(duration), treatment_label: treatment || 'Check-up', status: 'confirmed', notes })
    setSaving(false)
  }
  return <div className="modal-backdrop" role="presentation"><form className="modal appointment-modal" onSubmit={submit}>
    <div className="modal-head"><div><span className="eyebrow">BOOK APPOINTMENT</span><h2>Appointment details</h2><p className="booking-time"><CalendarDays size={14} /> {slot.date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {slot.label || formatTime(slot.date.toISOString())}</p></div><button type="button" className="icon-btn" onClick={onClose}><X size={18} /></button></div>
    {patients.length ? <><div className="booking-patient-picker"><label>Find patient by name, ID or phone number<input value={patientSearch} onChange={event => setPatientSearch(event.target.value)} placeholder="Search patient…" /></label><div className="patient-options">{matchingPatients.slice(0, 5).map(patient => <button type="button" className={patient.id === patientId ? 'patient-option selected' : 'patient-option'} key={patient.id} onClick={() => { setPatientId(patient.id); setPatientSearch('') }}><b>{patientName(patient)}</b><span>{patient.patient_number} · {patient.phone || 'No phone number'}</span></button>)}</div></div>
    {selectedPatient && <div className="appointment-patient-summary"><div><span>Patient name</span><b>{patientName(selectedPatient)}</b></div><div><span>Patient ID</span><b>{selectedPatient.patient_number}</b></div><div><span>Age / sex</span><b>{selectedPatient.date_of_birth ? `${new Date().getFullYear() - new Date(selectedPatient.date_of_birth).getFullYear()} years` : 'Not recorded'} · {selectedPatient.sex || 'Not recorded'}</b></div><div><span>Phone number</span><b>{selectedPatient.phone || 'Not recorded'}</b></div><div><span>Address</span><b>{selectedPatient.location || 'Not recorded'}</b></div><div><span>Occupation</span><b>{selectedPatient.occupation || 'Not recorded'}</b></div><div className="wide"><span>Chief complaint</span><b>{selectedPatient.chief_complaint || 'Not recorded'}</b></div></div>}
    <div className="form-grid two"><label>Assigned doctor<select value={doctor.name} onChange={event => setDoctor(doctors.find(item => item.name === event.target.value) || doctors[0])}>{doctors.map(item => <option key={item.name}>{item.name}</option>)}</select></label><label>Duration<select value={duration} onChange={event => setDuration(event.target.value)}><option value="30">30 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></label></div>
    <label>Treatment / visit type<input value={treatment} onChange={event => setTreatment(event.target.value)} placeholder="e.g. Review, extraction, consult" /></label><label>Appointment note<textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional receptionist or clinical note" /></label>
    <div className="sms-note"><Activity size={15} /><span>On confirmation, SMS notifications are queued for the patient and {doctor.name}. Delivery activates when the clinic SMS provider is connected.</span></div>
    <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={saving || !patientId}>{saving ? 'Confirming…' : 'Confirm appointment'}</button></div></> : <EmptyState label="Create a patient record first. Appointments are always connected to a patient." />}
  </form></div>
}

function SettingsPage({ profileName, email, clinicName, onSave, onLogout }: { profileName: string; email: string; clinicName: string; onSave: (name: string, clinic: string) => Promise<void>; onLogout: () => void }) {
  const [name, setName] = useState(profileName)
  const [clinic, setClinic] = useState(clinicName)
  const [saving, setSaving] = useState(false)
  return <section><Hero eyebrow="PERSONALIZATION" title="Make SculptOS yours." copy="Your clinic identity carries through the workspace and future prescriptions." /><form className="panel settings-form" onSubmit={async event => { event.preventDefault(); setSaving(true); await onSave(name, clinic); setSaving(false) }}><div className="settings-avatar"><div className="avatar large">{initials(name)}</div><div><h3>Workspace identity</h3><p>Your account uses Google sign-in. Change your visible clinician and clinic names here.</p></div></div><div className="form-grid two"><label>Clinician name<input value={name} onChange={event => setName(event.target.value)} /></label><label>Clinic name<input value={clinic} onChange={event => setClinic(event.target.value)} /></label><label>Email<input value={email} disabled /></label><label>Timezone<input value="Asia/Kolkata" disabled /></label></div><div className="settings-actions"><button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save personalization'}</button><button type="button" className="ghost danger" onClick={onLogout}><LogOut size={16} /> Log out</button></div></form></section>
}

function PlaceholderPage({ view }: { view: View }) {
  const labels: Record<string, string> = { inventory: 'Inventory', finance: 'Finance', crm: 'CRM', ai: 'AI Studio', prescriptions: 'Pharmacy & Rx', reports: 'Reports' }
  return <section><Hero eyebrow="SCULPTOS CLINIC" title={labels[view]} copy="This module is next in the workflow roadmap. Your appointments and patient records are already live." /><div className="panel"><EmptyState label="The clinical core has been connected first: secure sign-in, patient records, appointments, calendar navigation and personalization." /></div></section>
}

function EmptyState({ label }: { label: string }) {
  return <div className="empty-state"><Activity size={19} /><p>{label}</p></div>
}
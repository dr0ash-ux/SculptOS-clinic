import { useEffect, useMemo, useState } from 'react'
import { Activity, Bell, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, CreditCard, FileText, FlaskConical, LayoutDashboard, Menu, Moon, Package, Phone, Plus, Search, Settings, ShieldCheck, Sun, Users, WalletCards } from 'lucide-react'
import { signInWithEmail, signInWithGoogle, signUpWithEmail, supabase } from './lib/supabase'

type View = 'dashboard'|'patients'|'appointments'|'inventory'|'finance'|'crm'|'ai'|'prescriptions'|'reports'|'settings'
type Patient = { name:string; id:string; age:number; sex:string; treatment:string; next:string; status:string }

const patients: Patient[] = [
  {name:'Aarav Mehta',id:'SC-1042',age:28,sex:'M',treatment:'Surgical extraction · 48',next:'Today · 10:30',status:'Confirmed'},
  {name:'Nisha Kapoor',id:'SC-1098',age:34,sex:'F',treatment:'RCT · 16',next:'Today · 11:30',status:'Checked in'},
  {name:'Rohan Shah',id:'SC-1107',age:22,sex:'M',treatment:'Orthognathic consult',next:'Today · 13:00',status:'Confirmed'},
  {name:'Diya Rao',id:'SC-1113',age:41,sex:'F',treatment:'Implant planning · 36',next:'Tomorrow · 09:00',status:'Pending'},
]

const doctors = [
  {name:'Dr. Agarwal',tone:'violet'}, {name:'Dr. Jain',tone:'teal'}, {name:'Dr. Reddy',tone:'amber'}
]

const slots = Array.from({length:11},(_,i)=>`${String(i+8).padStart(2,'0')}:00`)
const appointments = [
  {day:0,start:1,duration:2,doctor:0,patient:'Aarav Mehta',treatment:'Surgical extraction · 48'},
  {day:0,start:3,duration:1,doctor:1,patient:'Nisha Kapoor',treatment:'RCT · 16'},
  {day:1,start:2,duration:2,doctor:2,patient:'Kabir Singh',treatment:'Implant placement · 36'},
  {day:2,start:4,duration:2,doctor:0,patient:'Rohan Shah',treatment:'Orthognathic consult'},
  {day:3,start:1,duration:1,doctor:1,patient:'Diya Rao',treatment:'Post-op review'},
  {day:4,start:5,duration:2,doctor:2,patient:'Meera Nair',treatment:'Full mouth rehabilitation'},
]

function App(){
  const [view,setView]=useState<View>('dashboard')
  const [dark,setDark]=useState(true)
  const [login,setLogin]=useState(true)
  const [authLoading,setAuthLoading]=useState(true)
  const [sidebar,setSidebar]=useState(true)
  const [query,setQuery]=useState('')
  const [week,setWeek]=useState(0)

  useEffect(()=>{
    if(!supabase){setAuthLoading(false);return}
    let active=true
    supabase.auth.getSession().then(({data})=>{
      if(!active)return
      setLogin(!data.session)
      setAuthLoading(false)
    })
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
      setLogin(!session)
      setAuthLoading(false)
    })
    return ()=>{active=false;subscription.unsubscribe()}
  },[])

  const filteredPatients=useMemo(()=>patients.filter(p=>(p.name+p.id+p.treatment).toLowerCase().includes(query.toLowerCase())),[query])
  const nav:[View,string,typeof LayoutDashboard][]=[
    ['dashboard','Overview',LayoutDashboard],['appointments','Appointments',CalendarDays],['patients','Patients',Users],['crm','CRM',ClipboardList],['inventory','Inventory',Package],['prescriptions','Pharmacy & Rx',FlaskConical],['finance','Finance',WalletCards],['ai','AI Studio',Activity],['reports','Reports',FileText]
  ]

  if(authLoading) return <div className={dark?'login dark':'login'}><div className="login-panel loading-panel"><div className="brand-mark">S</div><div className="auth-loading">Loading secure workspace…</div></div></div>
  if(login) return <Login dark={dark} setDark={setDark}/>

  return <div className={dark?'app dark':'app'}>
    <aside className={sidebar?'sidebar':'sidebar collapsed'}>
      <div className="brand"><div className="brand-mark">S</div>{sidebar&&<div><b>SculptOS</b><span>CLINIC</span></div>}</div>
      <div className="workspace">{sidebar&&<><span>WORKSPACE</span><button className="clinic-switch">MaxFac Studio <ChevronRight size={14}/></button></>}</div>
      <nav>{nav.map(([id,label,Icon])=><button key={id} className={view===id?'nav-item active':'nav-item'} onClick={()=>setView(id)}><Icon size={18}/>{sidebar&&<span>{label}</span>}</button>)}</nav>
      <div className="side-bottom"><button className="nav-item" onClick={()=>setView('settings')}><Settings size={18}/>{sidebar&&<span>Settings</span>}</button><div className="profile-mini"><div className="avatar">AJ</div>{sidebar&&<div><b>Dr. Aishwarya Jain</b><span>Administrator</span></div>}</div></div>
    </aside>
    <main>
      <header className="topbar"><button className="icon-btn" onClick={()=>setSidebar(!sidebar)}><Menu size={19}/></button><div className="crumb"><b>{view==='dashboard'?'Good morning, Dr. Jain':nav.find(n=>n[0]===view)?.[1]||'Settings'}</b><span>Friday, 14 August 2026</span></div><div className="top-actions"><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search patients, records..."/></div><button className="icon-btn"><Bell size={18}/><i/></button><button className="icon-btn" onClick={()=>setDark(!dark)}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><div className="avatar large">AJ</div></div></header>
      {view==='dashboard'&&<Dashboard setView={setView}/>} 
      {view==='appointments'&&<Appointments week={week} setWeek={setWeek}/>} 
      {view==='patients'&&<Patients patients={filteredPatients} query={query}/>} 
      {view==='inventory'&&<Inventory/>}
      {view==='finance'&&<Finance/>}
      {view==='crm'&&<CRM/>}
      {view==='ai'&&<AIStudio/>}
      {view==='prescriptions'&&<Pharmacy/>}
      {view==='reports'&&<Reports/>}
      {view==='settings'&&<SettingsView/>}
    </main>
  </div>
}

function Login({dark,setDark}:{dark:boolean;setDark:(v:boolean)=>void}){
  const [mode,setMode]=useState<'signin'|'signup'>('signin')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')

  const submit=async()=>{
    setBusy(true);setMessage('')
    const result=mode==='signin'?await signInWithEmail(email,password):await signUpWithEmail(email,password)
    setBusy(false)
    if(result.error){setMessage(result.error.message);return}
    if(mode==='signup') setMessage('Account created. Check your email to confirm your address, then sign in.')
  }

  const google=async()=>{
    setBusy(true);setMessage('')
    const result=await signInWithGoogle()
    if(result.error){setBusy(false);setMessage(result.error.message)}
  }

  return <div className={dark?'login dark':'login'}><div className="login-visual"><div className="visual-overlay"><div className="eyebrow">SCULPTOS · CLINIC</div><h1>Precision, <em>beautifully</em> managed.</h1><p>A clinical operating system designed around the way modern dental teams actually work.</p><div className="anatomy-card"><span>CLINICAL INTELLIGENCE</span><b>Patient care, without the friction.</b></div></div></div><div className="login-panel"><div className="login-head"><div className="brand-mark">S</div><button className="icon-btn" onClick={()=>setDark(!dark)}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button></div><div className="login-copy"><span>{mode==='signin'?'WELCOME BACK':'CREATE YOUR ACCOUNT'}</span><h2>{mode==='signin'?<>Your clinic,<br/>at a glance.</>:<>Build your<br/>SculptOS workspace.</>}</h2><p>{mode==='signin'?'Sign in securely to continue.':'Create your SculptOS account to get started.'}</p></div><div className="auth-card"><label>Email address</label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="doctor@clinic.com" type="email" autoComplete="email"/><label>Password</label><input value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" type="password" autoComplete={mode==='signin'?'current-password':'new-password'}/>{mode==='signin'&&<div className="auth-row"><label className="check"><input type="checkbox"/> Remember me</label><a>Forgot password?</a></div>}{message&&<div className="auth-message">{message}</div>}<button className="primary full" disabled={busy||!email||!password} onClick={submit}>{busy?'Please wait…':mode==='signin'?'Sign in':'Create account'} <ChevronRight size={17}/></button><div className="divider"><span>or</span></div><button className="google full" disabled={busy} onClick={google}><span className="g">G</span> Continue with Google</button><button className="auth-switch" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setMessage('')}}>{mode==='signin'?"Don't have an account? Sign up":"Already have an account? Sign in"}</button><small>By continuing, you agree to SculptOS' terms and privacy policy.</small></div><div className="login-footer"><ShieldCheck size={15}/> Secure clinical workspace</div></div></div>
}

function Dashboard({setView}:{setView:(v:View)=>void}){return <section className="page"><div className="hero-row"><div><div className="eyebrow">FRIDAY · 14 AUGUST</div><h1>Today at the clinic.</h1><p className="muted">A clear view of your schedule, patients and practice health.</p></div><button className="primary" onClick={()=>setView('appointments')}><Plus size={17}/> New appointment</button></div><div className="metric-grid"><Metric label="Today's appointments" value="18" delta="+12%" icon={CalendarDays}/><Metric label="Patients checked in" value="07" delta="On pace" icon={Users}/><Metric label="Today's production" value="₹84,600" delta="+8.4%" icon={WalletCards}/><Metric label="Open treatment value" value="₹12.8L" delta="32 plans" icon={Activity}/></div><div className="content-grid"><div className="panel schedule-panel"><div className="panel-head"><div><h3>Today's schedule</h3><span>3 doctors · 18 appointments</span></div><button className="ghost" onClick={()=>setView('appointments')}>Full calendar <ChevronRight size={15}/></button></div><div className="mini-schedule">{appointments.filter(a=>a.day===0).map((a,i)=><div className={`mini-event ${doctors[a.doctor].tone}`} key={i}><span>{`${8+a.start}:00`}</span><div><b>{a.patient}</b><small>{a.treatment}</small></div><em>{a.duration*60} min</em></div>)}</div></div><div className="panel focus"><div className="panel-head"><div><h3>Practice focus</h3><span>This month</span></div><Activity size={18}/></div><div className="donut"><div><b>₹18.4L</b><span>production</span></div></div><div className="legend"><span><i className="dot teal"/>Collections <b>86%</b></span><span><i className="dot violet"/>Treatment acceptance <b>72%</b></span><span><i className="dot amber"/>New patients <b>41</b></span></div></div></div><div className="panel quick"><div className="panel-head"><div><h3>Quick actions</h3><span>Common workflows</span></div></div><div className="quick-grid">{[['patients','Add patient',Users],['appointments','Book appointment',CalendarDays],['prescriptions','Write prescription',FlaskConical],['inventory','Add inventory',Package]].map(([v,l,I])=><button key={l} onClick={()=>setView(v as View)}><I size={19}/><span>{l}</span><ChevronRight size={15}/></button>)}</div></div></section>}
function Metric({label,value,delta,icon:Icon}:{label:string;value:string;delta:string;icon:any}){return <div className="metric"><div className="metric-icon"><Icon size={18}/></div><span>{label}</span><b>{value}</b><small>{delta}</small></div>}

function Appointments({week,setWeek}:{week:number;setWeek:(n:number)=>void}){const days=['Mon 10','Tue 11','Wed 12','Thu 13','Fri 14','Sat 15','Sun 16'];return <section className="page"><div className="hero-row"><div><div className="eyebrow">APPOINTMENTS</div><h1>Weekly schedule</h1><p className="muted">Every chair, doctor and treatment in one view.</p></div><div className="calendar-actions"><button className="ghost" onClick={()=>setWeek(week-1)}><ChevronLeft size={16}/></button><button className="ghost" onClick={()=>setWeek(0)}>This week</button><button className="ghost" onClick={()=>setWeek(week+1)}><ChevronRight size={16}/></button><button className="primary"><Plus size={17}/> Book appointment</button></div></div><div className="calendar-panel"><div className="doctor-key"><span>DOCTORS</span>{doctors.map(d=><span key={d.name}><i className={`dot ${d.tone}`}/>{d.name}</span>)}</div><div className="calendar"><div className="time-col"><div className="corner"/>{slots.map(s=><div key={s}>{s}</div>)}</div>{days.map((day,di)=><div className="day-col" key={day}><div className={di===4?'day-head today':'day-head'}><b>{day.split(' ')[0]}</b><strong>{day.split(' ')[1]}</strong></div>{slots.map((s,si)=><div className="hour" key={s}/>) }{appointments.filter(a=>a.day===di).map((a,i)=><div className={`appointment ${doctors[a.doctor].tone}`} key={i} style={{top:`${42+a.start*64}px`,height:`${a.duration*64-6}px`}}><b>{a.patient}</b><span>{a.treatment}</span><em>{a.duration*60} min · {doctors[a.doctor].name}</em></div>)}</div>)}</div></div></section>}

function Patients({patients,query}:{patients:Patient[];query:string}){return <section className="page"><div className="hero-row"><div><div className="eyebrow">PATIENTS</div><h1>Patient records</h1><p className="muted">Clinical history, treatment plans and imaging.</p></div><button className="primary"><Plus size={17}/> Add patient</button></div><div className="panel patient-panel"><div className="filter-row"><div className="tabs"><button className="tab active">All patients <b>{patients.length}</b></button><button className="tab">Active</button><button className="tab">Needs follow-up</button></div><button className="ghost"><Search size={15}/> {query?'Filtering':'Filter'}</button></div><div className="patient-table"><div className="table-head"><span>Patient</span><span>Treatment / plan</span><span>Next appointment</span><span>Status</span><span/></div>{patients.map(p=><div className="patient-row" key={p.id}><div className="patient-name"><div className="avatar">{p.name.split(' ').map(x=>x[0]).join('')}</div><div><b>{p.name}</b><span>{p.id} · {p.age} yrs · {p.sex}</span></div></div><div><b>{p.treatment}</b><span>Treatment plan linked</span></div><div><b>{p.next}</b><span>Appointment</span></div><div><span className={`status ${p.status==='Checked in'?'green':''}`}>{p.status}</span></div><button className="icon-btn"><ChevronRight size={17}/></button></div>)}</div></div></section>}

function Inventory(){const items=[['Surgical gloves','124 boxes','−14%','Reorder in 18 days'],['Lignocaine 2%','86 cartridges','−9%','Healthy'],['Suture 3-0 Vicryl','42 packs','−21%','Reorder in 9 days'],['Impression material','31 packs','+6%','Healthy'],['Surgical burs','18 sets','−28%','Reorder in 5 days'],['Gauze 4×4','340 packs','−12%','Healthy']];return <section className="page"><div className="hero-row"><div><div className="eyebrow">OPERATIONS</div><h1>Inventory</h1><p className="muted">Stock, consumption and intelligent reorder signals.</p></div><button className="primary"><Plus size={17}/> Add item</button></div><div className="metric-grid"><Metric label="Inventory value" value="₹4.82L" delta="+3.2%" icon={Package}/><Metric label="Items low in stock" value="08" delta="Action needed" icon={Bell}/><Metric label="Monthly consumption" value="₹1.14L" delta="−4.8% vs July" icon={Activity}/><Metric label="Wastage" value="2.1%" delta="Within target" icon={ShieldCheck}/></div><div className="panel inventory-panel"><div className="panel-head"><div><h3>Stock overview</h3><span>Based on recorded clinical usage</span></div><button className="ghost">Export <FileText size={15}/></button></div><div className="inventory-table"><div className="table-head"><span>Item</span><span>Current stock</span><span>Monthly change</span><span>Signal</span></div>{items.map(x=><div className="inventory-row" key={x[0]}><div><b>{x[0]}</b><span>Dental / surgical consumable</span></div><b>{x[1]}</b><span>{x[2]}</span><span className={x[3].startsWith('Reorder')?'warning':'status green'}>{x[3]}</span></div>)}</div></div></section>}

function Finance(){return <section className="page"><div className="hero-row"><div><div className="eyebrow">PRACTICE HEALTH</div><h1>Finance</h1><p className="muted">Production, collections, discounts and missed opportunity.</p></div><button className="primary"><Plus size={17}/> New expense</button></div><div className="metric-grid"><Metric label="August production" value="₹18.4L" delta="+11.8%" icon={WalletCards}/><Metric label="Collections" value="₹15.9L" delta="86.4%" icon={CreditCard}/><Metric label="Discounts given" value="₹62,400" delta="3.4% of production" icon={Activity}/><Metric label="Missed opportunity" value="₹2.16L" delta="14 patients" icon={Bell}/></div><div className="content-grid"><div className="panel chart"><div className="panel-head"><div><h3>Monthly production</h3><span>Mar — Aug 2026</span></div><button className="ghost">Monthly <ChevronRight size={14}/></button></div><div className="bars">{[58,72,64,80,76,94].map((h,i)=><div key={i}><span style={{height:`${h}%`}}/><small>{['Mar','Apr','May','Jun','Jul','Aug'][i]}</small></div>)}</div></div><div className="panel calculator"><div className="panel-head"><div><h3>Financial calculator</h3><span>Quick scenario</span></div></div><label>Treatment value</label><input defaultValue="125000"/><label>Discount</label><input defaultValue="10"/><div className="calc-result"><span>Net production</span><b>₹1,12,500</b></div><button className="primary full">Calculate</button></div></div></section>}
function CRM(){return <section className="page"><div className="hero-row"><div><div className="eyebrow">PATIENT RELATIONSHIPS</div><h1>CRM</h1><p className="muted">Turn enquiries, missed calls and pending plans into care.</p></div><button className="primary"><Plus size={17}/> New lead</button></div><div className="crm-board">{[['New enquiry',5],['Consultation booked',8],['Treatment proposed',12],['Follow-up',7]].map(([title,n],i)=><div className="crm-col" key={title as string}><div className="crm-head"><b>{title}</b><span>{n}</span></div>{['Priya Menon','Arjun Patel','Sneha Rao'].slice(0,i+1).map((x,j)=><div className="lead" key={x}><div className="avatar">{x.split(' ').map(y=>y[0]).join('')}</div><div><b>{x}</b><span>{i%2?'Implant consult':'Orthodontic enquiry'}</span></div><ChevronRight size={14}/></div>)}</div>)}</div></section>}
function AIStudio(){return <section className="page"><div className="hero-row"><div><div className="eyebrow">SCULPTOS INTELLIGENCE</div><h1>AI Studio</h1><p className="muted">Assistive tools built around your clinical workflow.</p></div></div><div className="ai-grid">{[['Daignobot','Differential diagnosis assistance','Review clinical findings and surface possible differentials.',Activity],['OPG Reader','Imaging analysis','Upload an OPG and receive structured observations for clinician review.',Search],['Daily report','Close-of-day intelligence','Summarise production, appointments, follow-ups and operational signals.',FileText],['Call scheduling bot','AI receptionist','Qualify inbound calls, answer basics and hand off to your team.',Phone]].map(([t,s,d,I])=><div className="ai-card" key={t as string}><div className="ai-icon"><I size={20}/></div><div><span>{s as string}</span><h3>{t as string}</h3><p>{d as string}</p></div><button className="ghost">Open <ChevronRight size={15}/></button></div>)}</div></section>}
function Pharmacy(){return <section className="page"><div className="hero-row"><div><div className="eyebrow">CLINICAL TOOLS</div><h1>Pharmacy & prescriptions</h1><p className="muted">Your clinic's formulary, pricing and reusable prescription workflows.</p></div><button className="primary"><Plus size={17}/> Add medication</button></div><div className="panel rx-builder"><div className="panel-head"><div><h3>Prescription builder</h3><span>Medication dropdown is populated from your clinic formulary.</span></div></div><div className="rx-grid"><div><label>Medication</label><select><option>Amoxicillin 500 mg</option><option>Ibuprofen 400 mg</option><option>Chlorhexidine 0.2%</option><option>Diclofenac 50 mg</option></select></div><div><label>Frequency</label><select><option>1-1-1</option><option>1-0-1</option><option>0-0-1</option></select></div><div><label>Duration</label><select><option>5 days</option><option>7 days</option><option>3 days</option></select></div></div><div className="rx-note"><FileText size={17}/><span>Prescription records should capture drug, dose, amount, directions and refills, with clinician sign-off.</span></div><button className="primary">Add to prescription</button></div></section>}
function Reports(){return <section className="page"><div className="hero-row"><div><div className="eyebrow">OPERATIONS</div><h1>Daily report</h1><p className="muted">A concise close-of-day view for the practice administrator.</p></div><button className="primary"><FileText size={17}/> Generate report</button></div><div className="report-grid"><div className="panel"><h3>Today's close</h3><div className="report-line"><span>Appointments completed</span><b>14 / 18</b></div><div className="report-line"><span>Production</span><b>₹84,600</b></div><div className="report-line"><span>Collections</span><b>₹76,200</b></div><div className="report-line"><span>New patients</span><b>3</b></div><div className="report-line"><span>Follow-ups due</span><b>7</b></div></div><div className="panel"><h3>AI narrative</h3><p className="narrative">Production is ahead of the daily target, with 3 new patients and 7 follow-ups requiring action. Two appointments were cancelled; one treatment plan remains unsigned.</p><button className="ghost">Edit narrative</button></div></div></section>}
function SettingsView(){return <section className="page"><div className="hero-row"><div><div className="eyebrow">ADMINISTRATION</div><h1>Settings</h1><p className="muted">Control workspace preferences and access.</p></div></div><div className="settings-grid"><div className="panel"><div className="panel-head"><div><h3>Access control</h3><span>Admin can decide who sees and edits what.</span></div><ShieldCheck size={18}/></div>{['Dr. Agarwal · Surgeon','Dr. Reddy · General Dentist','Anita · Reception'].map((x,i)=><div className="access-row" key={x}><div className="avatar">{x.split(' ').map(y=>y[0]).join('').slice(0,2)}</div><div><b>{x}</b><span>{i===0?'Full clinical access':i===1?'Clinical + treatment plans':'Appointments + CRM'}</span></div><button className="ghost">Manage <ChevronRight size={14}/></button></div>)}</div><div className="panel"><div className="panel-head"><div><h3>Personalisation</h3><span>Carry the SculptOS identity across variants.</span></div></div><div className="theme-options"><button className="theme-card active"><div className="theme-light"/>Light</button><button className="theme-card"><div className="theme-dark"/>Dark</button></div></div></div></section>}

export default App

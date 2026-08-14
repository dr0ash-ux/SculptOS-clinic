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
    let active=true

    const initializeAuth = async () => {
      if (!supabase) {
        if (active) setAuthLoading(false)
        return
      }

      // OAuth callback is consumed in src/main.tsx BEFORE React mounts.
      // App only reads the resulting session here, avoiding a second
      // setSession() call racing with the bootstrap callback.
      const { data, error } = await supabase.auth.getSession()
      if (error) console.error('Supabase getSession failed:', error)
      if (!active) return

      setLogin(!data.session)
      setAuthLoading(false)
    }

    initializeAuth()

    const {data:{subscription}}=supabase?.auth.onAuthStateChange((_event,session)=>{
      if (!active) return
      setLogin(!session)
      setAuthLoading(false)
    }) ?? {data:{subscription:{unsubscribe(){}}}}

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
      {view==='patients'&&<Patients patients={filteredPatients}/>} 
      {view==='appointments'&&<Appointments week={week} setWeek={setWeek}/>} 
      {view==='inventory'&&<Inventory/>} 
      {view==='finance'&&<Finance/>} 
      {view==='crm'&&<CRM/>} 
      {view==='ai'&&<AIStudio/>} 
      {view==='prescriptions'&&<Prescriptions/>} 
      {view==='reports'&&<Reports/>} 
      {view==='settings'&&<SettingsPage/>}
    </main>
  </div>
}

function Login({dark,setDark}:{dark:boolean;setDark:(v:boolean)=>void}){
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [mode,setMode]=useState<'login'|'signup'>('login')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const submit=async()=>{setLoading(true);setError('');try{const r=mode==='login'?await signInWithEmail(email,password):await signUpWithEmail(email,password);if(r.error)setError(r.error.message)}finally{setLoading(false)}}
  const google=async()=>{setLoading(true);setError('');const r=await signInWithGoogle();if(r.error){setError(r.error.message);setLoading(false)}}
  return <div className={dark?'login dark':'login'}><button className="theme-toggle" onClick={()=>setDark(!dark)}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><div className="login-card"><div className="login-brand"><div className="brand-mark">S</div><div><b>SculptOS</b><span>CLINIC</span></div></div><h1>{mode==='login'?'Welcome back':'Create your account'}</h1><p>{mode==='login'?'Sign in to your clinic workspace':'Start your SculptOS clinic workspace'}</p><button className="google" onClick={google} disabled={loading}><span className="google-g">G</span>{loading?'Connecting…':'Continue with Google'}</button><div className="divider"><span>or</span></div><label>Email</label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@clinic.com"/><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/><button className="primary" onClick={submit} disabled={loading}>{mode==='login'?'Sign in':'Create account'}</button>{error&&<div className="error">{error}</div>}<button className="link-btn" onClick={()=>setMode(mode==='login'?'signup':'login')}>{mode==='login'?'Need an account? Create one':'Already have an account? Sign in'}</button><small>By continuing, you agree to the SculptOS terms and privacy policy.</small></div></div>
}

function Dashboard({setView}:{setView:(v:View)=>void}){return <section><div className="hero"><div><span className="eyebrow">CLINIC OVERVIEW</span><h1>Good morning, Dr. Jain</h1><p>Here’s what’s happening across your practice today.</p></div><button className="primary compact" onClick={()=>setView('patients')}><Plus size={16}/> New patient</button></div><div className="stats"><Stat label="Today’s appointments" value="18" delta="+12%"/><Stat label="Patients this month" value="142" delta="+8.4%"/><Stat label="Revenue this month" value="₹4.82L" delta="+15.2%"/><Stat label="Pending follow-ups" value="27" delta="-6.1%"/></div><div className="grid2"><div className="panel"><div className="panel-head"><div><b>Today’s schedule</b><span>18 appointments · 3 doctors</span></div><button onClick={()=>setView('appointments')}>View calendar <ChevronRight size={15}/></button></div><div className="timeline">{appointments.slice(0,4).map((a,i)=><div className="appt-row" key={i}><span>{['09:00','10:00','11:30','13:00'][i]}</span><div><b>{a.patient}</b><small>{a.treatment}</small></div><em>{doctors[a.doctor].name}</em></div>)}</div></div><div className="panel"><div className="panel-head"><div><b>Revenue</b><span>Last 6 months</span></div><span className="positive">+15.2%</span></div><div className="chart"><div className="bars">{[44,52,48,63,70,82].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div><div className="chart-labels"><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span></div></div></div></div><div className="grid2"><div className="panel"><div className="panel-head"><div><b>Patient pipeline</b><span>Conversion overview</span></div><button onClick={()=>setView('crm')}>Open CRM <ChevronRight size={15}/></button></div><div className="pipeline"><Pipeline n="48" l="New enquiries"/><Pipeline n="31" l="Consultations"/><Pipeline n="19" l="Treatment plans"/><Pipeline n="12" l="Started treatment"/></div></div><div className="panel"><div className="panel-head"><div><b>Quick actions</b><span>Common workflows</span></div></div><div className="quick"><button onClick={()=>setView('patients')}><Users size={18}/>Add patient</button><button onClick={()=>setView('appointments')}><CalendarDays size={18}/>Book appointment</button><button onClick={()=>setView('ai')}><Activity size={18}/>AI diagnosis</button><button onClick={()=>setView('reports')}><FileText size={18}/>Reports</button></div></div></div></section>}

function Stat({label,value,delta}:{label:string;value:string;delta:string}){return <div className="stat"><span>{label}</span><b>{value}</b><em>{delta}</em></div>}
function Pipeline({n,l}:{n:string;l:string}){return <div className="pipe"><b>{n}</b><span>{l}</span></div>}
function Patients({patients}:{patients:Patient[]}){return <section><div className="hero"><div><span className="eyebrow">PATIENTS</span><h1>Patient management</h1><p>Search and manage your clinic records.</p></div><button className="primary compact"><Plus size={16}/> New patient</button></div><div className="panel table-panel"><div className="table-head"><b>{patients.length} patients</b><button><Search size={15}/> Filter</button></div><table><thead><tr><th>Patient</th><th>ID</th><th>Treatment</th><th>Next visit</th><th>Status</th></tr></thead><tbody>{patients.map(p=><tr key={p.id}><td><b>{p.name}</b><span>{p.age} · {p.sex}</span></td><td>{p.id}</td><td>{p.treatment}</td><td>{p.next}</td><td><em className="pill">{p.status}</em></td></tr>)}</tbody></table></div></section>}

function Appointments({week,setWeek}:{week:number;setWeek:(n:number)=>void}){const days=['Mon','Tue','Wed','Thu','Fri','Sat'];return <section><div className="hero"><div><span className="eyebrow">APPOINTMENTS</span><h1>Weekly calendar</h1><p>Doctor-coded schedule across your clinic.</p></div><div className="hero-actions"><button className="icon-btn" onClick={()=>setWeek(week-1)}><ChevronLeft size={18}/></button><button className="icon-btn" onClick={()=>setWeek(week+1)}><ChevronRight size={18}/></button><button className="primary compact"><Plus size={16}/> Book appointment</button></div></div><div className="panel calendar"><div className="calendar-grid"><div className="time-col">{slots.map(s=><span key={s}>{s}</span>)}</div>{days.map((d,di)=><div className="day-col" key={d}><header><b>{d}</b><span>{15+di}</span></header>{slots.map((s,si)=><div className="cell" key={s}>{appointments.filter(a=>a.day===di&&a.start===si).map(a=><div className={`booking ${doctors[a.doctor].tone}`} key={a.patient}><b>{a.patient}</b><span>{a.treatment}</span><small>{doctors[a.doctor].name}</small></div>)}</div>)}</div>)}</div></div></section>}

function Inventory(){return <section><div className="hero"><div><span className="eyebrow">INVENTORY</span><h1>Inventory & supplies</h1><p>Stock levels, batches and expiry alerts.</p></div><button className="primary compact"><Plus size={16}/> Add stock</button></div><div className="stats"><Stat label="Items tracked" value="248" delta="+12"/><Stat label="Low stock" value="14" delta="Needs action"/><Stat label="Expiring in 30d" value="7" delta="Watch"/><Stat label="Inventory value" value="₹8.6L" delta="+4.8%"/></div><div className="panel table-panel"><table><thead><tr><th>Item</th><th>Category</th><th>Stock</th><th>Expiry</th><th>Status</th></tr></thead><tbody>{['Lignocaine 2%','Surgical gloves · M','Bone graft · 1g','Suture · 3-0'].map((x,i)=><tr key={x}><td><b>{x}</b></td><td>{['Anaesthetic','Consumable','Implant','Surgical'][i]}</td><td>{[82,240,18,64][i]}</td><td>{['Jan 2027','Mar 2027','Oct 2026','Dec 2026'][i]}</td><td><em className="pill">{i===2?'Low stock':'Healthy'}</em></td></tr>)}</tbody></table></div></section>}

function Finance(){return <section><div className="hero"><div><span className="eyebrow">FINANCE</span><h1>Financial overview</h1><p>Revenue, collections, discounts and leakage.</p></div><button className="primary compact"><CreditCard size={16}/> Export report</button></div><div className="stats"><Stat label="Gross revenue" value="₹5.31L" delta="+15.2%"/><Stat label="Collected" value="₹4.82L" delta="90.8%"/><Stat label="Discounts" value="₹28.4K" delta="5.3%"/><Stat label="Potential missed" value="₹41.7K" delta="Needs action"/></div><div className="panel chart-panel"><div className="panel-head"><div><b>Monthly revenue</b><span>Actual vs potential</span></div></div><div className="big-chart"><div className="bars">{[35,48,42,58,68,84].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div></div></div></section>}

function CRM(){return <section><div className="hero"><div><span className="eyebrow">CRM</span><h1>Patient conversion</h1><p>Follow-ups, enquiries and treatment starts.</p></div><button className="primary compact"><Phone size={16}/> Call queue</button></div><div className="stats"><Stat label="New enquiries" value="48" delta="This month"/><Stat label="Consulted" value="31" delta="64.6%"/><Stat label="Plans sent" value="19" delta="61.3%"/><Stat label="Started" value="12" delta="63.2%"/></div><div className="panel pipeline-panel"><div className="panel-head"><div><b>Follow-up queue</b><span>Patients needing contact</span></div></div>{['Karan Malhotra','Isha Verma','Vivek Rao','Ananya Shah'].map((n,i)=><div className="follow" key={n}><div className="avatar">{n.split(' ').map(x=>x[0]).join('')}</div><div><b>{n}</b><span>{['Implant consult','Aligner enquiry','OMFS consult','Full mouth rehab'][i]}</span></div><em>{['Today','Today','Tomorrow','Aug 17'][i]}</em><button className="icon-btn"><Phone size={16}/></button></div>)}</div></section>}

function AIStudio(){return <section><div className="hero"><div><span className="eyebrow">AI STUDIO</span><h1>Clinical intelligence</h1><p>Diagnosis, differentials and imaging workflows.</p></div></div><div className="grid2"><div className="panel ai-card"><div className="ai-icon"><Activity size={20}/></div><b>Diagnobot</b><span>Build a differential diagnosis from symptoms, history and clinical findings.</span><button className="primary compact">Start analysis <ChevronRight size={15}/></button></div><div className="panel ai-card"><div className="ai-icon"><Search size={20}/></div><b>OPG Reader</b><span>Upload panoramic imaging for structured review and findings.</span><button className="secondary compact">Open reader <ChevronRight size={15}/></button></div><div className="panel ai-card"><div className="ai-icon"><ShieldCheck size={20}/></div><b>CBCT Review</b><span>Basic volumetric review with annotation-ready workflow.</span><button className="secondary compact">Open CBCT <ChevronRight size={15}/></button></div><div className="panel ai-card"><div className="ai-icon"><FileText size={20}/></div><b>Patient summary</b><span>Turn notes and records into a clean clinical summary.</span><button className="secondary compact">Create summary <ChevronRight size={15}/></button></div></div></section>}

function Prescriptions(){return <section><div className="hero"><div><span className="eyebrow">PHARMACY & RX</span><h1>Prescriptions</h1><p>Draft and track patient medication plans.</p></div><button className="primary compact"><Plus size={16}/> New prescription</button></div><div className="panel table-panel"><table><thead><tr><th>Patient</th><th>Medication</th><th>Duration</th><th>Status</th></tr></thead><tbody>{[['Aarav Mehta','Amoxicillin 500mg','5 days'],['Nisha Kapoor','Ibuprofen 400mg','3 days'],['Rohan Shah','Chlorhexidine 0.2%','7 days']].map(([p,m,d])=><tr key={p}><td><b>{p}</b></td><td>{m}</td><td>{d}</td><td><em className="pill">Active</em></td></tr>)}</tbody></table></div></section>}

function Reports(){return <section><div className="hero"><div><span className="eyebrow">REPORTS</span><h1>Clinic reports</h1><p>Performance, revenue and patient activity.</p></div><button className="primary compact"><FileText size={16}/> Generate report</button></div><div className="grid2"><div className="panel report"><b>Revenue report</b><span>Monthly collections, discounts and leakage.</span><button className="secondary compact">Open</button></div><div className="panel report"><b>Patient report</b><span>New, active and returning patient trends.</span><button className="secondary compact">Open</button></div></div></section>}

function SettingsPage(){return <section><div className="hero"><div><span className="eyebrow">SETTINGS</span><h1>Workspace settings</h1><p>Clinic preferences and user access.</p></div></div><div className="panel settings-panel"><div><b>Workspace</b><span>MaxFac Studio</span></div><div><b>Authentication</b><span>Google OAuth enabled</span></div><div><b>Role</b><span>Administrator</span></div></div></section>}

export default App

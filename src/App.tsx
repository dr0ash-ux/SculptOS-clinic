import { useEffect, useMemo, useState } from 'react'
import { Activity, Bell, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, CreditCard, FileText, FlaskConical, LayoutDashboard, Menu, Moon, Package, Phone, Plus, Search, Settings, ShieldCheck, Sun, Users, WalletCards } from 'lucide-react'
import { signInWithEmail, signInWithGoogle, signUpWithEmail, supabase, handleOAuthCallback } from './lib/supabase'

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

      const callback = await handleOAuthCallback()
      if (!active) return

      if (callback?.error) {
        console.error('Supabase OAuth callback failed:', callback.error)
      }

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

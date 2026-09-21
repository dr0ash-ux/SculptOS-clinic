import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Check, Send, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { classifyMilo, localInput, miloHelp, promptDate } from './miloCommands'
import mascot from './milo.webp.b64?raw'
import './MiloAssistant.css'

type Patient = { id:string; first_name:string; last_name:string|null; patient_number:string; next_follow_up_date:string|null }
type Reminder = {id:string;title:string;due_at:string;completed_at:string|null}
type Action = {label:string;run:()=>void}
type Message = {id:number;role:'user'|'milo';text:string;actions?:Action[]}
export type MiloPage = 'appointments'|'patients'|'inventory'|'settings'|'prescriptions'
type Props = {clinicId:string; clinicName:string; access:Set<string>; currentPage:string; onNavigate:(page:MiloPage)=>void; onPatient:(id:string)=>void; onBook:(date:Date,patientId:string|null)=>void}
const welcome='Hi, I’m Milo. Tiny assistant, tidy clinic. I can find patients, check your schedule, prepare a booking, save reminders and explain common app errors. Try a shortcut below.'
const permission:Record<MiloPage,string>={appointments:'appointments.manage',patients:'patients.view',inventory:'inventory.view',prescriptions:'pharmacy.view',settings:''}
export function MiloAssistant({clinicId,clinicName,access,currentPage,onNavigate,onPatient,onBook}:Props) {
  const [open,setOpen]=useState(false), [tab,setTab]=useState<'chat'|'reminders'>('chat')
  const [messages,setMessages]=useState<Message[]>([{id:0,role:'milo',text:welcome}])
  const [input,setInput]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [reminders,setReminders]=useState<Reminder[]>([]),[clock,setClock]=useState(Date.now())
  const [draft,setDraft]=useState<{kind:'reminder'|'booking';title:string;due:string;id:string}|null>(null)
  const [saving,setSaving]=useState(false)
  const end=useRef<HTMLDivElement>(null),field=useRef<HTMLInputElement>(null),launcher=useRef<HTMLButtonElement>(null)
  const live=useRef(true), inFlight=useRef(false), sequence=useRef(1)
  const say=(text:string,actions?:Action[])=>{if(live.current)setMessages(old=>[...old.slice(-39),{id:sequence.current++,role:'milo',text,actions}])}
  const allowed=(key:string)=>!key||access.has(key)
  const close=()=>{setOpen(false);launcher.current?.focus()}
  const loadReminders=useCallback(async()=>{
    const result=await supabase.from('assistant_reminders').select('id,title,due_at,completed_at').eq('clinic_id',clinicId).is('completed_at',null).order('due_at').limit(100)
    if(!live.current)return
    if(result.error) setError('Could not load reminders. Check your connection and use Retry.')
    else {setReminders(result.data||[]);setError('')}
  },[clinicId])
  useEffect(()=>{
    live.current=true;void loadReminders()
    const refresh=()=>{setClock(Date.now());void loadReminders()}
    const timer=window.setInterval(refresh,30000)
    window.addEventListener('focus',refresh)
    return()=>{live.current=false;window.clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[loadReminders])
  useEffect(()=>{if(open&&tab==='chat'){end.current?.scrollIntoView({block:'nearest'});field.current?.focus()}},[open,tab,messages.length])
  const due=reminders.filter(r=>new Date(r.due_at).getTime()<=clock).length
  const navigate=(page:MiloPage)=>{
    if(!allowed(permission[page])){say('Your login does not have access to that section. Ask your clinic administrator.');return}
    if(!window.confirm('Open another page? Save any unfinished work before continuing.'))return
    onNavigate(page);close()
  }
  const openPatient=(id:string)=>{
    if(!allowed('patients.view'))return
    if(!window.confirm('Open this clinical file? Save any unfinished work before continuing.'))return
    onPatient(id);close()
  }
  const newDraft=(kind:'reminder'|'booking',q:string)=>{
    setDraft({kind,title:kind==='reminder'?q.replace(/^(?:please\s+)?(?:remind me|set (?:a )?reminder|create (?:a )?reminder)\s*(?:to\s*)?/i,'').slice(0,240):'',due:promptDate(q),id:crypto.randomUUID()})
    say(kind==='reminder'?'Check the reminder text and local date/time below, then choose Save reminder.':'Choose the appointment date/time below. Next I’ll open the booking form for you to select the patient and doctor and confirm. Nothing has been booked yet.')
  }
  const run=async(q:string)=>{
    if(inFlight.current||!q.trim())return
    inFlight.current=true;setBusy(true);setInput('');setTab('chat');setDraft(null)
    setMessages(old=>[...old.slice(-39),{id:sequence.current++,role:'user',text:q}])
    try{
      switch(classifyMilo(q)){
        case 'reminder':newDraft('reminder',q);break
        case 'reminders':setTab('reminders');await loadReminders();break
        case 'help':say(miloHelp(q));break
        case 'book':
          if(!allowed('appointments.manage')){say('Booking requires appointment access. Ask your clinic administrator.');break}
          newDraft('booking',q);break
        case 'patients':{
          if(!allowed('patients.view')){say('Patient lookup is not enabled for your login.');break}
          const term=q.replace(/^.*?\b(?:find|search(?: for)?|look up)\s+(?:patient\s+)?/i,'').replace(/[^\p{L}\p{N}\s-]/gu,'').trim().slice(0,80)
          if(term.length<2){say('Type “Find patient” followed by at least two letters of their name or patient ID.');break}
          let query=supabase.from('patients').select('id,first_name,last_name,patient_number,next_follow_up_date').eq('clinic_id',clinicId)
          for(const word of term.split(/\s+/).slice(0,6)) query=query.or(`first_name.ilike.%${word}%,last_name.ilike.%${word}%,patient_number.ilike.%${word}%`)
          const result=await query.order('first_name').limit(15)
          if(result.error)throw result.error
          const rows=(result.data||[]) as Patient[]
          say(rows.length?`Found ${rows.length}${rows.length===15?' (showing first 15)':''}. Choose the matching patient by name and ID.`:'No matching patients found. Try their first name, surname or patient ID.',rows.map(p=>({label:`${p.first_name} ${p.last_name||''} · ${p.patient_number}`,run:()=>openPatient(p.id)})))
          break
        }
        case 'followups':{
          if(!allowed('patients.view')){say('Follow-up lookup needs patient access.');break}
          const today=localInput(new Date()).slice(0,10),until=new Date();until.setDate(until.getDate()+7)
          const result=await supabase.from('patients').select('id,first_name,last_name,patient_number,next_follow_up_date').eq('clinic_id',clinicId).gte('next_follow_up_date',today).lte('next_follow_up_date',localInput(until).slice(0,10)).order('next_follow_up_date').limit(25)
          if(result.error)throw result.error
          const rows=(result.data||[]) as Patient[]
          say(rows.length?`Follow-ups from ${today} through ${localInput(until).slice(0,10)} (up to 25). These come from saved follow-up dates, not booked appointments.`:'No saved follow-up dates in the next 7 days.',rows.map(p=>({label:`${p.next_follow_up_date} · ${p.first_name} ${p.last_name||''} · ${p.patient_number}`,run:()=>openPatient(p.id)})))
          break
        }
        case 'schedule':{
          if(!allowed('appointments.manage')){say('Schedule access is not enabled for your login.');break}
          if(/\b(week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|yesterday)\b/i.test(q)){say('I can list one day at a time. Try “Appointments tomorrow” or “Appointments 2026-09-25”. The grid has the full week.',[{label:'Open appointment grid',run:()=>navigate('appointments')}]);break}
          const requested=promptDate(q)
          if(/\d{4}-\d{2}-\d{2}|\bat\s+\d/i.test(q)&&!requested){say('I could not read that date/time. Use a valid date such as “Appointments 2026-09-25”.');break}
          const date=requested?new Date(requested):new Date();date.setHours(0,0,0,0);const finish=new Date(date);finish.setDate(finish.getDate()+1)
          const result=await supabase.from('appointments').select('id,scheduled_at,clinician_name,treatment_label,duration_minutes,status').eq('clinic_id',clinicId).gte('scheduled_at',date.toISOString()).lt('scheduled_at',finish.toISOString()).order('scheduled_at').limit(50)
          if(result.error)throw result.error
          const rows=result.data||[]
          say(`${date.toLocaleDateString('en-IN')}: ${rows.length?'appointments (up to 50)':'no appointments'}\n`+rows.map(r=>`${new Date(r.scheduled_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})} · ${r.clinician_name} · ${r.treatment_label} · ${r.duration_minutes} min · ${r.status}`).join('\n'),[{label:'Open appointment grid',run:()=>navigate('appointments')}]);break
        }
        case 'inventory':{
          if(!allowed('inventory.view')){say('Inventory access is not enabled for your login.');break}
          // Compare in the database to avoid hiding low-stock rows behind client pagination.
          const result=await supabase.rpc('assistant_low_stock',{target_clinic:clinicId})
          if(result.error)throw result.error
          const rows=(result.data||[]) as {name:string;current_stock:number;reorder_threshold:number;unit:string}[]
          say(rows.length?'At or below the reorder threshold (up to 30):\n'+rows.map(r=>`${r.name}: ${r.current_stock} ${r.unit} · reorder at ${r.reorder_threshold}`).join('\n'):'No active inventory items are at or below their saved reorder thresholds.',[{label:'Open inventory',run:()=>navigate('inventory')}]);break
        }
        case 'navigate':{
          const page:MiloPage|null=/setting|admin/i.test(q)?'settings':/pharmacy|prescri/i.test(q)?'prescriptions':/patient/i.test(q)?'patients':null
          say(page?'Use this shortcut when you’re ready to leave the current page.':'I can open Appointments, Patients, Inventory, Pharmacy or Settings.',page?[{label:`Open ${page}`,run:()=>navigate(page)}]:undefined);break
        }
        default:say('I’m in basic command mode, not connected to a generative AI service yet. Try “Find patient Riya”, “Show tomorrow’s appointments”, “Remind me to review stock tomorrow at 9 am”, “Low stock”, or “Why can’t I print a prescription?” I cannot perform unrecognised requests.')
      }
    }catch{say('I couldn’t retrieve that information. Check your connection and permissions, then retry. No changes were made.')}
    finally{inFlight.current=false;if(live.current)setBusy(false)}
  }
  const saveDraft=async(e:FormEvent)=>{
    e.preventDefault();if(!draft||inFlight.current)return
    const when=new Date(draft.due)
    if(!Number.isFinite(when.getTime())||when.getTime()<=Date.now()){say('Choose a valid future date and time.');return}
    if(draft.kind==='booking'){
      if(!allowed('appointments.manage'))return
      if(!window.confirm('Open the booking form? Save any unfinished work first.'))return
      onBook(when,null);setDraft(null);close();return
    }
    if(!draft.title.trim())return
    inFlight.current=true;setSaving(true)
    try{
      // Stable ID makes retries safe if the server saved a request before a connection dropped.
      const result=await supabase.from('assistant_reminders').upsert({id:draft.id,clinic_id:clinicId,title:draft.title.trim(),due_at:when.toISOString()},{onConflict:'id'}).select('id').single()
      if(result.error)throw result.error
      say(`Reminder saved for ${when.toLocaleString('en-IN')}. It will appear in Milo when due, or when you next open the app.`);setDraft(null);await loadReminders()
    }catch{say('Reminder could not be confirmed as saved. Keep this draft and retry when connected.')}
    finally{inFlight.current=false;if(live.current)setSaving(false)}
  }
  const complete=async(id:string)=>{
    if(inFlight.current)return;inFlight.current=true;setSaving(true)
    try{
      const result=await supabase.from('assistant_reminders').update({completed_at:new Date().toISOString()}).eq('id',id).eq('clinic_id',clinicId).select('id').single()
      if(result.error)throw result.error
      setReminders(old=>old.filter(r=>r.id!==id));say('Reminder marked as done.')
    }catch{setError('Could not mark the reminder done. Please retry.')}
    finally{inFlight.current=false;if(live.current)setSaving(false)}
  }
  return <div className="milo-root">
    {open&&<section className="milo-panel" role="dialog" aria-label="Milo clinic assistant" onKeyDown={e=>{if(e.key==='Escape')close()}}>
      <header className="milo-head"><img src={`data:image/webp;base64,${mascot.trim()}`} alt="Milo, a little molar holding a toothbrush"/><div><strong>Milo <small>EARLY ACCESS</small></strong><span>{clinicName}</span></div><button type="button" onClick={close} aria-label="Close Milo"><X size={19}/></button></header>
      <div className="milo-tabs"><button type="button" aria-pressed={tab==='chat'} onClick={()=>setTab('chat')}>Ask Milo</button><button type="button" aria-pressed={tab==='reminders'} onClick={()=>{setTab('reminders');void loadReminders()}}><Bell size={14}/> My reminders {due>0&&<b>{due} due</b>}</button></div>
      <div className="milo-context">{currentPage.replaceAll('_',' ')} · Basic command mode</div>
      {tab==='chat'?<>
        <div className="milo-chat" role="log" aria-live="polite" aria-relevant="additions">{messages.map(m=><div key={m.id} className={`milo-message ${m.role}`}><small>{m.role==='milo'?'MILO':'YOU'}</small><p>{m.text}</p>{m.actions&&<div className="milo-actions">{m.actions.map((a,i)=><button type="button" key={i} onClick={a.run}>{a.label}</button>)}</div>}</div>)}{busy&&<p role="status">Assembling the little details…</p>}<div ref={end}/></div>
        {draft&&<form className="milo-draft" onSubmit={saveDraft}><strong>{draft.kind==='reminder'?'Review reminder':'Prepare appointment'}</strong>{draft.kind==='reminder'&&<label>Remind me to<input maxLength={240} required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>}<label>Date & time · {Intl.DateTimeFormat().resolvedOptions().timeZone}<input type="datetime-local" required value={draft.due} onChange={e=>setDraft({...draft,due:e.target.value})}/></label><div className="milo-actions"><button type="submit" disabled={saving}>{saving?'Saving…':draft.kind==='reminder'?'Save reminder':'Review booking'}</button><button type="button" disabled={saving} onClick={()=>setDraft(null)}>Cancel</button></div></form>}
        <div className="milo-shortcuts">{['Today’s appointments','Follow-ups this week','Low stock','Help with saving'].map(q=><button key={q} type="button" disabled={busy||saving} onClick={()=>void run(q)}>{q}</button>)}</div>
        <form className="milo-input" onSubmit={e=>{e.preventDefault();void run(input)}}><input ref={field} aria-label="Ask Milo" placeholder="Ask, find, or remind me…" maxLength={500} value={input} disabled={busy||saving} onChange={e=>setInput(e.target.value)}/><button type="submit" aria-label="Send to Milo" disabled={busy||saving||!input.trim()}><Send size={18}/></button></form>
      </>:<div className="milo-reminders"><p>Private to your login in this clinic. Due reminders appear here while the app is open, or when you return. No email, WhatsApp or background push notifications.</p><button type="button" onClick={()=>{setTab('chat');newDraft('reminder','')}}>+ New reminder</button>{error&&<p role="alert">{error} <button type="button" onClick={()=>void loadReminders()}>Retry</button></p>}{!error&&!reminders.length&&<p>Your reminder tray is clear. A little breathing room.</p>}{reminders.map(r=><article key={r.id} className={new Date(r.due_at).getTime()<=clock?'due':''}><b>{r.title}</b><span>{new Date(r.due_at).toLocaleString('en-IN')}{new Date(r.due_at).getTime()<=clock?' · Due':''}</span><button type="button" disabled={saving} onClick={()=>void complete(r.id)}><Check size={14}/> Mark done</button></article>)}{reminders.length===100&&<p>Showing your earliest 100 reminders. Complete items to see later ones.</p>}</div>}
    </section>}
    <button type="button" className="milo-launcher" ref={launcher} aria-expanded={open} aria-label={`${open?'Close Milo':'Ask me — Milo assistant'}${due?`, ${due} reminders due`:''}`} onClick={()=>setOpen(!open)}><span className="milo-thought">{open?'Close':'Ask me'}</span><img src={`data:image/webp;base64,${mascot.trim()}`} alt=""/>{due>0&&<b aria-live="polite">{due}</b>}</button>
  </div>
}

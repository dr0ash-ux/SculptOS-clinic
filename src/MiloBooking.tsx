import { FormEvent, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { parseBooking } from './miloCommands'
export type MiloDoctor={name:string;color:string}
export type MiloBookingEntry={patient_id:string;patient_group_id:string|null;clinician_name:string;clinician_color:string;scheduled_at:string;duration_minutes:number;treatment_label:string;status:string;notes:string|null}
type Match={id:string;first_name:string;last_name:string|null;patient_number:string;patient_group_id:string|null}
type Props={prompt:string;clinicId:string;doctors:MiloDoctor[];onConfirm:(entry:MiloBookingEntry,requestId:string)=>Promise<string|void>;onSaved:(message:string)=>void;onCancel:()=>void;onBusy:(busy:boolean)=>void}
export function MiloBooking({prompt,clinicId,doctors,onConfirm,onSaved,onCancel,onBusy}:Props){
  const [parsed]=useState(()=>parseBooking(prompt))
  const [name,setName]=useState(parsed.name),[date,setDate]=useState(parsed.due)
  const [duration,setDuration]=useState(parsed.duration),[patientId,setPatientId]=useState('')
  const [doctor,setDoctor]=useState(()=>{
    const matches=doctors.filter(d=>d.name.toLowerCase().replace(/^dr\.?\s*/,'').includes(parsed.doctor.toLowerCase()))
    return parsed.doctor?(matches.length===1?matches[0].name:''):(doctors.length===1?doctors[0].name:'')
  })
  const [matches,setMatches]=useState<Match[]>([]),[searching,setSearching]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('')
  const [searched,setSearched]=useState(false)
  const requestId=useRef(crypto.randomUUID()),pending=useRef(false),searchVersion=useRef(0)
  const alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;searchVersion.current++}},[])
  const search=async(term:string)=>{
    const version=++searchVersion.current
    setSearching(true);setSearched(false);setPatientId('');setMatches([]);setError('')
    try{
      const words=term.replace(/[^\p{L}\p{N}\s-]/gu,'').trim().split(/\s+/).filter(Boolean)
      if(!words.length){setError('Enter the patient’s name or patient ID.');return}
      let query=supabase.from('patients').select('id,first_name,last_name,patient_number,patient_group_id').eq('clinic_id',clinicId)
      for(const word of words.slice(0,6))query=query.or(`first_name.ilike.%${word}%,last_name.ilike.%${word}%,patient_number.ilike.%${word}%`)
      const result=await query.order('first_name').order('id').limit(15)
      if(!alive.current||version!==searchVersion.current)return
      if(result.error)throw result.error
      const rows=result.data||[];setMatches(rows);setSearched(true)
      if(rows.length===1)setPatientId(rows[0].id)
    }catch{if(alive.current&&version===searchVersion.current)setError('Could not search patients. Check your connection and patient access, then retry.')}
    finally{if(alive.current&&version===searchVersion.current)setSearching(false)}
  }
  useEffect(()=>{if(parsed.name)void search(parsed.name)},[])
  const submit=async(e:FormEvent)=>{
    e.preventDefault();if(pending.current||searching)return
    const patient=matches.find(p=>p.id===patientId),clinician=doctors.find(d=>d.name===doctor),when=new Date(date)
    if(!patient||!clinician){setError('Choose a patient and an active doctor.');return}
    if(!Number.isFinite(when.getTime())||when.getTime()<=Date.now()){setError('Choose a future time. I won’t move a past time to tomorrow automatically.');return}
    pending.current=true;setSaving(true);onBusy(true);setError('')
    try{
      const result=await onConfirm({patient_id:patient.id,patient_group_id:patient.patient_group_id,clinician_name:clinician.name,clinician_color:clinician.color,scheduled_at:when.toISOString(),duration_minutes:duration,treatment_label:'Check-up',status:'confirmed',notes:null},requestId.current)
      if(!alive.current)return
      if(result){setError(result);return}
      onSaved(`Appointment saved: ${patient.first_name} ${patient.last_name||''} (${patient.patient_number}) · ${when.toLocaleString('en-IN')} · ${clinician.name} · ${duration} minutes. It is now in the appointments grid.`)
    }catch{if(alive.current)setError('Could not confirm the save. Retry this booking to check its saved status without creating a duplicate.')}
    finally{pending.current=false;onBusy(false);if(alive.current)setSaving(false)}
  }
  return <form className="milo-draft milo-booking" onSubmit={submit}>
    <strong>Confirm appointment</strong>
    <p className="milo-booking-hint">{parsed.assumedToday?'No date mentioned — today is selected. ':''}Check-up · {duration} minutes. Review and confirm below.</p>
    {parsed.durationNeedsReview&&<p>The requested duration is not a supported quick choice. Select the duration below before confirming.</p>}
    <fieldset disabled={saving}>
      <label>Patient name or ID<div className="milo-patient-search"><input value={name} onChange={e=>{setName(e.target.value);setPatientId('');setMatches([]);setSearched(false);searchVersion.current++;setSearching(false)}}/><button type="button" disabled={searching} onClick={()=>void search(name)}>{searching?'Finding…':'Find'}</button></div></label>
      {searched&&!matches.length&&<p role="status">No matching patient. Try a different spelling or patient ID. New patients must be registered first.</p>}
      {!!matches.length&&<label>{matches.length>1?'Several matches — choose the patient':'Matched patient'}<select required value={patientId} onChange={e=>setPatientId(e.target.value)}><option value="">Choose patient</option>{matches.map(p=><option key={p.id} value={p.id}>{p.first_name} {p.last_name} · {p.patient_number}</option>)}</select></label>}
      {matches.length===15&&<p>Showing the first 15 matches. Narrow the name or use the patient ID.</p>}
      {!parsed.due&&<p>Add the date and time below, or try “Book Riya tomorrow at 5 pm”.</p>}
      <label>Date & time · {Intl.DateTimeFormat().resolvedOptions().timeZone}<input required type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/></label>
      <div className="milo-booking-fields"><label>Doctor<select required value={doctor} onChange={e=>setDoctor(e.target.value)}><option value="">Choose doctor</option>{doctors.map(d=><option key={d.name}>{d.name}</option>)}</select></label><label>Duration<select value={duration} onChange={e=>setDuration(+e.target.value)}>{[15,30,45,60,90,120].map(n=><option value={n} key={n}>{n} min</option>)}</select></label></div>
      {!doctors.length&&<p>Add an active doctor in Admin settings before booking.</p>}
    </fieldset>
    {error&&<p role="alert">{error}</p>}
    <div className="milo-actions"><button type="submit" disabled={saving||searching||!patientId||!doctor}>{saving?'Saving appointment…':'Confirm booking'}</button><button type="button" disabled={saving} onClick={onCancel}>Cancel</button></div>
  </form>
}

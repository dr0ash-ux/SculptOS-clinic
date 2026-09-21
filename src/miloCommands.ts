// A deliberately bounded command vocabulary. Unknown requests never become writes.
export type MiloIntent = 'reminder' | 'reminders' | 'book' | 'patients' | 'followups' | 'schedule' | 'inventory' | 'navigate' | 'help' | 'unknown'
export function classifyMilo(input: string): MiloIntent {
  const q = input.toLowerCase().trim()
  if (/\b(remind me|set (a )?reminder|create (a )?reminder)\b/.test(q)) return 'reminder'
  if (/\b(reminders|my tasks)\b/.test(q)) return 'reminders'
  if (/\b(error|failed|cannot|can't|unable|why|how|help|not working|won't)\b/.test(q)) return 'help'
  if (/^(?:(?:please|can you|could you)\s+)*(?:book\b|schedule\s+(?!today|tomorrow|for\b)|make\s+(?:an?\s+)?appointment)/.test(q)) return 'book'
  if (/\bfollow[ -]?ups?\b/.test(q)) return 'followups'
  if (/\b(find|search|look up)\b/.test(q)) return 'patients'
  if (/\b(low stock|running low|inventory|stock)\b/.test(q)) return 'inventory'
  if (/\b(appointments|schedule|calendar)\b/.test(q)) return 'schedule'
  if (/\b(open|go to|take me|show)\b/.test(q)) return 'navigate'
  if (/^[\p{L}][\p{L}\s.'’-]+\s+(?:today\s+|tomorrow\s+)?at\s+\d/iu.test(q)) return 'book'
  if (/^[\p{L}][\p{L}\s.'’-]+\s+(?:(?:today|tomorrow)\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/iu.test(q)) return 'book'
  return 'unknown'
}

export function parseBooking(input:string, now=new Date()) {
  const q=input.trim(), lower=q.toLowerCase()
  const doctor=q.match(/\bwith\s+(?:dr\.?\s*)?(.+?)(?=\s+(?:today|tomorrow|at|on|for|in|next)\b|\s+\d{4}-\d{2}-\d{2}|$)/i)?.[1]?.trim()||''
  let name=q.replace(/^(?:(?:please|can you|could you)\s+)*(?:book|schedule|make)\s+/i,'').replace(/^(?:an?\s+)?(?:appointment|visit)\s*(?:for\s+)?/i,'').replace(/^(?:for\s+)?(?:patient\s+|pt\.?\s+)?/i,'')
  name=name.split(/\s+(?:today|tomorrow|at|on|with|in|next|for\s+\d)\b|\s+\d{4}-\d{2}-\d{2}|\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i)[0].trim()
  const durationMatch=lower.match(/\bfor\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)\b/)
  const duration=durationMatch?+durationMatch[1]*(/^(hour|hr)/.test(durationMatch[2])?60:1):30
  const time=q.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\bat\s+(\d{1,2}):(\d{2})\b/i)
  let due='',assumedToday=false
  if(time){
    const hour=time[3]?+time[1]:+time[4],minute=+(time[2]||time[5]||0)
    if(minute<=59&&((time[3]&&hour>=1&&hour<=12)||(!time[3]&&hour<=23))){
      const h=time[3]?hour%12+(time[3].toLowerCase()==='pm'?12:0):hour
      let dateText=lower
      const hasDate=/\btoday\b|\btomorrow\b|\d{4}-\d{2}-\d{2}|\bin\s+\d+\s+(?:days?|weeks?)/.test(lower)
      const unsupported=/\b(next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|yesterday)\b/.test(lower)
      if(!hasDate&&!unsupported){dateText+=' today';assumedToday=true}
      const day=promptDate(dateText.replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(am|pm)?\b/g,''),now)
      if(day)due=day.slice(0,10)+`T${String(h).padStart(2,'0')}:${String(minute).padStart(2,'0')}`
    }
  }
  return {name,doctor,due,duration:[15,30,45,60,90,120].includes(duration)?duration:30,assumedToday,durationNeedsReview:!([15,30,45,60,90,120].includes(duration))}
}
export function localInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
export function promptDate(input: string, now = new Date()): string {
  const q = input.toLowerCase(), date = new Date(now)
  date.setSeconds(0,0)
  const iso = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  const relative = q.match(/\bin (\d+) (minutes?|hours?|days?|weeks?)\b/)
  if (iso) {
    date.setFullYear(+iso[1], +iso[2]-1, +iso[3])
    if(date.getFullYear()!==+iso[1] || date.getMonth()!==+iso[2]-1 || date.getDate()!==+iso[3]) return ''
    date.setHours(9,0)
  } else if (relative) {
    const amount = +relative[1]
    if (!amount || amount > 365) return ''
    if(relative[2].startsWith('minute')) date.setMinutes(date.getMinutes()+amount)
    else if(relative[2].startsWith('hour')) date.setHours(date.getHours()+amount)
    else {date.setDate(date.getDate()+amount*(relative[2].startsWith('week')?7:1));date.setHours(9,0)}
  } else if(/\btomorrow\b/.test(q)) { date.setDate(date.getDate()+1); date.setHours(9,0) }
  else if (/\btoday\b/.test(q)) date.setHours(9,0)
  else return ''
  const time = q.match(/\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/)
  if(time) {
    let hour = +time[1]; const minute = +(time[2] || 0)
    if(minute>59 || hour>23 || (time[3] && (hour<1 || hour>12))) return ''
    // An unqualified 1–12 hour is ambiguous. Ask for a time in the preview.
    if(!time[3] && !time[2] && hour<=12) return ''
    if(time[3]) hour = hour%12+(time[3]==='pm'?12:0)
    date.setHours(hour,minute)
  }
  return localInput(date)
}
export function miloHelp(input: string) {
  const q=input.toLowerCase()
  if(/permission|access|denied|42501/.test(q)) return 'Access is controlled per login. Ask your clinic admin to open Settings → Admin settings → Team & access, select your membership and check the relevant permission. I cannot override access controls.'
  if(/prescri|medicine|print/.test(q)) return 'Open a patient’s clinical file → Prescription. Select a quick medicine choice; use Edit instructions only when needed. Save stays on that page and shows Saved ✓. Print becomes available after saving. For missing letterhead, check Settings → Admin settings → Clinic setup. Home · Appointments returns to the grid.'
  if(/clinical|treatment|file/.test(q)) return 'Save Clinical File opens the treatment plan after a successful save. Prescription and Imaging are available from the patient file. If saving fails, keep the page open, check the required fields and connection, and copy the error here. Do not reload while you have unsaved changes.'
  if(/upload|opg|imag/.test(q)) return 'Open the patient file → Imaging, choose the correct image type and upload the file. Wait for the upload acknowledgement. If upload fails, check your connection, file type and imaging permission; keep the original file and retry after checking whether it was already saved.'
  if(/book|appointment|date|tomorrow|overlap/.test(q)) return 'Use Appointments → an empty time slot or Book appointment. Check the date, time, assigned doctor and duration before confirming. An overlap error means the doctor already has a booking during that interval. This version uses the device’s local date/time; check the device timezone if dates look wrong.'
  if(/team|member|doctor|name/.test(q)) return 'Settings → Admin settings → Team & access contains Edit member and Remove from clinic. The displayed clinic name comes from the linked doctor/staff profile. Admin-only controls require an admin login; protected admin memberships cannot be removed here.'
  if(/network|fetch|offline|connect|load/.test(q)) return 'Check your internet connection first. Preserve unsaved text before refreshing. If other sections load but one action fails, copy its exact error and tell me which action you were taking. I can explain known errors, but cannot inspect your browser or repair server issues automatically.'
  return 'Tell me which page and action failed, and paste the exact error without passwords or access tokens. I can help with booking conflicts, saving clinical files, printing prescriptions, uploads and permissions. I cannot diagnose clinical conditions or automatically repair the application.'
}

import { useEffect, useState } from 'react'
import illustration from '../public/sphenoid-hero.jpg?raw'
import './Workflow.css'

const messages = {
  records: ['Assembling your records…', 'Assimilating saved info…', 'Putting every detail in its happy place…'],
  imaging: ['Bringing your images into focus…', 'Connecting the dots, and the anatomy…', 'A little patience for the patient file…'],
  inventory: ['Rearranging inventory data…', 'Counting the essentials, not the seconds…', 'Getting your stock in order…'],
}
export function ClinicLoading({ kind = 'records', label }: { kind?: keyof typeof messages; label?: string }) {
  const [step, setStep] = useState(0)
  useEffect(() => { const timer = window.setInterval(() => setStep(n => n + 1), 3200); return () => window.clearInterval(timer) }, [])
  return <div className="clinic-loading" role="status" aria-live="polite" aria-busy="true">
    <img src={`data:image/jpeg;base64,${illustration.trim()}`} alt="" width="180" height="130" />
    <strong>{label || messages[kind][step % messages[kind].length]}</strong>
    <span>Your workspace is getting ready. Take a tiny breather.</span>
    <div className="loading-dots" aria-hidden="true">● ● ●</div>
  </div>
}

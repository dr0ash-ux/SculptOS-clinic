import type { Medicine } from './PharmacyPage'
import { mealTiming } from './prescriptionPrint'
export type RxItem = {
  medicine_key: string; name: string; strength: string; form: string;
  route: string; dose: string; frequency: string; duration: string;
  instructions: string; print_timing?: string;
}
export function prescriptionChoice(m: Medicine, saved?: RxItem): RxItem {
  const preset = m.code === 'clinic-amoxiclav-625' || m.code === 'clinic-zerodol-sp'
  const item: RxItem = saved ? { ...saved } : {
    medicine_key:m.key, name:m.name, strength:m.strength, form:m.form,
    route:m.route, dose:m.default_dose || '', frequency:m.frequency || '',
    duration:preset ? (m.code === 'clinic-zerodol-sp' ? '3 days (SOS / as needed)' : '3 days') : '',
    instructions:m.instructions || '', print_timing:preset ? 'After meals' : mealTiming(m.instructions)
  }
  return { ...item, medicine_key:m.key, name:m.name, strength:m.strength, form:m.form }
}
export function choiceSummary(item: RxItem): string {
  const frequency = item.frequency === 'BID' ? 'BD' : item.frequency
  return [item.name, item.strength, item.dose, frequency, item.print_timing, item.duration].filter(Boolean).join(' · ')
}
export function completeChoice(item: RxItem): boolean {
  return ['dose','route','frequency','duration','instructions'].every(key => !!item[key as keyof RxItem]?.trim())
}

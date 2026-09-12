// Compact presentation only. Prescribed doses are never recalculated.
export function patientAge(birth: string | null, on: string): string {
  if (
    !birth ||
    !/^\d{4}-\d{2}-\d{2}$/.test(birth) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(on) ||
    birth > on
  )
    return "Not recorded";
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  const years = y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
  if (years) return `${years} ${years === 1 ? "year" : "years"}`;
  const months = (y - by) * 12 + m - bm - (d < bd ? 1 : 0);
  if (months > 0) return `${months} ${months === 1 ? "month" : "months"}`;
  const days = Math.floor((Date.parse(on) - Date.parse(birth)) / 86400000);
  return `${days} ${days === 1 ? "day" : "days"}`;
}
export function mealTiming(instructions: string): string {
  const text = instructions.toLowerCase();
  if (/with or without food|before or after food/.test(text))
    return "With or without food";
  if (/start of a meal/.test(text)) return "At the start of a meal";
  if (/1 hour before a meal/.test(text)) return "1 hour before a meal";
  if (/before a meal|empty stomach/.test(text))
    return "Before meals / empty stomach";
  if (/with or (just )?after food/.test(text)) return "With or after meals";
  if (/after food|after meals/.test(text)) return "After meals";
  if (/with food/.test(text)) return "With meals";
  return "";
}
export function dosageForm(form: string): string {
  if (/tablet/i.test(form)) return "Tab.";
  if (/capsule/i.test(form)) return "Cap.";
  if (/injection/i.test(form)) return "Inj.";
  return form;
}

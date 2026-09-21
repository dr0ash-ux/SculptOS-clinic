// Calendar keys must use the same local clock as column labels and time slots.
// ISO timestamps remain UTC in storage; never slice them to group local days.
export function dateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

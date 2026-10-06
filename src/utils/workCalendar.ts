import workCalendar from '../../data/work-calendar.json'

export const WORK_CALENDAR = workCalendar
export const CAPACITY_COLORS = { nonWorking: '000000', halfDay: '9CA3AF' } as const

/** Only October is configured; other months are unknown, not assumed to be days off. */
export function dayCapacity(date: Date): number | null {
  const iso = date.toISOString().slice(0, 10)
  if (iso < workCalendar.startDate || iso > workCalendar.endDate) return null
  return (workCalendar.capacities as Record<string, number>)[iso] ?? workCalendar.defaultCapacity
}

export function capacityColor(date: Date): string | undefined {
  const capacity = dayCapacity(date)
  return capacity === 0 ? CAPACITY_COLORS.nonWorking : capacity === 0.5 ? CAPACITY_COLORS.halfDay : undefined
}

export function capacityLabel(date: Date): string {
  const capacity = dayCapacity(date)
  return capacity === null ? '근무 일정 미설정' : capacity === 0 ? '비근무일 · 업무 가능량 0' : `근무일 · 업무 가능량 ${capacity}`
}

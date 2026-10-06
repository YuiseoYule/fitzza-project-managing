import type { Role, Status, Task } from '../types'
import { capacityColor, WORK_CALENDAR } from './workCalendar'

export const ROLES: Role[] = ['팀장', 'Cloud', 'PM', 'FE', 'BE']
export const FILTER_ROLES: Task['responsible'][] = [...ROLES, '']
export const roleLabel = (role: Task['responsible']) => role || '미배정'
export const DAY = 86_400_000
export const STATUS_LABELS = {
  not_started: '시작 전', in_progress: '진행 중', blocked: '차단됨',
  completed: '완료', on_hold: '보류',
  '시작 전': '시작 전', '진행 전': '시작 전', '진행 중': '진행 중', '차단됨': '차단됨', '완료': '완료', '보류': '보류',
} as const satisfies Record<Status, string>
export type StatusLabel = typeof STATUS_LABELS[Status]
export const STATUS_COLORS: Record<StatusLabel, string> = {
  '시작 전': 'FAD4D0', '진행 중': 'A9C4E9', '차단됨': 'F1B6B6',
  '완료': 'B6DDCA', '보류': 'F6DFAC',
}
export const COLUMNS = [
  { label: '구분', width: 150 }, { label: 'WBS', width: 72 },
  { label: '업무', width: 350 }, { label: '유형', width: 78 },
  { label: '산출물', width: 200 }, { label: '수행인력', width: 100 },
  { label: '시작일', width: 96 }, { label: '종료일', width: 96 },
  { label: '가중치', width: 64 }, { label: '상태', width: 84 },
  { label: '진행률', width: 68 },
]
export const DAY_WIDTH = 26
export const dateValue = (date: string) => Date.parse(`${date}T00:00:00Z`)
export const statusLabel = (task: Pick<Task, 'status'>) => STATUS_LABELS[task.status]
export const taskProgress = (task: Pick<Task, 'status'>): number | null =>
  statusLabel(task) === '보류' ? null : statusLabel(task) === '완료' ? 1 : 0
export const formatProgress = (rate: number | null) => rate === null ? '계산 대상 없음' : `${(rate * 100).toFixed(1)}%`

export function calculateProgress(tasks: readonly Task[]) {
  let totalWeight = 0, completedWeight = 0, excludedWeight = 0, heldCount = 0
  for (const task of tasks) {
    if (statusLabel(task) === '보류') {
      excludedWeight += task.weight
      heldCount++
      continue
    }
    totalWeight += task.weight
    if (statusLabel(task) === '완료') completedWeight += task.weight
  }
  return { totalWeight, completedWeight, excludedWeight, heldCount,
    rate: totalWeight === 0 ? null : completedWeight / totalWeight }
}

export type WbsRow = { kind: 'section'; key: string; label: string } | { kind: 'task'; key: string; task: Task }

/** Both the screen and XLSX use this exact row order, date span and column layout. */
export function createWbsView(tasks: readonly Task[]) {
  const sortDate = (task: Task) => task.startDate ? dateValue(task.startDate) : Infinity
  const sorted = [...tasks].sort((a, b) => sortDate(a) - sortDate(b) || a.id.localeCompare(b.id))
  const rows: WbsRow[] = []
  let previousSection: string | undefined
  sorted.forEach((task, index) => {
    const section = task.section || '프로젝트 작업'
    if (section !== previousSection) rows.push({ kind: 'section', key: `section-${index}`, label: section })
    rows.push({ kind: 'task', key: task.id, task })
    previousSection = section
  })
  const calendar: Date[] = []
  if (sorted.length) {
    const starts = sorted.map(t => dateValue(t.startDate)).filter(Number.isFinite)
    const ends = sorted.map(t => dateValue(t.endDate)).filter(Number.isFinite)
    const first = new Date(starts.length ? Math.min(...starts) : dateValue(WORK_CALENDAR.startDate))
    const last = new Date(ends.length ? Math.max(...ends) : dateValue(WORK_CALENDAR.endDate))
    first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7))
    last.setUTCDate(last.getUTCDate() + ((7 - last.getUTCDay()) % 7))
    for (let day = first.getTime(); day <= last.getTime(); day += DAY) calendar.push(new Date(day))
  }
  const weeks = Array.from({ length: Math.ceil(calendar.length / 7) }, (_, i) => ({
    label: `W${i + 1}`, start: calendar[i * 7], offset: i * 7, span: Math.min(7, calendar.length - i * 7),
  }))
  return { tasks: sorted, rows, calendar, weeks, summary: calculateProgress(sorted) }
}

export const isScheduled = (task: Task, date: Date) =>
  date.getTime() >= dateValue(task.startDate) && date.getTime() <= dateValue(task.endDate)
export const shortDate = (date: Date) => date.toISOString().slice(5, 10).replace('-', '/')
export const isWeekend = (date: Date) => date.getUTCDay() === 0 || date.getUTCDay() === 6
/** Work capacity shading must win even when a task spans the date. */
export const slotColor = (task: Task, date: Date) =>
  capacityColor(date) ?? (isScheduled(task, date) ? STATUS_COLORS[statusLabel(task)] : isWeekend(date) ? 'F0F2F5' : 'FFFFFF')

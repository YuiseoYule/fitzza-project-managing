export type Role = '팀장' | 'Cloud' | 'PM' | 'FE' | 'BE'
export type Assignee = Role | '경민' | '주희' | '지현'
export type Status = '시작 전' | '진행 전' | '진행 중' | '차단됨' | '완료' | '보류'
  | 'not_started' | 'in_progress' | 'blocked' | 'completed' | 'on_hold'

export interface Task {
  id: string
  wbs?: string
  section?: string
  title: string
  phase: string
  category?: string
  responsible: Assignee | ''
  assistants: Assignee[]
  startDate: string
  endDate: string
  weight: 1 | 2
  /** Legacy data only. Progress is calculated from status; this field is ignored. */
  progress?: number | null
  status: Status
  predecessorIds: string[]
  deliverables: { label: string; url: string }[]
  notes: string
}

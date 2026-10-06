export type Role = '팀장' | 'Cloud' | 'PM' | 'FE' | 'BE'
export type Status = 'not_started' | 'in_progress' | 'blocked' | 'completed'
export interface Task { id:string; wbs?:string; section?:string; title:string; phase:string; category?:string; responsible:Role; assistants:Role[]; startDate:string; endDate:string; weight?:number; progress?:number; status:Status; predecessorIds:string[]; deliverables:{label:string;url:string}[]; notes:string }

import { useMemo, useState } from 'react'
import type { Role, Status, Task } from './types'

const modules = import.meta.glob('../data/tasks/*.json', { eager: true, import: 'default' })
const tasks = Object.values(modules) as Task[]
const ROLES: Role[] = ['팀장', 'Cloud', 'PM', 'FE', 'BE']
const STATUS: Record<Status, string> = { not_started: '시작 전', in_progress: '진행 중', blocked: '차단됨', completed: '완료' }
const DAY = 86400000
const stamp = (d:string) => Date.parse(`${d}T00:00:00Z`)
const fmt = (d:string) => new Intl.DateTimeFormat('ko-KR', { month:'short', day:'numeric', timeZone:'UTC' }).format(new Date(`${d}T00:00:00Z`))
const dateRange = (all:Task[]) => { const min = Math.min(...all.map(x => stamp(x.startDate))), max = Math.max(...all.map(x => stamp(x.endDate))); return Array.from({length: Math.round((max-min)/DAY)+1}, (_,i) => new Date(min+i*DAY).toISOString().slice(0,10)) }

function Detail({ task, successors, close }: {task:Task; successors:Task[]; close:()=>void}) {
  return <div className="backdrop" onMouseDown={close}><aside className="detail" onMouseDown={e=>e.stopPropagation()}><button className="close" onClick={close}>×</button><p className="eyebrow">{task.phase} · {task.id}</p><h2>{task.title}</h2><span className={`badge ${task.status}`}>{STATUS[task.status]}</span><dl><dt>책임자</dt><dd>{task.responsible}</dd><dt>보조자</dt><dd>{task.assistants.join(', ') || '없음'}</dd><dt>기간</dt><dd>{task.startDate} — {task.endDate}</dd><dt>선행 작업</dt><dd>{task.predecessorIds.join(', ') || '없음'}</dd><dt>후행 작업</dt><dd>{successors.map(x=>x.id).join(', ') || '없음'}</dd><dt>산출물</dt><dd>{task.deliverables.length ? task.deliverables.map(x=><a key={x.url} href={x.url} target="_blank" rel="noreferrer">{x.label}</a>) : '없음'}</dd><dt>비고</dt><dd>{task.notes || '없음'}</dd></dl></aside></div>
}

export default function App() {
  const [visible, setVisible] = useState<Set<Role>>(new Set(ROLES)); const [selected, setSelected] = useState<Task | null>(null)
  const days = useMemo(()=>dateRange(tasks),[]); const first = days[0]
  const rows = useMemo(() => ROLES.filter(r=>visible.has(r)).flatMap(role => [{kind:'group' as const, role}, ...tasks.filter(t=>t.responsible===role).sort((a,b)=>stamp(a.startDate)-stamp(b.startDate)).map(task=>({kind:'task' as const, task}))]), [visible])
  const taskRows = new Map(rows.map((r,i)=>r.kind==='task'?[r.task.id,i]:null).filter(Boolean) as [string,number][])
  const toggle=(r:Role)=>setVisible(prev=>{const next=new Set(prev); next.has(r)?next.delete(r):next.add(r); return next})
  return <main><header className="page-head"><div><p className="eyebrow">FITZZA PROJECT</p><h1>WBS 간트 대시보드</h1><p className="sub">GitHub의 작업 JSON을 기준으로 표시하는 읽기 전용 일정 현황입니다.</p></div><div className="legend">{(Object.keys(STATUS) as Status[]).map(s=><span key={s}><i className={`dot ${s}`}/>{STATUS[s]}</span>)}<span><i className="arrow-key">→</i> 의존성</span></div></header>
  <section className="controls" aria-label="역할 필터">{ROLES.map(r=><button key={r} onClick={()=>toggle(r)} className={visible.has(r)?'active':''} aria-pressed={visible.has(r)}>{r}</button>)}</section>
  <section className="board-wrap"><div className="board" style={{'--days':days.length} as React.CSSProperties}><div className="head-left">작업 정보</div>{days.map(d=><div key={d} className="date-head"><b>{fmt(d)}</b><small>{['일','월','화','수','목','금','토'][new Date(`${d}T00:00:00Z`).getUTCDay()]}</small></div>)}
  <div className="grid-body" style={{gridColumn:`1 / span ${days.length + 1}`,gridTemplateRows:`repeat(${rows.length}, 62px)`}}>{rows.map((row,index)=>row.kind==='group' ? <div className="group-row" key={row.role} style={{gridRow:index+1}}><strong>{row.role}</strong></div> : <div className="task-row" key={row.task.id} style={{gridRow:index+1}}><button className="info" onClick={()=>setSelected(row.task)}><strong>{row.task.title}</strong><span>{row.task.responsible} · {row.task.assistants.join(', ') || '보조 없음'} · {row.task.phase}</span><span className={`badge ${row.task.status}`}>{STATUS[row.task.status]}</span><time>{row.task.startDate} — {row.task.endDate}</time></button><button aria-label={`${row.task.title} 상세 보기`} className={`bar ${row.task.status}`} onClick={()=>setSelected(row.task)} style={{left:`calc(${Math.round((stamp(row.task.startDate)-stamp(first))/DAY)} * var(--day-width) + 3px)`,width:`calc(${Math.round((stamp(row.task.endDate)-stamp(row.task.startDate))/DAY)+1} * var(--day-width) - 6px)`}}>{row.task.title}</button></div>)}</div>
  <svg className="arrows" width={days.length*48} height={rows.length*62} aria-label="작업 의존성"><defs><marker id="arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7Z" fill="#596579"/></marker></defs>{rows.flatMap((r)=>r.kind==='task'?r.task.predecessorIds.map(id=>{const from=taskRows.get(id),to=taskRows.get(r.task.id); const source=tasks.find(t=>t.id===id); if(from===undefined||to===undefined||!source)return null; const x1=(Math.round((stamp(source.endDate)-stamp(first))/DAY)+1)*48-5, x2=Math.round((stamp(r.task.startDate)-stamp(first))/DAY)*48+3, y1=from*62+31,y2=to*62+31; return <path key={`${id}-${r.task.id}`} d={`M ${x1} ${y1} H ${x1+10} V ${y2} H ${x2-5}`} markerEnd="url(#arrowhead)"/>}):[])}</svg></div></section>
  {selected && <Detail task={selected} successors={tasks.filter(t=>t.predecessorIds.includes(selected.id))} close={()=>setSelected(null)}/>}</main>
}

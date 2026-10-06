import { useEffect, useMemo, useRef, useState } from 'react'
import type { Task } from './types'
import {
  COLUMNS, DAY_WIDTH, FILTER_ROLES, STATUS_COLORS, createWbsView, formatProgress,
  isWeekend, roleLabel, shortDate, slotColor, statusLabel, taskProgress,
} from './utils/wbs'
import { CAPACITY_COLORS, capacityColor, capacityLabel, dayCapacity } from './utils/workCalendar'

const modules = import.meta.glob('../data/tasks/*.json', { eager: true, import: 'default' })
const allTasks = Object.values(modules) as Task[]

function TaskDetail({ task, close }: { task: Task; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const relatedNames = (ids: string[]) => ids.map(id => allTasks.find(t => t.id === id)?.title ?? id).join(', ') || '없음'
  return <dialog ref={dialog} className="detail-dialog" onCancel={close} onClick={event => {
    if (event.target === event.currentTarget) close()
  }}>
    <article>
      <button className="close" onClick={close} aria-label="상세 닫기">×</button>
      <p className="kicker">{task.wbs ?? task.id}</p>
      <h2 className={statusLabel(task) === '보류' ? 'on-hold' : ''}>{task.title}</h2>
      <dl>
        <dt>책임자 / 보조자</dt><dd>{roleLabel(task.responsible)} / {task.assistants.join(', ') || '없음'}</dd>
        <dt>단계 / 유형</dt><dd>{task.phase} / {task.category || '없음'}</dd>
        <dt>상태 / 가중치</dt><dd>{statusLabel(task)} / {task.weight}{taskProgress(task) === null ? ' (진척률 계산 제외)' : ''}</dd>
        <dt>기간</dt><dd>{task.startDate || '날짜 미정'} ~ {task.endDate || '날짜 미정'}</dd>
        <dt>선행 작업</dt><dd>{relatedNames(task.predecessorIds)}</dd>
        <dt>후행 작업</dt><dd>{relatedNames(allTasks.filter(t => t.predecessorIds.includes(task.id)).map(t => t.id))}</dd>
        <dt>산출물</dt><dd>{task.deliverables.map(x => x.label).join(', ') || '없음'}</dd>
        <dt>비고</dt><dd>{task.notes || '없음'}</dd>
      </dl>
    </article>
  </dialog>
}

export default function App() {
  const [shown, setShown] = useState(new Set(FILTER_ROLES))
  const [selected, setSelected] = useState<Task | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const view = useMemo(() => createWbsView(allTasks.filter(task => shown.has(task.responsible))), [shown])
  const { rows, calendar, weeks, summary } = view
  const scopeLabel = shown.size === FILTER_ROLES.length ? '전체 작업' : `표시된 역할: ${FILTER_ROLES.filter(role => shown.has(role)).map(roleLabel).join(', ') || '없음'}`

  async function exportExcel() {
    setExporting(true)
    setExportError('')
    try {
      const { downloadWbsExcel } = await import('./utils/exportExcel')
      await downloadWbsExcel(view.tasks, scopeLabel)
    } catch (error) {
      console.error('Excel export failed', error)
      setExportError('Excel 파일을 만들지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setExporting(false)
    }
  }

  return <main className="wbs-page">
    <header>
      <div>
        <p className="kicker">PROJECT WBS</p>
        <h1>프로젝트 WBS</h1>
        <p>작업 JSON을 기준으로 표시하는 읽기 전용 일정표</p>
      </div>
      <div className="summary" aria-live="polite">
        <b>가중 진척률{shown.size !== FILTER_ROLES.length ? ' · 표시된 작업' : ''}</b>
        <strong>{formatProgress(summary.rate)}</strong>
        <small>완료 {summary.completedWeight} / 계산 대상 {summary.totalWeight} · 보류 가중치 {summary.excludedWeight} 제외</small>
      </div>
    </header>
    <div className="toolbar">
      <nav className="role-filter" aria-label="수행인력 필터">
        {FILTER_ROLES.map(role => <button key={role} className={shown.has(role) ? 'on' : ''} aria-pressed={shown.has(role)}
          onClick={() => setShown(old => {
            const next = new Set(old)
            next.has(role) ? next.delete(role) : next.add(role)
            return next
          })}>{roleLabel(role)}</button>)}
        <button onClick={() => setShown(new Set(FILTER_ROLES))}>전체 표시</button>
      </nav>
      <button className="export-button" onClick={exportExcel} disabled={exporting || !view.tasks.length}>
        {exporting ? 'Excel 생성 중…' : 'Excel 내보내기 (.xlsx)'}
      </button>
    </div>
    <p className="scope-note">{scopeLabel} · {view.tasks.length}개 작업. 진척률과 Excel 내보내기는 현재 표시된 작업 기준입니다.</p>
    <p className="formula-note">완료 가중치 합 ÷ 보류를 제외한 전체 가중치 합. 가중치는 1 또는 2이며, 보류 작업의 진행률은 ‘제외’로 표시합니다.</p>
    {exportError && <p role="alert" className="export-error">{exportError}</p>}
    <div className="legend" aria-label="상태 범례">
      {Object.entries(STATUS_COLORS).map(([label, color]) => <span key={label}><i style={{ background: `#${color}` }} />{label}</span>)}
    </div>
    <div className="legend capacity-legend" aria-label="근무일 범례">
      <span><i style={{ background: `#${CAPACITY_COLORS.nonWorking}` }} />비근무일 (0)</span>
      <span><i style={{ background: `#${CAPACITY_COLORS.halfDay}` }} />0.5 근무일 (10/17·10/24)</span>
      <span>2026년 10월 기준 · 비근무일/0.5 근무일 색상이 상태 색상보다 우선합니다.</span>
      <span>빈 담당자: 미배정 · 빈 날짜: 날짜 미정 · ‘진행 전’은 ‘시작 전’으로 표시</span>
    </div>
    {!view.tasks.length ? <div className="empty">표시할 작업이 없습니다. 역할 필터에서 표시할 역할을 선택하세요.</div> :
      <div className="wbs-scroll" tabIndex={0} role="region" aria-label="WBS 일정표">
        <table style={{ width: COLUMNS.reduce((sum, col) => sum + col.width, 0) + calendar.length * DAY_WIDTH }}>
          <colgroup>
            {COLUMNS.map(column => <col key={column.label} style={{ width: column.width }} />)}
            {calendar.map(day => <col key={day.toISOString()} style={{ width: DAY_WIDTH }} />)}
          </colgroup>
          <thead>
            <tr className="week-head"><th colSpan={COLUMNS.length}>주차</th>
              {weeks.map(week => <th key={week.label} colSpan={week.span}>{week.label}<small>{shortDate(week.start)}</small></th>)}
            </tr>
            <tr className="day-head">
              {COLUMNS.map((column, i) => <th key={column.label} scope="col" className={i < 3 ? `pinned pin-${i}` : ''}>{column.label}</th>)}
              {calendar.map(date => <th key={date.toISOString()} className={isWeekend(date) ? 'weekend' : ''} scope="col"
                style={capacityColor(date) ? { background: `#${capacityColor(date)}`, color: dayCapacity(date) === 0.5 ? '#202d40' : '#fff' } : undefined}
                title={`${date.toISOString().slice(0, 10)} · ${capacityLabel(date)}`}><b>{date.getUTCDate()}</b><small>{['일', '월', '화', '수', '목', '금', '토'][date.getUTCDay()]}</small></th>)}
            </tr>
          </thead>
          <tbody>{rows.map(row => {
            if (row.kind === 'section') return <tr className="section" key={row.key}>
              <td colSpan={COLUMNS.length}>{row.label}</td><td colSpan={calendar.length} />
            </tr>
            const task = row.task
            const label = statusLabel(task)
            return <tr key={row.key} data-task-id={task.id} className={`task-row ${label === '보류' ? 'on-hold' : ''}`} onClick={() => setSelected(task)}>
              <td className="pinned pin-0">{task.section || '프로젝트 작업'}</td>
              <td className="pinned pin-1">{task.wbs || task.id}</td>
              <td className="pinned pin-2 task-name"><button onClick={() => setSelected(task)}>{task.title}</button></td>
              <td>{task.category || task.phase}</td>
              <td>{task.deliverables.map(item => item.label).join(', ')}</td>
              <td>{[roleLabel(task.responsible), ...task.assistants].join(', ')}</td>
              <td>{task.startDate || '날짜 미정'}</td><td>{task.endDate || '날짜 미정'}</td>
              <td className="number">{task.weight}</td>
              <td><span className="status-badge" style={{ background: `#${STATUS_COLORS[label]}` }}>{label}</span></td>
              <td className="number">{taskProgress(task) === null ? '제외' : `${taskProgress(task)! * 100}%`}</td>
              {calendar.map(date => <td key={date.toISOString()} className="slot" data-date={date.toISOString().slice(0, 10)}
                style={{ background: `#${slotColor(task, date)}` }}
                title={`${task.title} · ${date.toISOString().slice(0, 10)} · ${label} · ${capacityLabel(date)}`} />)}
            </tr>
          })}</tbody>
        </table>
      </div>}
    {selected && <TaskDetail task={selected} close={() => setSelected(null)} />}
  </main>
}

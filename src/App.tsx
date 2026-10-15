import { useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import type { Task } from './types'
import {
  COLUMNS, DAY_WIDTH, FILTER_ROLES, STATUS_COLORS, createWbsView, formatProgress, formatWeight,
  isVisibleTask, isWeekend, roleLabel, shortDate, slotColor, statusLabel, taskProgress,
} from './utils/wbs'
import { CAPACITY_COLORS, capacityColor, capacityLabel, dayCapacity } from './utils/workCalendar'
import { projectSummary } from './utils/projectSummary'
import jiraAudit from '../data/jira-weight-audit.json'

const modules = import.meta.glob('../data/jira-tasks/*.json', { eager: true, import: 'default' })
const allTasks = Object.values(modules) as Task[]
const activeTasks = allTasks.filter(isVisibleTask)
const project = projectSummary(activeTasks)

function WbsColumns({ calendar }: { calendar: Date[] }) {
  return <colgroup>
    {COLUMNS.map(column => <col key={column.label} style={{ width: column.width }} />)}
    {calendar.map(day => <col key={day.toISOString()} style={{ width: DAY_WIDTH }} />)}
  </colgroup>
}

function DayHeader({ calendar, headerRef }: { calendar: Date[]; headerRef?: Ref<HTMLTableRowElement> }) {
  return <tr className="day-head" ref={headerRef}>
    {COLUMNS.map((column, i) => <th key={column.label} scope="col" className={i < 3 ? `pinned pin-${i}` : ''}>{column.label}</th>)}
    {calendar.map(date => <th key={date.toISOString()} className={isWeekend(date) ? 'weekend' : ''} scope="col"
      style={capacityColor(date) ? { background: `#${capacityColor(date)}`, color: dayCapacity(date) === 0.5 ? '#202d40' : '#fff' } : undefined}
      title={`${date.toISOString().slice(0, 10)} · ${capacityLabel(date)}`}><b>{date.getUTCDate()}</b><small>{['일', '월', '화', '수', '목', '금', '토'][date.getUTCDay()]}</small></th>)}
  </tr>
}

function TaskDetail({ task, close }: { task: Task; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const relatedNames = (ids: string[]) => ids.filter(id => activeTasks.some(t => t.id === id))
    .map(id => activeTasks.find(t => t.id === id)!.title).join(', ') || '없음'
  const weightSources = jiraAudit.mappings.filter(row => row.activeTaskId === task.id)
  return <dialog ref={dialog} className="detail-dialog" onCancel={close} onClick={event => {
    if (event.target === event.currentTarget) close()
  }}>
    <article>
      <button className="close" onClick={close} aria-label="상세 닫기">×</button>
      <p className="kicker">{task.wbs ?? task.id}</p>
      <h2>{task.title}</h2>
      {task.id.startsWith('FITZZA-') && <p><a href={`https://fractalbarista.atlassian.net/browse/${task.id}`} target="_blank" rel="noopener noreferrer">Jira 작업 열기 ↗</a></p>}
      <dl>
        <dt>책임자 / 보조자</dt><dd>{roleLabel(task.responsible)} / {task.assistants.join(', ') || '없음'}</dd>
        <dt>단계 / 유형</dt><dd>{task.phase} / {task.category || '없음'}</dd>
        <dt>상태 / 가중치 / 반영률</dt><dd>{statusLabel(task)} / {formatWeight(task.weight)} / {taskProgress(task) === null ? '제외' : formatProgress(taskProgress(task))}</dd>
        <dt>가중치 합산 근거</dt><dd><strong>기존 작업 {weightSources.length}개 합계 {formatWeight(weightSources.reduce((sum, row) => sum + row.sourceWeight, 0))}</strong>
          <ul className="weight-sources">{weightSources.map(row => <li key={row.sourceTaskId}><code>{row.sourceTaskId}</code> · {row.sourceTitle} — {formatWeight(row.sourceWeight)}</li>)}</ul></dd>
        {task.effortScore && <><dt>원본 점수</dt><dd>{task.effortScore}점 (가중치는 엑셀의 최종 전체 기여도 적용)</dd></>}
        {task.source && <><dt>원본 계층</dt><dd>{task.source.category} → {task.source.section}{task.source.feature ? ` → ${task.source.feature}` : ''}<br />{task.source.sheet} · {task.source.row}행</dd></>}
        <dt>기간</dt><dd>{task.startDate || '날짜 미정'} ~ {task.endDate || '날짜 미정'}</dd>
        <dt>선행 작업</dt><dd>{relatedNames(task.predecessorIds)}</dd>
        <dt>후행 작업</dt><dd>{relatedNames(activeTasks.filter(t => t.predecessorIds.includes(task.id)).map(t => t.id))}</dd>
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
  const [headerPinned, setHeaderPinned] = useState(false)
  const regionRef = useRef<HTMLDivElement>(null)
  const dayHeaderRef = useRef<HTMLTableRowElement>(null)
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const floatingScrollRef = useRef<HTMLDivElement>(null)
  const view = useMemo(() => createWbsView(activeTasks.filter(task => shown.has(task.responsible)), 'jira-section'), [shown])
  const { rows, calendar, weeks, summary } = view
  const tableWidth = COLUMNS.reduce((sum, col) => sum + col.width, 0) + calendar.length * DAY_WIDTH
  const scopeLabel = shown.size === FILTER_ROLES.length ? '전체 작업' : `표시된 역할: ${FILTER_ROLES.filter(role => shown.has(role)).map(roleLabel).join(', ') || '없음'}`

  useEffect(() => {
    const update = () => {
      const header = dayHeaderRef.current?.getBoundingClientRect()
      const region = regionRef.current?.getBoundingClientRect()
      setHeaderPinned(Boolean(header && region && header.bottom <= 0 && region.bottom > 38))
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [rows.length])

  async function exportExcel() {
    setExporting(true)
    setExportError('')
    try {
      const { downloadWbsExcel } = await import('./utils/exportExcel')
      await downloadWbsExcel(view.tasks, scopeLabel, 'jira-section')
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
        <p>Jira 작업 분류·상태에 기존 WBS 세부 가중치를 합산한 읽기 전용 일정표</p>
      </div>
      <div className="summary" aria-live="polite">
        <b>가중 진척률{shown.size !== FILTER_ROLES.length ? ' · 표시된 작업' : ''}</b>
        <strong>{formatProgress(summary.rate)}</strong>
        <small>진척 반영 {formatWeight(summary.earnedWeight)} / 전체 작업 가중치 {formatWeight(summary.totalWeight)}</small>
        <small>표시된 작업 가중치 합계 {formatWeight(summary.allWeight)}</small>
      </div>
    </header>
    <section className="weight-summary" aria-label="전체 프로젝트 가중치 총합">
      <h2>전체 프로젝트 가중치 총합 <small>Jira {jiraAudit.jiraIssueCount}개 이슈 · 표시 대상 작업 {project.total.count}행 · 기존 {jiraAudit.sourceTaskCount}개 원본 가중치 기록</small></h2>
      <div className="weight-table-wrap"><table>
        <thead><tr><th>영역</th><th>작업 수</th><th>계획 비중</th><th>등록 가중치</th><th>완료 가중치</th><th>진척 반영 가중치</th><th>등록 작업 진척률</th></tr></thead>
        <tbody>{[...project.rows, { ...project.total, category: '전체 총합' }].map(row => <tr key={row.category}>
          <th scope="row">{row.category}</th><td>{row.count}</td><td>{formatWeight(row.plannedWeight)}</td>
          <td>{formatWeight(row.allWeight)}</td><td>{formatWeight(row.completedWeight)}</td><td>{formatWeight(row.earnedWeight)}</td><td>{formatProgress(row.rate)}</td>
        </tr>)}</tbody>
      </table></div>
      <p>표시 대상 작업만 한 번씩 합산합니다. 진척 반영 가중치 = Σ(작업 가중치 × 상태별 반영률), 가중 진척률 = 진척 반영 가중치 ÷ 등록 가중치. 미등록 영역의 진행 상태는 추정하지 않습니다.</p>
      <p>기능 Story를 섹션 분류로 쓰고 FE/BE Subtask와 클라우드 세부 Story에 기존 가중치를 합산했습니다. Epic의 상하위 링크는 내보내기에 없어 별도 스냅샷에 보관합니다. 계획·분석설계·테스트·배포 4건도 중복 없이 유지합니다. 합산 내역은 <code>data/jira-weight-audit.json</code>에 원본 작업별로 기록했습니다.</p>
      <p>Jira 조회 시점: {new Date(jiraAudit.fetchedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}. 가중치가 없는 Jira 신규 Subtask {jiraAudit.unmatchedJiraSubtasks.map(item => item.key).join(', ')}는 임의의 0% 작업으로 만들지 않았습니다.</p>
      {project.allocationGaps.length > 0 ?
        <p className="weight-warning">원본 계획 비중과 현재 등록 작업 합계 차이: {project.allocationGaps.map(row => `${row.category} 계획 ${formatWeight(row.plannedWeight)} / 등록 ${formatWeight(row.allWeight)}`).join(', ')}.</p> :
        <p>등록된 영역의 가중치는 계획 비중과 일치합니다.</p>}
      {project.unregistered.length > 0 && <p>미등록 영역: {project.unregistered.map(row => `${row.category} ${formatWeight(row.plannedWeight)}`).join(', ')}. 합계 {formatWeight(project.unregistered.reduce((sum, row) => sum + row.plannedWeight, 0))}는 아직 작업이 등록되지 않았습니다.</p>}
    </section>
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
    <p className="formula-note">가중치는 기존 엑셀의 최종 전체 기여도를 Jira 작업별로 합산했습니다. Jira 상태별 반영률: 시작 전 0% · 진행 중 50% · 검토 중 75% · 완료 100%. 일정 계획 전 작업 {activeTasks.filter(task => task.schedulePending).length}개는 날짜 미정입니다. Jira에는 일정 필드가 없어 날짜는 기존 WBS 범위를 사용합니다.</p>
    {exportError && <p role="alert" className="export-error">{exportError}</p>}
    <div className="legend" aria-label="상태 범례">
      {Object.entries(STATUS_COLORS).filter(([label]) => label !== '보류').map(([label, color]) => <span key={label}><i style={{ background: `#${color}` }} />{label}</span>)}
    </div>
    <div className="legend capacity-legend" aria-label="근무일 범례">
      <span><i style={{ background: `#${CAPACITY_COLORS.nonWorking}` }} />비근무일 (0)</span>
      <span><i style={{ background: `#${CAPACITY_COLORS.halfDay}` }} />0.5 근무일 (10/17·10/24)</span>
      <span>2026년 10월 기준 · 비근무일/0.5 근무일 색상이 상태 색상보다 우선합니다.</span>
      <span>빈 담당자: 미배정 · 빈 날짜: 날짜 미정 · ‘진행 전’은 ‘시작 전’으로 표시</span>
    </div>
    {!view.tasks.length ? <div className="empty">표시할 작업이 없습니다. 역할 필터에서 표시할 역할을 선택하세요.</div> :
      <div className="wbs-region" ref={regionRef}>
        <div className={`sticky-day-head ${headerPinned ? 'visible' : ''}`} aria-hidden={!headerPinned}>
          <div className="sticky-header-scroll" ref={floatingScrollRef} onScroll={event => {
            if (tableScrollRef.current && tableScrollRef.current.scrollLeft !== event.currentTarget.scrollLeft) {
              tableScrollRef.current.scrollLeft = event.currentTarget.scrollLeft
            }
          }}>
            <table style={{ width: tableWidth }}><WbsColumns calendar={calendar} /><thead><DayHeader calendar={calendar} /></thead></table>
          </div>
        </div>
        <div className="wbs-scroll" ref={tableScrollRef} tabIndex={0} role="region" aria-label="WBS 일정표" onScroll={event => {
          if (floatingScrollRef.current && floatingScrollRef.current.scrollLeft !== event.currentTarget.scrollLeft) {
            floatingScrollRef.current.scrollLeft = event.currentTarget.scrollLeft
          }
        }}>
        <table style={{ width: tableWidth }}>
          <WbsColumns calendar={calendar} />
          <thead>
            <tr className="week-head"><th colSpan={COLUMNS.length}>주차</th>
              {weeks.map(week => <th key={week.label} colSpan={week.span}>{week.label}<small>{shortDate(week.start)}</small></th>)}
            </tr>
            <DayHeader calendar={calendar} headerRef={dayHeaderRef} />
          </thead>
          <tbody>{rows.map(row => {
            if (row.kind === 'section') return <tr className="section" key={row.key}>
              <td colSpan={COLUMNS.length}>{row.label}</td><td colSpan={calendar.length} />
            </tr>
            const task = row.task
            const label = statusLabel(task)
            return <tr key={row.key} data-task-id={task.id} className="task-row" onClick={() => setSelected(task)}>
              <td className="pinned pin-0">{task.section || '프로젝트 작업'}</td>
              <td className="pinned pin-1">{task.wbs || task.id}</td>
              <td className="pinned pin-2 task-name"><button onClick={() => setSelected(task)}>{task.title}</button></td>
              <td>{task.category || task.phase}</td>
              <td>{task.deliverables.map(item => item.label).join(', ')}</td>
              <td>{[roleLabel(task.responsible), ...task.assistants].join(', ')}</td>
              <td>{task.startDate || '날짜 미정'}</td><td>{task.endDate || '날짜 미정'}</td>
              <td className="number">{formatWeight(task.weight)}</td>
              <td><span className="status-badge" style={{ background: `#${STATUS_COLORS[label]}` }}>{label}</span></td>
              <td className="number">{taskProgress(task)! * 100}%</td>
              {calendar.map(date => <td key={date.toISOString()} className="slot" data-date={date.toISOString().slice(0, 10)}
                style={{ background: `#${slotColor(task, date)}` }}
                title={`${task.title} · ${date.toISOString().slice(0, 10)} · ${label} · ${capacityLabel(date)}`} />)}
            </tr>
          })}</tbody>
        </table>
        </div>
      </div>}
    {selected && <TaskDetail task={selected} close={() => setSelected(null)} />}
  </main>
}

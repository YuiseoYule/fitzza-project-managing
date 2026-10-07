import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import Ajv from 'ajv/dist/2020.js'
import type { Status, Task } from '../src/types'
import { FILTER_ROLES, calculateProgress, createWbsView, slotColor, taskProgress } from '../src/utils/wbs'
import { CAPACITY_COLORS, dayCapacity } from '../src/utils/workCalendar'
import { validateTaskRules } from '../scripts/task-rules.mjs'

export function makeTask(id: string, weight: 1 | 2, status: Status): Task {
  return { id, weight: weight / 100, status, title: id, phase: '설계', section: '개발', responsible: 'FE',
    assistants: [], startDate: '2026-10-06', endDate: '2026-10-08', predecessorIds: [], deliverables: [], notes: '' }
}

test('완료 가중치 2 / (완료 2 + 진행 1), 보류 2 제외 = 2/3', () => {
  assert.deepEqual(calculateProgress([
    makeTask('TASK-A', 2, '완료'), makeTask('TASK-B', 1, '진행 중'), makeTask('TASK-C', 2, '보류'),
  ]), { completedWeight: 0.02, totalWeight: 0.03, excludedWeight: 0.02, allWeight: 0.05, heldCount: 1, rate: 0.02 / 0.03 })
})

test('상태만 수정해도 완료와 보류 전환에 따라 분자와 분모가 바뀐다', () => {
  const tasks = [makeTask('TASK-A', 1, '완료'), makeTask('TASK-B', 2, '시작 전')]
  assert.equal(calculateProgress(tasks).rate, 0.01 / 0.03)
  tasks[1].status = '완료'
  assert.equal(calculateProgress(tasks).rate, 1)
  tasks[1].status = '보류'
  assert.equal(calculateProgress(tasks).totalWeight, 0.01)
  tasks[0].status = '보류'
  assert.equal(calculateProgress(tasks).rate, null)
})

test('과거 영문 상태도 지원하고 progress 숫자는 무시한다', () => {
  const done = { ...makeTask('TASK-A', 2, 'completed'), progress: 0 }
  const active = { ...makeTask('TASK-B', 1, 'in_progress'), progress: 1 }
  const held = makeTask('TASK-C', 2, 'on_hold')
  assert.equal(calculateProgress([done, active, held]).rate, 0.02 / 0.03)
  assert.equal(taskProgress(done), 1)
  assert.equal(taskProgress(active), 0)
  assert.equal(taskProgress(held), null)
})

test('빈 데이터, 전부 보류, 전부 미완료, 차단 상태를 구분한다', () => {
  assert.equal(calculateProgress([]).rate, null)
  assert.equal(calculateProgress([makeTask('TASK-A', 1, '보류')]).rate, null)
  assert.equal(calculateProgress([makeTask('TASK-A', 2, '시작 전')]).rate, 0)
  assert.equal(calculateProgress([makeTask('TASK-A', 2, '차단됨')]).totalWeight, 0.02)
  assert.equal(calculateProgress([makeTask('TASK-A', 1, 'blocked')]).heldCount, 0)
})

test('화면/Excel 공통 뷰는 입력 배열을 보존하고 필터 범위만 집계한다', () => {
  const tasks = [makeTask('TASK-B', 2, '완료'), makeTask('TASK-A', 1, '시작 전')]
  tasks[1].responsible = 'BE'
  assert.deepEqual(createWbsView(tasks).tasks.map(t => t.id), ['TASK-A', 'TASK-B'])
  assert.equal(tasks[0].id, 'TASK-B')
  assert.equal(createWbsView(tasks.filter(t => t.responsible === 'FE')).summary.rate, 1)
  assert.equal(createWbsView(tasks).calendar[0].toISOString().slice(0, 10), '2026-10-05')
  assert.equal(createWbsView([]).calendar.length, 0)
})

test('JSON 스키마는 퍼센트 가중치와 상태를 검증하고 잘못된 가중치를 거절한다', async () => {
  const schema = JSON.parse(await readFile(new URL('../schemas/task.schema.json', import.meta.url), 'utf8'))
  const validate = new Ajv().compile(schema)
  for (const status of ['완료', '보류', '시작 전', '진행 전', '진행 중', '차단됨', 'completed', 'on_hold'] as const) {
    assert.equal(validate({ ...makeTask('TASK-A', 1, status), weight: 0.002083333333333333 }), true)
  }
  for (const weight of [0, 1.5, 2, 3, -1, '1', null, undefined]) {
    assert.equal(validate({ ...makeTask('TASK-A', 1, '완료'), weight }), false, `weight=${weight}`)
  }
  assert.equal(validate({ ...makeTask('TASK-A', 1, '완료'), status: 'complete' }), false)
  assert.equal(validate({ ...makeTask('FR-ACC-01-FE-01', 1, '완료'), responsible: '', startDate: '', endDate: '', progress: null }), true)
  assert.equal(validate({ ...makeTask('FR-ACC-01-FE-01', 1, '완료'), responsible: 'unknown' }), false)
  for (const responsible of ['경민', '주희', '지현', '수혁', '승원', '준우', '나연'] as const) {
    assert.equal(validate({ ...makeTask('FR-ACC-01-BE-01', 1, '진행 전'), responsible }), true)
    assert.ok(FILTER_ROLES.includes(responsible))
  }
  assert.equal(validate({ ...makeTask('../escape', 1, '완료') }), false)
})

test('클라우드/신규 작업은 명시적 일정 미정일 때만 빈 날짜를 허용한다', () => {
  const cloud = { ...makeTask('CLOUD-001', 1, '진행 전'), responsible: '나연' as const, startDate: '', endDate: '', schedulePending: true }
  assert.deepEqual(validateTaskRules([cloud]), [])
  assert.ok(validateTaskRules([{ ...cloud, schedulePending: false }]).length)
  assert.ok(validateTaskRules([{ ...cloud, startDate: '2026-10-07' }]).length)
  assert.ok(validateTaskRules([{ ...cloud, startDate: '2026-10-07', endDate: '2026-10-08' }]).length)
  assert.equal(slotColor(cloud, new Date('2026-10-07T00:00:00Z')), 'FFFFFF')
})

test('10월 근무일 17개 중 17일/24일만 0.5이며 나머지 날짜는 비근무일이다', () => {
  const fullDays = [7, 8, 12, 13, 14, 15, 16, 20, 21, 22, 23, 27, 28, 29, 30]
  for (let day = 1; day <= 31; day++) {
    const date = new Date(Date.UTC(2026, 9, day))
    assert.equal(dayCapacity(date), [17, 24].includes(day) ? 0.5 : fullDays.includes(day) ? 1 : 0, `October ${day}`)
  }
  assert.equal(dayCapacity(new Date('2026-11-01T00:00:00Z')), null)
})

test('비근무/0.5 색상은 작업의 상태 및 일정 유무와 관계없이 우선 적용한다', () => {
  for (const status of ['완료', '진행 전', '보류', '진행 중'] as const) {
    const task = { ...makeTask('FR-A', 1, status), startDate: '2026-10-01', endDate: '2026-10-31' }
    assert.equal(slotColor(task, new Date('2026-10-09T00:00:00Z')), CAPACITY_COLORS.nonWorking)
    assert.equal(slotColor(task, new Date('2026-10-17T00:00:00Z')), CAPACITY_COLORS.halfDay)
    assert.equal(slotColor(task, new Date('2026-10-24T00:00:00Z')), CAPACITY_COLORS.halfDay)
    assert.notEqual(slotColor(task, new Date('2026-10-07T00:00:00Z')), CAPACITY_COLORS.nonWorking)
  }
  const unknown = { ...makeTask('FR-A', 1, '완료'), startDate: '', endDate: '' }
  assert.equal(slotColor(unknown, new Date('2026-10-07T00:00:00Z')), 'FFFFFF')
  assert.equal(slotColor(unknown, new Date('2026-10-17T00:00:00Z')), CAPACITY_COLORS.halfDay)
})

test('진행 전 작업 기간은 연한 빨강으로 반일 근무 회색과 구분한다', () => {
  for (const status of ['진행 전', '시작 전', 'not_started'] as const) {
    const task = { ...makeTask('FR-A', 1, status), endDate: '2026-10-24' }
    assert.equal(slotColor(task, new Date('2026-10-07T00:00:00Z')), 'FAD4D0')
    assert.equal(slotColor(task, new Date('2026-10-09T00:00:00Z')), '000000')
    assert.equal(slotColor(task, new Date('2026-10-17T00:00:00Z')), '9CA3AF')
    assert.equal(slotColor(task, new Date('2026-10-24T00:00:00Z')), '9CA3AF')
  }
})

test('미배정/완료일 미상 데이터도 숨겨지거나 날짜 계산을 망가뜨리지 않는다', () => {
  const undated = { ...makeTask('FR-A', 2, '완료'), responsible: '' as const, startDate: '', endDate: '', progress: null }
  const planned = makeTask('FR-B', 1, '진행 전')
  assert.ok(FILTER_ROLES.includes(undated.responsible))
  const view = createWbsView([undated, planned])
  assert.deepEqual(view.tasks.map(t => t.id), ['FR-B', 'FR-A'])
  assert.equal(view.summary.rate, 0.02 / 0.03)
  assert.ok(view.calendar.length > 0)
  assert.ok(createWbsView([undated]).calendar.every(date => Number.isFinite(date.getTime())))
  assert.ok(createWbsView([undated]).calendar.length >= 31)
})

test('날짜 미상은 완료/보류에 허용하고 의존성 및 실제 날짜 검증은 유지한다', () => {
  const completed = { ...makeTask('FR-A', 1, '완료'), startDate: '', endDate: '' }
  const next = { ...makeTask('FR-B', 1, '진행 전'), predecessorIds: ['FR-A'] }
  assert.deepEqual(validateTaskRules([completed, next]), [])
  for (const status of ['보류', 'on_hold'] as const) {
    assert.deepEqual(validateTaskRules([{ ...completed, status }]), [])
    assert.ok(validateTaskRules([{ ...completed, status, startDate: '2026-10-07' }]).length)
  }
  assert.ok(validateTaskRules([{ ...completed, status: '진행 전' }]).length)
  assert.ok(validateTaskRules([{ ...completed, endDate: '2026-10-08' }]).length)
  assert.ok(validateTaskRules([{ ...next, startDate: '2026-02-30' }]).some((e: string) => e.includes('invalid calendar date')))
  assert.ok(validateTaskRules([{ ...next, startDate: '2026-10-09' }]).some((e: string) => e.includes('after endDate')))
  assert.ok(validateTaskRules([next]).some((e: string) => e.includes('does not exist')))
  assert.ok(validateTaskRules([{ ...next, predecessorIds: ['FR-B'] }]).some((e: string) => e.includes('itself')))
  assert.ok(validateTaskRules([{ ...completed, predecessorIds: ['FR-B'] }, next]).some((e: string) => e.includes('circular')))
  assert.ok(validateTaskRules([makeTask('FR-A', 1, '완료'), next]).some((e: string) => e.includes('after predecessor')))
})

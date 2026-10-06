import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import Ajv from 'ajv/dist/2020.js'
import type { Status, Task } from '../src/types'
import { calculateProgress, createWbsView, taskProgress } from '../src/utils/wbs'

export function makeTask(id: string, weight: 1 | 2, status: Status): Task {
  return { id, weight, status, title: id, phase: '설계', section: '개발', responsible: 'FE',
    assistants: [], startDate: '2026-10-06', endDate: '2026-10-08', predecessorIds: [], deliverables: [], notes: '' }
}

test('완료 가중치 2 / (완료 2 + 진행 1), 보류 2 제외 = 2/3', () => {
  assert.deepEqual(calculateProgress([
    makeTask('TASK-A', 2, '완료'), makeTask('TASK-B', 1, '진행 중'), makeTask('TASK-C', 2, '보류'),
  ]), { completedWeight: 2, totalWeight: 3, excludedWeight: 2, heldCount: 1, rate: 2 / 3 })
})

test('상태만 수정해도 완료와 보류 전환에 따라 분자와 분모가 바뀐다', () => {
  const tasks = [makeTask('TASK-A', 1, '완료'), makeTask('TASK-B', 2, '시작 전')]
  assert.equal(calculateProgress(tasks).rate, 1 / 3)
  tasks[1].status = '완료'
  assert.equal(calculateProgress(tasks).rate, 1)
  tasks[1].status = '보류'
  assert.equal(calculateProgress(tasks).totalWeight, 1)
  tasks[0].status = '보류'
  assert.equal(calculateProgress(tasks).rate, null)
})

test('과거 영문 상태도 지원하고 progress 숫자는 무시한다', () => {
  const done = { ...makeTask('TASK-A', 2, 'completed'), progress: 0 }
  const active = { ...makeTask('TASK-B', 1, 'in_progress'), progress: 1 }
  const held = makeTask('TASK-C', 2, 'on_hold')
  assert.equal(calculateProgress([done, active, held]).rate, 2 / 3)
  assert.equal(taskProgress(done), 1)
  assert.equal(taskProgress(active), 0)
  assert.equal(taskProgress(held), null)
})

test('빈 데이터, 전부 보류, 전부 미완료, 차단 상태를 구분한다', () => {
  assert.equal(calculateProgress([]).rate, null)
  assert.equal(calculateProgress([makeTask('TASK-A', 1, '보류')]).rate, null)
  assert.equal(calculateProgress([makeTask('TASK-A', 2, '시작 전')]).rate, 0)
  assert.equal(calculateProgress([makeTask('TASK-A', 2, '차단됨')]).totalWeight, 2)
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

test('JSON 스키마는 1/2 가중치와 한국어 상태만 허용하고 잘못된 가중치를 거절한다', async () => {
  const schema = JSON.parse(await readFile(new URL('../schemas/task.schema.json', import.meta.url), 'utf8'))
  const validate = new Ajv().compile(schema)
  for (const status of ['완료', '보류', '시작 전', '진행 중', '차단됨', 'completed', 'on_hold'] as const) {
    assert.equal(validate(makeTask('TASK-A', 2, status)), true)
  }
  for (const weight of [0, 0.03, 1.5, 3, -1, '1', null, undefined]) {
    assert.equal(validate({ ...makeTask('TASK-A', 1, '완료'), weight }), false, `weight=${weight}`)
  }
  assert.equal(validate({ ...makeTask('TASK-A', 1, '완료'), status: 'complete' }), false)
})

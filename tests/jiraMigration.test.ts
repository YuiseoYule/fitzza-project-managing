import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { buildWbsWorkbook } from '../src/utils/exportExcel'
import { calculateProgress } from '../src/utils/wbs'
import type { Task } from '../src/types'

const root = path.resolve(import.meta.dirname, '..')
const load = (folder: string) => readdirSync(path.join(root, 'data', folder))
  .filter(file => file.endsWith('.json'))
  .map(file => JSON.parse(readFileSync(path.join(root, 'data', folder, file), 'utf8')) as Task)
const originals = load('tasks')
const active = load('jira-tasks')
const audit = JSON.parse(readFileSync(path.join(root, 'data', 'jira-weight-audit.json'), 'utf8')) as {
  mappings: { sourceTaskId: string; sourceWeight: number; activeTaskId: string; excludedAsHold: boolean }[]
  sourceTaskCount: number; activeTaskCount: number; unmatchedJiraSubtasks: { key: string }[]
}

test('Jira 통합 후에도 모든 원본 296개 가중치가 정확히 한 번 보존된다', () => {
  assert.equal(originals.length, 296)
  assert.equal(audit.mappings.length, originals.length)
  assert.equal(new Set(audit.mappings.map(row => row.sourceTaskId)).size, originals.length)
  assert.equal(active.length, audit.activeTaskCount)
  const sourceWeight = originals.reduce((sum, task) => sum + task.weight, 0)
  const activeWeight = active.reduce((sum, task) => sum + task.weight, 0)
  assert.ok(Math.abs(sourceWeight - 1) < 1e-10)
  assert.ok(Math.abs(activeWeight - sourceWeight) < 1e-10)
  for (const task of active) {
    const mapped = audit.mappings.filter(row => row.activeTaskId === task.id)
    assert.ok(mapped.length > 0, `${task.id}: 원본 누락`)
    assert.ok(Math.abs(mapped.reduce((sum, row) => sum + row.sourceWeight, 0) - task.weight) < 1e-10)
  }
})

test('Jira 완료만 완료로 계산하고 원본 보류 가중치는 제외한다', () => {
  const held = active.filter(task => task.status === '보류')
  assert.equal(held.length, 4)
  assert.equal(audit.mappings.filter(row => row.excludedAsHold).length, 4)
  const progress = calculateProgress(active)
  assert.ok(Math.abs(progress.allWeight - 1) < 1e-10)
  assert.ok(Math.abs(progress.totalWeight + progress.excludedWeight - 1) < 1e-10)
  assert.equal(audit.unmatchedJiraSubtasks.length, 2)
  assert.ok(active.some(task => task.id === 'FITZZA-11' && task.status === '완료'))
  assert.ok(active.some(task => task.id === 'FITZZA-9' && task.status === '검토 중'))
})

test('Jira 섹션 순서와 가중치 합산 근거 296행이 Excel 저장 후에도 보존된다', async () => {
  const workbook = buildWbsWorkbook(active, 'Jira WBS', 'jira-section')
  const total = workbook.getWorksheet('가중치 총합')!
  const lineage = workbook.getWorksheet('가중치 합산 근거')!
  const summary = calculateProgress(active)
  assert.ok(Math.abs(summary.allWeight - 1) < 1e-10)
  assert.ok(total.rowCount > 4)
  assert.equal(workbook.getWorksheet('프로젝트 WBS')!.getCell('A2').value?.toString().includes('137개 작업'), true)
  assert.equal(lineage.rowCount, audit.mappings.length + 4)
  const sourceIds = new Set(Array.from({ length: audit.mappings.length }, (_, index) => lineage.getCell(index + 5, 3).value))
  assert.equal(sourceIds.size, originals.length)
  assert.equal(lineage.getCell('E5').numFmt, '0.000%')
  const reopened = new (await import('exceljs')).default.Workbook()
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer())
  assert.equal(reopened.getWorksheet('가중치 합산 근거')?.rowCount, audit.mappings.length + 4)
})

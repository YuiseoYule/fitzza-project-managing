import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import type { Task } from '../src/types'
import { projectSummary } from '../src/utils/projectSummary'
import { buildWbsWorkbook } from '../src/utils/exportExcel'
import { calculateProgress, formatWeight } from '../src/utils/wbs'

const tasks: Task[] = [
  { id: 'FE-1', title: '완료', phase: '개발', category: '프론트엔드', responsible: '준우', assistants: [], startDate: '2026-10-07', endDate: '2026-10-08', weight: 0.02, status: '완료', predecessorIds: [], deliverables: [], notes: '' },
  { id: 'BE-1', title: '시작 전', phase: '개발', category: '백엔드', responsible: '지현', assistants: [], startDate: '2026-10-07', endDate: '2026-10-08', weight: 0.01, status: '진행 전', predecessorIds: [], deliverables: [], notes: '' },
  { id: 'CLOUD-1', title: '클라우드', phase: '클라우드', category: '클라우드', responsible: '나연', assistants: [], startDate: '', endDate: '', schedulePending: true, weight: 0.04, status: '진행 전', predecessorIds: [], deliverables: [], notes: '' },
  { id: 'FE-2', title: '보류', phase: '개발', category: '프론트엔드', responsible: '수혁', assistants: [], startDate: '', endDate: '', weight: 0.03, status: '보류', predecessorIds: [], deliverables: [], notes: '' },
]
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`)

test('단일 계획/분석설계 작업은 화면과 Excel에서 각각 한 번만 집계한다', () => {
  const phases: Task[] = [
    { ...tasks[0], id: 'PHASE-PLAN', category: '계획', weight: 0.15, responsible: '', startDate: '', endDate: '' },
    { ...tasks[0], id: 'PHASE-ANALYSIS-DESIGN', category: '분석설계', weight: 0.1, responsible: '', startDate: '', endDate: '' },
  ]
  const combined = [...tasks, ...phases]
  const result = projectSummary(combined)
  near(result.total.allWeight, 0.35)
  near(result.total.completedWeight, 0.27)
  near(result.total.totalWeight, 0.32)
  for (const phase of phases) {
    const row = result.rows.find(item => item.category === phase.category)!
    assert.equal(row.count, 1)
    near(row.allWeight, phase.weight)
    near(row.completedWeight, phase.status === '완료' ? phase.weight : 0)
  }
  const sheet = buildWbsWorkbook(combined).getWorksheet('가중치 총합')!
  near(sheet.getCell('C7').result as number, 0.15)
  near(sheet.getCell('C8').result as number, 0.1)
  near(sheet.getCell('D12').result as number, 0.27)
  near(sheet.getCell('C12').result as number, 0.35)
})

test('전체 합계는 최하위 가중치만 더하고 보류/미등록/미계획을 구분한다', () => {
  const { rows, total } = projectSummary(tasks)
  near(total.allWeight, 0.10)
  near(total.totalWeight, 0.07)
  near(total.completedWeight, 0.02)
  near(total.excludedWeight, 0.03)
  near(total.rate!, 2 / 7)
  near(total.plannedWeight, 1)
  assert.equal(rows.find(r => r.category === '계획')?.rate, null)
  assert.equal(rows.find(r => r.category === '클라우드')?.totalWeight, 0.04)
  assert.equal(formatWeight(0.002083333333333333), '0.208%')
  const filtered = calculateProgress(tasks.filter(t => t.category === '프론트엔드'))
  assert.equal(filtered.rate, 1)
  near(projectSummary(tasks).total.rate!, 2 / 7)
})

test('영역별 부족과 초과를 상쇄하지 않고 미등록 영역과 구분한다', () => {
  const result = projectSummary([
    { ...tasks[0], weight: 0.24 },
    { ...tasks[1], weight: 0.31 },
  ])
  assert.deepEqual(result.allocationGaps.map(row => row.category), ['프론트엔드', '백엔드'])
  assert.ok(result.unregistered.some(row => row.category === '테스트'))
  assert.ok(!result.unregistered.some(row => row.category === '백엔드'))
  const fixed = projectSummary([{ ...tasks[0], weight: 0.25 }, { ...tasks[1], weight: 0.30 }])
  assert.deepEqual(fixed.allocationGaps, [])
})

test('퍼센트 및 영역별 SUMIFS 총합이 XLSX 재열기 후에도 보존된다', async () => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await buildWbsWorkbook(tasks).xlsx.writeBuffer())
  const main = workbook.getWorksheet('프로젝트 WBS')!
  const sheet = workbook.getWorksheet('가중치 총합')!
  near(main.getCell('H4').result as number, 0.10)
  near(sheet.getCell('C12').result as number, 0.10)
  near(sheet.getCell('D12').result as number, 0.02)
  near(sheet.getCell('E12').result as number, 0.03)
  near(sheet.getCell('F12').result as number, 0.07)
  near(sheet.getCell('G12').result as number, 2 / 7)
  near(sheet.getCell('C14').result as number, 0.9)
  assert.equal(sheet.getCell('C5').numFmt, '0.000%')
  assert.match(sheet.getCell('C5').formula, /^SUMIFS\('프로젝트 WBS'/)
  assert.match(sheet.getCell('E5').formula, /보류/)
  assert.equal(sheet.getCell('G7').result, '계산 대상 없음')
})

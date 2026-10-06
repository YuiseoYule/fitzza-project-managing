import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import type { Task } from '../src/types'
import { buildWbsWorkbook } from '../src/utils/exportExcel'

const fixture: Task[] = [
  { id: 'TASK-A', title: '완료 작업', phase: '설계', responsible: 'FE', assistants: [], startDate: '2026-10-06', endDate: '2026-10-08', weight: 2, status: '완료', predecessorIds: [], deliverables: [], notes: '' },
  { id: 'TASK-B', title: '진행 작업', phase: '설계', responsible: 'BE', assistants: [], startDate: '2026-10-06', endDate: '2026-10-08', weight: 1, status: '진행 중', predecessorIds: [], deliverables: [], notes: '' },
  { id: 'TASK-C', title: '보류 작업', phase: '설계', responsible: 'PM', assistants: [], startDate: '2026-10-06', endDate: '2026-10-08', weight: 2, status: '보류', predecessorIds: [], deliverables: [], notes: '' },
]

test('XLSX 저장/재열기 후 값, 수식, 날짜, 서식, 틀 고정, 입력 제한이 보존된다', async () => {
  const workbook = buildWbsWorkbook(fixture)
  const reopened = new ExcelJS.Workbook()
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer())
  const sheet = reopened.worksheets[0]
  assert.equal(sheet.name, '프로젝트 WBS')
  assert.equal(sheet.getCell('C3').result, 2 / 3)
  assert.equal(sheet.getCell('B4').result, 2)
  assert.equal(sheet.getCell('D4').result, 3)
  assert.equal(sheet.getCell('F4').result, 2)
  assert.match(sheet.getCell('D4').formula, /<>보류/)
  assert.match(sheet.getCell('D4').formula, /<>on_hold/)
  assert.equal(sheet.getCell('C10').value, '완료 작업')
  assert.equal(sheet.getCell('J12').value, '보류')
  assert.equal(sheet.getCell('K10').result, 1)
  assert.equal(sheet.getCell('K11').result, 0)
  assert.equal(sheet.getCell('K12').result, '제외')
  assert.equal(sheet.getCell('I10').value, 2)
  assert.equal(sheet.getCell('I10').numFmt, '0')
  assert.equal(sheet.getCell('C3').numFmt, '0.0%')
  assert.ok(sheet.getCell('L8').value instanceof Date)
  assert.equal(sheet.getCell('G10').numFmt, 'yyyy-mm-dd')
  assert.equal(sheet.views[0].state, 'frozen')
  assert.equal(sheet.getCell('I10').dataValidation.type, 'whole')
  assert.deepEqual(sheet.getCell('I10').dataValidation.formulae, [1, 2])
  assert.equal(sheet.getCell('J10').dataValidation.type, 'list')
  const rules = sheet.model.conditionalFormattings
  assert.equal(rules.length, 13)
  assert.ok(JSON.stringify(rules).includes('L$8>=$G9'))
})

test('XLSX 근무일 색상 우선순위, 보류 취소선과 날짜 미상 표시가 보존된다', async () => {
  const tasks: Task[] = [
    { ...fixture[0], id: 'FR-A', responsible: '', startDate: '', endDate: '', progress: null },
    { ...fixture[2], id: 'FR-B', startDate: '2026-10-07', endDate: '2026-10-30' },
  ]
  const reopened = new ExcelJS.Workbook()
  await reopened.xlsx.load(await buildWbsWorkbook(tasks).xlsx.writeBuffer())
  const sheet = reopened.worksheets[0]
  assert.equal(sheet.getCell('C10').value, '보류 작업')
  assert.equal(sheet.getCell('F11').value, '미배정')
  assert.equal(sheet.getCell('G11').value, '날짜 미정')
  assert.equal(sheet.getCell('H11').value, '날짜 미정')
  const byDate = new Map<string, number>()
  sheet.getRow(8).eachCell((cell, column) => {
    if (cell.value instanceof Date) byDate.set(cell.value.toISOString().slice(0, 10), column)
  })
  for (const [date, capacity] of [['2026-10-07', 1], ['2026-10-09', 0], ['2026-10-17', 0.5], ['2026-10-24', 0.5]] as const) {
    assert.equal(sheet.getCell(6, byDate.get(date)!).value, capacity)
  }
  const formats = sheet.model.conditionalFormattings
  const rules = formats.flatMap(format => format.rules)
  assert.ok(rules.some(rule => rule.priority === 1 && JSON.stringify(rule.style).includes('FF000000')))
  assert.ok(rules.some(rule => rule.priority === 2 && JSON.stringify(rule.style).includes('FF9CA3AF')))
  const strike = formats.find(format => format.ref === 'B9:C11')
  assert.equal(strike?.rules[0].style?.font?.strike, true)
  assert.ok(JSON.stringify(strike).includes('보류'))
  assert.ok(JSON.stringify(formats).includes('OR(NOT(ISNUMBER(L$6)),L$6=1)'))
})

test('빈 표와 모두 보류인 표는 0 나눗셈 대신 계산 대상 없음으로 내보낸다', async () => {
  for (const tasks of [[], [fixture[2]]]) {
    const workbook = buildWbsWorkbook(tasks)
    const sheet = workbook.worksheets[0]
    assert.equal(sheet.getCell('C3').result, '계산 대상 없음')
    assert.match(sheet.getCell('C3').formula, /^IF\(D4=0/)
    assert.ok((await workbook.xlsx.writeBuffer()).byteLength > 0)
  }
})

test('역할 필터에 표시된 작업만 Excel에 포함한다', () => {
  const workbook = buildWbsWorkbook([fixture[1]], '표시된 역할: BE')
  const sheet = workbook.worksheets[0]
  assert.equal(sheet.getCell('C10').value, '진행 작업')
  assert.equal(sheet.getCell('C11').value, null)
  assert.equal(sheet.getCell('D4').result, 1)
  assert.equal(sheet.getCell('C3').result, 0)
  assert.match(sheet.getCell('A2').text, /BE/)
})

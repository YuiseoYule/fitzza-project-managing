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
  assert.equal(rules.length, 10)
  assert.ok(JSON.stringify(rules).includes('L$8>=$G9'))
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

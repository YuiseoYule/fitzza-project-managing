import ExcelJS from 'exceljs'
import type { Task } from '../types'
import {
  COLUMNS, STATUS_COLORS, createWbsView, isWeekend, shortDate, statusLabel, taskProgress,
} from './wbs'
import { CAPACITY_COLORS, dayCapacity } from './workCalendar'
import { projectSummary } from './projectSummary'

const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${argb}` } })
export const HEADER_ROW = 8
export const FIRST_DATA_ROW = 9

/** Generate an actual .xlsx, with editable status/weight cells and recalculating formulas. */
export function buildWbsWorkbook(tasks: readonly Task[], scopeLabel = '전체 작업') {
  const view = createWbsView(tasks)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Fitzza WBS'
  workbook.calcProperties.fullCalcOnLoad = true
  const sheet = workbook.addWorksheet('프로젝트 WBS', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: HEADER_ROW, topLeftCell: 'D9', showGridLines: false }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  COLUMNS.forEach((column, i) => { sheet.getColumn(i + 1).width = (column.width - 5) / 7 })
  view.calendar.forEach((_, i) => { sheet.getColumn(COLUMNS.length + i + 1).width = 3.6 })
  const lastColumn = sheet.getColumn(COLUMNS.length + view.calendar.length).letter
  const lastRow = Math.max(FIRST_DATA_ROW, HEADER_ROW + view.rows.length)

  sheet.mergeCells('A1:K1')
  sheet.getCell('A1').value = '프로젝트 WBS'
  sheet.getCell('A1').font = { name: '맑은 고딕', size: 18, bold: true, color: { argb: 'FF202D40' } }
  sheet.getRow(1).height = 32
  sheet.mergeCells('A2:K2')
  sheet.getCell('A2').value = `${scopeLabel} · ${tasks.length}개 작업 · 상태 기준 자동 계산`
  sheet.mergeCells('A3:B3')
  sheet.getCell('A3').value = '가중 진척률'
  sheet.getCell('C3').value = { formula: 'IF(D4=0,"계산 대상 없음",B4/D4)', result: view.summary.rate ?? '계산 대상 없음' }
  sheet.getCell('C3').numFmt = '0.0%'
  sheet.getCell('A4').value = '완료 가중치'
  sheet.getCell('C4').value = '계산 대상 가중치'
  sheet.getCell('E4').value = '보류 가중치 (제외)'
  const weightRange = `$I$${FIRST_DATA_ROW}:$I$${lastRow}`
  const statusRange = `$J$${FIRST_DATA_ROW}:$J$${lastRow}`
  sheet.getCell('B4').value = {
    formula: `SUMIFS(${weightRange},${statusRange},"완료")+SUMIFS(${weightRange},${statusRange},"completed")`,
    result: view.summary.completedWeight,
  }
  sheet.getCell('D4').value = {
    formula: `SUMIFS(${weightRange},${statusRange},"<>보류",${statusRange},"<>on_hold")`,
    result: view.summary.totalWeight,
  }
  sheet.getCell('F4').value = {
    formula: `SUM(${weightRange})-D4`, result: view.summary.excludedWeight,
  }
  sheet.getCell('G4').value = '등록 가중치 합계'
  sheet.getCell('H4').value = { formula: `SUM(${weightRange})`, result: view.summary.allWeight }
  for (const address of ['B4', 'D4', 'F4', 'H4']) sheet.getCell(address).numFmt = '0.000%'
  sheet.mergeCells('A5:K5')
  sheet.getCell('A5').value = '가중 진척률 = 완료 가중치 합 ÷ 보류 제외 가중치 합. 가중치: 전체 기여도(%). 영역별 총합은 가중치 총합 시트에서 확인하세요.'
  sheet.getRow(5).height = 24
  sheet.mergeCells('A6:K6')
  sheet.getCell('A6').value = 'Excel 수정은 이 파일에만 반영됩니다. 대시보드 원본 변경은 GitHub의 작업 JSON에서 진행하세요.'
  if (view.calendar.length) {
    sheet.mergeCells(5, COLUMNS.length + 1, 5, COLUMNS.length + view.calendar.length)
    sheet.getCell(5, COLUMNS.length + 1).value = '업무 가능량: 0 = 검정 / 0.5 = 회색 / 1 = 근무일 / 미설정 = 10월 외'
  }
  sheet.mergeCells('A7:K7')
  sheet.getCell('A7').value = '주차'
  view.weeks.forEach(week => {
    const firstColumn = COLUMNS.length + week.offset + 1
    sheet.mergeCells(7, firstColumn, 7, firstColumn + week.span - 1)
    sheet.getCell(7, firstColumn).value = `${week.label}\n${shortDate(week.start)}`
  })
  COLUMNS.forEach((column, i) => { sheet.getCell(HEADER_ROW, i + 1).value = column.label })
  view.calendar.forEach((date, i) => {
    const cell = sheet.getCell(HEADER_ROW, COLUMNS.length + i + 1)
    cell.value = date
    sheet.getCell(6, COLUMNS.length + i + 1).value = dayCapacity(date) ?? '미설정'
    // Date stays numeric; an invariant literal preserves Korean weekdays in all viewers.
    cell.numFmt = `d"\n${['일', '월', '화', '수', '목', '금', '토'][date.getUTCDay()]}"`
  })

  view.rows.forEach((entry, i) => {
    const rowIndex = FIRST_DATA_ROW + i
    const row = sheet.getRow(rowIndex)
    row.height = entry.kind === 'section' ? 22 : 44
    if (entry.kind === 'section') {
      sheet.mergeCells(rowIndex, 1, rowIndex, COLUMNS.length)
      row.getCell(1).value = entry.label
      for (let col = 1; col <= COLUMNS.length + view.calendar.length; col++) {
        row.getCell(col).fill = fill('C8DCF4')
        row.getCell(col).font = { name: '맑은 고딕', size: 10, bold: true }
      }
      return
    }
    const task = entry.task
    row.values = [
      task.section || '프로젝트 작업', task.wbs || task.id, task.title, task.category || task.phase,
      task.deliverables.map(x => x.label).join(', '), [task.responsible || '미배정', ...task.assistants].join(', '),
      task.startDate ? new Date(`${task.startDate}T00:00:00Z`) : '날짜 미정',
      task.endDate ? new Date(`${task.endDate}T00:00:00Z`) : '날짜 미정', task.weight, statusLabel(task),
      { formula: `IF(OR(J${rowIndex}="보류",J${rowIndex}="on_hold"),"제외",IF(OR(J${rowIndex}="완료",J${rowIndex}="completed"),1,0))`, result: taskProgress(task) ?? '제외' },
    ]
    row.getCell(7).numFmt = row.getCell(8).numFmt = 'yyyy-mm-dd'
    row.getCell(9).numFmt = '0.000%'
    row.getCell(11).numFmt = '0%'
    row.getCell(9).dataValidation = {
      type: 'custom', formulae: [`AND(ISNUMBER(I${rowIndex}),I${rowIndex}>0,I${rowIndex}<=1)`], allowBlank: false,
      showErrorMessage: true, errorStyle: 'stop', errorTitle: '가중치 확인', error: '0% 초과 100% 이하의 가중치를 입력하세요. 예: 0.25%',
    }
    row.getCell(10).dataValidation = {
      type: 'list', formulae: ['"시작 전,진행 중,차단됨,완료,보류"'], allowBlank: false,
      showErrorMessage: true, errorStyle: 'stop', errorTitle: '상태 확인', error: '목록에서 상태를 선택하세요.',
    }
    view.calendar.forEach((date, dayIndex) => {
      const cell = row.getCell(COLUMNS.length + dayIndex + 1)
      cell.value = null
      cell.fill = fill(isWeekend(date) ? 'F0F2F5' : 'FFFFFF')
    })
  })

  // Conditions stay live when the exported dates, weights or statuses are edited in Excel.
  if (view.calendar.length) {
    // Capacity fills take precedence over task bars, including held/undated tasks.
    for (const [capacity, color] of [[0, CAPACITY_COLORS.nonWorking], [0.5, CAPACITY_COLORS.halfDay]] as const) {
      sheet.addConditionalFormatting({ ref: `L9:${lastColumn}${lastRow}`, rules: [{
        type: 'expression', priority: capacity === 0 ? 1 : 2,
        formulae: [`AND(ISNUMBER($I9),ISNUMBER(L$6),L$6=${capacity})`],
        style: { fill: fill(color) },
      }] })
    }
    const aliases = ['not_started', 'in_progress', 'blocked', 'completed', 'on_hold']
    Object.entries(STATUS_COLORS).forEach(([label, color], index) => {
      const statusCondition = `OR($J9="${label}",$J9="${aliases[index]}")`
      sheet.addConditionalFormatting({ ref: `L9:${lastColumn}${lastRow}`, rules: [{
        type: 'expression', priority: index + 3,
        formulae: [`AND(ISNUMBER($I9),ISNUMBER($G9),ISNUMBER($H9),L$8>=$G9,L$8<=$H9,OR(NOT(ISNUMBER(L$6)),L$6=1),${statusCondition})`],
        style: { fill: fill(color) },
      }] })
      sheet.addConditionalFormatting({ ref: `J9:J${lastRow}`, rules: [{
        type: 'expression', priority: index + 8, formulae: [statusCondition], style: { fill: fill(color) },
      }] })
    })
  }
  sheet.addConditionalFormatting({ ref: `A9:K${lastRow}`, rules: [{
    type: 'expression', priority: 13,
    formulae: ['OR($J9="보류",$J9="on_hold")'], style: { font: { strike: true } },
  }] })
  for (let rowIndex = 2; rowIndex <= lastRow; rowIndex++) {
    for (let col = 1; col <= COLUMNS.length + view.calendar.length; col++) {
      const cell = sheet.getCell(rowIndex, col)
      if (cell.isMerged && cell.master.address !== cell.address) continue
      cell.font = { name: '맑은 고딕', size: 10, color: { argb: 'FF202D40' }, ...cell.font }
      cell.alignment = { vertical: 'middle', horizontal: col >= 6 ? 'center' : 'left', wrapText: true }
      if (rowIndex >= 7) cell.border = {
        top: { style: 'thin', color: { argb: 'FFD7DEE8' } },
        bottom: { style: 'thin', color: { argb: 'FFD7DEE8' } },
        left: { style: 'thin', color: { argb: 'FFD7DEE8' } },
        right: { style: 'thin', color: { argb: 'FFD7DEE8' } },
      }
      if (rowIndex === 7 || rowIndex === 8) {
        cell.fill = fill(rowIndex === 7 ? '9DB7DC' : '385F9D')
        cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: rowIndex === 7 ? 'FF274B82' : 'FFFFFFFF' } }
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      }
    }
  }
  sheet.getRow(7).height = 30
  sheet.getRow(8).height = 36
  sheet.getCell('C3').font = { name: '맑은 고딕', size: 16, bold: true, color: { argb: 'FF335E98' } }
  sheet.pageSetup.printTitlesRow = '7:8'
  sheet.pageSetup.printTitlesColumn = 'A:C'
  sheet.pageSetup.printArea = `A1:${lastColumn}${lastRow}`
  addWeightSummary(workbook, tasks, scopeLabel, lastRow)
  return workbook
}

/** Formula-based roll-up, never adding parent rows to the leaf-task total. */
function addWeightSummary(workbook: ExcelJS.Workbook, tasks: readonly Task[], scopeLabel: string, lastRow: number) {
  const summary = projectSummary(tasks)
  const sheet = workbook.addWorksheet('가중치 총합', { views: [{ state: 'frozen', ySplit: 4 }] })
  sheet.columns = [22, 20, 20, 20, 20, 20, 20].map(width => ({ width }))
  sheet.mergeCells('A1:G1')
  sheet.getCell('A1').value = '프로젝트 가중치 총합'
  sheet.getCell('A1').font = { size: 18, bold: true }
  sheet.getRow(1).height = 32
  sheet.mergeCells('A2:G2')
  sheet.getCell('A2').value = `${scopeLabel} · 등록/완료/보류 합계는 내보낸 작업 기준. 전체 합계는 전체 표시 후 내보내세요.`
  sheet.mergeCells('A3:G3')
  sheet.getCell('A3').value = '계획 비중은 원본 O4:P10 기준이며 미등록 영역의 상태는 추정하지 않습니다. 보류는 진척률 분모에서 제외합니다.'
  sheet.getRow(4).values = ['영역', '전체 계획 비중', '등록 가중치', '완료 가중치', '보류 가중치', '계산 대상 가중치', '가중 진척률']
  const weights = `'프로젝트 WBS'!$I$9:$I$${lastRow}`
  const statuses = `'프로젝트 WBS'!$J$9:$J$${lastRow}`
  const categories = `'프로젝트 WBS'!$D$9:$D$${lastRow}`
  summary.rows.forEach((row, index) => {
    const n = index + 5
    sheet.getRow(n).values = [row.category, row.plannedWeight,
      { formula: `SUMIFS(${weights},${categories},A${n})`, result: row.allWeight },
      { formula: `SUMIFS(${weights},${categories},A${n},${statuses},"완료")+SUMIFS(${weights},${categories},A${n},${statuses},"completed")`, result: row.completedWeight },
      { formula: `SUMIFS(${weights},${categories},A${n},${statuses},"보류")+SUMIFS(${weights},${categories},A${n},${statuses},"on_hold")`, result: row.excludedWeight },
      { formula: `C${n}-E${n}`, result: row.totalWeight },
      { formula: `IF(F${n}=0,"계산 대상 없음",D${n}/F${n})`, result: row.rate ?? '계산 대상 없음' },
    ]
  })
  const total = summary.rows.length + 5
  sheet.getCell(total, 1).value = '전체 총합'
  for (const [col, result] of [[2, summary.total.plannedWeight], [3, summary.total.allWeight], [4, summary.total.completedWeight], [5, summary.total.excludedWeight], [6, summary.total.totalWeight]]) {
    const letter = sheet.getColumn(col).letter
    sheet.getCell(total, col).value = { formula: `SUM(${letter}5:${letter}${total - 1})`, result }
  }
  sheet.getCell(total, 7).value = { formula: `IF(F${total}=0,"계산 대상 없음",D${total}/F${total})`, result: summary.total.rate ?? '계산 대상 없음' }
  sheet.mergeCells(total + 2, 1, total + 2, 2)
  sheet.getCell(total + 2, 1).value = '계획 대비 미등록·미배분'
  sheet.getCell(total + 2, 3).value = { formula: `B${total}-C${total}`, result: summary.total.plannedWeight - summary.total.allWeight }
  sheet.getCell(total + 2, 3).numFmt = '0.000%'
  for (let n = 4; n <= total; n++) {
    sheet.getRow(n).height = 28
    sheet.getRow(n).eachCell((cell, col) => {
      cell.font = { name: '맑은 고딕', size: 11, bold: n === 4 || n === total, color: { argb: n === 4 ? 'FFFFFFFF' : 'FF202D40' } }
      cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'left' : 'right' }
      if (n === 4 || n === total) cell.fill = fill(n === 4 ? '385F9D' : 'EEF5FF')
      if (n > 4 && col > 1) cell.numFmt = col === 7 ? '0.0%' : '0.000%'
    })
  }
}

export async function downloadWbsExcel(tasks: readonly Task[], scopeLabel: string) {
  const workbook = buildWbsWorkbook(tasks, scopeLabel)
  const buffer = await workbook.xlsx.writeBuffer()
  const bytes = new Uint8Array(buffer)
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `Fitzza_WBS_${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Keep the blob alive until the browser has had time to begin saving it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

import ExcelJS from 'exceljs'
import type { Task } from '../types'
import {
  COLUMNS, STATUS_COLORS, createWbsView, isWeekend, shortDate, statusLabel, taskProgress,
} from './wbs'

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
  sheet.mergeCells('A5:K5')
  sheet.getCell('A5').value = '가중 진척률 = 완료 가중치 합 ÷ 보류 제외 전체 가중치 합. 가중치: 1 또는 2. 진행률은 상태에서 자동 계산됩니다.'
  sheet.getRow(5).height = 24
  sheet.mergeCells('A6:K6')
  sheet.getCell('A6').value = 'Excel 수정은 이 파일에만 반영됩니다. 대시보드 원본 변경은 GitHub의 작업 JSON에서 진행하세요.'
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
      task.deliverables.map(x => x.label).join(', '), [task.responsible, ...task.assistants].join(', '),
      new Date(`${task.startDate}T00:00:00Z`), new Date(`${task.endDate}T00:00:00Z`), task.weight, statusLabel(task),
      { formula: `IF(OR(J${rowIndex}="보류",J${rowIndex}="on_hold"),"제외",IF(OR(J${rowIndex}="완료",J${rowIndex}="completed"),1,0))`, result: taskProgress(task) ?? '제외' },
    ]
    row.getCell(7).numFmt = row.getCell(8).numFmt = 'yyyy-mm-dd'
    row.getCell(9).numFmt = '0'
    row.getCell(11).numFmt = '0%'
    row.getCell(9).dataValidation = {
      type: 'whole', operator: 'between', formulae: [1, 2], allowBlank: false,
      showErrorMessage: true, errorStyle: 'stop', errorTitle: '가중치 확인', error: '가중치는 1 또는 2만 입력할 수 있습니다.',
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
    const aliases = ['not_started', 'in_progress', 'blocked', 'completed', 'on_hold']
    Object.entries(STATUS_COLORS).forEach(([label, color], index) => {
      const statusCondition = `OR($J9="${label}",$J9="${aliases[index]}")`
      sheet.addConditionalFormatting({ ref: `L9:${lastColumn}${lastRow}`, rules: [{
        type: 'expression', priority: index + 1,
        formulae: [`AND(ISNUMBER($I9),ISNUMBER($G9),ISNUMBER($H9),L$8>=$G9,L$8<=$H9,${statusCondition})`],
        style: { fill: fill(color) },
      }] })
      sheet.addConditionalFormatting({ ref: `J9:J${lastRow}`, rules: [{
        type: 'expression', priority: index + 6, formulae: [statusCondition], style: { fill: fill(color) },
      }] })
    })
  }
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
  return workbook
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

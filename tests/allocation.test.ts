import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error validation CLI uses native JavaScript
import { validateAllocation } from '../scripts/allocation-rules.mjs'

const categories = [
  { category: 'FE', weight: 0.25, requireFullAllocation: true },
  { category: 'BE', weight: 0.30, requireFullAllocation: true },
  { category: 'future', weight: 0.45 },
]
const tasks = [
  { id: 'FE-1', category: 'FE', weight: 0.25, status: '보류' },
  { id: 'BE-1', category: 'BE', weight: 0.1, status: '완료' },
  { id: 'BE-2', category: 'BE', weight: 0.2, status: '시작 전' },
]
test('배분 검증은 보류를 포함하고 미등록 미래 영역과 부동소수 오차를 허용한다', () => {
  assert.deepEqual(validateAllocation(tasks, categories), [])
})
test('누락·초과·누락 영역 전체·알 수 없는 영역은 실패한다', () => {
  assert.match(validateAllocation(tasks.slice(0, 2), categories).join(), /BE/)
  assert.match(validateAllocation(tasks.filter(t => t.category !== 'BE'), categories).join(), /BE/)
  assert.match(validateAllocation([...tasks, { ...tasks[2], id: 'duplicate-weight' }], categories).join(), /BE/)
  assert.match(validateAllocation([...tasks, { ...tasks[2], category: 'unknown' }], categories).join(), /unknown/)
  assert.match(validateAllocation([...tasks, { ...tasks[2], category: 'future', weight: 0.46 }], categories).join(), /exceeded/)
})
test('배분 설정의 합계·중복·플래그 형식을 검증한다', () => {
  for (const invalid of [null, [], [...categories, categories[0]], [{ category: 'A', weight: 0.9 }], [{ category: 'A', weight: 1, requireFullAllocation: 'true' }]]) {
    assert.ok(validateAllocation([], invalid).length)
  }
})

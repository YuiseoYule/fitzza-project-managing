import allocation from '../../data/project-weights.json'
import type { Task } from '../types'
import { calculateProgress } from './wbs'

export function projectSummary(tasks: readonly Task[]) {
  const categories = [...new Set([...allocation.categories.map(item => item.category), ...tasks.map(task => task.category || task.phase)])]
  const rows = categories.map(category => {
    const items = tasks.filter(task => (task.category || task.phase) === category)
    return { category, plannedWeight: allocation.categories.find(item => item.category === category)?.weight ?? 0,
      count: items.length, ...calculateProgress(items) }
  })
  const allocationGaps = rows.filter(row => row.count > 0 && Math.abs(row.plannedWeight - row.allWeight) > 1e-10)
  const unregistered = rows.filter(row => row.count === 0 && row.plannedWeight > 0)
  return { rows, allocationGaps, unregistered, total: { ...calculateProgress(tasks), count: tasks.length,
    plannedWeight: allocation.categories.reduce((sum, item) => sum + item.weight, 0) } }
}

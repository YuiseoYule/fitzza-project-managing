/** Allocation coverage includes held tasks: exclusion applies only to progress. */
export function validateAllocation(tasks, categories) {
  const errors = []
  if (!Array.isArray(categories) || !categories.length || categories.some(item =>
    !item || typeof item.category !== 'string' || !item.category.trim() ||
    typeof item.weight !== 'number' || !Number.isFinite(item.weight) || item.weight <= 0 || item.weight > 1 ||
    (item.requireFullAllocation !== undefined && typeof item.requireFullAllocation !== 'boolean')) ||
    new Set(categories.map(item => item.category)).size !== categories.length ||
    Math.abs(categories.reduce((sum, item) => sum + item.weight, 0) - 1) > 1e-10) {
    return ['project-weights.json: categories must be unique, positive weights must sum to 100%, and requireFullAllocation must be boolean']
  }
  const totals = new Map(categories.map(item => [item.category, 0]))
  for (const task of tasks) {
    const category = task.category || task.phase
    if (!totals.has(category)) errors.push(`${task.id}: unknown allocation category ${category}`)
    else totals.set(category, totals.get(category) + task.weight)
  }
  for (const item of categories) {
    const actual = totals.get(item.category)
    if (actual - item.weight > 1e-10 || (item.requireFullAllocation && Math.abs(actual - item.weight) > 1e-10)) {
      errors.push(`${item.category}: registered weight ${(actual * 100).toFixed(6)}% does not match planned ${(item.weight * 100).toFixed(6)}% (${item.requireFullAllocation ? 'full allocation required' : 'allocation exceeded'})`)
    }
  }
  return errors
}

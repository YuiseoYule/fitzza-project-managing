export function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Missing dates require completed/held history or an explicit pending schedule. */
export function validateTaskRules(tasks) {
  const errors = [], ids = new Map()
  for (const task of tasks) {
    if (ids.has(task.id)) errors.push(`${task.id}: duplicate task id`)
    ids.set(task.id, task)
    if (task.schedulePending && (task.startDate || task.endDate)) {
      errors.push(`${task.id}: pending schedules must have both dates empty`)
    }
    if (!task.startDate || !task.endDate) {
      if (task.startDate || task.endDate || (!task.schedulePending && !['완료', 'completed', '보류', 'on_hold'].includes(task.status))) {
        errors.push(`${task.id}: both dates are required unless completed, held, or explicitly schedulePending`)
      }
    } else if (!isRealDate(task.startDate) || !isRealDate(task.endDate)) {
      errors.push(`${task.id}: invalid calendar date`)
    } else if (task.startDate > task.endDate) {
      errors.push(`${task.id}: startDate must not be after endDate`)
    }
  }
  for (const task of tasks) for (const predecessorId of task.predecessorIds) {
    const predecessor = ids.get(predecessorId)
    if (!predecessor) errors.push(`${task.id}: predecessor ${predecessorId} does not exist`)
    else {
      if (predecessorId === task.id) errors.push(`${task.id}: cannot depend on itself`)
      if (isRealDate(predecessor.endDate) && isRealDate(task.startDate) && predecessor.endDate >= task.startDate) {
        errors.push(`${task.id}: must start after predecessor ${predecessorId} ends`)
      }
    }
  }
  const visiting = new Set(), visited = new Set()
  function visit(id, stack = []) {
    if (visiting.has(id)) { errors.push(`circular dependency: ${[...stack, id].join(' → ')}`); return }
    if (visited.has(id)) return
    visiting.add(id)
    for (const next of ids.get(id).predecessorIds) if (ids.has(next)) visit(next, [...stack, id])
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of ids.keys()) visit(id)
  return errors
}

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import Ajv from 'ajv/dist/2020.js'
import { isRealDate, validateTaskRules } from './task-rules.mjs'

const root = process.cwd(), taskDir = path.join(root, 'data', 'tasks')
const schema = JSON.parse(await readFile(path.join(root, 'schemas', 'task.schema.json'), 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: false }); const validSchema = ajv.compile(schema)
let errors = []; let tasks = []
for (const file of (await readdir(taskDir)).filter(x=>x.endsWith('.json')).sort()) {
  try { const task = JSON.parse(await readFile(path.join(taskDir,file),'utf8')); if (!validSchema(task)) errors.push(`${file}: ${ajv.errorsText(validSchema.errors)}`); else tasks.push(task) }
  catch (error) { errors.push(`${file}: invalid JSON (${error.message})`) }
}
errors.push(...validateTaskRules(tasks))
try {
  const allocation = JSON.parse(await readFile(path.join(root, 'data', 'project-weights.json'), 'utf8'))
  const categories = allocation.categories
  if (!Array.isArray(categories) || !categories.length || categories.some(item => !item || typeof item.category !== 'string' || !item.category || typeof item.weight !== 'number' || !Number.isFinite(item.weight) || item.weight <= 0 || item.weight > 1) ||
      new Set(categories.map(item => item.category)).size !== categories.length || Math.abs(categories.reduce((sum, item) => sum + item.weight, 0) - 1) > 1e-10) {
    errors.push('project-weights.json: categories must be unique and positive weights must sum to 100%')
  }
} catch (error) { errors.push(`project-weights.json: ${error.message}`) }
try {
  const calendar = JSON.parse(await readFile(path.join(root, 'data', 'work-calendar.json'), 'utf8'))
  if (!isRealDate(calendar.startDate) || !isRealDate(calendar.endDate) || calendar.startDate > calendar.endDate ||
      ![0, 0.5, 1].includes(calendar.defaultCapacity) || !calendar.capacities || typeof calendar.capacities !== 'object' || Array.isArray(calendar.capacities)) {
    errors.push('work-calendar.json: invalid calendar range, default capacity or capacities')
  } else for (const [date, capacity] of Object.entries(calendar.capacities)) {
    if (!isRealDate(date) || date < calendar.startDate || date > calendar.endDate || ![0, 0.5, 1].includes(capacity)) {
      errors.push(`work-calendar.json: invalid date or capacity (${date}: ${capacity})`)
    }
  }
} catch (error) { errors.push(`work-calendar.json: ${error.message}`) }
if(errors.length){ console.error('WBS validation failed:\n' + errors.map(e=>`- ${e}`).join('\n')); process.exit(1) }
console.log(`WBS validation passed: ${tasks.length} task(s).`)
const unknownDates = tasks.filter(task => !task.startDate).length
if (unknownDates) console.log(`Note: ${unknownDates} task(s) have unknown/pending dates; their dependency dates cannot be checked.`)

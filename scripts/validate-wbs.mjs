import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import Ajv from 'ajv/dist/2020.js'

const root = process.cwd(), taskDir = path.join(root, 'data', 'tasks')
const schema = JSON.parse(await readFile(path.join(root, 'schemas', 'task.schema.json'), 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: false }); const validSchema = ajv.compile(schema)
let errors = []; let tasks = []
for (const file of (await readdir(taskDir)).filter(x=>x.endsWith('.json')).sort()) {
  try { const task = JSON.parse(await readFile(path.join(taskDir,file),'utf8')); if (!validSchema(task)) errors.push(`${file}: ${ajv.errorsText(validSchema.errors)}`); else tasks.push(task) }
  catch (error) { errors.push(`${file}: invalid JSON (${error.message})`) }
}
const ids = new Map()
for (const task of tasks) { if(ids.has(task.id)) errors.push(`${task.id}: duplicate task id`); ids.set(task.id,task); if (Date.parse(`${task.startDate}T00:00:00Z`) > Date.parse(`${task.endDate}T00:00:00Z`)) errors.push(`${task.id}: startDate must not be after endDate`) }
for (const task of tasks) for (const predecessorId of task.predecessorIds) {
  const predecessor=ids.get(predecessorId)
  if (!predecessor) errors.push(`${task.id}: predecessor ${predecessorId} does not exist`)
  else { if (predecessorId===task.id) errors.push(`${task.id}: cannot depend on itself`); if (Date.parse(`${predecessor.endDate}T00:00:00Z`) >= Date.parse(`${task.startDate}T00:00:00Z`)) errors.push(`${task.id}: must start after predecessor ${predecessorId} ends`) }
}
const visiting=new Set(), visited=new Set()
function visit(id, stack=[]) { if (visiting.has(id)) { errors.push(`circular dependency: ${[...stack,id].join(' → ')}`); return } if(visited.has(id))return; visiting.add(id); for(const next of ids.get(id).predecessorIds) if(ids.has(next)) visit(next,[...stack,id]); visiting.delete(id); visited.add(id) }
for(const id of ids.keys()) visit(id)
if(errors.length){ console.error('WBS validation failed:\n' + errors.map(e=>`- ${e}`).join('\n')); process.exit(1) }
console.log(`WBS validation passed: ${tasks.length} task(s).`)

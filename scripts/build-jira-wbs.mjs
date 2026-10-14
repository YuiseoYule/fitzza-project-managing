import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const exportPath = process.argv[2]
if (!exportPath) throw new Error('Usage: node scripts/build-jira-wbs.mjs <Jira issues export.json>')
const jira = JSON.parse(await readFile(exportPath, 'utf8'))
if (jira.project !== 'FITZZA' || jira.count !== jira.issues?.length) throw new Error('Invalid or incomplete FITZZA Jira export')
const issues = new Map(jira.issues.map(issue => [issue.key, issue]))
const originals = new Map()
for (const file of await readdir(path.join(root, 'data', 'tasks'))) {
  if (file.endsWith('.json')) {
    const task = JSON.parse(await readFile(path.join(root, 'data', 'tasks', file), 'utf8'))
    originals.set(task.id, task)
  }
}

const mapping = new Map()
function assign(feature, lane, issueNo, selection) {
  const key = `FITZZA-${issueNo}`
  if (issues.get(key)?.fields?.issuetype?.name !== 'Subtask') throw new Error(`${key} is not a Jira Subtask`)
  for (const token of selection.split(',')) {
    const [first, last = first] = token.split('-').map(Number)
    for (let n = first; n <= last; n++) {
      const id = `${feature}-${lane}-${String(n).padStart(2, '0')}`
      if (!originals.has(id) || mapping.has(id)) throw new Error(`Missing or duplicate source task: ${id}`)
      mapping.set(id, key)
    }
  }
}
const rules = [
  ['FR-ACC-01', [['FE',9,'1-3'],['FE',10,'4-6'],['BE',11,'1-4'],['BE',12,'5-6'],['BE',13,'7']]],
  ['FR-ACC-03', [['FE',15,'1-2'],['FE',16,'3-4'],['BE',17,'1,4'],['BE',18,'2-3']]],
  ['FR-PRF-01', [['FE',20,'1-3'],['FE',21,'4-5'],['BE',22,'1-2'],['BE',23,'3-4']]],
  ['FR-PRF-02', [['FE',25,'1-3'],['FE',26,'4-5'],['BE',28,'1-2'],['BE',29,'3-4']]],
  ['FR-CAT-01', [['FE',34,'1-2'],['FE',35,'3-4'],['BE',36,'1-2'],['BE',37,'3-5']]],
  ['FR-CAT-02', [['FE',38,'1-4'],['BE',39,'1-4']]],
  ['FR-CAT-03', [['FE',40,'1-3'],['FE',41,'4-7'],['BE',42,'1'],['BE',43,'2-3']]],
  ['FR-REC-01', [['FE',47,'1-3'],['FE',48,'4-8'],['BE',49,'1-2'],['BE',50,'3-4'],['BE',51,'5']]],
  ['FR-REC-02', [['FE',52,'1-4'],['BE',53,'1'],['BE',54,'2-3'],['BE',55,'4']]],
  ['FR-WISH-01', [['FE',63,'1-3'],['FE',64,'4-5'],['BE',65,'1-2'],['BE',66,'3']]],
  ['FR-CART-01', [['FE',67,'1-2'],['FE',68,'3-4'],['BE',69,'1-2'],['BE',70,'3-4']]],
  ['FR-CART-02', [['FE',71,'1-2'],['FE',72,'3-5'],['BE',73,'1-3'],['BE',74,'4-5']]],
  ['FR-CART-03', [['FE',75,'1-2'],['FE',76,'3-5'],['BE',77,'1-2'],['BE',78,'3']]],
  ['FR-ORD-01', [['FE',79,'1-2'],['FE',80,'3-5'],['BE',81,'1'],['BE',82,'2-3']]],
  ['FR-ORD-02', [['FE',83,'1-4'],['BE',84,'1-3'],['BE',85,'4']]],
  ['FR-COM-01', [['FE',93,'1-2'],['FE',94,'3-5'],['BE',95,'1-2'],['BE',96,'3-4']]],
  ['FR-COM-02', [['FE',97,'1-2'],['FE',98,'3-8'],['BE',99,'1-4'],['BE',100,'5-7']]],
  ['FR-COM-03', [['FE',101,'1-4'],['BE',102,'1-2'],['BE',103,'3-4']]],
  ['FR-COM-04', [['FE',104,'1-3'],['FE',105,'4'],['BE',106,'1-2'],['BE',107,'3']]],
  ['FR-COM-05', [['FE',108,'1-6'],['FE',109,'7-8'],['BE',110,'1-3'],['BE',111,'4-7']]],
  ['FR-COM-06', [['FE',112,'1-3'],['FE',113,'4-10'],['FE',114,'11-14'],['BE',115,'1-7'],['BE',116,'8-10']]],
  ['FR-VTO-01', [['FE',122,'1'],['FE',123,'2-3'],['BE',124,'1-4'],['BE',125,'5']]],
  ['FR-VTO-02', [['FE',126,'1-2'],['FE',127,'3-4'],['BE',128,'1'],['BE',129,'2-3']]],
  ['FR-VTO-03', [['FE',130,'1-2'],['FE',131,'3-4'],['BE',132,'1-2'],['BE',133,'3']]],
  ['FR-VTO-04', [['FE',134,'1-2'],['FE',135,'3-5'],['BE',136,'1'],['BE',137,'2-3']]],
  ['FR-NOT-00', [['BE',144,'1-2'],['BE',145,'3-4'],['BE',146,'5']]],
  ['FR-NOT-01', [['FE',147,'1-3'],['BE',148,'1-2']]],
  ['FR-NOT-02', [['FE',149,'1-3'],['BE',150,'1-3']]],
  ['FR-NOT-03', [['FE',151,'1-3'],['BE',152,'1-2']]],
  ['FR-NOT-04', [['FE',153,'1-3'],['BE',154,'1-3']]],
]
for (const [feature, entries] of rules) for (const [lane, number, selection] of entries) assign(feature, lane, number, selection)
for (let n = 1; n <= 20; n++) {
  const id = `CLOUD-${String(n).padStart(3, '0')}`
  const key = `FITZZA-${159 + n}`
  if (!originals.has(id) || issues.get(key)?.fields?.summary !== originals.get(id).title) throw new Error(`Cloud title mismatch: ${id} / ${key}`)
  mapping.set(id, key)
}
const phases = [...originals.keys()].filter(id => id.startsWith('PHASE-')).sort()
const missing = [...originals.keys()].filter(id => !mapping.has(id) && !phases.includes(id))
if (missing.length || phases.length !== 4) throw new Error(`Unmapped source tasks: ${missing.join(', ')}; phase count=${phases.length}`)

const status = { Done: '완료', 'In Progress': '진행 중', 'In Review': '진행 중', 'To Do': '진행 전' }
const storyByFeature = new Map(jira.issues.filter(issue => issue.fields.issuetype.name === 'Story')
  .map(issue => [issue.fields.summary.match(/^(FR-[A-Z]+-\d+)/)?.[1], issue]).filter(([key]) => key))
const members = new Map()
for (const [id, key] of mapping) {
  if (!members.has(key)) members.set(key, [])
  members.get(key).push(originals.get(id))
}
const targetDir = path.join(root, 'data', 'jira-tasks')
await mkdir(targetDir, { recursive: true })
const generated = []
const audit = []
for (const [key, group] of [...members].sort((a, b) => Number(a[0].split('-')[1]) - Number(b[0].split('-')[1]))) {
  const issue = issues.get(key)
  const active = group.filter(task => task.status !== '보류')
  const held = group.filter(task => task.status === '보류')
  const title = issue.fields.summary.replace(/^\[(FE|BE)\]\s*/, '')
  const feature = group[0].id.match(/^(FR-[A-Z]+-\d+)/)?.[1]
  const story = storyByFeature.get(feature)
  const section = story?.fields.summary ?? group[0].section ?? '클라우드'
  const dates = active.flatMap(task => task.startDate && task.endDate ? [task.startDate, task.endDate] : [])
  const starts = active.map(task => task.startDate).filter(Boolean).sort()
  const ends = active.map(task => task.endDate).filter(Boolean).sort()
  const ownerCounts = new Map()
  for (const task of active) ownerCounts.set(task.responsible, (ownerCounts.get(task.responsible) ?? 0) + 1)
  const responsible = [...ownerCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? group[0].responsible
  const assistants = [...new Set(active.flatMap(task => task.assistants))].filter(person => person !== responsible)
  const deliverables = [...new Map(active.flatMap(task => task.deliverables)
    .map(item => [`${item.label}|${item.url}`, item])).values()]
  const category = group[0].category
  if (group.some(task => task.category !== category)) throw new Error(`Mixed categories in ${key}`)
  const weight = active.reduce((sum, task) => sum + task.weight, 0)
  if (weight > 0) {
    generated.push({
      id: key, wbs: key, section, title, phase: feature ?? group[0].phase, category, responsible,
      assistants, startDate: starts[0] ?? '', endDate: ends.at(-1) ?? '',
      ...(dates.length ? {} : { schedulePending: true }), weight, status: status[issue.fields.status.name],
      predecessorIds: [], deliverables,
      notes: `Jira ${key} (${issue.fields.status.name}, ${jira.fetchedAt} 조회). 기존 WBS ${active.length}개 작업의 가중치를 합산했습니다. 원본별 내역: data/jira-weight-audit.json. 날짜는 기존 작업의 최소 시작일·최대 종료일이며 Jira 계획일은 아닙니다.`,
    })
  }
  for (const task of group) audit.push({ sourceTaskId: task.id, sourceTitle: task.title, sourceWeight: task.weight,
    sourceCategory: task.category, sourceStatus: task.status, sourceStartDate: task.startDate, sourceEndDate: task.endDate,
    jiraKey: key, jiraSummary: issue.fields.summary, jiraStatus: issue.fields.status.name,
    activeTaskId: task.status === '보류' ? task.id : key, excludedAsHold: task.status === '보류' })
  for (const task of held) generated.push({ ...task, section, phase: feature ?? task.phase, predecessorIds: [],
    notes: `${task.notes}\nJira ${key}의 일부이지만 기존 보류 가중치를 계산에서 제외하기 위해 별도 행으로 보존합니다. 원래 선행관계는 data/tasks 원본에 있습니다.` })
}
for (const id of phases) {
  const task = originals.get(id)
  generated.push({ ...task, notes: `${task.notes}\nJira Subtask에 대응하지 않아 기존 독립 작업으로 보존합니다.` })
  audit.push({ sourceTaskId: id, sourceTitle: task.title, sourceWeight: task.weight, sourceStatus: task.status,
    sourceCategory: task.category, sourceStartDate: task.startDate, sourceEndDate: task.endDate,
    jiraKey: null, jiraSummary: null, jiraStatus: null, activeTaskId: id, excludedAsHold: task.status === '보류' })
}
const sourceWeight = [...originals.values()].reduce((sum, task) => sum + task.weight, 0)
const activeWeight = generated.reduce((sum, task) => sum + task.weight, 0)
if (Math.abs(sourceWeight - activeWeight) > 1e-10 || audit.length !== originals.size) throw new Error('Weight or source-task count was not preserved')
const unmatched = jira.issues.filter(issue => issue.fields.issuetype.name === 'Subtask' && !members.has(issue.key))
const snapshot = jira.issues.map(issue => ({ key: issue.key, summary: issue.fields.summary,
  type: issue.fields.issuetype.name, status: issue.fields.status.name,
  assignee: issue.fields.assignee?.displayName ?? null, updated: issue.fields.updated }))
const generatedFiles = new Set(generated.map(task => `${task.id}.json`))
const stale = (await readdir(targetDir)).filter(file => file.endsWith('.json') && !generatedFiles.has(file))
if (stale.length) throw new Error(`Generated directory contains stale files; review before removing: ${stale.join(', ')}`)
for (const task of generated) await writeFile(path.join(targetDir, `${task.id}.json`), JSON.stringify(task, null, 2) + '\n')
await writeFile(path.join(root, 'data', 'jira-weight-audit.json'), JSON.stringify({
  source: path.basename(exportPath), fetchedAt: jira.fetchedAt, jiraIssueCount: jira.issues.length,
  sourceTaskCount: originals.size, activeTaskCount: generated.length, sourceWeight, activeWeight,
  rules: 'Feature Stories classify sections; Epics are retained in the snapshot without inferred parent links. Mapped FE/BE Subtasks and 20 Cloud Story leaf issues receive summed source weights. Held source rows remain separate and excluded from progress. Four phase rows remain independent.',
  mappings: audit,
  unmatchedJiraSubtasks: unmatched.map(issue => ({ key: issue.key, summary: issue.fields.summary, status: issue.fields.status.name, reason: '기존 WBS 대응 가중치 없음' })),
  unweightedJiraIssues: jira.issues.filter(issue => !members.has(issue.key)).map(issue => ({
    key: issue.key, type: issue.fields.issuetype.name, summary: issue.fields.summary, status: issue.fields.status.name,
    reason: issue.fields.issuetype.name === 'Subtask' ? '기존 WBS 대응 가중치 없음' : '상위 분류 또는 기존 WBS에 없는 신규 작업; 중복·임의 가중치 방지',
  })),
}, null, 2) + '\n')
await writeFile(path.join(root, 'data', 'jira-issues-snapshot.json'), JSON.stringify({ fetchedAt: jira.fetchedAt, issues: snapshot }, null, 2) + '\n')
console.log(`Jira WBS: ${jira.issues.length} issues, ${members.size} weighted Jira leaf issues, ${generated.length} active rows, ${audit.length} preserved source weights, ${unmatched.length} unmatched Jira Subtasks.`)

import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const input = process.argv[2] ? await readFile(process.argv[2], 'utf8') : await new Promise((resolve,reject)=>{let s='';process.stdin.setEncoding('utf8').on('data',x=>s+=x).on('end',()=>resolve(s)).on('error',reject)})
const lines=input.trim().split(/\r?\n/).filter(Boolean); if(lines.shift()?.trim() !== 'predecessorId,successorId') throw new Error('CSV header must be predecessorId,successorId')
const links=lines.map((line,i)=>{const [predecessorId,successorId,...extra]=line.split(',').map(x=>x.trim());if(!predecessorId||!successorId||extra.length)throw new Error(`Invalid CSV line ${i+2}`);return {predecessorId,successorId}})
const dir=path.join(process.cwd(),'data','tasks');const files=(await readdir(dir)).filter(x=>x.endsWith('.json'));const byId=new Map()
for(const file of files){const task=JSON.parse(await readFile(path.join(dir,file),'utf8'));byId.set(task.id,{file,task})}
for(const {predecessorId,successorId} of links){if(!byId.has(predecessorId)||!byId.has(successorId))throw new Error(`Unknown task in link: ${predecessorId},${successorId}`);const target=byId.get(successorId).task;target.predecessorIds=[...new Set([...target.predecessorIds,predecessorId])].sort()}
for(const {file,task} of byId.values())await writeFile(path.join(dir,file),JSON.stringify(task,null,2)+'\n')
console.log(`Imported ${links.length} dependency link(s). Run npm run validate:data next.`)

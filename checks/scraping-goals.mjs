import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { writeSharedPlanning } from '../server/shared-planning.mjs'
const source = fs.readFileSync(new URL('../src/planning.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { agentScrapingGoal, nextScrapingDay, scrapingProgress } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
const base = { accounts: [], models: [], posts: {}, references: [], captionUses: [], submittedPosts: [] }
assert.equal(agentScrapingGoal(undefined, 'Tony'), 40)
assert.equal(agentScrapingGoal({ '*': 2 }, ' TONY '), 2)
assert.equal(agentScrapingGoal({ '*': 2 }, 'Nouvel agent'), 2)
assert.equal(agentScrapingGoal({ '|tony': 5 }, 'Tony'), 40)
const posts = [1,2].map(n => ({ agent: 'Tony', url: `https://www.threads.com/@tony/post/p${n}`, addedOn: '2026-11-20', quotaDay: '2026-11-20' }))
assert.equal(nextScrapingDay({ ...base, submittedPosts: posts, scrapingGoals: { '*': 2 } }, 'Tony', new Date('2026-11-20T12:00:00Z')), '2026-11-21')
assert.equal(nextScrapingDay({ ...base, submittedPosts: posts }, 'Tony', new Date('2026-11-20T12:00:00Z')), '2026-11-20')
assert.equal(scrapingProgress(posts, { '*': 2 }).counts.get('2026-11-20|tony'), 2)
let writes = 0
const db = { get: async sql => {
  if (sql.startsWith('SELECT')) return { revision: 1, data: { ...base, scrapingGoals: { '*': 2 } } }
  writes++
  return { revision: 2, data: base }
} }
assert.equal((await writeSharedPlanning(db, { revision: 1, data: { ...base, scrapingGoals: { '*': 5 } } }, false))[0], 403)
assert.equal(writes, 0)
assert.equal((await writeSharedPlanning(db, { revision: 1, data: { ...base, scrapingGoals: { '*': 5 } } }, true))[0], 200)
assert.equal((await writeSharedPlanning(db, { revision: 1, data: { ...base, scrapingGoals: { '*': 2 } } }, false))[0], 200)
assert.equal((await writeSharedPlanning(db, { revision: 1, data: { ...base, scrapingGoals: { '*': 0 } } }, true))[0], 400)
assert.equal((await writeSharedPlanning(db, { revision: 1, data: { ...base, scrapingGoals: { '*': 1.5 } } }, true))[0], 400)
assert.equal((await writeSharedPlanning(db, { revision: 1, data: base }, false))[0], 403)
console.log('Objectifs, report au lendemain, validation et droits administrateur : OK')

// Static check (no install needed): every relative import resolves and every named import is exported.
// Run: npm run check:imports
import fs from 'node:fs'
import path from 'node:path'

const files = []
;(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (/\.(jsx?|tsx?)$/.test(f)) files.push(p)
  }
})('src')

function resolve(from, spec) {
  const base = path.resolve(path.dirname(from), spec)
  for (const ext of ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx']) {
    const p = base + ext
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
  }
  return null
}

function exportsOf(file) {
  const s = fs.readFileSync(file, 'utf8')
  const names = new Set()
  if (/export\s+default/.test(s)) names.add('default')
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1])
  for (const m of s.matchAll(/export\s*\{([^}]+)\}/g)) m[1].split(',').forEach((x) => names.add(x.trim().split(/\s+as\s+/).pop()))
  return names
}

let problems = 0
for (const file of files) {
  const s = fs.readFileSync(file, 'utf8')
  for (const m of s.matchAll(/import\s+([^'";]+?)\s+from\s+'(\.[^']+)'/g)) {
    const target = resolve(file, m[2])
    if (!target) {
      problems++
      console.log(`UNRESOLVED  ${file}: ${m[2]}`)
      continue
    }
    if (!/\.(jsx?|tsx?)$/.test(target)) continue
    const have = exportsOf(target)
    const clause = m[1]
    const def = clause.match(/^([A-Za-z0-9_$]+)\s*(,|$)/)
    if (def && !have.has('default')) {
      problems++
      console.log(`NO DEFAULT  ${file}: ${m[2]}`)
    }
    const named = clause.match(/\{([^}]+)\}/)
    if (named) {
      for (const n of named[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
        if (!have.has(n)) {
          problems++
          console.log(`NOT EXPORTED  ${file}: { ${n} } from ${m[2]}`)
        }
      }
    }
  }
}
console.log(`${files.length} files checked, ${problems} problem(s)`)
process.exit(problems ? 1 : 0)

import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd(), 'data', 'benchmark-literature')
const papers = JSON.parse(fs.readFileSync(path.join(root, 'papers.json'), 'utf8'))
const rawCsv = fs.readFileSync(path.join(root, 'results.csv'), 'utf8')
const columns = [
  'id', 'paper_id', 'domain_id', 'task', 'model', 'model_version',
  'dataset', 'dataset_version', 'split', 'metric', 'value', 'unit',
  'uncertainty', 'protocol', 'source_locator', 'source_url',
  'evaluation_origin', 'reviewed_utc',
]
const domains = new Set([
  'dna-genomes', 'rna-transcriptomes', 'proteins-complexes',
  'cells-tissues', 'microbes-communities', 'molecular-interactions',
])
const origins = new Set(['author_reported', 'independent_paper', 'paper_compilation'])

function parseCsv(input) {
  const output = []
  let row = []
  let field = ''
  let quoted = false
  let closedQuote = false
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++ }
      else if (char === '"') { quoted = false; closedQuote = true }
      else field += char
    } else if (closedQuote && char !== ',' && char !== '\n' && char !== '\r') {
      throw new Error('Unexpected character after closing CSV quote')
    } else if (char === '"') {
      if (field) throw new Error(`Unexpected quote at character ${i}`)
      quoted = true
    } else if (char === ',') {
      row.push(field); field = ''; closedQuote = false
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++
      row.push(field); field = ''; closedQuote = false
      if (row.some(Boolean)) output.push(row)
      row = []
    } else field += char
  }
  if (quoted) throw new Error('Unclosed CSV quote')
  if (field || row.length || closedQuote) { row.push(field); output.push(row) }
  return output
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value.replace('Z', '.000Z')
}

function validUrl(value) {
  try { return typeof value === 'string' && ['https:', 'http:'].includes(new URL(value).protocol) }
  catch { return false }
}

const csv = parseCsv(rawCsv)
assert(csv.length > 1, 'Literature CSV is empty')
assert(csv[0].join(',') === columns.join(','), 'Literature CSV header differs from the agreed schema')
assert(Array.isArray(papers), 'papers.json must contain an array')

const paperById = new Map()
const paperDois = new Set()
const paperSources = new Set()
for (const paper of papers) {
  assert(typeof paper.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(paper.id), `Invalid paper slug: ${paper.id}`)
  assert(!paperById.has(paper.id), `Duplicate paper slug: ${paper.id}`)
  assert(typeof paper.title === 'string' && paper.title.trim(), `Missing paper title: ${paper.id}`)
  assert(Number.isInteger(paper.year) && paper.year >= 1900, `Invalid paper year: ${paper.id}`)
  assert(['peer_reviewed', 'preprint'].includes(paper.publication_status), `Invalid publication status: ${paper.id}`)
  assert(typeof paper.version === 'string' && paper.version.trim(), `Missing paper version: ${paper.id}`)
  assert(domains.has(paper.primary_domain), `Unknown paper domain: ${paper.id}`)
  assert(validUrl(paper.source_url), `Invalid paper source URL: ${paper.id}`)
  assert(validDate(paper.retrieved_utc), `Invalid retrieval date: ${paper.id}`)
  const doi = paper.doi?.trim().toLowerCase()
  const source = paper.source_url.replace(/\/+$/, '')
  assert(!(doi && paperDois.has(doi)) && !paperSources.has(source), `Duplicate primary paper source: ${paper.id}`)
  if (doi) paperDois.add(doi)
  paperSources.add(source)
  paperById.set(paper.id, paper)
}

const resultIds = new Set()
const resultKeys = new Set()
const papersWithRows = new Set()
const domainsWithRows = new Set()
for (let i = 1; i < csv.length; i++) {
  const cells = csv[i]
  assert(cells.length === columns.length, `Wrong CSV column count on line ${i + 1}`)
  const row = Object.fromEntries(columns.map((column, index) => [column, cells[index]]))
  assert(row.id && !resultIds.has(row.id), `Missing or duplicate result ID on line ${i + 1}`)
  resultIds.add(row.id)
  const paper = paperById.get(row.paper_id)
  assert(paper, `Unknown paper ID in result ${row.id}`)
  assert(row.domain_id === paper.primary_domain, `Domain mismatch in result ${row.id}`)
  assert(row.source_url === paper.source_url, `Source URL mismatch in result ${row.id}`)
  for (const key of ['task', 'model', 'dataset', 'metric', 'unit', 'source_locator']) {
    assert(row[key].trim(), `Missing ${key} in result ${row.id}`)
  }
  assert(/^Table \w+/i.test(row.source_locator), `Result ${row.id} lacks a table source locator`)
  assert(row.value.trim() && Number.isFinite(Number(row.value)), `Non-numeric printed value in result ${row.id}`)
  assert(origins.has(row.evaluation_origin), `Unknown evaluation origin in result ${row.id}`)
  assert(validDate(row.reviewed_utc), `Invalid review date in result ${row.id}`)
  const key = [row.paper_id, row.task, row.model, row.model_version, row.dataset, row.dataset_version, row.split, row.metric].join('\u0000')
  assert(!resultKeys.has(key), `Duplicate paper/model/test/metric result: ${row.id}`)
  resultKeys.add(key)
  papersWithRows.add(row.paper_id)
  domainsWithRows.add(row.domain_id)
}

for (const id of paperById.keys()) assert(papersWithRows.has(id), `Paper has no numerical results: ${id}`)
for (const domain of domains) assert(domainsWithRows.has(domain), `Domain has no numerical results: ${domain}`)
console.log(`Validated ${papers.length} primary papers and ${csv.length - 1} source-located result rows across ${domainsWithRows.size} domains.`)

import fs from 'node:fs'
import path from 'node:path'

const sourceDir = path.join(process.cwd(), 'data', 'benchmark-literature')
const targetDir = path.join(process.cwd(), 'public', 'benchmark-literature')

for (const filename of ['papers.json', 'results.csv']) {
  const source = path.join(sourceDir, filename)
  const target = path.join(targetDir, filename)
  if (fs.existsSync(source)) {
    fs.mkdirSync(targetDir, { recursive: true })
    fs.copyFileSync(source, target)
  } else if (fs.existsSync(target)) {
    fs.unlinkSync(target)
  }
}

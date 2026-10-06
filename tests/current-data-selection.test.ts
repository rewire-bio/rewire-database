import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { currentDataPatterns } from '../scripts/select-current-data.mjs';
import { isCurrentOnlyEntry } from '../scripts/prepare-benchmark-data.mjs';
const release_id = '2026-10-06-fea06f63ac0e';
function fixture(files: {source: string; destination: string; scope: string}[]) {
  const bytes = Buffer.from(JSON.stringify({ schema_version: 1, release_id, files }));
  return { bytes, lock: { schema_version: 1, repository: 'rewire-bio/rewire-benchmark-data', revision: 'a'.repeat(40), release_id, manifest_sha256: createHash('sha256').update(bytes).digest('hex') } };
}
describe('current-only data sparse checkout', () => {
  it('uses the hydration predicate for current data and historic receipts, excludes old payloads', () => {
    const files = [
      {source:'website/files/lib/generated-benchmark-catalog.ts.gz', destination:'lib/generated-benchmark-catalog.ts',scope:'current'},
      {source:'website/files/data/omics/releases/old.json.gz',destination:'data/omics/releases/old.json',scope:'historical'},
      {source:'website/files/public/omics/releases/old/catalogue.json.gz',destination:'public/omics/releases/old/catalogue.json',scope:'historical'},
      {source:'website/files/public/omics/catalogue.json.gz',destination:'public/omics/catalogue.json',scope:'current'},
    ];
    const {bytes,lock}=fixture(files);
    expect(currentDataPatterns(lock,bytes)).toEqual(['/website/manifest.json', ...files.filter(isCurrentOnlyEntry).map(x=>'/'+x.source).sort()]);
  });
  it('non-cone patterns include exact files without sibling archives or root files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sparse-current-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    try {
      git('init', '-q');
      for (const name of ['website/manifest.json', 'website/files/public/omics/current.json.gz', 'website/files/public/omics/old.json.gz', 'README.md']) {
        fs.mkdirSync(path.dirname(path.join(root,name)), {recursive:true});
        fs.writeFileSync(path.join(root,name), '{}');
      }
      git('add','.');
      git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture');
      const {bytes,lock}=fixture([{source:'website/files/public/omics/current.json.gz',destination:'public/omics/current.json',scope:'current'}]);
      execFileSync('git',['sparse-checkout','set','--no-cone','--stdin'],{cwd:root,input:currentDataPatterns(lock,bytes).join('\n')+'\n'});
      expect(fs.existsSync(path.join(root,'website/manifest.json'))).toBe(true);
      expect(fs.existsSync(path.join(root,'website/files/public/omics/current.json.gz'))).toBe(true);
      expect(fs.existsSync(path.join(root,'website/files/public/omics/old.json.gz'))).toBe(false);
      expect(fs.existsSync(path.join(root,'README.md'))).toBe(false);
    } finally { fs.rmSync(root,{recursive:true,force:true}); }
  });
  it('rejects an unauthenticated manifest before using any paths',()=>{
    const {bytes,lock}=fixture([]);
    expect(()=>currentDataPatterns(lock,Buffer.concat([bytes,Buffer.from(' ')]))).toThrow('SHA-256');
  });
  it.each(['website/files/../secret.gz','website/files/*/record.gz','website/files/a\n/record.gz'])('rejects sparse-pattern injection %s',(source)=>{
    const {bytes,lock}=fixture([{source,destination:'public/omics/catalogue.json',scope:'current'}]);
    expect(()=>currentDataPatterns(lock,bytes)).toThrow('Unsafe');
  });
});

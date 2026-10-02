import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { historicalExportPaths } from '../scripts/omics/export-scope.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it('allows only explicitly receipted historical downloads to be absent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'export-scope-'));
  roots.push(root);
  const current = '2026-09-30-aaaaaaaaaaaa';
  const old = '2026-09-20-bbbbbbbbbbbb';
  for (const id of [current, old]) fs.writeFileSync(path.join(root, `${id}.json`), JSON.stringify({ release_id: id, files: { 'catalogue.json': 'a'.repeat(64) } }));
  const allowed = historicalExportPaths(current, root);
  expect([...allowed].sort()).toEqual([`/omics/releases/${old}/catalogue.json`, `/omics/releases/${old}/manifest.json`]);
  for (const file of [
    `/omics/releases/${current}/catalogue.json`,
    `/omics/releases/${old}/undeclared.csv`,
    '/omics/releases/2026-09-10-cccccccccccc/catalogue.json',
    '/omics/catalogue.json', '/database/model/missing/',
  ]) expect(allowed.has(file)).toBe(false);
});

it('rejects mismatched identities and unsafe filenames in historical receipts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'export-scope-'));
  roots.push(root);
  const id = '2026-09-20-bbbbbbbbbbbb';
  const file = path.join(root, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify({ release_id: 'other', files: {} }));
  expect(() => historicalExportPaths('current', root)).toThrow(/ID mismatch/);
  fs.writeFileSync(file, JSON.stringify({ release_id: id, files: { '../outside': 'a'.repeat(64) } }));
  expect(() => historicalExportPaths('current', root)).toThrow(/Invalid historical filename/);
});

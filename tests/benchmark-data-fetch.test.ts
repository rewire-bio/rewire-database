import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fetchBenchmarkData } from '../scripts/fetch-benchmark-data.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture(existing = true) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'benchmark-fetch-')));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'benchmark-data.lock.json'), JSON.stringify({
    schema_version: 1, repository: 'rewire-bio/rewire-benchmark-data', revision: '1'.repeat(40),
    manifest_sha256: 'a'.repeat(64), release_id: '2026-09-29-06401fd5b220',
  }));
  const directory = path.join(root, 'workbench/benchmark-data');
  if (existing) fs.mkdirSync(directory, { recursive: true });
  const calls: string[][] = [];
  const answers = { topLevel: directory, remote: 'git@github.com:rewire-bio/rewire-benchmark-data.git', status: '' };
  const git = (args: string[]) => {
    calls.push(args);
    if (args.includes('--show-toplevel')) return answers.topLevel;
    if (args.includes('get-url')) return answers.remote;
    if (args.includes('--porcelain')) return answers.status;
    return '';
  };
  return { root, directory, calls, answers, git, run: () => fetchBenchmarkData({ root, git }) };
}

describe('dedicated benchmark data checkout', () => {
  it.each(['workbench', 'checkout', 'dangling checkout'])('rejects a symlinked %s before Git runs', kind => {
    const f = fixture(false);
    const outside = path.join(f.root, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'keep.txt'), 'preserve');
    if (kind === 'workbench') fs.symlinkSync(outside, path.join(f.root, 'workbench'));
    else {
      fs.mkdirSync(path.join(f.root, 'workbench'));
      fs.symlinkSync(kind === 'checkout' ? outside : path.join(f.root, 'missing'), f.directory);
    }
    expect(f.run).toThrow(/symlink/i);
    expect(f.calls).toEqual([]);
    expect(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8')).toBe('preserve');
  });

  it('rejects a directory inside another repository before remote lookup or mutation', () => {
    const f = fixture();
    f.answers.topLevel = f.root;
    expect(f.run).toThrow(/Git root differs/);
    expect(f.calls).toEqual([['-C', f.directory, 'rev-parse', '--show-toplevel']]);
  });

  it('rejects a foreign remote before status or mutations', () => {
    const f = fixture();
    f.answers.remote = 'git@github.com:other/repository.git';
    expect(f.run).toThrow(/origin differs/);
    expect(f.calls.map(args => args[2])).toEqual(['rev-parse', 'remote']);
  });

  it.each([' M records.json', '?? local-notes.txt'])('preserves dirty or untracked work: %s', status => {
    const f = fixture();
    f.answers.status = status;
    expect(f.run).toThrow(/local changes/);
    expect(f.calls.map(args => args[2])).toEqual(['rev-parse', 'remote', 'status']);
  });

  it.each(['git@github.com:rewire-bio/rewire-benchmark-data.git', 'https://github.com/rewire-bio/rewire-benchmark-data.git'])('fetches the strict pin from the expected remote: %s', remote => {
    const f = fixture();
    f.answers.remote = remote;
    expect(f.run()).toBe(f.directory);
    expect(f.calls.slice(3)).toEqual([
      ['-C', f.directory, 'sparse-checkout', 'set', 'website', 'data/omics/releases'],
      ['-C', f.directory, 'fetch', '--depth=1', 'origin', '1'.repeat(40)],
      ['-C', f.directory, 'checkout', '--detach', '1'.repeat(40)],
    ]);
  });

  it('creates a fresh dedicated clone and fetches only the pinned revision', () => {
    const f = fixture(false);
    f.run();
    expect(f.calls[0]).toEqual(['clone', '--no-checkout', '--filter=blob:none', 'git@github.com:rewire-bio/rewire-benchmark-data.git', f.directory]);
    expect(f.calls.at(-1)).toEqual(['-C', f.directory, 'checkout', '--detach', '1'.repeat(40)]);
  });
});

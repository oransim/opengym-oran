import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const version = JSON.parse(readFileSync(path.join(root, 'api/package.json'), 'utf8')).version;
const sha = 'a'.repeat(40);
const goodRun = { head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success' };
const check = (tag, runs, commit = sha) => spawnSync(process.execPath,
  ['scripts/ci/release-check.mjs', tag, commit],
  { cwd: root, input: JSON.stringify({ workflow_runs: runs }), encoding: 'utf8' });

test('a version tag on the exact commit with a successful main CI run is releasable', () => {
  const r = check(`v${version}`, [goodRun]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /passed CI/);
});

test('a release tag that disagrees with the API or frontend version is refused', () => {
  const r = check('v0.0.0', [goodRun]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /version/i);
});

test('a successful run for a different commit, branch, or event cannot authorize a release', () => {
  for (const altered of [
    { head_sha: 'b'.repeat(40) }, { head_branch: 'feature' }, { event: 'pull_request' },
    { status: 'in_progress', conclusion: null }, { conclusion: 'failure' },
  ]) {
    const r = check(`v${version}`, [{ ...goodRun, ...altered }]);
    assert.equal(r.status, 1, JSON.stringify(altered));
  }
});

test('missing or malformed CI evidence fails closed', () => {
  assert.equal(check(`v${version}`, []).status, 1);
  const r = spawnSync(process.execPath, ['scripts/ci/release-check.mjs', `v${version}`, sha],
    { cwd: root, input: '{bad json', encoding: 'utf8' });
  assert.equal(r.status, 1);
});

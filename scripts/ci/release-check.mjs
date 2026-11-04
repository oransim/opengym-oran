#!/usr/bin/env node
// A published release may move GHCR version/latest tags only when its exact commit has a
// successful push-to-main Tests run. The workflow queries GitHub's workflow-runs API and pipes
// the response here. Check the response again instead of trusting the query filters alone.
import { readFileSync } from 'node:fs';

const [tag, sha] = process.argv.slice(2);
const refuse = message => { console.error(`Release refused: ${message}`); process.exit(1); };
if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag || '')) refuse('expected a stable vX.Y.Z tag');
if (!/^[0-9a-f]{40}$/.test(sha || '')) refuse('expected the tagged commit SHA');

const version = tag.slice(1);
for (const file of ['api/package.json', 'frontend/package.json']) {
  let actual;
  try { actual = JSON.parse(readFileSync(file, 'utf8')).version; }
  catch { refuse(`cannot read ${file}`); }
  if (actual !== version) refuse(`${file} version ${actual} does not match ${tag}`);
}

let response;
try { response = JSON.parse(readFileSync(0, 'utf8')); }
catch { refuse('invalid workflow-run response'); }
if (!Array.isArray(response?.workflow_runs)) refuse('workflow-run response has no runs');
const passed = response.workflow_runs.some(run => run?.head_sha === sha
  && run.head_branch === 'main' && run.event === 'push'
  && run.status === 'completed' && run.conclusion === 'success');
if (!passed) refuse(`the tagged commit ${sha} has no successful main Tests run`);
console.log(`${tag} (${sha}) passed CI on main`);

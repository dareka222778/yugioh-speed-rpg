const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const requiredPullRequestBases = [
  'main',
  'classic-engine-foundation',
  'feat/rea-engine-recovery-20261026',
  'feat/work-*',
  'feat/aux-*'
];

function readPullRequestBranches(file) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  const eventIndex = lines.findIndex(line => /^  pull_request:\s*$/.test(line));
  assert.notEqual(eventIndex, -1, `${file} must declare pull_request`);

  const branchesIndex = lines.findIndex((line, index) =>
    index > eventIndex && /^    branches:\s*$/.test(line)
  );
  assert.notEqual(branchesIndex, -1, `${file} must declare pull_request.branches`);

  const branches = [];
  for (let index = branchesIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;
    if (!/^      -\s+/.test(line)) break;
    branches.push(line.replace(/^      -\s+/, '').trim().replace(/^['"]|['"]$/g, ''));
  }
  return branches;
}

for (const workflow of [
  '.github/workflows/card-batch-fast.yml',
  '.github/workflows/engine-validation.yml',
  '.github/workflows/card-batch-admission.yml',
  '.github/workflows/milestone1000.yml'
]) {
  test(`${workflow} runs for isolated Work and auxiliary PR bases`, () => {
    const branches = readPullRequestBranches(workflow);
    for (const expected of requiredPullRequestBases) {
      assert.ok(
        branches.includes(expected),
        `${workflow} is missing pull_request base pattern: ${expected}`
      );
    }
  });
}

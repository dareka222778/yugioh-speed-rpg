'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const runnerPath=path.join(__dirname,'..','scripts','run-tests-isolated.cjs');
const runner=fs.readFileSync(runnerPath,'utf8');

test('isolated test runner remains generic and does not special-case individual suites',()=>{
  assert.doesNotMatch(
    runner,
    /files\.includes\s*\(/,
    'targeted diagnostics belong in the test or a dedicated workflow, not in the shared runner'
  );
  assert.equal(
    (runner.match(/spawnSync\s*\(\s*process\.execPath/g)||[]).length,
    1,
    'the shared runner must execute the selected test set once'
  );
  assert.doesNotMatch(runner,/\bM\d{3}\b/,'mission-specific branches must not accumulate in the shared runner');
});

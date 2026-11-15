'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');

test('diagnostic: capture M232 subtest failure with the spec reporter',()=>{
  const result=spawnSync(process.execPath,[
    '--test','--test-reporter=spec',
    'tests/tagClassicActivationRestrictionsBattlePhase2v2.test.cjs'
  ],{encoding:'utf8',timeout:60000,env:{...process.env,M232_DIAGNOSTIC:'1'}});
  fs.mkdirSync('artifacts',{recursive:true});
  fs.writeFileSync('artifacts/engine-acceptance-failure.tap',
    'M232 SPEC REPORT\n'+(result.stdout||'')+'\nSTDERR\n'+(result.stderr||'')+'\nEXIT '+result.status+'\n');
  assert.notEqual(result.status,0,'the diagnostic child must reproduce the M232 failure');
});

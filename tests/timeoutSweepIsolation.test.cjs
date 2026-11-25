'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTimeoutSweepQueue,runIndependentTimeoutSweeps}=require('../dist/timeoutSweep');

test('a 1v1 queue listing failure does not prevent the 2v2 queue from draining',async()=>{
  const processed=[];
  const failures=await runIndependentTimeoutSweeps([
    createTimeoutSweepQueue('1v1',()=>{throw new Error('duel store unavailable');},()=>assert.fail('1v1 publisher must not run')),
    createTimeoutSweepQueue('2v2',()=>['tag-a','tag-b'],async id=>{processed.push(id);})
  ]);

  assert.deepEqual(processed,['tag-a','tag-b']);
  assert.equal(failures.length,1);
  assert.equal(failures[0].queue,'1v1');
  assert.equal(failures[0].stage,'list');
  assert.match(failures[0].error.message,/duel store unavailable/);
});

test('one broken NPC TagDuel does not stop later TagDuels or the other mode',async()=>{
  const processed=[];
  const failures=await runIndependentTimeoutSweeps([
    createTimeoutSweepQueue('1v1',()=>[{id:'duel-bad'},{id:'duel-good'}],async record=>{
      if(record.id==='duel-bad')throw new Error('corrupt 1v1 snapshot');
      processed.push('1v1:'+record.id);
    }),
    createTimeoutSweepQueue('2v2',()=>[{id:'npc-stuck'},{id:'human-lobby'},{id:'npc-healthy'}],async record=>{
      if(record.id==='npc-stuck')throw new Error('NPC decision limit reached');
      processed.push('2v2:'+record.id);
    })
  ]);

  assert.deepEqual(processed,['1v1:duel-good','2v2:human-lobby','2v2:npc-healthy']);
  assert.deepEqual(failures.map(f=>[f.queue,f.stage,f.index]),[
    ['1v1','publish',0],
    ['2v2','publish',0]
  ]);
  assert.match(failures[1].error.message,/NPC decision limit/);
});

test('an unexpected queue runner rejection is isolated from subsequent queues',async()=>{
  const processed=[];
  const failures=await runIndependentTimeoutSweeps([
    {name:'1v1',run:async()=>{throw new Error('unexpected 1v1 runner failure');}},
    createTimeoutSweepQueue('2v2',()=>['still-drained'],async id=>{processed.push(id);})
  ]);

  assert.deepEqual(processed,['still-drained']);
  assert.equal(failures.length,1);
  assert.equal(failures[0].queue,'1v1');
  assert.equal(failures[0].stage,'runner');
  assert.match(failures[0].error.message,/unexpected 1v1 runner failure/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {planRemaining} = require('../scripts/plan-remaining-families.cjs');

const rec = (passwords, date='2004-01-01', kind='spell') => ({
  names: {en:'Example Card'}, kind, passwords,
  mechanics:[], classifications:[], firstObserved:{ocg:date}
});
const source = (id,desc) => ({id:Number(id),name:'Example Card',desc});

test('only OCG records in cutoff and not already certified are considered',()=>{
  const history=[rec(['12345678']),rec(['11111111']),rec(['87654321'],'2005-01-01')];
  const out=planRemaining(history,{cards:[{id:'11111111'}]},[{data:[source('12345678','Destroy all monsters.')] }]);
  assert.equal(out.remainingHistoricalRecords,1);
  assert.equal(out.matchedIndependentRecords,1);
  assert.equal(out.historicalCount,2);
  assert.equal(out.certifiedCount,1);
});

test('text families are expressly non-certifications and may overlap',()=>{
  const out=planRemaining([rec(['12345678'])],{cards:[]},[{data:[source('12345678','Destroy all monsters. Discard one card.')] }]);
  assert.equal(out.basis,'planning-only-not-certification');
  assert.ok(out.groups.some(x=>x.family==='spell:mass-destruction'));
  assert.ok(out.groups.some(x=>x.family==='spell:hand-discard'));
  assert.ok(out.groups.every(x=>x.examples.every(y=>y.reviewRequired===true)));
});

test('ambiguous identity and absent independent evidence stay blocked',()=>{
  const out=planRemaining([rec([]),rec(['12345678','77777777']),rec(['88888888'])],{cards:[]},[{data:[]}]);
  assert.equal(out.blockedIdentityRecords,2);
  assert.equal(out.missingIndependentRecords,1);
  assert.equal(out.matchedIndependentRecords,0);
});

test('duplicate independent ID is rejected instead of silently overwriting',()=>{
  assert.throws(()=>planRemaining([rec(['12345678'])],{cards:[]},[
    {data:[source('12345678','first')]},{data:[source('12345678','second')]}
  ]),/Duplicate independent card ID/);
});

test('current immutable catalog is treated as certified baseline',()=>{
  const base=path.resolve(__dirname,'..');
  const history=require(path.join(base,'catalog/historical/2004-10-01/cards.json'));
  const manifest=require(path.join(base,'catalog/engine-v7/manifest.json'));
  const current=require(path.join(base,'catalog/engine-v7',manifest.current+'.json'));
  const out=planRemaining(history,current,[]);
  assert.equal(out.certifiedCount,740);
  assert.equal(out.historicalCount,1897);
  assert.equal(out.remainingHistoricalRecords,1157);
  assert.equal(out.matchedIndependentRecords,0);
  assert.equal(out.blockedIdentityRecords+out.missingIndependentRecords,1157);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
test('progress report is internally consistent and anchored to the actual supported-card registry',()=>{
 const out=spawnSync(process.execPath,['scripts/project-progress.cjs','--json'],{encoding:'utf8'});
 assert.equal(out.status,0,out.stderr);
 const report=JSON.parse(out.stdout);
 for(const phase of [report.engine,report.layout]){
  assert.equal(phase.milestones.reduce((n,x)=>n+x.weight,0),100);
  assert.equal(phase.milestones.reduce((n,x)=>n+x.done,0),phase.complete);
  assert.equal(phase.complete+phase.remaining,100);
  assert.ok(phase.milestones.every(x=>x.done>=0&&x.done<=x.weight));
 }
 const {enabledCardIds,engineCard,getEffect}=require('../dist/effectRegistry');
 const {npcs}=require('../dist/npcContent');
 const {getMonsterEffect}=require('../dist/monsterEffects');
 assert.equal(report.playableNPCDecks.length,npcs.length);
 for(const n of report.playableNPCDecks){
  const original=npcs.find(p=>p.id===n.id);
  assert.ok(original);assert.equal(n.main,original.cards.length);assert.equal(n.extra,original.extra.length);
  assert.equal(n.valid,original.cards.length>=20&&original.cards.length<=30&&original.extra.length<=6&&
   [...original.cards,...original.extra].every(id=>!!engineCard(id)&&!!getEffect(id)));
 }
 assert.equal('classicArchive' in report,false);
 assert.equal(report.enabledEngineCards,enabledCardIds.length);
 assert.equal(report.playableEffectMonsters,enabledCardIds.filter(id=>!!getMonsterEffect(id)).length);
});

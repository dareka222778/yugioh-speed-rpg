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
 const {classicCoverage,enabledCardIds}=require('../dist/effectRegistry');
 const {getMonsterEffect}=require('../dist/monsterEffects');
 const cards=classicCoverage();
 assert.equal(report.classicArchive.total,cards.length);
 assert.equal(report.classicArchive.enabled,cards.filter(c=>c.enabled).length);
 assert.equal(report.classicArchive.pending,cards.filter(c=>c.status==='pending').length);
 assert.equal(report.classicArchive.incompatible,cards.filter(c=>c.status==='format-incompatible').length);
 assert.equal(report.classicArchive.total,report.classicArchive.enabled+report.classicArchive.pending+report.classicArchive.incompatible);
 assert.equal(report.enabledEngineCards,enabledCardIds.length);
 assert.equal(report.playableEffectMonsters,enabledCardIds.filter(id=>!!getMonsterEffect(id)).length);
});

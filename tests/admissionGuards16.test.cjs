const {test}=require('node:test'),assert=require('node:assert/strict');
const {monsterDefinitionIssues,getMonsterDefinition}=require('../dist/monsterEffects');
const {buildCardRegistry}=require('../dist/cardRegistry'),r=require('../dist/effectRegistry');
test('M16 admission: continuous effects cannot claim ignored activation costs or once-per-turn gates',()=>{
 const base=getMonsterDefinition('78193831');
 for(const extra of [{cost:{kind:'lp',amount:1000}},{cost:{kind:'tribute',count:1}},{oncePerTurn:true}]){
  const candidate={...base,effect:{...base.effect,...extra}};assert.deepEqual(monsterDefinitionIssues(candidate),['unsupported-continuous-activation']);
  const card={...r.engineCard('78193831'),id:'00000001'};
  const registry=buildCardRegistry([card],{'00000001':{kind:'monsterEffect'}},{},{monster:()=>candidate});assert.equal(registry.statuses.get(card.id).stage,'registered');assert.equal(registry.enabled.length,0);
 }
});
test('M16 admission: passive direct-attack/Trap-negation operations are not ignition commands',()=>{
 for(const kind of ['directAttack','negateTraps'])assert.deepEqual(monsterDefinitionIssues({effect:{trigger:'ignition',operation:{kind}},activation:{policy:'manual',window:'main'}}),['unsupported-monster-mechanic']);
});
test('M16 admission: automatic trigger policy must represent a mandatory or optional decision',()=>{
 for(const policy of ['manual','continuous'])assert.deepEqual(monsterDefinitionIssues({effect:{trigger:'flip',operation:{kind:'draw',count:1}},activation:{policy,window:'flip'}}),['inconsistent-monster-policy']);
 assert.deepEqual(monsterDefinitionIssues({effect:{trigger:'flip',cost:{kind:'lp',amount:2000},operation:{kind:'burn',amount:1000}},activation:{policy:'optional',window:'flip'}}),['unsupported-trigger-cost']);
});
test('M16 admission: every existing certified monster definition remains valid',()=>{
 for(const id of r.enabledCardIds){const d=getMonsterDefinition(id);if(d)assert.deepEqual(monsterDefinitionIssues(d),[],id);}
});

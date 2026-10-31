const {test}=require('node:test'),assert=require('node:assert/strict');
const {runCase}=require('../scripts/card-batch-scenarios.cjs'),batch=require('../catalog/batches/m31-single-targets.json');
const clone=x=>JSON.parse(JSON.stringify(x));
test('Trap inspection excludes a Set Field Spell; Spell inspection includes it without leaking Set backrow types',()=>{
 for(const c of batch.candidates.filter(c=>c.monster.effect.operation.rule.inspectSetAs)){
  const spec=clone(c.cases['target-activation']);spec.fixture.players[1].field={uid:'field',id:'86318356',faceUp:false,setTurn:0};spec.assertions=spec.assertions.filter(a=>a.path?.join('.')!=='choice.targets');spec.assertions.push({path:['choice','targets'],equals:c.monster.effect.operation.rule.kind==='spell'?['response','target','field']:['response','target']});runCase(spec);
 }
});
test('a Graveyard banish preserves the opponent owner and never moves a different entity',()=>{
 const c=batch.candidates.find(c=>c.card.id==='75946257'),spec=clone(c.cases.resolution);spec.fixture.players[1].grave=spec.fixture.players[0].grave;spec.fixture.players[0].grave=[];spec.assertions=[{path:['players',1,'banished'],containsUID:'target'},{path:['players',0,'banished'],length:0}];runCase(spec);
});
test('Dragon Seeker also triggers on an actual Tribute Normal Summon and does not target a non-Dragon',()=>{
 const c=batch.candidates.find(c=>c.card.id==='28563545'),spec=clone(c.cases.resolution);spec.fixture.players[0].monsters=[{uid:'tribute',id:'91152256',faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0}];spec.fixture.players[0].hand=[{uid:'source',id:c.card.id}];spec.actions[0]={actor:'a',match:{kind:'summon',card:'source',position:'atk'}};runCase(spec);
 const invalid=clone(c.cases['no-eligible-target']);invalid.fixture.players[1].monsters=[{uid:'warrior',id:'91152256',faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0}];invalid.assertions.push({path:['players',1,'monsters'],containsUID:'warrior'});runCase(invalid);
});
test('single-card model rejects unsupported combinations and cannot smuggle arbitrary operations',()=>{
 const {singleCardRuleIssues}=require('../dist/singleCardRules'),{monsterDefinitionIssues}=require('../dist/monsterEffects');
 for(const rule of [{from:'grave',controller:'both',action:'destroy'},{from:'backrow',controller:'both',action:'banish'},{from:'grave',controller:'both',action:'shuffleDeck',faceUpOnly:true},{from:'monsters',controller:'both',action:'destroy',race:'Dragon'},{from:'backrow',controller:'both',action:'destroy',kind:'spell',inspectSetAs:'trap'},{from:'grave',controller:'both',action:'banish',code:'eval'}])assert.ok(singleCardRuleIssues(rule).length);
 const definition=clone(batch.candidates[0].monster);definition.effect.cost={kind:'lp',amount:1};assert.ok(monsterDefinitionIssues(definition).length);
});

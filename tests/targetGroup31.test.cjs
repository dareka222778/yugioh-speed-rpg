const {test}=require('node:test'),assert=require('node:assert/strict');
const {runCase}=require('../scripts/card-batch-scenarios.cjs'),batch=require('../catalog/batches/m31-target-groups.json'),e=require('../dist/duelEngine'),{chooseNPC}=require('../dist/duelStore'),integrity=require('../dist/duelIntegrity');
const clone=x=>JSON.parse(JSON.stringify(x));
function atChoice(c,change=()=>{}){const spec=clone(c.cases['target-activation']);change(spec);return runCase(spec).state;}
test('NPC group targeting prefers opposing cards and stops after useful optional targets',()=>{
 for(const c of batch.candidates){let s=atChoice(c),a=chooseNPC(s,'a');assert.ok(a?.kind==='choose');assert.ok(s.players[1][c.monster.effect.operation.rule.from].some(c=>c.uid===a.target));}
 for(const c of batch.candidates.filter(c=>c.monster.activation.policy==='optional')){
  const spec=clone(c.cases['one-target-early-confirm']);spec.fixture.players[1].monsters=spec.fixture.players[1].monsters.slice(0,1);spec.actions=spec.actions.slice(0,-2);spec.assertions=[{path:['choice','source'],equals:'triggerGroup'}];let s=runCase(spec).state;assert.equal(chooseNPC(s,'a').target,'__done__');
  const skip=clone(c.cases['optional-decline']);skip.fixture.players[1].monsters=[];skip.actions=skip.actions.slice(0,2);skip.assertions=[{path:['choice','source'],equals:'triggerOptional'}];s=runCase(skip).state;assert.equal(chooseNPC(s,'a').target,'__skip__');
 }
});
test('NPC and labels do not inspect opponent Set identities when selecting group targets',()=>{
 for(const c of batch.candidates){
  const states=[false,true].map(swap=>atChoice(c,spec=>{const list=spec.fixture.players[1][c.monster.effect.operation.rule.from];for(const ref of list){ref.faceUp=false;if('position'in ref)ref.position='def';}if(swap)[list[0].id,list[1].id]=[list[1].id,list[0].id];}));
  assert.deepEqual(chooseNPC(states[0],'a'),chooseNPC(states[1],'a'));
  for(const s of states)for(const a of e.legalActions(s,'a')){const label=e.actionLabel(s,'a',a);for(const ref of s.players[1][c.monster.effect.operation.rule.from])assert.ok(!label.includes(require('../dist/effectRegistry').engineCard(ref.id).name),'A Set name leaked');assert.ok(!label.includes('Fissura'));}
 }
});
test('restored group selections reject duplicate UIDs, wrong zones and forged options',()=>{
 for(const c of batch.candidates){const s=runCase(c.cases['duplicate-target']).state;integrity.assertDuelState(s);for(const tamper of [x=>x.triggerBuild.selected.targetBindings[0].zone='deck',x=>x.triggerBuild.selected.targets.push('target1'),x=>x.choice.targets.push('forged')]){const corrupt=clone(s);tamper(corrupt);assert.throws(()=>integrity.assertDuelState(corrupt));}}
});
test('a 2v2 group return routes a controlled Fusion to its inactive physical owner Extra Deck',()=>{
 const t=require('../dist/tagDuel'),base=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
 for(const id of ['93920745','28357177']){
  let s=t.createTagDuel([0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[...base,id],extra:['45231177']})),{classic:true,seed:'group-owner-'+id});s.core.turn=3;let source;for(const zone of ['hand','deck']){const n=s.core.players[0][zone].findIndex(c=>c.id===id);if(n>=0){source=s.core.players[0][zone].splice(n,1)[0];break;}}assert.ok(source);const mon=(r,extra={})=>({...r,owner:0,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...extra});s.core.players[0].monsters.push(mon(source,{faceUp:false,position:'def'}));const fusion=s.reserves[2].extra.shift();s.core.players[1].monsters.push(mon(fusion,{properlySummoned:true}));const before=new Map(t.tagInventory(s).map(c=>[c.uid,c.id]));
  const act=(kind,target)=>{const actor=t.tagDecisionMember(s).id,a=t.tagActions(s,actor).find(a=>a.kind===kind&&(kind==='position'?a.card===source.uid&&a.mode==='flip':kind==='choose'?a.target===target:true));assert.ok(a);s=t.stepTagDuel(s,actor,a);};const settle=()=>{for(let i=0;s.core.phase==='response';i++){assert.ok(i<40);act('pass');}};
  act('position');settle();act('choose',source.uid);act('choose',fusion.uid);s=clone(s);t.assertTagDuel(s);act('choose','__done__');settle();const returned=s.reserves[2].extra.find(c=>c.uid===fusion.uid);assert.ok(returned);assert.equal(returned.properlySummoned,undefined);assert.ok(!s.core.players[0].extra.some(c=>c.uid===fusion.uid));assert.ok(!s.core.players[1].extra.some(c=>c.uid===fusion.uid));const after=t.tagInventory(s);assert.equal(after.length,before.size);for(const c of after)assert.equal(before.get(c.uid),c.id);t.assertTagDuel(s);
 }
});
test('group effects include the Field Zone and Greenkappa rechecks its Set requirement',()=>{
 for(const id of ['61831093','71283180']){
  const c=batch.candidates.find(c=>c.card.id===id);assert.ok(c);const spec=clone(c.cases.resolution);spec.fixture.players[1].backrow=spec.fixture.players[1].backrow.filter(c=>c.uid!=='target2');spec.fixture.players[0].field={uid:'target2',id:'86318356',faceUp:false,setTurn:0};spec.assertions=[{path:['players',1,id==='61831093'?'grave':'hand'],containsUID:'target1'},{path:['players',0,id==='61831093'?'grave':'hand'],containsUID:'target2'},{path:['players',0,'field'],equals:null}];runCase(spec);
  if(id==='61831093'){const s=atChoice(c,spec=>{spec.fixture.players[0].field={uid:'publicField',id:'86318356',faceUp:true,setTurn:0,resolved:true};});assert.ok(!s.choice.targets.includes('publicField'));}
 }
});
test('NPC single-card targeting prefers enemy threats without learning unrevealed identities',()=>{
 const singles=require('../catalog/batches/m31-single-targets.json');for(const c of singles.candidates){const spec=clone(c.cases['target-activation']);let s=runCase(spec).state;const a=chooseNPC(s,'a');assert.equal(a.kind,'choose');if(c.monster.effect.operation.rule.from!=='grave')assert.ok(s.players[1][c.monster.effect.operation.rule.from].some(c=>c.uid===a.target));
  if(c.monster.effect.operation.rule.from==='backrow'){const hidden=s.players[1].backrow.map(x=>x.id);s.players[1].backrow.forEach((x,i)=>x.id=hidden[(i+1)%hidden.length]);assert.deepEqual(chooseNPC(s,'a'),a);}
 }
});

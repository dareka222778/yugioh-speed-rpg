const {test}=require('node:test'),assert=require('node:assert/strict');
const {conditionalBatch30:cards,conditionalEffects30:effects,conditionalMonsters30:monsters}=require('../dist/conditionalBatch30');
const {conditionalTargets}=require('../dist/conditionalDestruction');
const {effectDefinitionIssues}=require('../dist/effectDefinitions');
const {getDestructionModel,getActivationModel}=require('../dist/effectModels');
const {destructionTargets}=require('../dist/effectOperations');
const {namedCard}=require('../dist/cardIdentity');
const {resolveClassicSpell}=require('../dist/classicEffects');
const r=require('../dist/effectRegistry');
const mon=(uid,id,other={})=>({uid,id,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...other});
const card=(uid,id,other={})=>({uid,id,faceUp:true,setTurn:0,...other});
function state(){return {turn:4,players:[{monsters:[mon('own','91152256')],backrow:[],field:null,banished:[]},{monsters:[mon('enemy','89631139')],backrow:[],field:null,banished:[]} ]};}
function ready(id){const s=state();if(['63391643','02314238'].includes(id))s.players[0].monsters.push(mon('magician','46986414'));
 if(id==='02314238')s.players[1].backrow.push(card('enemyBackrow','19159413',{faceUp:false}));
 if(id==='38411870')s.players[0].monsters.push(mon('extra1','91152256'))&&s.players[1].monsters.push(mon('extra2','91152256'));
 if(id==='28121403')s.players[1].backrow.push(card('equip','01435851',{resolved:true,equippedTo:'enemy'}));
 if(id==='20727787')s.players[1].backrow.push(card('equip','01435851',{resolved:true,equippedTo:'enemy'}));
 if(id==='61044390')s.players[0].banished=Array.from({length:7},(_,i)=>({uid:'banished'+i,id:'91152256'}));
 return s;}
test('M30 historical cohort is unique, available by September 2004 and definitions compile strictly',()=>{
 const historical=require('../catalog/historical/2004-10-01/cards.json');
 assert.equal(cards.length,10);assert.equal(new Set(cards.map(c=>c.id)).size,10);
 for(const c of cards){const h=historical.find(x=>x.konamiId===c.konamiId);assert.ok(h,c.englishName);assert.ok(h.passwords.includes(c.id),c.englishName);assert.ok(h.firstObserved.world<='2004-09-30');assert.equal(h.names.en,c.englishName);assert.deepEqual(effectDefinitionIssues(effects[c.id]),[]);assert.ok(['registered','validated'].includes(r.getCardStatus(c.id).stage));}
});
for(const [id,next]of [['13839120','Green Gadget'],['41172955','Red Gadget'],['86445415','Yellow Gadget']]){
 test('M30 Gadget '+id+' exactly offers its next named Gadget on Normal or Special Summon',()=>{
  const d=monsters[id],e=effects[id];assert.equal(e.kind,'monsterEffect');assert.equal(d.effect.trigger,'onSummon');assert.deepEqual(d.effect.summons,['normal','special']);assert.deepEqual(d.effect.operation,{kind:'searchFiltered',rule:{from:'deck',filter:{name:next}}});assert.equal(d.activation.policy,'optional');assert.equal(d.activation.window,'summon');assert.ok(namedCard(cards.find(c=>c.englishName===next),next));
 });
}
for(const c of cards.filter(c=>c.kind!=='monster')){
 test('M30 '+c.englishName+' activation, model and targets',()=>{
  const e=effects[c.id],s=ready(c.id);assert.equal(e.kind,'conditionalDestruction');const targets=conditionalTargets(s,0,e,'source');assert.ok(targets.length,c.englishName);assert.equal(getActivationModel(e).speed,c.kind==='trap'?2:1);
  if(e.zone==='monsters'){
   const model=getDestructionModel(e);assert.ok(model);assert.equal(model.destination,'grave');
   if(e.scope==='selected'){assert.ok(targets.includes('enemy'));assert.ok(!targets.includes('own'));assert.ok(destructionTargets(s,0,model,'enemy').includes('enemy'));assert.ok(!destructionTargets(s,0,model,'own').length);}
   else {assert.deepEqual(targets,['']);assert.ok(destructionTargets(s,0,model).length);}
  }else assert.deepEqual(targets,['']);
 });
 test('M30 '+c.englishName+' unavailable when requirement or target absent',()=>{
  const e=effects[c.id],s=state();assert.deepEqual(conditionalTargets(s,0,e,'source'),e.zone==='monsters'&&!e.requiredName&&!e.minFieldMonsters&&!e.minBanished&&!e.equipped?e.scope==='selected'?['enemy']:['']:[]);
 });
}
test('M30 Dark Magician must be face-up and controlled by the activator',()=>{
 for(const id of ['63391643','02314238']){
  const s=ready(id);s.players[0].monsters.find(m=>m.uid==='magician').faceUp=false;assert.deepEqual(conditionalTargets(s,0,effects[id]),[]);
  s.players[0].monsters=s.players[0].monsters.filter(m=>m.uid!=='magician');s.players[1].monsters.push(mon('opMagician','46986414'));assert.deepEqual(conditionalTargets(s,0,effects[id]),[]);
 }
});
test('M30 Needle Ceiling counts hidden monsters but destroys only face-up ones',()=>{
 const s=ready('38411870');s.players[1].monsters[1].faceUp=false;assert.deepEqual(conditionalTargets(s,0,effects['38411870']),['']);const m=getDestructionModel(effects['38411870']);assert.ok(!destructionTargets(s,0,m).includes('extra2'));s.players[0].monsters.pop();assert.deepEqual(conditionalTargets(s,0,effects['38411870']),[]);
});
test('M30 banished count belongs to caster, not opponent',()=>{
 const s=state();s.players[1].banished=Array.from({length:7},(_,i)=>({uid:''+i,id:'91152256'}));assert.deepEqual(conditionalTargets(s,0,effects['61044390']),[]);s.players[0].banished=s.players[1].banished;assert.deepEqual(conditionalTargets(s,0,effects['61044390']),['']);
});
test('M30 equipped monsters must have a resolved face-up Equip, not merely facedown backrow',()=>{
 const s=ready('28121403'),b=s.players[1].backrow[0];assert.deepEqual(conditionalTargets(s,0,effects['28121403']),['']);b.faceUp=false;assert.deepEqual(conditionalTargets(s,0,effects['28121403']),[]);b.faceUp=true;b.resolved=false;assert.deepEqual(conditionalTargets(s,0,effects['28121403']),[]);
});
test('M30 Disarmament only sees face-up Equip Card kinds',()=>{
 const s=ready('20727787');assert.deepEqual(conditionalTargets(s,0,effects['20727787']),['']);s.players[1].backrow[0].faceUp=false;assert.deepEqual(conditionalTargets(s,0,effects['20727787']),[]);s.players[0].backrow.push(card('ordinary','19159413'));assert.deepEqual(conditionalTargets(s,0,effects['20727787']),[]);
});
test('M30 Soul Taker can only select face-up opponent monsters and has conditional post-heal',()=>{
 const e=effects['81510157'],s=state();s.players[1].monsters[0].faceUp=false;assert.deepEqual(conditionalTargets(s,0,e),[]);assert.equal(e.opponentGainOnDestroy,1000);assert.equal(getDestructionModel(e).controller,'opponent');
});
test('M30 schema rejects malformed conditions rather than granting executable privileges',()=>{
 assert.ok(effectDefinitionIssues({...effects['61044390'],minBanished:-1}).length);assert.ok(effectDefinitionIssues({...effects['20727787'],zone:'secret'}).length);assert.ok(effectDefinitionIssues({...effects['81510157'],scope:'private'}).length);
});
for(const c of cards.filter(c=>c.kind!=='monster')){
 test('M30 '+c.englishName+' resolves an actual effect on field zones without enabling distribution',()=>{
  const s=ready(c.id),logs=[],before=s.players[1].lp=4000;
  s.players.forEach(p=>{p.grave=[];p.lp??=4000;});
  const service={attack:()=>3000,note:(_s,n)=>logs.push(n),finish:()=>{},checkLP:()=>{},destroy:(_s,uid)=>{
   for(const p of s.players){const i=p.monsters.findIndex(m=>m.uid===uid);if(i>=0){const [m]=p.monsters.splice(i,1);p.grave.push({uid:m.uid,id:m.id});return;}}
  }};
  const target=effects[c.id].scope==='selected'?'enemy':undefined;
  const resolved=resolveClassicSpell(s,{kind:'spell',actor:0,card:'source',id:c.id,target},service);
  assert.equal(resolved,true);assert.ok(logs.length);
  if(c.id==='02314238')assert.ok(s.players[1].grave.some(x=>x.uid==='enemyBackrow'));
  else if(c.id==='20727787')assert.ok(s.players[1].grave.some(x=>x.uid==='equip'));
  else {assert.ok(s.players[1].grave.some(x=>x.uid==='enemy'),c.englishName);}
  if(c.id==='81510157')assert.equal(s.players[1].lp,before+1000);
 });
}

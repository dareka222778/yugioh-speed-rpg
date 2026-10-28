const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const e=require('../dist/duelEngine'),r=require('../dist/effectRegistry'),
 {historicalFusionBatch10:cards}=require('../dist/historicalFusionBatch10'),
 reviews=require('../docs/evidence/mission10-individual-reviews.json'),
 {definitionFingerprint}=require('../dist/cardRegistry'),{getEffectModel}=require('../dist/effectModels'),
 {cardDistributionAllowed}=require('../dist/cardReleasePolicy'),
 {starterContents}=require('../dist/cardCatalog'),{duelCards,assertDuelState}=require('../dist/duelIntegrity');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id)),clone=s=>JSON.parse(JSON.stringify(s)),
 monster=(uid,id)=>({uid,id,owner:0,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
const game=()=>{const s=e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],undefined,0,{randomSeed:'10'.repeat(32)});s.turn=3;s.players[0].hand=[];s.players[1].hand=[];return s;};
function fixture(card){
 const s=game(),hand=[{uid:'poly',id:'24094653'}],field=[];
 s.players[0].extra=[{uid:'fusion',id:card.id}];
 for(let i=0;i<card.fusion.length;i++){
  const id=card.fusion[i],material={uid:'mat'+i,id};
  if(r.getPlayableCard(id)?.fusion)field.push({...monster(material.uid,id),properlySummoned:true});
  else if(!hand.some(c=>c.uid.startsWith('mat')))hand.push(material);
  else field.push(monster(material.uid,id));
 }
 s.players[0].hand=hand;s.players[0].monsters=field;return s;
}
function act(s,who,kind,pred=()=>true){const a=e.legalActions(s,who).find(a=>a.kind===kind&&pred(a));assert.ok(a,'Missing '+kind+' action');return e.step(s,who,a);}
function settle(s){for(let i=0;s.phase==='response';i++){assert.ok(i<30);s=act(clone(s),s.players[e.decisionPlayer(s)].id,'pass');}return s;}
const results=[];
for(const card of cards){
 const review=reviews.find(x=>x.id===card.id),fingerprint=definitionFingerprint(card,r.getEffect(card.id),{model:getEffectModel}),
  result={id:card.id,fingerprint,passed:[],failed:[]};results.push(result);
 function scenario(name,fn){test('mission10 '+card.id+' '+card.englishName+': '+name,()=>{try{fn();result.passed.push(name);}catch(err){result.failed.push(name);throw err;}});}
 scenario('identity',()=>{
  assert.ok(review);assert.equal(card.konamiId,review.konamiId);assert.equal(card.monsterType,'fusion');assert.equal(r.getEffect(card.id).kind,'fusion');
  for(const field of ['level','atk','defense','race','attribute'])assert.equal(card[field],review.primaryFacts[field]);
  assert.deepEqual(card.fusion,review.recipeIds);assert.ok(card.fusion.length>=2&&card.fusion.length<=3);
  assert.ok(review.primaryFacts.ocgDate<='2004-09-30');assert.equal(fingerprint,review.mechanicalFingerprint);
  assert.equal(r.getCardStatus(card.id).stage,'certified');assert.equal(cardDistributionAllowed(card.id),false);
  for(const material of card.fusion)assert.ok(r.getPlayableCard(material),'Uncertified Fusion material: '+material);
 });
 scenario('mechanic',()=>{
  let s=fixture(card);const before=duelCards(s).map(c=>[c.uid,c.id]).sort();
  s=settle(act(s,'a','fusion',a=>a.position==='atk'));
  const monster=s.players[0].monsters.find(m=>m.uid==='fusion');assert.ok(monster);
  assert.equal(monster.id,card.id);assert.equal(monster.properlySummoned,true);assert.equal(monster.owner,0);
  assert.equal(e.atk(monster,s),card.atk);assert.equal(e.def(monster,s),card.defense);
  assert.deepEqual(s.players[0].grave.map(c=>c.uid).sort(),['poly',...card.fusion.map((_,i)=>'mat'+i)].sort());
  assert.equal(s.players[0].extra.length,0);assert.deepEqual(duelCards(s).map(c=>[c.uid,c.id]).sort(),before);assertDuelState(clone(s));
 });
 scenario('negative',()=>{
  const s=fixture(card),replacement=['91152256','48305365'].find(id=>!card.fusion.includes(id));
  s.players[0].hand.find(c=>c.uid.startsWith('mat')).id=replacement;
  assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='fusion'));
  assert.throws(()=>e.createDuel([{id:'a',name:'A',cards:[card.id,...basic.slice(1)]},{id:'b',name:'B',cards:basic}]));
  const bad=fixture(card);bad.players[0].grave=bad.players[0].monsters.map(m=>({uid:m.uid,id:m.id}));bad.players[0].monsters=[];bad.players[0].hand=[{uid:'poly',id:'24094653'}];
  assert.ok(!e.legalActions(bad,'a').some(a=>a.kind==='fusion'));
 });
 scenario('replay',()=>{
  const s=fixture(card),a=e.legalActions(s,'a').find(a=>a.kind==='fusion'&&a.position==='def');assert.ok(a);
  const next=e.step(s,'a',a);assert.deepEqual(clone(next),clone(e.step(clone(s),'a',a)));
  assert.deepEqual(clone(settle(next)),clone(settle(clone(next))));
  assert.equal(next.resolverVersion,'engine-v7');assert.equal(next.catalogRevision,s.catalogRevision);
 });
 scenario('zone-capacity',()=>{
  if(card.fusion.some(id=>r.getPlayableCard(id)?.fusion)){
   const s=fixture(card);while(s.players[0].monsters.length<3)s.players[0].monsters.push(monster('f'+s.players[0].monsters.length,'91152256'));
   assertDuelState(clone(s));
   assert.ok(e.legalActions(s,'a').some(a=>a.kind==='fusion'),'Properly summoned Fusion material can be used from a full field');
   const withoutMaterial=clone(s);withoutMaterial.players[0].monsters=withoutMaterial.players[0].monsters.filter(m=>!card.fusion.includes(m.id));
   assert.ok(!e.legalActions(withoutMaterial,'a').some(a=>a.kind==='fusion'));
   const next=settle(act(s,'a','fusion'));assert.equal(next.players[0].monsters.length,3);assertDuelState(clone(next));return;
  }
  const s=fixture(card),inField=s.players[0].monsters.splice(0);
  s.players[0].hand.push(...inField.map(m=>({uid:m.uid,id:m.id})));
  s.players[0].monsters=[monster('f1','91152256'),monster('f2','48305365'),monster('f3','48305365')];
  assertDuelState(clone(s));assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='fusion'));
  const shifted=s.players[0].hand.splice(s.players[0].hand.findIndex(c=>c.uid==='mat1'),1)[0];
  s.players[0].monsters[0]=monster(shifted.uid,shifted.id);
  assert.ok(e.legalActions(s,'a').some(a=>a.kind==='fusion'));
  const after=settle(act(s,'a','fusion'));assert.equal(after.players[0].monsters.length,3);assertDuelState(clone(after));
 });
 scenario('counter-negation',()=>{
  let s=fixture(card);s.players[1].hand=[{uid:'discard',id:'91152256'}];
  s.players[1].backrow=[{uid:'jam',id:'77414722',faceUp:false,setTurn:0}];
  s=act(s,'a','fusion');s=settle(act(s,'b','trap',a=>a.card==='jam'));
  assert.equal(s.players[0].extra.length,1);
  for(let i=0;i<card.fusion.length;i++)assert.ok([...s.players[0].hand,...s.players[0].monsters].some(x=>x.uid==='mat'+i));
  assert.ok(s.players[0].grave.some(c=>c.uid==='poly'));assert.ok(!s.players[0].monsters.some(m=>m.id===card.id));assertDuelState(clone(s));
 });
}
after(()=>{fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/certification-executions-fusion10.json',JSON.stringify(results,null,2)+'\n');});

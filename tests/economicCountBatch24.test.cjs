const {test}=require('node:test');
const assert=require('node:assert/strict');
const duel=require('../dist/duelEngine');
const registry=require('../dist/effectRegistry');
const {economicCountBatch24,economicCountEffects24}=require('../dist/economicCountBatch24');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {getEffectModel}=require('../dist/effectModels');
const {cardCertifications}=require('../dist/cardCertifications');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const {economicOperationIssues}=require('../dist/economicOperations');
const history=require('../catalog/historical/2004-10-01/cards.json');
const deck=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id)=>({uid,id});
const mon=(uid,id,faceUp=true,position='atk')=>({uid,id,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
function game(){
 const s=duel.createDuel([{id:'a',name:'A',cards:deck},{id:'b',name:'B',cards:deck}],undefined,0,{randomSeed:'24'.repeat(32)});
 s.turn=3;s.players.forEach(p=>{p.hand=[];p.grave=[];p.backrow=[];p.monsters=[];p.field=null;});return s;
}
function settle(s){for(let i=0;s.phase==='response';i++){assert.ok(i<30,'bounded chain');s=duel.step(s,s.players[duel.decisionPlayer(s)].id,{kind:'pass'});}return s;}
function cast(s,id){
 const c=economicCountBatch24.find(c=>c.id===id);assert.ok(c);
 if(c.kind==='spell')s.players[0].hand=[ref('economic',id)];
 else s.players[0].backrow=[{...ref('economic',id),faceUp:false,setTurn:s.turn-1}];
 const kind=c.kind==='spell'?'spell':'trap';
 const action=duel.legalActions(s,'a').find(a=>a.kind===kind&&a.card==='economic');
 assert.ok(action,`${c.englishName}: legal ${kind} action`);
 const before=JSON.stringify(s);const next=settle(duel.step(s,'a',action));
 assert.equal(JSON.stringify(s),before,'source state preserved');
 return next;
}
test('M24 historical cutoff, source, unique certificates and no public distribution',()=>{
 assert.equal(economicCountBatch24.length,5);
 for(const c of economicCountBatch24){
  const h=history.find(v=>v.passwords.includes(c.id));assert.ok(h,c.englishName);
  assert.equal(h.konamiId,c.konamiId);assert.equal(h.names.en,c.englishName);
  assert.ok(h.firstObserved.world<='2004-09-30');
  assert.equal(registry.getCardStatus(c.id).stage,'certified');
  assert.equal(cardDistributionAllowed(c.id),true);
  assert.equal(cardCertifications[c.id].fingerprint,definitionFingerprint(c,economicCountEffects24[c.id],{model:getEffectModel}));
 }
});
test('M24 Restructer Revolution only counts opposing hand at resolution',()=>{
 const s=game();s.players[0].lp=3000;s.players[1].lp=3400;
 s.players[1].hand=[ref('h1','76812113'),ref('h2','76812113'),ref('h3','76812113')];
 const result=cast(s,'99518961');assert.deepEqual(result.players.map(p=>p.lp),[3000,2800]);
});
test('M24 Secret Barrel counts opposing hand, monsters, backrow and Field Zone, regardless of face',()=>{
 const s=game();s.players[1].hand=[ref('h1','76812113'),ref('h2','76812113')];
 s.players[1].monsters=[mon('m1','76812113'),mon('m2','76812113',false)];
 s.players[1].backrow=[{...ref('b1','08842266'),faceUp:false,setTurn:1}];
 s.players[1].field={...ref('f1','86318356'),faceUp:true,setTurn:1};
 const result=cast(s,'27053506');assert.equal(result.players[1].lp,4000-6*200);
});
test('M24 Cemetary Bomb counts only opposing Graveyard, including spells',()=>{
 const s=game();s.players[0].grave=[ref('self','99518961')];
 s.players[1].grave=[ref('g1','76812113'),ref('g2','08842266'),ref('g3','76812113')];
 const result=cast(s,'51394546');assert.equal(result.players[1].lp,3700);
});
test('M24 Gift of The Mystical Elf counts both fields and heals activating player',()=>{
 const s=game();s.players[0].lp=2400;s.players[0].monsters=[mon('a1','76812113')];
 s.players[1].monsters=[mon('b1','76812113'),mon('b2','76812113',false)];
 const result=cast(s,'98299011');assert.deepEqual(result.players.map(p=>p.lp),[3300,4000]);
});
test('M24 Solar Ray requires own face-up LIGHT monsters, not enemy/facedown LIGHT',()=>{
 const s=game();s.players[0].monsters=[mon('light','60694662'),mon('hidden','60694662',false),mon('dark','83011277')];
 s.players[1].monsters=[mon('enemy-light','60694662')];
 const result=cast(s,'44472639');assert.equal(result.players[1].lp,3400);
});
test('M24 invalid multiplied operations are rejected without broken state',()=>{
 for(const op of [
  {kind:'scaledLP',direction:'damage',recipient:'opponent',amountPerCard:0,selectors:[{zone:'hand',player:'opponent'}]},
  {kind:'scaledLP',direction:'gain',recipient:'self',amountPerCard:200,selectors:[{zone:'deck',player:'both'}]},
  {kind:'scaledLP',direction:'damage',recipient:'opponent',amountPerCard:200,selectors:[{zone:'hand',player:'both',attribute:'LIGHT'}]}
 ])assert.ok(economicOperationIssues([op]).length);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const duel=require('../dist/duelEngine');
const registry=require('../dist/effectRegistry');
const {economicBatch23,economicEffects23}=require('../dist/economicBatch23');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {getEffectModel}=require('../dist/effectModels');
const {cardCertifications}=require('../dist/cardCertifications');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const history=require('../catalog/historical/2004-10-01/cards.json');
const deck=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id)=>({uid,id});

function game(){
 const s=duel.createDuel([{id:'a',name:'A',cards:deck},{id:'b',name:'B',cards:deck}],undefined,0,{randomSeed:'23'.repeat(32)});
 s.turn=3;s.players.forEach(p=>{p.hand=[];p.grave=[];p.backrow=[];p.monsters=[];});return s;
}
function settle(s){for(let i=0;s.phase==='response';i++){assert.ok(i<30,'chain must resolve');s=duel.step(s,s.players[duel.decisionPlayer(s)].id,{kind:'pass'});}return s;}
function activate(s,id,choice){
 s.players[0].hand=[ref('spell',id)];
 const a=duel.legalActions(s,'a').find(a=>a.kind==='spell'&&a.card==='spell'&&(choice===undefined||a.target===choice));
 assert.ok(a,`legal action for ${id}/${choice}`);
 const before=JSON.stringify(s);
 s=settle(duel.step(s,'a',a));assert.equal(JSON.stringify(JSON.parse(before)),before,'input state unchanged');
 return s;
}
for(const card of economicBatch23){
 test(`M23 ${card.englishName}: identity, cutoff and exact certification fingerprint`,()=>{
  const h=history.find(v=>v.passwords.includes(card.id));assert.ok(h);assert.equal(h.konamiId,card.konamiId);assert.equal(h.names.en,card.englishName);
  assert.ok(h.firstObserved.tcg<='2004-09-30'||h.firstObserved.ocg<='2004-09-30');
  assert.equal(registry.getCardStatus(card.id).stage,'certified');assert.equal(cardDistributionAllowed(card.id),false);
  assert.equal(cardCertifications[card.id].fingerprint,definitionFingerprint(card,economicEffects23[card.id],{model:getEffectModel}));
 });
 test(`M23 ${card.englishName}: legal action and preservation across serialization`,()=>{
  const s=game();s.players[0].hand=[ref('spell',card.id)];
  const actions=duel.legalActions(s,'a').filter(a=>a.kind==='spell'&&a.card==='spell');
  assert.ok(actions.length);assert.deepEqual(JSON.parse(JSON.stringify(s)),s);
  for(const a of actions){const before=JSON.stringify(s);settle(duel.step(s,'a',a));assert.equal(JSON.stringify(s),before);}
 });
}
test('M23 Mooyan Curry: choice of player, no hardcoded self healing',()=>{
 for(const [option,expected]of [['__choice_0__',[2700,3300]],['__choice_1__',[2500,3500]]]){
  const s=game();s.players[0].lp=2500;s.players[1].lp=3300;
  const after=activate(s,'58074572',option);assert.deepEqual(after.players.map(p=>p.lp),expected);
 }
});
test('M23 Poison of the Old Man: independently selectable healing and burn',()=>{
 for(const [option,expected]of [['__choice_0__',[3700,3300]],['__choice_1__',[2500,2500]]]){
  const s=game();s.players[0].lp=2500;s.players[1].lp=3300;
  const after=activate(s,'08842266',option);assert.deepEqual(after.players.map(p=>p.lp),expected);
 }
});
test('M23 Quick-Play spell has speed 2 and cannot activate during the same turn it was Set',()=>{
 const s=game();s.players[0].backrow=[{uid:'set-poison',id:'08842266',faceUp:false,setTurn:s.turn}];
 assert.equal(duel.legalActions(s,'a').some(a=>a.kind==='spell'&&a.card==='set-poison'),false);
 s.players[0].backrow[0].setTurn=s.turn-1;
 assert.ok(duel.legalActions(s,'a').some(a=>a.kind==='spell'&&a.card==='set-poison'));
});
test('M23 rejects fabricated economic options',()=>{
 const s=game();s.players[0].hand=[ref('spell','08842266')];
 assert.equal(duel.legalActions(s,'a').some(a=>a.target==='__choice_99__'),false);
 assert.throws(()=>duel.step(s,'a',{kind:'spell',card:'spell',target:'__choice_99__'}));
});

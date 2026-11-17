const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDuel,legalActions,step}=require('../dist/duelEngine');
const {starterContents}=require('../dist/cardCatalog');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id)=>({uid,id});
const monster=(uid,id,opts={})=>({uid,id,owner:0,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...opts});
function game(){const s=createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);s.turn=3;return s;}
function use(s,actor,kind,pred=()=>true){const a=legalActions(s,actor).find(a=>a.kind===kind&&pred(a));assert.ok(a,`missing ${kind}: ${JSON.stringify(legalActions(s,actor))}`);return step(s,actor,a);}
test('Pot of Greed and Raigeki are audited, legal classic Spell cards',()=>{
 const {getCard}=require('../dist/collection'),{getEffect,enabledCardIds}=require('../dist/effectRegistry');
 for(const [id,kind] of [['55144522','potOfGreed'],['12580477','raigeki']]){
  assert.equal(getCard(id).kind,'spell');assert.ok(enabledCardIds.includes(id));assert.equal(getEffect(id).kind,kind);
 }
});
test('Pot of Greed draws exactly two cards from the top in order',()=>{
 let s=game();s.players[0].hand=[ref('pot','55144522')];
 s.players[0].deck=[ref('first','91152256'),ref('second','48305365'),ref('third','15025844')];
 s=use(s,'a','spell',a=>a.card==='pot');
 assert.deepEqual(s.players[0].hand.map(c=>c.uid),['first','second']);
 assert.deepEqual(s.players[0].deck.map(c=>c.uid),['third']);
 assert.ok(s.players[0].grave.some(c=>c.uid==='pot'));
});
test('Pot of Greed cannot be activated if the Deck cannot supply two cards',()=>{
 let s=game();s.players[0].hand=[ref('pot','55144522')];s.players[0].deck=[ref('one','91152256')];
 assert.ok(!legalActions(s,'a').some(a=>a.kind==='spell'&&a.card==='pot'));
 assert.throws(()=>step(s,'a',{kind:'spell',card:'pot'}),/inválida/);
});
test('Raigeki destroys only enemy monsters, including face-down, preserving allied field',()=>{
 let s=game();s.players[0].hand=[ref('raigeki','12580477')];
 s.players[0].monsters=[monster('ours','91152256')];
 s.players[1].monsters=[monster('one','91152256',{owner:1}),monster('hidden','15025844',{owner:1,faceUp:false,position:'def'})];
 s=use(s,'a','spell',a=>a.card==='raigeki');
 assert.deepEqual(s.players[0].monsters.map(m=>m.uid),['ours']);assert.equal(s.players[1].monsters.length,0);
 assert.deepEqual(new Set(s.players[1].grave.filter(c=>c.uid==='one'||c.uid==='hidden').map(c=>c.uid)),new Set(['one','hidden']));
});
test('Raigeki does not incorrectly trigger battle-only recruiter Mystic Tomato',()=>{
 let s=game();s.players[0].hand=[ref('raigeki','12580477')];
 s.players[1].monsters=[monster('tomato','83011277',{owner:1})];
 s.players[1].deck=[ref('eligible','11384280')];
 s=use(s,'a','spell');
 assert.equal(s.phase,'main');assert.equal(s.choice,undefined);
 assert.ok(s.players[1].grave.some(c=>c.uid==='tomato'));
});
test('Raigeki still triggers Sangan after the Spell chain resolves',()=>{
 let s=game();s.players[0].hand=[ref('raigeki','12580477')];
 s.players[1].monsters=[monster('sangan','26202165',{owner:1})];
 s.players[1].deck=[ref('candidate','91152256')];
 s=use(s,'a','spell');
 assert.equal(s.phase,'choice');assert.equal(s.choice.source,'monsterSearch');assert.equal(s.choice.actor,1);
 s=use(s,'b','choose');assert.ok(s.players[1].hand.some(c=>c.uid==='candidate'));
});
test('Magic Jammer counters Pot of Greed before it draws cards',()=>{
 let s=game();s.players[0].hand=[ref('pot','55144522')];s.players[0].deck=[ref('first','91152256'),ref('second','48305365')];
 s.players[1].hand=[ref('discard','91152256')];
 s.players[1].backrow=[{uid:'jam',id:'77414722',faceUp:false,setTurn:1}];
 s=use(s,'a','spell');
 assert.equal(s.phase,'response');
 s=use(s,'b','trap',a=>a.card==='jam');
 assert.equal(s.players[0].hand.length,0);
 assert.equal(s.players[0].deck.length,2);
 assert.ok(s.players[1].grave.some(c=>c.uid==='discard'));
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const e=require('../dist/duelEngine'),r=require('../dist/effectRegistry');
const {mechanicalBatch14,mechanicalEffects14,mechanicalMonsters14}=require('../dist/mechanicalBatch14');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {getMonsterDefinition}=require('../dist/monsterEffects');
const {getEffectModel}=require('../dist/effectModels');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const {assertDuelState}=require('../dist/duelIntegrity');
const {starterContents}=require('../dist/cardCatalog');
const manifest=require('../catalog/engine-v7/manifest.json');
const card=mechanicalBatch14[0],id=card.id;
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id)=>({uid,id});
const mon=(uid,id,owner=0)=>({uid,id,owner,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
function game(){
 const s=e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],undefined,0,{randomSeed:'b4'.repeat(32)});
 s.turn=3;return s;
}
function presented(hands=0){
 const s=game();s.players[0].monsters=[mon('flash',id)];
 s.players[0].hand=Array.from({length:hands},(_,i)=>ref('held'+i,'91152256'));
 s.players[1].monsters=[mon('enemy','91152256',1)];
 return s;
}

test('mission14: historical identity, complete official description and immutable fingerprint',()=>{
 assert.equal(id,'96890582');assert.equal(card.konamiId,4918);
 assert.equal(card.atk,2000);assert.equal(card.defense,2000);assert.equal(card.race,'Fiend');
 assert.equal(card.summary,'Decrease the ATK and DEF of this card by 400 points for each card in your hand.');
 assert.deepEqual(mechanicalEffects14[id],{kind:'monsterEffect'});
 const h=require('../catalog/historical/2004-10-01/cards.json').find(c=>c.passwords?.length===1&&c.passwords[0]===id);
 assert.equal(h.names.en,'Flash Assailant');assert.equal(h.firstObserved.ocg,'2002-06-20');
 assert.equal(r.getCardStatus(id).stage,'certified');assert.equal(cardDistributionAllowed(id),true);
 assert.equal(definitionFingerprint(card,mechanicalEffects14[id],{monster:getMonsterDefinition,model:getEffectModel}),
  '9b9232cd1383d481d6eca6e50a386612b8ed0abca65f621c72488b98565c333e');
 assert.deepEqual(getMonsterDefinition(id),mechanicalMonsters14[id]);
});
test('mission14: each card in its controller hand reduces ONLY own face-up stats by 400',()=>{
 for(let n=0;n<=6;n++){
  const s=presented(n);
  assert.equal(e.atk(s.players[0].monsters[0],s),Math.max(0,2000-n*400),String(n));
  assert.equal(e.def(s.players[0].monsters[0],s),Math.max(0,2000-n*400),String(n));
  assert.equal(e.atk(s.players[1].monsters[0],s),1400,'unrelated player');
  assert.equal(e.def(s.players[1].monsters[0],s),1200,'unrelated player');
  assertDuelState(structuredClone(s));
 }
});
test('mission14: drawing and removing hand cards recalculates both stats without caching',()=>{
 const s=presented(1),m=s.players[0].monsters[0];
 assert.equal(e.atk(m,s),1600);
 s.players[0].hand.push(ref('extra','91152256'));
 assert.equal(e.atk(m,s),1200);assert.equal(e.def(m,s),1200);
 s.players[0].grave.push(s.players[0].hand.pop());
 assert.equal(e.atk(m,s),1600);assert.equal(e.def(m,s),1600);
 assertDuelState(structuredClone(s));
});
test('mission14: facedown source loses its continuous effect and flipping restores it',()=>{
 const s=presented(2),m=s.players[0].monsters[0];
 assert.equal(e.atk(m,s),1200);
 m.faceUp=false;m.position='def';
 assert.equal(e.atk(m,s),2000);assert.equal(e.def(m,s),2000);
 m.faceUp=true;m.position='atk';
 assert.equal(e.atk(m,s),1200);
});
test('mission14: Skill Drain negation suppresses modifier without changing opposing stats',()=>{
 const s=presented(2);
 s.players[1].backrow=[{uid:'skill',id:'82732705',setTurn:0,faceUp:true,resolved:true}];
 assert.equal(e.atk(s.players[0].monsters[0],s),2000);
 assert.equal(e.def(s.players[0].monsters[0],s),2000);
 s.players[1].backrow=[];
 assert.equal(e.atk(s.players[0].monsters[0],s),1200);
 assertDuelState(structuredClone(s));
});
test('mission14: card enters by a legal summon and replays identically after JSON snapshot',()=>{
 const s=game();s.players[0].hand.push(ref('new',id));
 const action=e.legalActions(s,'a').find(a=>a.kind==='summon'&&a.card==='new'&&a.position==='atk');
 assert.ok(action);
 const result=e.step(s,'a',action),replay=e.step(structuredClone(s),'a',action);
 assert.deepEqual(structuredClone(result),structuredClone(replay));
 assert.equal(result.resolverVersion,'engine-v9');
 assert.equal(result.catalogRevision,require('../catalog/engine-v9/manifest.json').current);
 assert.ok(result.players[0].monsters.some(m=>m.id===id));
 assertDuelState(structuredClone(result));
});
test('mission14: old catalog revision rejects new card while preserving old duel semantics',()=>{
 const old=manifest.revisions.at(-2).id;
 const resolver=e.getArchivedDefinitionResolver('engine-v7');
 assert.equal(resolver.getPlayableCard(id,old),undefined);
 assert.equal(resolver.getPlayableCard(id,manifest.current)?.id,id);
 assert.throws(()=>resolver.createDuel([{id:'a',name:'A',cards:[id,...basic.slice(1)]},{id:'b',name:'B',cards:basic}],undefined,0,{catalogRevision:old}));
});
test('mission14: all existing v7 revisions and 740 earlier certificates remain pinned',()=>{
 assert.equal(manifest.revisions.length,7);
 const previous=require('../catalog/engine-v7/'+manifest.revisions.at(-2).id+'.json');
 const newest=require('../catalog/engine-v7/'+manifest.current+'.json');
 assert.equal(previous.cards.length,740);assert.equal(newest.cards.length,741);
 assert.ok(r.enabledCardIds.length>=769);
 for(const oldCard of previous.cards)assert.deepEqual(newest.cards.find(c=>c.id===oldCard.id),oldCard);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getMonsterEffect}=require('../dist/effectRegistry');

const WITCH='78010363';
const KURIBOH='40640057';
const SANGAN='26202165';
const witch=getPlayableCard(WITCH);
assert.ok(witch&&witch.kind==='monster');
assert.equal(getMonsterEffect(WITCH)?.trigger,'onSentToGrave');
assert.deepEqual(getMonsterEffect(WITCH)?.operation,{kind:'search',stat:'defense',maximum:1500});
assert.ok(getPlayableCard(KURIBOH)?.kind==='monster');
assert.ok(getPlayableCard(SANGAN)?.kind==='monster');

const normalCards=[...new Set(tag.tagNormalCardIds)]
 .map(id=>({id,card:getPlayableCard(id)}))
 .filter(entry=>entry.card&&entry.card.level<=4&&Number.isInteger(entry.card.atk));
const attackerEntry=normalCards
 .filter(entry=>entry.card.atk>(witch.defense??0))
 .sort((a,b)=>b.card.atk-a.card.atk)[0];
assert.ok(attackerEntry,'Witch battle fixture needs a Normal Monster above its Defense');
function diagnosticTest(name,run){
 test(name,(...args)=>{
  try{return run(...args);}
  catch(error){console.error('[M89 Witch diagnostic]',error?.stack??error);throw error;}
 });
}
function member(seat){return 'm89-seat-'+seat;}
function deck(required=[]){
 const ids=[...new Set([...required,...tag.tagNormalCardIds])].slice(0,7);
 assert.ok(ids.length>=7,'fixture deck must have seven unique card identities');
 return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function holder(state,seat){
 const team=seat%2;
 return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takeCard(state,seat,id){
 const physical=holder(state,seat);
 for(const zone of ['hand','deck']){
  const index=physical[zone].findIndex(card=>card.id===id);
  if(index>=0)return physical[zone].splice(index,1)[0];
 }
 throw new Error('M89 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInDeck(state,seat,id){
 const physical=holder(state,seat);
 const index=physical.hand.findIndex(card=>card.id===id);
 if(index>=0)physical.deck.push(physical.hand.splice(index,1)[0]);
 const found=physical.deck.find(card=>card.id===id);
 assert.ok(found,'expected card must remain in physical Deck '+seat);
 return found;
}
function deploy(state,seat,id,position,faceUp=true){
 const card=takeCard(state,seat,id);
 const monster={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,setTurn:0};
 state.core.players[seat%2].monsters.push(monster);
 return monster;
}
function settleResponses(state){
 for(let guard=0;state.core.phase==='response';guard++){
  assert.ok(guard<20,'the battle response chain must terminate');
  const actor=tag.tagDecisionMember(state).id;
  const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
  assert.ok(pass);
  state=tag.stepTagDuel(state,actor,pass);
 }
 return state;
}
function inventorySnapshot(state){
 const cards=tag.tagInventory(state);
 assert.equal(cards.length,80);
 const map=new Map(cards.map(card=>[card.uid,card.id]));
 assert.equal(map.size,80);
 return map;
}
function assertConserved(state,before){
 const cards=tag.tagInventory(state);
 assert.equal(cards.length,before.size);
 assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
 for(const card of cards)assert.equal(before.get(card.uid),card.id);
}

diagnosticTest('Witch of the Black Forest resolves for the active teammate and searches by DEF in that physical Deck',()=>{
 const players=[
  {id:member(0),name:'M89 Seat 0',cards:deck([attackerEntry.id])},
  {id:member(1),name:'M89 Seat 1',cards:deck([KURIBOH])},
  {id:member(2),name:'M89 Seat 2',cards:deck()},
  {id:member(3),name:'M89 Seat 3',cards:deck([WITCH,SANGAN])}
 ];
 let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m89-witch-active-deck'});
 const before=inventorySnapshot(state);
 const attacker=deploy(state,0,attackerEntry.id,'atk');
 const source=deploy(state,3,WITCH,'def',false);
 const activeCandidate=ensureInDeck(state,1,KURIBOH);
 const inactiveCandidate=ensureInDeck(state,3,SANGAN);
 state.core.turn=3;
 assert.doesNotThrow(()=>tag.assertTagDuel(state));
 assert.match(source.uid,/^m3:/);
 assert.match(activeCandidate.uid,/^m1:/);
 assert.match(inactiveCandidate.uid,/^m3:/);

 const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
 assert.ok(battle);
 state=settleResponses(tag.stepTagDuel(state,member(0),battle));
 const attack=tag.tagActions(state,member(0)).find(action=>
  action.kind==='attack'&&action.card===attacker.uid&&action.target===source.uid
 );
 assert.ok(attack);
 state=settleResponses(tag.stepTagDuel(state,member(0),attack));

 assert.ok(state.core.players[1].grave.some(card=>card.uid===source.uid),'Witch must enter the shared Graveyard');
 assert.equal(state.core.phase,'choice');
 assert.equal(tag.tagDecisionMember(state).id,member(1),'the active teammate resolves the inactive partner trigger');
 const choices=tag.tagActions(state,member(1)).filter(action=>action.kind==='choose');
 assert.ok(choices.some(action=>action.target===activeCandidate.uid),'the active physical Deck candidate must be offered');
 assert.ok(!choices.some(action=>action.target===inactiveCandidate.uid),'the inactive source owner Deck must not leak into the choices');
 assert.deepEqual(tag.tagActions(state,member(3)),[],'the inactive source owner must not receive the decision');

 const chosen=choices.find(action=>action.target===activeCandidate.uid);
 state=settleResponses(tag.stepTagDuel(state,member(1),chosen));
 assert.ok(tag.tagMemberHand(state,member(1)).some(card=>card.uid===activeCandidate.uid),
  'the selected DEF-eligible monster must return to the active representative hand');
 assert.ok(state.reserves[3].deck.some(card=>card.uid===inactiveCandidate.uid),
  'the inactive partner Deck must remain unchanged');
 assert.ok(!tag.tagMemberHand(state,member(3)).some(card=>card.uid===activeCandidate.uid));
 assert.equal(state.core.players[0].lp,4000);
 assert.equal(state.core.players[1].lp,4000);
 assert.doesNotThrow(()=>tag.assertTagDuel(state));
 assertConserved(state,before);
});

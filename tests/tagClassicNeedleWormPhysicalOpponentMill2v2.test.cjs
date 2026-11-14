'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const NEEDLE_WORM='81843628';
assert.equal(getPlayableCard(NEEDLE_WORM)?.englishName,'Needle Worm');
assert.equal(getMonsterEffect(NEEDLE_WORM)?.trigger,'flip');
assert.equal(getMonsterEffect(NEEDLE_WORM)?.activation?.policy,'mandatory');
assert.equal(getMonsterEffect(NEEDLE_WORM)?.operation.kind,'mill');
assert.equal(getMonsterEffect(NEEDLE_WORM)?.operation.count,5);
assert.equal(getMonsterEffect(NEEDLE_WORM)?.operation.player,'opponent');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the Needle Worm fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm196-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M196 Seat '+seat,cards:deck([NEEDLE_WORM])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  return state;
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
  throw new Error('M196 fixture card missing from physical seat '+seat+': '+id);
}
function deployFaceDown(state,seat){
  const card=takeCard(state,seat,NEEDLE_WORM);
  const monster={...card,owner:seat%2,position:'def',faceUp:false,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'all physical UIDs must be unique');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Needle Worm must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Needle Worm must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function arrangeTop(state,count){
  const physical=holder(state,1);
  const chosen=normalIds.slice(0,count);
  const top=[];
  for(const id of chosen){
    const index=physical.deck.findIndex(card=>card.id===id);
    assert.ok(index>=0,'each selected top card must originate in the active opposing physical Deck');
    top.push(physical.deck.splice(index,1)[0]);
  }
  physical.deck.unshift(...top);
  return top;
}
function flip(state,source){
  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='position'&&candidate.card===source.uid&&candidate.mode==='flip'
  );
  assert.ok(action,'the active teammate can Flip Summon the partner-owned Needle Worm');
  const unchanged=JSON.stringify(state);
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical owner cannot submit the Flip Summon');
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo/);
  assert.equal(JSON.stringify(state),unchanged,'a rejected partner action must not mutate the duel');
  return tag.stepTagDuel(state,member(0),action);
}
function pass(state,seat){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='pass');
  assert.ok(action,'the current physical responder must receive a pass action');
  return tag.stepTagDuel(state,member(seat),action);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the mandatory mill trigger response must terminate');
    const actor=tag.tagDecisionMember(state).id;
    state=pass(state,Number(actor.slice('m196-seat-'.length)));
  }
  return state;
}
function partnerDeckUids(state){
  return holder(state,3).deck.map(card=>card.uid).sort();
}

test('Needle Worm mills exactly the top five cards from the opposing active physical Deck, not its partner Deck',()=>{
  let state=game('m196-needle-worm-five');
  const before=inventorySnapshot(state);
  const source=deployFaceDown(state,2);
  const top=arrangeTop(state,5);
  const partnerBefore=partnerDeckUids(state);
  const activeDeckBefore=state.core.players[1].deck.length;
  state=flip(state,source);
  state=settle(state);

  const graveUids=state.core.players[1].grave.map(card=>card.uid);
  for(const card of top)assert.ok(graveUids.includes(card.uid),
    'each of the five exact top Deck UIDs must be sent to the opposing shared Graveyard');
  assert.equal(state.core.players[1].deck.length,activeDeckBefore-5,
    'exactly five cards are removed from the active opposing physical Deck');
  assert.deepEqual(partnerDeckUids(state),partnerBefore,
    'the opposing partner physical Deck is not milled');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid&&card.faceUp),
    'Needle Worm remains face-up after its mandatory Flip trigger');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Needle Worm mills all remaining opposing Deck cards when fewer than five remain',()=>{
  let state=game('m196-needle-worm-short-deck');
  const before=inventorySnapshot(state);
  const source=deployFaceDown(state,2);
  const physical=holder(state,1);
  const top=arrangeTop(state,3);
  const chosenUids=new Set(top.map(card=>card.uid));
  const leftovers=physical.deck.filter(card=>!chosenUids.has(card.uid));
  physical.grave.push(...leftovers);
  physical.deck=top.slice();
  assert.equal(physical.deck.length,3);
  const partnerBefore=partnerDeckUids(state);
  state=flip(state,source);
  state=settle(state);

  const graveUids=state.core.players[1].grave.map(card=>card.uid);
  for(const card of top)assert.ok(graveUids.includes(card.uid),
    'all three remaining Deck cards must be milled');
  assert.equal(state.core.players[1].deck.length,0,
    'Needle Worm mills the entire remaining Deck when it contains fewer than five cards');
  assert.deepEqual(partnerDeckUids(state),partnerBefore,
    'the opposing partner physical Deck remains untouched');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

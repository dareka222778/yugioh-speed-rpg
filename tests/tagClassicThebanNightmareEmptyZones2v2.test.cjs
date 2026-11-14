'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const THEBAN_NIGHTMARE='51838385';
const SANCTUARY='56433456';
const TOLL='82003859';

assert.equal(getPlayableCard(THEBAN_NIGHTMARE)?.atk,1500);
assert.equal(getMonsterEffect(THEBAN_NIGHTMARE)?.trigger,'continuous');
assert.equal(getMonsterEffect(THEBAN_NIGHTMARE)?.operation.kind,'continuous');
assert.equal(getPlayableCard(SANCTUARY)?.field,true);
assert.equal(getPlayableCard(TOLL)?.kind,'spell');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the Theban fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm189-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M189 Seat '+seat,
    cards:deck([THEBAN_NIGHTMARE,SANCTUARY,TOLL])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m189-theban-empty-zones'});
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
  throw new Error('M189 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,
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
  assert.equal(cards.length,before.size,'Theban Nightmare conditions must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Theban Nightmare conditions must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function emptyPhysicalHand(physical){
  physical.deck.push(...physical.hand);
  physical.hand=[];
}

test('Theban Nightmare gains 1500 ATK with empty hands/backrow even when the Field Zone is occupied',()=>{
  let state=game();
  const before=inventorySnapshot(state);
  emptyPhysicalHand(state.core.players[0]);
  emptyPhysicalHand(state.reserves[2]);
  const theban=deploy(state,2,THEBAN_NIGHTMARE);
  const field=takeCard(state,0,SANCTUARY);
  state.core.players[0].field={...field,setTurn:0,faceUp:true,resolved:true};
  assert.match(theban.uid,/^m2:/,'Theban Nightmare retains inactive partner physical ownership');
  assert.equal(state.core.players[0].backrow.length,0);
  assert.equal(state.core.players[0].hand.length,0);
  assert.equal(state.reserves[2].hand.length,0);
  assert.equal(engine.atk(theban,state.core),3000,
    'the Field Zone is explicitly excluded from Theban Nightmare empty Spell/Trap Zone condition');

  const setSpell=takeCard(state,0,TOLL);
  state.core.players[0].backrow.push({...setSpell,setTurn:0,faceUp:false});
  assert.equal(engine.atk(theban,state.core),1500,
    'a face-down card in the shared team Spell/Trap Zone disables the bonus');
  const removed=state.core.players[0].backrow.pop();
  state.core.players[0].grave.push(removed);
  assert.equal(engine.atk(theban,state.core),3000,
    'removing the only backrow card restores the conditional bonus');

  const handCard=takeCard(state,0,normalIds[0]);
  state.core.players[0].hand.push(handCard);
  assert.equal(engine.atk(theban,state.core),1500,
    'a card in the active physical hand disables the empty-hand condition');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const FAIRY_KING_TRUESDALE='45425051';
assert.equal(getPlayableCard(FAIRY_KING_TRUESDALE)?.englishName,'Fairy King Truesdale');
assert.equal(getPlayableCard(FAIRY_KING_TRUESDALE)?.race,'Plant');
assert.equal(getPlayableCard(FAIRY_KING_TRUESDALE)?.atk,2200);
assert.equal(getPlayableCard(FAIRY_KING_TRUESDALE)?.defense,1500);
assert.equal(getMonsterEffect(FAIRY_KING_TRUESDALE)?.trigger,'continuous');
assert.equal(getMonsterEffect(FAIRY_KING_TRUESDALE)?.operation.kind,'continuous');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the Truesdale fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm190-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M190 Seat '+seat,cards:deck([FAIRY_KING_TRUESDALE])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m190-truesdale-team-plant-buff'});
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
  throw new Error('M190 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,position){
  const card=takeCard(state,seat,FAIRY_KING_TRUESDALE);
  const monster={...card,owner:seat%2,position,faceUp:true,
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
  assert.equal(cards.length,before.size,'Plant modifiers must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'Plant modifiers must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Fairy King Truesdale in Defense buffs a partner-owned Plant on the shared team field',()=>{
  const state=game();
  const before=inventorySnapshot(state);
  const source=deploy(state,2,'def');
  const ally=deploy(state,0,'atk');
  const opponent=deploy(state,3,'atk');
  assert.match(source.uid,/^m2:/,'the continuous source retains inactive teammate physical ownership');
  assert.match(ally.uid,/^m0:/,'the buffed Plant retains active teammate physical ownership');
  assert.match(opponent.uid,/^m3:/,'the opposing Plant retains opposing teammate physical ownership');
  assert.equal(engine.atk(source,state.core),2700,'the Defense Position source receives its own +500 ATK');
  assert.equal(engine.def(source,state.core),2000,'the Defense Position source receives its own +500 DEF');
  assert.equal(engine.atk(ally,state.core),2700,'the active teammate Plant receives +500 ATK from the partner-owned source');
  assert.equal(engine.def(ally,state.core),2000,'the active teammate Plant receives +500 DEF from the partner-owned source');
  assert.equal(engine.atk(opponent,state.core),2200,'the opposing team Plant is not affected by the source team modifier');
  assert.equal(engine.def(opponent,state.core),1500);

  source.position='atk';
  assert.equal(engine.atk(source,state.core),2200,'moving the source out of Defense removes its continuous bonus');
  assert.equal(engine.def(source,state.core),1500);
  assert.equal(engine.atk(ally,state.core),2200,'the partner Plant loses the team bonus when the source leaves Defense');
  assert.equal(engine.def(ally,state.core),1500);
  assert.equal(engine.atk(opponent,state.core),2200,'the opposing Plant remains unaffected');
  assert.equal(engine.def(opponent,state.core),1500);
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

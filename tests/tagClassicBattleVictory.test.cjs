'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard}=require('../dist/effectRegistry');

const candidates=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.level<=4&&Number.isInteger(entry.card.atk));
assert.ok(candidates.length>=7,'the terminal-battle fixture needs certified Level 4-or-lower Normal Monsters');
const attacker=candidates.reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const deckIds=[...new Set([attacker.id,...candidates.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);
function deck(){return Array.from({length:20},(_,index)=>deckIds[index%deckIds.length]);}
function member(seat){return 'm77-seat-'+seat;}
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
  throw new Error('M77 attacker not found in physical seat '+seat);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the battle response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function snapshot(state){
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
for(const first of [0,1,2,3])test('classic 2v2 direct battle victory belongs to the correct team from physical starting seat '+first,()=>{
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M77 Seat '+seat,cards:deck()}));
  let state=tag.createTagDuel(players,{classic:true,first,seed:'m77-terminal-battle-'+first});
  const before=snapshot(state);
  const team=first%2;
  const physical=takeCard(state,first,attacker.id);
  const monster={
    ...physical,
    owner:team,
    position:'atk',
    faceUp:true,
    entered:0,
    changed:0,
    attacked:0,
    atkBoost:0,
    defBoost:0
  };
  state.core.players[team].monsters.push(monster);
  state.core.players[1-team].lp=100;
  state.core.turn=3;
  assert.equal(tag.tagDecisionMember(state).id,member(first));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const actor=member(first);
  const battle=tag.tagActions(state,actor).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=settle(tag.stepTagDuel(state,actor,battle));
  const attack=tag.tagActions(state,actor).find(action=>
    action.kind==='attack'&&action.card===monster.uid&&action.target===undefined
  );
  assert.ok(attack);
  const liveMonster=state.core.players[team].monsters.find(card=>card.uid===monster.uid);
  const damage=engine.atk(liveMonster,state.core);
  assert.ok(damage>=100);

  state=settle(tag.stepTagDuel(state,actor,attack));
  assert.equal(state.core.phase,'finished','lethal direct battle damage must finish the duel');
  assert.equal(state.core.winner,'tag-team-'+team,'the physical seat must map to its shared team, not to a seat index');
  assert.equal(state.core.players[1-team].lp,0);
  assert.equal(state.core.players[team].lp,4000);
  assert.equal(state.core.turn,3,'terminal battle damage must not advance the turn');
  assert.equal(tag.publicTagDuel(state).winner,'tag-team-'+team);
  assert.match(tag.publicTagDuel(state).reason,/pontos de vida/);
  for(let seat=0;seat<4;seat++)assert.deepEqual(tag.tagActions(state,member(seat)),[],'a finished duel must expose no actions');
  assert.throws(()=>tag.stepTagDuel(state,actor,{kind:'end'}),/encerrado/);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getMonsterEffect}=require('../dist/effectRegistry');

const NOBLEMAN_EATER_BUG='65878864';
const nobleman=getPlayableCard(NOBLEMAN_EATER_BUG);
const effect=getMonsterEffect(NOBLEMAN_EATER_BUG);
assert.ok(nobleman&&nobleman.kind==='monster');
assert.equal(effect?.trigger,'flip');
assert.deepEqual(effect?.operation,{kind:'targetGroup',rule:{from:'monsters',action:'destroy',minimum:2,maximum:2}});

const normalCards=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.level<=4&&Number.isInteger(entry.card.atk));
const weak=normalCards
  .filter(entry=>entry.card.atk>0&&entry.card.atk<(nobleman.defense??0))
  .sort((a,b)=>b.card.atk-a.card.atk)[0];
assert.ok(weak,'Nobleman-Eater Bug fixture needs an attacker below its Defense');
const partner=normalCards.find(entry=>entry.id!==weak.id);
const own=normalCards.find(entry=>entry.id!==weak.id&&entry.id!==partner.id);
assert.ok(partner&&own);
const deckIds=[...new Set([weak.id,partner.id,own.id,...normalCards.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);
function normalDeck(){return Array.from({length:20},(_,index)=>deckIds[index%deckIds.length]);}
function member(seat){return 'm86-seat-'+seat;}
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
  throw new Error('M86 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position,faceUp=true){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,setTurn:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function settleResponses(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the response chain must terminate');
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
function choose(state,seat,target){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind==='choose'&&candidate.target===target);
  assert.ok(action,'seat '+seat+' must receive target-group action '+target);
  return tag.stepTagDuel(state,member(seat),action);
}

test('Nobleman-Eater Bug selects exactly two opposing shared-field monsters, not its own teammate',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M86 Seat '+seat,
    cards:seat===3?[NOBLEMAN_EATER_BUG,...normalDeck().slice(1)]:normalDeck()
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m86-nobleman-eater-group'});
  const before=inventorySnapshot(state);
  const attacker=deploy(state,0,weak.id,'atk');
  const partnerTarget=deploy(state,2,partner.id,'atk');
  const ownMonster=deploy(state,1,own.id,'atk');
  const source=deploy(state,3,NOBLEMAN_EATER_BUG,'def',false);
  state.core.turn=3;
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assert.match(partnerTarget.uid,/^m2:/);
  assert.match(source.uid,/^m3:/);

  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=settleResponses(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===source.uid
  );
  assert.ok(attack);
  state=settleResponses(tag.stepTagDuel(state,member(0),attack));
  assert.equal(state.core.phase,'choice');
  assert.equal(tag.tagDecisionMember(state).id,member(1),'the active defending teammate must resolve the inactive partner trigger');

  const actions=tag.tagActions(state,member(1)).filter(action=>action.kind==='choose');
  const targets=new Set(actions.map(action=>action.target));
  assert.ok(targets.has(attacker.uid));
  assert.ok(targets.has(partnerTarget.uid),'the inactive opposing teammate monster must be targetable');
  assert.ok(!targets.has(ownMonster.uid),'Nobleman-Eater Bug must not target its own team monster');
  assert.ok(!targets.has(source.uid),'Nobleman-Eater Bug must not target its own source');
  assert.deepEqual(tag.tagActions(state,member(3)),[],'the inactive physical source owner must not receive target actions');

  state=choose(state,1,attacker.uid);
  assert.ok(tag.tagActions(state,member(1)).some(action=>action.kind==='choose'&&action.target===partnerTarget.uid),
    'the group must permit the second target before confirmation');
  state=choose(state,1,partnerTarget.uid);
  state=choose(state,1,'__done__');
  state=settleResponses(state);

  assert.ok(state.core.players[0].grave.some(card=>card.uid===attacker.uid));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===partnerTarget.uid&&card.id===partner.id));
  assert.ok(!state.core.players[0].monsters.some(card=>card.uid===attacker.uid||card.uid===partnerTarget.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===source.uid&&card.faceUp));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===ownMonster.uid));
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

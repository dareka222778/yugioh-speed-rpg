'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getMonsterEffect}=require('../dist/effectRegistry');

const NEEDLE_WORM='81843628';
const needle=getPlayableCard(NEEDLE_WORM);
assert.ok(needle&&needle.kind==='monster');
assert.deepEqual(getMonsterEffect(NEEDLE_WORM)?.operation,{kind:'mill',count:5,player:'opponent'});

const normalCards=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.level<=4&&Number.isInteger(entry.card.atk));
const weak=normalCards
  .filter(entry=>entry.card.atk>0&&entry.card.atk<(needle.defense??0))
  .sort((a,b)=>b.card.atk-a.card.atk)[0];
assert.ok(weak,'the Needle Worm battle fixture needs an attacker below its Defense');
const deckIds=[...new Set([weak.id,...normalCards.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);
function normalDeck(){return Array.from({length:20},(_,index)=>deckIds[index%deckIds.length]);}
function member(seat){return 'm81-seat-'+seat;}
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
  throw new Error('M81 fixture card missing from physical seat '+seat+': '+id);
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

test('Needle Worm mills the active opposing physical Deck, not the inactive partner Deck, in 2v2',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M81 Seat '+seat,
    cards:seat===3?[NEEDLE_WORM,...normalDeck().slice(1)]:normalDeck()
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m81-needle-worm-physical-deck'});
  const before=inventorySnapshot(state);

  const attackerCard=takeCard(state,0,weak.id);
  const attacker={
    ...attackerCard,
    owner:0,
    position:'atk',
    faceUp:true,
    entered:0,
    changed:0,
    attacked:0,
    atkBoost:0,
    defBoost:0
  };
  state.core.players[0].monsters.push(attacker);

  const needleCard=takeCard(state,3,NEEDLE_WORM);
  const defender={
    ...needleCard,
    owner:1,
    position:'def',
    faceUp:false,
    entered:0,
    changed:0,
    attacked:0,
    atkBoost:0,
    defBoost:0,
    setTurn:0
  };
  state.core.players[1].monsters.push(defender);
  state.core.turn=3;
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const activeOpponentDeckBefore=state.core.players[0].deck.length;
  const inactivePartnerDeckBefore=state.reserves[2].deck.length;
  const otherTeamDeckBefore=state.core.players[1].deck.length;
  const milled=state.core.players[0].deck.slice(0,5).map(card=>card.uid);
  assert.equal(milled.length,5);

  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=settleResponses(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===defender.uid
  );
  assert.ok(attack);
  state=settleResponses(tag.stepTagDuel(state,member(0),attack));

  assert.equal(state.core.players[0].deck.length,activeOpponentDeckBefore-5,
    'the opponent team active physical member must lose exactly five Deck cards');
  assert.equal(state.reserves[2].deck.length,inactivePartnerDeckBefore,
    'the inactive partner physical Deck must not be milled');
  assert.equal(state.core.players[1].deck.length,otherTeamDeckBefore,
    'the triggering team Deck must not be milled');
  for(const uid of milled)assert.ok(state.core.players[0].grave.some(card=>card.uid===uid),
    'each milled card must enter the opponent shared Graveyard: '+uid);
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===defender.uid&&card.faceUp),
    'Needle Worm survives the weaker attack face-up in Defense Position');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

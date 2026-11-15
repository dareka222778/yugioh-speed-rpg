'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');

const DIAN_KETO='84257639';
const OOKAZI='19523799';
const CASES=[
  {id:DIAN_KETO,name:'Dian Keto the Cure Master',kind:'heal',amount:1000,lp:[4500,4100],expected:[5500,4100]},
  {id:OOKAZI,name:'Ookazi',kind:'burn',amount:800,lp:[4000,4000],expected:[4000,3200]}
];

for(const entry of CASES){
  assert.equal(getPlayableCard(entry.id)?.kind,'spell',entry.name+' must be certified and playable');
  assert.equal(getEffect(entry.id)?.kind,entry.kind,entry.name+' must use its registered LP operation');
  assert.equal(getEffect(entry.id)?.amount,entry.amount,entry.name+' must preserve its exact official amount');
}

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&
    Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the four-seat fixture needs seven certified Normal Monsters');
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm212-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=7);
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
  throw new Error('M212 fixture card missing from physical seat '+seat+': '+id);
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique before resolution');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'LP Spells must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function snapshots(state){
  const hands=new Map([0,1,2,3].map(seat=>[
    seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)
  ]));
  const decks=new Map([0,1,2,3].map(seat=>[
    seat,holder(state,seat).deck.map(card=>card.uid)
  ]));
  return {hands,decks};
}
function assertPrivateHands(state,hands){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const uids of hands.values())for(const uid of uids){
    assert.ok(!publicState.includes(uid),'private hand UID leaked to public duel: '+uid);
  }
}
function setup(entry,activeSeat=0){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M212 Seat '+seat,
    cards:deck(seat===activeSeat?[entry.id]:[])
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m212-'+entry.id});
  const spell=takeCard(state,activeSeat,entry.id);
  holder(state,activeSeat).hand.push(spell);
  state.core.turn=3;
  state.core.players[0].lp=entry.lp[0];
  state.core.players[1].lp=entry.lp[1];
  assert.match(spell.uid,new RegExp('^m'+activeSeat+':'),entry.name+' must retain active physical seat ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const {hands,decks}=snapshots(state);
  assertPrivateHands(state,hands);
  return {state,spell,before,hands,decks};
}
function assertActiveSeat(state,action,entry,activeSeat=0){
  assert.equal(tag.tagDecisionMember(state).id,member(activeSeat),'the selected physical seat must be the active player');
  const partnerSeat=activeSeat===0?2:0;
  assert.deepEqual(tag.tagActions(state,member(partnerSeat)),[],
    'the inactive physical teammate cannot execute the shared Main Phase action');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(partnerSeat),action),/Aguarde a vez do participante ativo\./,
    entry.name+' must reject an action submitted by the inactive partner');
  assert.equal(JSON.stringify(state),unchanged,'rejected inactive-seat action must not mutate the duel');
}
function assertResolved(state,entry,spell,before,hands,decks,activeSeat=0){
  assert.equal(state.core.phase,'main',entry.name+' resolves immediately without a legal response');
  assert.deepEqual(state.core.players.map(player=>player.lp),entry.expected,
    entry.name+' must change the correct shared team LP by the exact amount');
  assert.ok(state.core.players[activeSeat%2].grave.some(card=>card.uid===spell.uid&&card.id===entry.id),
    entry.name+' must enter the activating team Graveyard with its original physical UID');
  for(const seat of [0,1,2,3]){
    const expectedHand=hands.get(seat).filter(uid=>!(seat===activeSeat&&uid===spell.uid));
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),expectedHand,
      entry.name+' must not mutate physical seat '+seat+' hand beyond consuming its source');
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),decks.get(seat),
      entry.name+' must not borrow or mutate physical seat '+seat+' Deck');
  }
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const restored=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(restored),'the resolved LP effect must survive JSON restoration');
  assertPrivateHands(restored,hands);
  assertConserved(restored,before);
}

function endCurrentTurn(state){
  const actor=tag.tagDecisionMember(state).id;
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active physical player must be able to end the current turn');
  return tag.stepTagDuel(state,actor,action);
}

for(const entry of CASES){
  test(entry.name+' applies its exact LP change to the correct shared 2v2 team',()=>{
    const {state:initial,spell,before,hands,decks}=setup(entry);
    const action=tag.tagActions(initial,member(0)).find(candidate=>
      candidate.kind==='spell'&&candidate.card===spell.uid
    );
    assert.ok(action,'active physical seat 0 must receive the legal '+entry.name+' activation');
    assertActiveSeat(initial,action,entry);
    const state=tag.stepTagDuel(initial,member(0),action);
    assertResolved(state,entry,spell,before,hands,decks);
  });
}

for(const entry of CASES){
  test(entry.name+' can also be activated from the rotated active partner physical hand',()=>{
    const {state:initial,spell,before}=setup(entry,2);
    let state=endCurrentTurn(initial);
    assert.equal(state.core.turn,4);
    assert.equal(tag.tagDecisionMember(state).id,member(1),'the opposing physical seat acts between partners');
    state=endCurrentTurn(state);
    assert.equal(state.core.turn,5);
    assert.equal(tag.tagDecisionMember(state).id,member(2),'the partner seat 2 must receive the next team turn');
    // Snapshot after normal turn-start draws so only the Spell activation is measured below.
    const {hands,decks}=snapshots(state);
    assertPrivateHands(state,hands);
    const action=tag.tagActions(state,member(2)).find(candidate=>
      candidate.kind==='spell'&&candidate.card===spell.uid
    );
    assert.ok(action,'the rotated active partner may activate the Spell from its own physical hand');
    assertActiveSeat(state,action,entry,2);
    const resolved=tag.stepTagDuel(state,member(2),action);
    assertResolved(resolved,entry,spell,before,hands,decks,2);
  });
}

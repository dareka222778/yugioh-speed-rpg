'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');

const JAR_OF_GREED='83968380';
assert.ok(getPlayableCard(JAR_OF_GREED)?.kind==='trap','Jar of Greed must be certified and playable');
assert.equal(getEffect(JAR_OF_GREED)?.kind,'sequence');
assert.equal(getEffect(JAR_OF_GREED)?.operations?.[0]?.kind,'draw');
assert.equal(getActivationModel(getEffect(JAR_OF_GREED))?.speed,2);
assert.equal(getActivationModel(getEffect(JAR_OF_GREED))?.window,'free');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm131-seat-'+seat;}
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
  throw new Error('M131 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'Jar of Greed must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Jar of Greed response window must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('inactive teammate-owned Jar of Greed draws for the active physical teammate',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M131 Seat '+seat,
    cards:deck(seat===2?[JAR_OF_GREED]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m131-jar-of-greed-physical-owner'});
  const beforeCard=takeCard(state,2,JAR_OF_GREED);
  const jar={...beforeCard,setTurn:0,faceUp:false};
  state.core.players[0].backrow.push(jar);
  state.core.turn=3;
  assert.match(jar.uid,/^m2:/,'the set Trap must retain inactive teammate seat 2 ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const handsBefore=new Map([0,1,2,3].map(seat=>[
    seat,tag.tagMemberHand(state,member(seat)).map(card=>card.uid)
  ]));
  const decksBefore=new Map([0,1,2,3].map(seat=>[
    seat,holder(state,seat).deck.map(card=>card.uid)
  ]));
  const topUid=holder(state,0).deck[0].uid;
  const publicBefore=tag.publicTagDuel(state);
  assert.ok(!JSON.stringify(publicBefore).includes(JAR_OF_GREED),
    'the set Trap identity must remain hidden');
  assert.ok(!JSON.stringify(publicBefore).includes(jar.uid),
    'the set Trap physical UID must remain hidden');

  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='trap'&&candidate.card===jar.uid
  );
  assert.ok(action,'active seat 0 must be allowed to activate its inactive teammate set Trap');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'inactive physical owner seat 2 cannot submit the shared-field activation');
  const beforeInvalid=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),beforeInvalid,'rejected inactive-seat activation must not mutate the duel');

  state=tag.stepTagDuel(state,member(0),action);
  state=settle(state);
  assert.equal(state.core.phase,'main');
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assert.deepEqual(tag.tagMemberHand(state,member(0)).map(card=>card.uid),
    handsBefore.get(0).concat(topUid),
    'draw resolves for the active physical seat, not the inactive Trap owner');
  assert.deepEqual(holder(state,0).deck.map(card=>card.uid),decksBefore.get(0).slice(1),
    'the active seat own Deck supplies the drawn card');
  for(const seat of [1,2,3]){
    assert.deepEqual(tag.tagMemberHand(state,member(seat)).map(card=>card.uid),handsBefore.get(seat),
      'Jar of Greed must not mutate physical seat '+seat+' hand');
    assert.deepEqual(holder(state,seat).deck.map(card=>card.uid),decksBefore.get(seat),
      'Jar of Greed must not draw from physical seat '+seat+' Deck');
  }
  assert.ok(state.core.players[0].grave.some(card=>card.uid===jar.uid),
    'the Trap retains seat 2 UID in the shared team Graveyard');
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,4000]);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');

const TORRENTIAL='53582587';
assert.ok(getPlayableCard(TORRENTIAL)?.kind==='trap','Torrential Tribute must be certified and playable');
assert.equal(getEffect(TORRENTIAL)?.kind,'torrentialTribute');
assert.equal(getActivationModel(getEffect(TORRENTIAL))?.speed,2);
assert.equal(getActivationModel(getEffect(TORRENTIAL))?.window,'summoned');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm135-seat-'+seat;}
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
  throw new Error('M135 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain the Normal Summon');
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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
  assert.equal(cards.length,before.size,'Torrential Tribute must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('active teammate activates inactive teammate Torrential Tribute and destroys all four physical monsters',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M135 Seat '+seat,
    cards:deck(seat===2?[TORRENTIAL]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m135-torrential-shared-field'});
  const team0PartnerMonster=deploy(state,2,normal[0].id);
  const team1ActiveMonster=deploy(state,1,normal[1].id);
  const team1PartnerMonster=deploy(state,3,normal[2].id);
  const trapCard=takeCard(state,2,TORRENTIAL);
  const torrential={...trapCard,setTurn:0,faceUp:false};
  state.core.players[0].backrow.push(torrential);
  const summoned=ensureInHand(state,0,normal[3].id);
  state.core.turn=3;
  assert.match(team0PartnerMonster.uid,/^m2:/);
  assert.match(team1ActiveMonster.uid,/^m1:/);
  assert.match(team1PartnerMonster.uid,/^m3:/);
  assert.match(torrential.uid,/^m2:/,'Torrential Tribute must retain inactive teammate seat 2 ownership');
  assert.match(summoned.uid,/^m0:/,'the Normal Summon must retain active seat 0 ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const before=inventorySnapshot(state);
  const publicBefore=tag.publicTagDuel(state);
  assert.ok(!JSON.stringify(publicBefore).includes(TORRENTIAL),'the set Trap identity must remain private');
  assert.ok(!JSON.stringify(publicBefore).includes(torrential.uid),'the set Trap UID must remain private');

  const summon=tag.tagActions(state,member(0)).find(action=>
    action.kind==='summon'&&action.card===summoned.uid&&action.position==='atk'
  );
  assert.ok(summon,'active seat 0 must receive its legal Normal Summon');
  state=tag.stepTagDuel(state,member(0),summon);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the opposing active teammate receives first response priority');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'inactive physical seat 3 must not receive response actions');
  const opponentPass=tag.tagActions(state,member(1)).find(action=>action.kind==='pass');
  assert.ok(opponentPass,'the opposing active teammate may pass the summon response');
  state=tag.stepTagDuel(state,member(1),opponentPass);
  assert.equal(tag.tagDecisionMember(state).id,member(0),
    'after the opponent passes, the active summoning seat receives response priority');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'inactive physical Torrential owner seat 2 cannot submit the activation');
  const activate=tag.tagActions(state,member(0)).find(action=>
    action.kind==='trap'&&action.card===torrential.uid
  );
  assert.ok(activate,'active seat 0 may activate its inactive teammate set Torrential Tribute');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(2),activate),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'rejected inactive-seat activation must not mutate the chain');

  state=tag.stepTagDuel(state,member(0),activate);
  if(state.core.phase==='response'){
    assert.equal(tag.tagDecisionMember(state).id,member(1));
    const pass=tag.tagActions(state,member(1)).find(action=>action.kind==='pass');
    assert.ok(pass);
    state=tag.stepTagDuel(state,member(1),pass);
  }
  assert.equal(state.core.phase,'main','Torrential Tribute resolves after all legal responders pass');
  assert.deepEqual(state.core.players.map(player=>player.monsters),[[],[]],
    'Torrential Tribute destroys monsters across both shared team fields');
  for(const card of [team0PartnerMonster,summoned]){
    assert.ok(state.core.players[0].grave.some(entry=>entry.uid===card.uid),
      'team 0 Graveyard receives its physical monsters: '+card.uid);
  }
  for(const card of [team1ActiveMonster,team1PartnerMonster]){
    assert.ok(state.core.players[1].grave.some(entry=>entry.uid===card.uid),
      'team 1 Graveyard receives its physical monsters: '+card.uid);
  }
  assert.ok(state.core.players[0].grave.some(entry=>entry.uid===torrential.uid),
    'Torrential Tribute enters the activating team shared Graveyard');
  assert.deepEqual(state.core.players.map(player=>player.backrow),[[],[]]);
  assert.deepEqual(state.core.players.map(player=>player.lp),[4000,4000]);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

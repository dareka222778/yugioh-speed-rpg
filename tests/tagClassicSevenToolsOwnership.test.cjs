'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');

const TORRENTIAL='53582587';
const SEVEN_TOOLS='03819470';
for(const [id,kind] of [[TORRENTIAL,'torrentialTribute'],[SEVEN_TOOLS,'sevenTools']]){
  assert.ok(getPlayableCard(id)?.kind==='trap','expected an enabled Trap: '+id);
  assert.equal(getEffect(id)?.kind,kind);
}
assert.equal(getActivationModel(getEffect(TORRENTIAL))?.window,'summoned');
assert.equal(getActivationModel(getEffect(SEVEN_TOOLS))?.speed,3);
assert.equal(getActivationModel(getEffect(SEVEN_TOOLS))?.window,'trapActivated');
assert.equal(getActivationModel(getEffect(SEVEN_TOOLS))?.damage,'counter');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);
function member(seat){return 'm110-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
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
  throw new Error('M110 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'Counter Trap resolution must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Counter Trap chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('inactive teammate-owned Seven Tools negates Torrential Tribute and pays the shared team LP cost',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M110 Seat '+seat,
    cards:deck(seat===2?[SEVEN_TOOLS]:seat===3?[TORRENTIAL]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m110-seven-tools-counter-chain-ownership'});
  const before=inventorySnapshot(state);
  const summonedCard=ensureInHand(state,0,normal[0].id);
  const ally=deploy(state,2,normal[1].id);
  const enemy=deploy(state,1,normal[2].id);
  const sevenCard=takeCard(state,2,SEVEN_TOOLS);
  const seven={...sevenCard,setTurn:0,faceUp:false};
  const torrentCard=takeCard(state,3,TORRENTIAL);
  const torrent={...torrentCard,setTurn:0,faceUp:false};
  state.core.players[0].backrow.push(seven);
  state.core.players[1].backrow.push(torrent);
  state.core.turn=3;
  assert.match(summonedCard.uid,/^m0:/);
  assert.match(ally.uid,/^m2:/);
  assert.match(enemy.uid,/^m1:/);
  assert.match(seven.uid,/^m2:/,'Seven Tools must retain inactive teammate seat 2 ownership');
  assert.match(torrent.uid,/^m3:/,'Torrential Tribute must retain inactive teammate seat 3 ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const publicBefore=tag.publicTagDuel(state);
  for(const [id,card] of [[SEVEN_TOOLS,seven],[TORRENTIAL,torrent]]){
    assert.ok(!JSON.stringify(publicBefore).includes(id),'set Trap identity must remain private: '+id);
    assert.ok(!JSON.stringify(publicBefore).includes(card.uid),'set Trap UID must remain private: '+card.uid);
  }

  const summon=tag.tagActions(state,member(0)).find(action=>
    action.kind==='summon'&&action.card===summonedCard.uid&&action.position==='atk'
  );
  assert.ok(summon);
  state=tag.stepTagDuel(state,member(0),summon);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(1));
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'inactive physical Torrential owner cannot receive the initial response');
  const activateTorrential=tag.tagActions(state,member(1)).find(action=>
    action.kind==='trap'&&action.card===torrent.uid
  );
  assert.ok(activateTorrential,'active seat 1 must activate the inactive partner set Torrential Tribute');
  const beforeInvalid=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(3),activateTorrential),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),beforeInvalid);
  state=tag.stepTagDuel(state,member(1),activateTorrential);

  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(0),
    'the active physical member of the defending team receives Counter Trap priority');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'inactive physical Seven Tools owner cannot receive the chain response');
  const activateSeven=tag.tagActions(state,member(0)).find(action=>
    action.kind==='trap'&&action.card===seven.uid
  );
  assert.ok(activateSeven,'active seat 0 must activate the inactive partner set Seven Tools');
  const beforeSecondInvalid=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(2),activateSeven),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),beforeSecondInvalid);
  state=tag.stepTagDuel(state,member(0),activateSeven);
  state=settle(state);

  assert.equal(state.core.phase,'main');
  assert.equal(tag.tagDecisionMember(state).id,member(0));
  assert.equal(state.core.players[0].lp,3000,
    'Seven Tools pays 1000 LP from the defending shared team');
  assert.equal(state.core.players[1].lp,4000,
    'the attacking team does not pay the Counter Trap cost');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===summonedCard.uid),
    'the Normal Summon survives because Torrential Tribute activation was negated');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===ally.uid),
    'the defending teammate monster survives the negated field wipe');
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===enemy.uid),
    'the opposing monster survives because Torrential Tribute did not resolve');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===seven.uid),
    'the activated Counter Trap goes to the defending shared Graveyard');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===torrent.uid),
    'the negated Torrential Tribute goes to the attacking shared Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

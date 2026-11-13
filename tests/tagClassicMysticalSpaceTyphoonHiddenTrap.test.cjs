'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect,isQuickPlaySpell}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');

const MST='05318639';
const TORRENTIAL='53582587';
assert.ok(getPlayableCard(MST)?.kind==='spell');
assert.equal(getEffect(MST)?.kind,'mysticalSpaceTyphoon');
assert.equal(isQuickPlaySpell(MST),true);
assert.equal(getActivationModel(getEffect(MST))?.speed,2);
assert.ok(getPlayableCard(TORRENTIAL)?.kind==='trap');
assert.equal(getEffect(TORRENTIAL)?.kind,'torrentialTribute');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the 2v2 fixture needs seven certified Normal Monsters');
const deckIds=normal.slice(0,7).map(entry=>entry.id);
function member(seat){return 'm115-seat-'+seat;}
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
  throw new Error('M115 fixture card missing from physical seat '+seat+': '+id);
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
  assert.equal(cards.length,before.size,'MST must conserve all physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the MST response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}

test('partner-owned Mystical Space Typhoon destroys a Set opposing Trap without activating or revealing it',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M115 Seat '+seat,
    cards:deck(seat===2?[MST]:seat===3?[TORRENTIAL]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m115-mst-set-trap-privacy'});
  const before=inventorySnapshot(state);
  const mstCard=takeCard(state,2,MST);
  const mst={...mstCard,setTurn:0,faceUp:false};
  const torrentCard=takeCard(state,3,TORRENTIAL);
  const torrent={...torrentCard,setTurn:0,faceUp:false};
  state.core.players[0].backrow.push(mst);
  state.core.players[1].backrow.push(torrent);
  state.core.turn=3;
  assert.match(mst.uid,/^m2:/,'MST must retain inactive seat 2 physical ownership');
  assert.match(torrent.uid,/^m3:/,'the target Trap must retain inactive seat 3 physical ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const publicBefore=tag.publicTagDuel(state);
  for(const [id,card] of [[MST,mst],[TORRENTIAL,torrent]]){
    assert.ok(!JSON.stringify(publicBefore).includes(id),'a Set card identity must remain private: '+id);
    assert.ok(!JSON.stringify(publicBefore).includes(card.uid),'a Set card UID must remain private: '+card.uid);
  }

  const action=tag.tagActions(state,member(0)).find(candidate=>
    candidate.kind==='spell'&&candidate.card===mst.uid&&candidate.target===torrent.uid
  );
  assert.ok(action,'the active physical teammate must activate the inactive partner Set MST against the opposing Set Trap');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical owner of MST must not receive Main Phase actions');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(2),action),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged);
  state=tag.stepTagDuel(state,member(0),action);

  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the opposing active physical seat receives response priority');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive physical owner of the targeted Set Trap cannot respond');
  assert.equal(tag.tagActions(state,member(1)).some(candidate=>
    candidate.kind==='trap'&&candidate.card===torrent.uid
  ),false,'Torrential Tribute cannot activate outside a successful Summon window');
  const publicDuring=tag.publicTagDuel(state);
  assert.ok(!JSON.stringify(publicDuring).includes(TORRENTIAL),
    'the targeted Set Trap identity remains hidden while the chain is open');

  state=settle(state);
  assert.equal(state.core.phase,'main');
  assert.equal(state.core.players[1].backrow.some(card=>card.uid===torrent.uid),false,
    'MST destroys the targeted Set Trap');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===torrent.uid),
    'the destroyed Trap goes to the opposing shared Graveyard without activating');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===mst.uid),
    'MST goes to the activating shared Graveyard');
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

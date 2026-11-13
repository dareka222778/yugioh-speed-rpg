'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  createTagDuel,
  tagNormalCardIds,
  tagInventory,
  tagDecisionMember,
  tagActions,
  tagMemberHand,
  stepTagDuel,
  timeoutTagDuel,
  publicTagDuel,
  assertTagDuel
}=require('../dist/tagDuel');

const FIELD_SPELL='86318356'; // Sogen
const normalIds=tagNormalCardIds.slice(0,7);
assert.ok(normalIds.length>=7,'the classic 2v2 fixture needs seven certified Normal Monsters');

function normalDeck(count){
  return Array.from({length:count},(_,index)=>normalIds[index%normalIds.length]);
}
function members(){
  return [0,1,2,3].map(seat=>({id:'m72-seat-'+seat,name:'M72 Seat '+seat,cards:normalDeck(20)}));
}
function createGame(first=0,fieldSeat=null){
  const players=members();
  if(fieldSeat!==null){
    assert.ok(fieldSeat>=0&&fieldSeat<4);
    players[fieldSeat].cards=[FIELD_SPELL,...normalDeck(19)];
  }
  return createTagDuel(players,{classic:true,first,seed:'m72-tag-timeout-'+first+'-'+fieldSeat});
}
function inventorySnapshot(state){
  const cards=tagInventory(state);
  assert.equal(cards.length,80,'all four physical 20-card decks must remain in the duel');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,cards.length,'physical UIDs must be unique');
  return map;
}
function assertInventoryConserved(state,before){
  const cards=tagInventory(state);
  assert.equal(cards.length,before.size,'timeout must not remove or create physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,cards.length,'timeout must not duplicate physical UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'timeout must preserve physical card identity '+card.uid);
}
function moveFieldSpellToHand(state,seat){
  const team=seat%2;
  const owner=state.active[team]===seat?state.core.players[team]:state.reserves[seat];
  let card=owner.hand.find(item=>item.id===FIELD_SPELL);
  if(!card){
    const index=owner.deck.findIndex(item=>item.id===FIELD_SPELL);
    assert.notEqual(index,-1,'Sogen must remain in its physical owner deck or hand');
    card=owner.deck.splice(index,1)[0];
    owner.hand.push(card);
  }
  return card.uid;
}
function handsByMember(state){
  return state.members.map(member=>({
    id:member.id,
    uids:tagMemberHand(state,member.id).map(card=>card.uid).sort()
  }));
}

test('classic 2v2 timeout in Main Phase awards the opposing team for every possible first seat',()=>{
  for(let first=0;first<4;first++){
    const state=createGame(first);
    const before=inventorySnapshot(state);
    const originalTurn=state.core.turn;
    const originalCursor=state.cursor;
    const originalActive=[...state.active];
    const originalHands=handsByMember(state);
    const activeTeam=first%2;

    assert.equal(tagDecisionMember(state).id,'m72-seat-'+first);
    const ended=timeoutTagDuel(state);

    assert.equal(ended.core.phase,'finished');
    assert.equal(ended.core.winner,'tag-team-'+(1-activeTeam));
    assert.match(ended.core.reason,/W\.O\./);
    assert.equal(ended.core.turn,originalTurn,'timeout must not advance the turn');
    assert.equal(ended.cursor,originalCursor,'timeout must not rotate physical seats');
    assert.deepEqual(ended.active,originalActive,'timeout must not swap teammates');
    assert.deepEqual(handsByMember(ended),originalHands,'each physical member must retain their own hand');
    assert.equal(state.core.phase,'main','timeout must not mutate the caller state');
    assert.equal(state.core.winner,null,'the original state must remain unfinished');
    assertInventoryConserved(ended,before);
    assert.doesNotThrow(()=>assertTagDuel(ended));
    assert.equal(publicTagDuel(ended).winner,'tag-team-'+(1-activeTeam));
    assert.throws(()=>stepTagDuel(ended,'m72-seat-'+first,{kind:'end'}),/encerrado/);

    const repeated=timeoutTagDuel(ended);
    assert.equal(repeated.core.winner,ended.core.winner,'repeated timeout must be idempotent');
    assertInventoryConserved(repeated,before);
  }
});

test('classic 2v2 timeout during a serialized response window awards the team that opened the chain',()=>{
  for(const first of [0,1]){
    const state=createGame(first,first);
    const before=inventorySnapshot(state);
    const uid=moveFieldSpellToHand(state,first);
    const actor='m72-seat-'+first;
    const fieldAction=tagActions(state,actor).find(action=>action.kind==='field'&&action.card===uid);
    assert.ok(fieldAction,'the active physical member must be able to activate Sogen');

    const responseState=stepTagDuel(state,actor,fieldAction);
    assert.equal(responseState.core.phase,'response','Field Spell activation must open a response window');
    const respondingTeam=1-(first%2);
    const respondingSeat=responseState.active[respondingTeam];
    assert.equal(tagDecisionMember(responseState).id,'m72-seat-'+respondingSeat);
    assert.equal(responseState.core.players[first%2].field?.uid,uid,'the activated physical card must remain in the shared team Field Zone');

    const responseHands=handsByMember(responseState);
    const restored=JSON.parse(JSON.stringify(responseState));
    assert.doesNotThrow(()=>assertTagDuel(restored));
    const ended=timeoutTagDuel(restored);

    assert.equal(ended.core.phase,'finished');
    assert.equal(ended.core.winner,'tag-team-'+(first%2),'the responding opponent timed out, so the activating team wins');
    assert.match(ended.core.reason,/W\.O\./);
    assert.equal(ended.core.players[first%2].field?.uid,uid,'timeout must preserve the already activated Field Spell');
    assert.deepEqual(handsByMember(ended),responseHands,'serialization and timeout must preserve all four private hands');
    assertInventoryConserved(ended,before);
    assert.doesNotThrow(()=>assertTagDuel(ended));
    assert.equal(publicTagDuel(ended).winner,'tag-team-'+(first%2));
  }
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const PUPPETEER='54098121';
const SUMMONED='91152256';
const TRAP_HOLE='04206964';
const puppeteer=getPlayableCard(PUPPETEER);
const summonedCard=getPlayableCard(SUMMONED);
assert.ok(puppeteer&&puppeteer.kind==='monster');
assert.ok(summonedCard&&summonedCard.kind==='monster'&&getEffect(SUMMONED)?.kind==='normal');
assert.deepEqual(getMonsterEffect(PUPPETEER),{
  trigger:'onOtherSummon',
  operation:{kind:'heal',amount:500}
});
assert.equal(getPlayableCard(TRAP_HOLE)?.kind,'trap');
assert.equal(getEffect(TRAP_HOLE)?.kind,'trapHole');

const normalIds=[...new Set(tag.tagNormalCardIds)]
  .filter(id=>getPlayableCard(id)?.kind==='monster');
assert.ok(normalIds.length>=7);
assert.ok(normalIds.includes(SUMMONED),'the summon fixture must be a certified Normal Monster');
const deckBase=[...new Set([SUMMONED,...normalIds])].slice(0,7);
assert.equal(deckBase.length,7);

function member(seat){return 'm102-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckBase])];
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
  throw new Error('M102 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const inHand=physical.hand.find(card=>card.id===id);
  if(inHand)return inHand;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the active physical Deck must contain the Normal Summon');
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four physical 20-card decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique before the summon');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settleResponses(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the summon response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function setup({first,sourceSeat,summonedSeat,withTrapHole,seed}){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M102 Seat '+seat,
    cards:deck([
      ...(seat===sourceSeat?[PUPPETEER]:[]),
      ...(seat===3&&withTrapHole?[TRAP_HOLE]:[])
    ])
  }));
  let state=tag.createTagDuel(players,{classic:true,first,seed});
  const before=inventorySnapshot(state);
  const sourceCard=takeCard(state,sourceSeat,PUPPETEER);
  const source={
    ...sourceCard,owner:0,position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[0].monsters.push(source);
  const summoned=ensureInHand(state,summonedSeat,SUMMONED);
  let trap;
  if(withTrapHole){
    const trapCard=takeCard(state,3,TRAP_HOLE);
    trap={...trapCard,setTurn:0,faceUp:false};
    state.core.players[1].backrow.push(trap);
  }
  state.core.turn=3;
  assert.match(source.uid,new RegExp('^m'+sourceSeat+':'));
  assert.match(summoned.uid,new RegExp('^m'+summonedSeat+':'));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,before,source,summoned,trap};
}
function normalSummon(state,seat,summoned){
  const action=tag.tagActions(state,member(seat)).find(candidate=>
    candidate.kind==='summon'&&candidate.card===summoned.uid&&candidate.position==='atk'
  );
  assert.ok(action,'the active physical seat must receive the legal Normal Summon');
  return tag.stepTagDuel(state,member(seat),action);
}

test('inactive-partner Mysterious Puppeteer heals its team even when Trap Hole destroys the teammate Normal Summon',()=>{
  let {state,before,source,summoned,trap}=setup({
    first:0,sourceSeat:2,summonedSeat:0,withTrapHole:true,
    seed:'m102-puppeteer-active-teammate-summon'
  });
  assert.equal(state.active[0],0);
  assert.equal(state.active[1],1);
  state=normalSummon(state,0,summoned);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the active opposing physical seat receives the Trap response window');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive physical owner of Trap Hole must not receive response actions');
  assert.deepEqual(tag.tagActions(state,member(2)),[],
    'the inactive physical owner of Mysterious Puppeteer must not receive response actions');

  const response=tag.tagActions(state,member(1)).find(action=>
    action.kind==='trap'&&action.card===trap.uid
  );
  assert.ok(response,'the active opponent may chain the inactive partner set Trap Hole');
  const unchanged=JSON.stringify(state);
  assert.throws(()=>tag.stepTagDuel(state,member(3),response),/Aguarde a vez do participante ativo\./);
  assert.equal(JSON.stringify(state),unchanged,'an inactive Trap owner must not mutate the response chain');

  state=settleResponses(tag.stepTagDuel(state,member(1),response));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===summoned.uid),
    'Trap Hole must destroy the successfully Normal Summoned monster');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===trap.uid),
    'the activated Trap must resolve to the shared team Graveyard');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid),
    'the inactive partner Mysterious Puppeteer remains on the shared field');
  assert.equal(state.core.players[0].lp,4500,
    'Mysterious Puppeteer must still grant 500 LP after the summoned monster is destroyed');
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

test('inactive-partner Mysterious Puppeteer reacts to an opponent Normal Summon and heals its own team',()=>{
  let {state,before,source,summoned}=setup({
    first:1,sourceSeat:0,summonedSeat:1,withTrapHole:false,
    seed:'m102-puppeteer-opponent-summon'
  });
  assert.equal(state.active[0],2,'the Puppeteer team is represented by its active partner');
  assert.equal(state.active[1],1,'the opponent performs the Normal Summon');
  state=normalSummon(state,1,summoned);
  state=settleResponses(state);

  assert.equal(state.core.players[0].lp,4500,
    'the Puppeteer controller team gains 500 LP when the opponent summons');
  assert.equal(state.core.players[1].lp,4000,
    'the summoning opponent does not receive the Puppeteer recovery');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===source.uid));
  assert.ok(state.core.players[1].monsters.some(card=>card.uid===summoned.uid));
  assert.deepEqual(tag.tagActions(state,member(0)),[],
    'the inactive physical owner of Puppeteer never receives active-seat actions');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

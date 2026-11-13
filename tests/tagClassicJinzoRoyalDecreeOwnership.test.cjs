'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const JINZO='77585513';
const ROYAL_DECREE='51452091';
const SAKURETSU_ARMOR='56120475';
const jinzo=getPlayableCard(JINZO);
const decree=getPlayableCard(ROYAL_DECREE);
const sakuretsu=getPlayableCard(SAKURETSU_ARMOR);
assert.ok(jinzo&&jinzo.kind==='monster','Jinzo must be an enabled Monster');
assert.ok(decree&&decree.kind==='trap','Royal Decree must be an enabled Continuous Trap');
assert.ok(sakuretsu&&sakuretsu.kind==='trap','Sakuretsu Armor must be an enabled Trap');
assert.equal(getMonsterEffect(JINZO)?.operation.kind,'negateTraps');
assert.equal(getEffect(ROYAL_DECREE)?.kind,'continuous');
assert.ok(getEffect(ROYAL_DECREE)?.kind==='continuous'&&getEffect(ROYAL_DECREE).rules.some(rule=>rule.kind==='negateTraps'));
assert.equal(getEffect(SAKURETSU_ARMOR)?.kind,'sakuretsuArmor');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk));
assert.ok(normal.length>=7,'the trap-lock fixture needs seven certified Normal Monsters');
const attackerEntry=normal.reduce((best,current)=>current.card.atk>best.card.atk?current:best);
const deckIds=[...new Set([attackerEntry.id,...normal.map(entry=>entry.id)])].slice(0,7);
assert.equal(deckIds.length,7);

function member(seat){return 'm101-seat-'+seat;}
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
  throw new Error('M101 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'the four 20-card physical decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique before the response chain');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'trap resolution must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'trap resolution must not duplicate physical UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function setup(sourceKind,sourceId,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),
    name:'M101 Seat '+seat,
    cards:deck(seat===2?[sourceId]:seat===3?[SAKURETSU_ARMOR]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed});
  const before=inventorySnapshot(state);
  const attacker=deploy(state,0,attackerEntry.id);
  const sourceCard=takeCard(state,2,sourceId);
  let source;
  if(sourceKind==='monster'){
    source={...sourceCard,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
    state.core.players[0].monsters.push(source);
  }else{
    source={...sourceCard,setTurn:0,faceUp:true,resolved:true};
    state.core.players[0].backrow.push(source);
  }
  const trapCard=takeCard(state,3,SAKURETSU_ARMOR);
  const trap={...trapCard,setTurn:0,faceUp:false};
  state.core.players[1].backrow.push(trap);
  state.core.turn=3;
  assert.match(attacker.uid,/^m0:/);
  assert.match(source.uid,/^m2:/,'the continuous source must retain its inactive physical teammate UID');
  assert.match(trap.uid,/^m3:/,'the set Trap must retain its inactive physical teammate UID');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return {state,before,attacker,source,trap};
}
function declareDirectAttack(state,attacker){
  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle,'the active attacker seat must enter the Battle Phase');
  state=settle(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===undefined
  );
  assert.ok(attack,'the active teammate must be able to declare the direct attack');
  state=tag.stepTagDuel(state,member(0),attack);
  assert.equal(state.core.phase,'response');
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the active physical member of the defending team owns response priority');
  return state;
}

test('Jinzo owned by an inactive teammate blocks the active opposing teammate from activating a set Trap',()=>{
  let {state,before,attacker,source:jinzo,trap}=setup('monster',JINZO,'m101-jinzo-inactive-teammate');
  const publicBefore=tag.publicTagDuel(state);
  assert.ok(!JSON.stringify(publicBefore).includes(SAKURETSU_ARMOR),
    'the opposing set Trap identity must remain hidden before activation');
  assert.ok(!JSON.stringify(publicBefore).includes(trap.uid),
    'the opposing set Trap physical UID must remain hidden before activation');

  state=declareDirectAttack(state,attacker);
  const blocked=tag.tagActions(state,member(1));
  assert.ok(blocked.some(action=>action.kind==='pass'));
  assert.ok(!blocked.some(action=>action.kind==='trap'&&action.card===trap.uid),
    'face-up Jinzo on the other team must prevent Trap activation, not merely negate resolution');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive physical owner of Sakuretsu Armor must not receive response priority');

  // A face-down Jinzo is no longer a continuous source. The same pending
  // attack must immediately expose the legal Trap response, without a stale cache.
  jinzo.faceUp=false;
  jinzo.position='def';
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const restored=tag.tagActions(state,member(1)).find(action=>
    action.kind==='trap'&&action.card===trap.uid&&action.target===attacker.uid
  );
  assert.ok(restored,'turning Jinzo face-down must restore the Trap activation window');
  state=settle(tag.stepTagDuel(state,member(1),restored));
  assert.ok(state.core.players[0].grave.some(card=>card.uid===attacker.uid),
    'Sakuretsu Armor must destroy the attacker after Jinzo stops applying');
  assert.ok(state.core.players[1].grave.some(card=>card.uid===trap.uid),
    'the activated physical Trap must move to the shared team Graveyard');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

test('Royal Decree owned by an inactive teammate allows Trap activation but negates the Trap effect on resolution',()=>{
  let {state,before,attacker,source:royalDecree,trap}=setup('trap',ROYAL_DECREE,'m101-royal-decree-inactive-teammate');
  assert.equal(royalDecree.faceUp,true);
  assert.equal(royalDecree.resolved,true);
  state=declareDirectAttack(state,attacker);

  const response=tag.tagActions(state,member(1)).find(action=>
    action.kind==='trap'&&action.card===trap.uid&&action.target===attacker.uid
  );
  assert.ok(response,
    'Royal Decree must permit the opponent Trap activation; its policy differs from Jinzo');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive physical Trap owner must not control the response decision');
  state=settle(tag.stepTagDuel(state,member(1),response));

  assert.ok(state.core.players[1].grave.some(card=>card.uid===trap.uid),
    'the activated Trap must be consumed even when its effect is negated');
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===attacker.uid),
    'Royal Decree must negate Sakuretsu Armor rather than destroy the attacker');
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===royalDecree.uid&&card.faceUp),
    'the inactive teammate continuous source must remain face-up and active');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

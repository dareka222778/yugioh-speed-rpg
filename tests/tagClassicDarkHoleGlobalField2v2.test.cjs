'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel,getDestructionModel}=require('../dist/effectModels');

const DARK_HOLE='53129443';
const MIRROR_FORCE='44095762';
const TORRENTIAL='53582587';
const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the 2v2 fixture needs eight certified Normal Monsters');
const deckIds=normal.slice(0,8).map(entry=>entry.id);
function member(seat){return 'm162-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...deckIds])];
  assert.ok(ids.length>=8);
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
  throw new Error('M162 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const held=physical.hand.find(card=>card.id===id);
  if(held)return held;
  const index=physical.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'the physical seat Deck must contain '+id);
  const [card]=physical.deck.splice(index,1);
  physical.hand.push(card);
  return card;
}
function deploy(state,seat,id,{faceUp=true,position='atk'}={}){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function act(state,seat,kind,filter=()=>true){
  const action=tag.tagActions(state,member(seat)).find(candidate=>candidate.kind===kind&&filter(candidate));
  assert.ok(action,'seat '+seat+' needs '+kind+' in '+state.core.phase);
  return tag.stepTagDuel(state,member(seat),action);
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<20,'the Dark Hole response chain must terminate');
    const seat=tag.tagDecisionMember(state).id;
    const action=tag.tagActions(state,seat).find(candidate=>candidate.kind==='pass');
    assert.ok(action,'the active physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,seat,action);
  }
  return state;
}
function snapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'all four physical 20-card decks must remain represented');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Dark Hole must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Dark Hole is a Normal Spell whose destruction model covers both shared 2v2 fields',()=>{
  const effect=getEffect(DARK_HOLE);
  assert.equal(getPlayableCard(DARK_HOLE)?.kind,'spell');
  assert.equal(effect?.kind,'darkHole');
  assert.deepEqual(getActivationModel(effect),{
    speed:1,window:'main',damage:'never'
  });
  assert.deepEqual(getDestructionModel(effect),{
    operation:'destroyMonsters',scope:'all',destination:'grave'
  });
});

test('Dark Hole destroys every monster from all four physical owners while preserving both teams backrows',()=>{
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M162 Seat '+seat,
    cards:deck(seat===0?[DARK_HOLE]:seat===2?[MIRROR_FORCE]:seat===3?[TORRENTIAL]:[])
  }));
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m162-dark-hole-global-field'});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  const spell=ensureInHand(state,0,DARK_HOLE);
  const monsters=[
    deploy(state,0,normal[0].id,{position:'atk'}),
    deploy(state,2,normal[1].id,{position:'def'}),
    deploy(state,1,normal[2].id,{faceUp:false,position:'def'}),
    deploy(state,3,normal[3].id,{position:'atk'})
  ];
  const team0TrapCard=takeCard(state,2,MIRROR_FORCE);
  const team1TrapCard=takeCard(state,3,TORRENTIAL);
  const team0Trap={...team0TrapCard,faceUp:false,setTurn:0};
  const team1Trap={...team1TrapCard,faceUp:false,setTurn:0};
  state.core.players[0].backrow.push(team0Trap);
  state.core.players[1].backrow.push(team1Trap);
  const before=snapshot(state);
  const publicBefore=JSON.stringify(tag.publicTagDuel(state));
  for(const hidden of [team0Trap,team1Trap]){
    assert.ok(!publicBefore.includes(hidden.id),'set Trap identity must remain private');
    assert.ok(!publicBefore.includes(hidden.uid),'set Trap UID must remain private');
  }

  const spellAction=tag.tagActions(state,member(0)).find(action=>action.kind==='spell'&&action.card===spell.uid);
  assert.ok(spellAction,'the active physical owner must be able to activate Dark Hole');
  state=tag.stepTagDuel(state,member(0),spellAction);
  state=settle(state);

  assert.deepEqual(state.core.players[0].monsters,[],'Dark Hole must clear both team 0 physical members');
  assert.deepEqual(state.core.players[1].monsters,[],'Dark Hole must clear both team 1 physical members');
  for(const monster of monsters){
    const team=Number(monster.owner);
    assert.ok(state.core.players[team].grave.some(card=>card.uid===monster.uid),
      'each destroyed monster must enter its shared team Graveyard: '+monster.uid);
  }
  assert.ok(state.core.players[0].grave.some(card=>card.uid===spell.uid),'Dark Hole itself must resolve to its owner team Graveyard');
  assert.ok(state.core.players[0].backrow.some(card=>card.uid===team0Trap.uid),'team 0 Set Trap must survive');
  assert.ok(state.core.players[1].backrow.some(card=>card.uid===team1Trap.uid),'team 1 Set Trap must survive');
  const publicAfter=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicAfter.includes(team0Trap.id)&&!publicAfter.includes(team0Trap.uid),'team 0 Set Trap remains private');
  assert.ok(!publicAfter.includes(team1Trap.id)&&!publicAfter.includes(team1Trap.uid),'team 1 Set Trap remains private');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

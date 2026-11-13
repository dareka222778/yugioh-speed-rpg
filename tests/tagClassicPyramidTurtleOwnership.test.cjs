'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const PYRAMID_TURTLE='77044671';
const KURIBOH='40640057';
const turtle=getPlayableCard(PYRAMID_TURTLE);
assert.ok(turtle&&turtle.kind==='monster');
assert.equal(getMonsterEffect(PYRAMID_TURTLE)?.trigger,'onBattleDestroyed');
assert.deepEqual(getMonsterEffect(PYRAMID_TURTLE)?.operation,{
  kind:'recruit',
  filter:{race:'Zombie',maximumDef:2000},
  positions:['atk','def']
});
const normalCards=[...new Set(tag.tagNormalCardIds)]
  .map(id=>getPlayableCard(id))
  .filter(card=>card&&Number.isInteger(card.atk)&&Number.isInteger(card.defense));
const attackerEntry=normalCards
  .filter(card=>card.atk>(turtle.defense??0))
  .sort((a,b)=>b.atk-a.atk)[0];
const zombieCandidate=normalCards
  .filter(card=>card.race==='Zombie'&&card.defense<=2000)
  .sort((a,b)=>a.defense-b.defense)[0];
assert.ok(attackerEntry,'Pyramid Turtle battle fixture needs a stronger Normal Monster');
assert.ok(zombieCandidate,'Pyramid Turtle fixture needs an eligible Zombie in the active physical Deck');
assert.ok(getPlayableCard(KURIBOH)?.kind==='monster');
function member(seat){return 'm95-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...tag.tagNormalCardIds])].slice(0,7);
  assert.ok(ids.length>=7,'fixture deck must have seven unique identities');
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
  throw new Error('M95 fixture card missing from physical seat '+seat+': '+id);
}
function ensureInDeck(state,seat,id){
  const physical=holder(state,seat);
  const index=physical.hand.findIndex(card=>card.id===id);
  if(index>=0)physical.deck.push(physical.hand.splice(index,1)[0]);
  const found=physical.deck.find(card=>card.id===id);
  assert.ok(found,'expected card must remain in physical Deck '+seat);
  return found;
}
function deploy(state,seat,id,position,faceUp=true){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,setTurn:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
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

function diagnosticTest(name,run){
  test(name,(...args)=>{
    try{return run(...args);}
    catch(error){
      const detail='[M95 Pyramid Turtle diagnostic] '+(error?.stack??String(error))+'\\n';
      try{fs.mkdirSync('artifacts',{recursive:true});fs.appendFileSync('artifacts/engine-acceptance-failure.tap',detail);}catch{}
      process.stderr.write(detail);
      throw error;
    }
  });
}

diagnosticTest('Pyramid Turtle owned by inactive seat 3 recruits an eligible Zombie only from active seat 1 Deck',()=>{
  const players=[
    {id:member(0),name:'M95 Seat 0',cards:deck([attackerEntry.id])},
    {id:member(1),name:'M95 Seat 1',cards:deck([zombieCandidate.id,KURIBOH])},
    {id:member(2),name:'M95 Seat 2',cards:deck()},
    {id:member(3),name:'M95 Seat 3',cards:deck([PYRAMID_TURTLE,zombieCandidate.id])}
  ];
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m95-pyramid-turtle-active-deck'});
  const attacker=deploy(state,0,attackerEntry.id,'atk');
  const source=deploy(state,3,PYRAMID_TURTLE,'def',true);
  const activeCandidate=ensureInDeck(state,1,zombieCandidate.id);
  const inactiveCandidate=ensureInDeck(state,3,zombieCandidate.id);
  const nonZombie=ensureInDeck(state,1,KURIBOH);
  state.core.turn=3;
  assert.match(source.uid,/^m3:/);
  assert.match(activeCandidate.uid,/^m1:/);
  assert.match(inactiveCandidate.uid,/^m3:/);
  const before=inventorySnapshot(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=settleResponses(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===source.uid
  );
  assert.ok(attack);
  state=settleResponses(tag.stepTagDuel(state,member(0),attack));

  assert.ok(state.core.players[1].grave.some(card=>card.uid===source.uid),'Pyramid Turtle must enter the shared Graveyard');
  assert.equal(state.core.phase,'choice');
  assert.equal(state.core.choice.source,'triggerOptional');
  assert.equal(tag.tagDecisionMember(state).id,member(1),'active defending teammate resolves the inactive partner trigger');
  assert.deepEqual(tag.tagActions(state,member(3)),[],'inactive source owner must not receive the decision');
  const activate=tag.tagActions(state,member(1)).find(action=>action.kind==='choose'&&action.target===source.uid);
  assert.ok(activate,'the active representative must be able to activate Pyramid Turtle');
  state=settleResponses(tag.stepTagDuel(state,member(1),activate));

  assert.equal(state.core.phase,'choice');
  assert.equal(state.core.choice.source,'monsterRecruit');
  assert.equal(state.core.choice.actor,1);
  const choices=tag.tagActions(state,member(1)).filter(action=>action.kind==='choose');
  assert.ok(choices.some(action=>action.target===activeCandidate.uid),'eligible Zombie from active physical Deck must be offered');
  assert.ok(!choices.some(action=>action.target===inactiveCandidate.uid),'inactive source owner Deck must not leak into recruit choices');
  assert.ok(!choices.some(action=>action.target===nonZombie.uid),'non-Zombie card must be excluded by the race filter');
  const chosen=choices.find(action=>action.target===activeCandidate.uid);
  state=settleResponses(tag.stepTagDuel(state,member(1),chosen));
  assert.equal(state.core.choice.source,'monsterRecruitPosition');
  const position=tag.tagActions(state,member(1)).find(action=>action.kind==='choose'&&action.target==='__recruit_def__');
  assert.ok(position,'the active representative must choose a legal Special Summon position');
  state=settleResponses(tag.stepTagDuel(state,member(1),position));

  assert.ok(state.core.players[1].monsters.some(card=>card.uid===activeCandidate.uid&&card.id===zombieCandidate.id),
    'the selected Zombie must be Special Summoned to the shared team field with its physical UID');
  assert.ok(state.reserves[3].deck.some(card=>card.uid===inactiveCandidate.uid),
    'inactive partner Deck must remain unchanged');
  assert.ok(state.core.players[1].deck.some(card=>card.uid===nonZombie.uid),
    'the non-Zombie candidate must remain in the active Deck');
  assert.equal(state.core.players[0].lp,4000,'attacking a Defense Position Turtle causes no battle damage');
  assert.equal(state.core.players[1].lp,4000);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

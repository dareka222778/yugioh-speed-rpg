'use strict';
const {test}=require('node:test');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const KURIBOH='40640057';
const sources=[
  {id:'97017120',name:'Giant Rat',attribute:'EARTH'},
  {id:'95956346',name:'Shining Angel',attribute:'LIGHT'},
  {id:'60806437',name:'UFO Turtle',attribute:'FIRE'},
  {id:'57839750',name:'Mother Grizzly',attribute:'WATER'},
  {id:'84834865',name:'Flying Kamakiri #1',attribute:'WIND'}
];
const normalCards=[...new Set(tag.tagNormalCardIds)]
  .map(id=>getPlayableCard(id))
  .filter(card=>card&&card.kind==='monster'&&Number.isInteger(card.atk));

function diagnosticTest(name,run){
  test(name,(...args)=>{
    try{return run(...args);}
    catch(error){
      const detail='[M99 attribute recruiter diagnostic] '+(error?.stack??String(error))+'\\n';
      try{fs.mkdirSync('artifacts',{recursive:true});fs.appendFileSync('artifacts/engine-acceptance-failure.tap',detail);}catch{}
      process.stderr.write(detail);
      throw error;
    }
  });
}
function member(seat){return 'm99-seat-'+seat;}
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
  throw new Error('M99 fixture card missing from physical seat '+seat+': '+id);
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
    assert.ok(pass,'the current responder must have a legal pass');
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

for(const source of sources)diagnosticTest(source.name+' recruits only the matching attribute from the active physical teammate Deck in 2v2',()=>{
  const sourceCard=getPlayableCard(source.id);
  assert.ok(sourceCard&&sourceCard.kind==='monster',source.name+' must be playable in the current catalog');
  const candidateDef=normalCards
    .filter(card=>card.attribute===source.attribute&&card.atk<=1500)
    .sort((a,b)=>b.atk-a.atk)[0];
  const attackerDef=normalCards
    .filter(card=>card.atk>(sourceCard.atk??0))
    .sort((a,b)=>b.atk-a.atk)[0];
  assert.ok(candidateDef,source.name+' needs a matching Normal Monster at or below 1500 ATK');
  assert.ok(attackerDef,source.name+' needs a stronger Normal Monster attacker');
  const effect=getMonsterEffect(source.id);
  assert.equal(effect?.trigger,'onBattleDestroyed');
  assert.deepEqual(effect?.operation,{kind:'specialSummon',attribute:source.attribute,maximumAtk:1500});
  const kuriboh=getPlayableCard(KURIBOH);
  assert.ok(kuriboh&&kuriboh.kind==='monster');
  assert.notEqual(kuriboh.attribute,source.attribute);

  const players=[
    {id:member(0),name:'M99 Seat 0',cards:deck([attackerDef.id])},
    {id:member(1),name:'M99 Seat 1',cards:deck([candidateDef.id,KURIBOH])},
    {id:member(2),name:'M99 Seat 2',cards:deck()},
    {id:member(3),name:'M99 Seat 3',cards:deck([source.id,candidateDef.id])}
  ];
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m99-'+source.id+'-active-physical-deck'});
  const attacker=deploy(state,0,attackerDef.id,'atk');
  const sourceMonster=deploy(state,3,source.id,'atk');
  const activeCandidate=ensureInDeck(state,1,candidateDef.id);
  const inactiveCandidate=ensureInDeck(state,3,candidateDef.id);
  const wrongAttribute=ensureInDeck(state,1,KURIBOH);
  state.core.turn=3;

  assert.match(attacker.uid,/^m0:/);
  assert.match(sourceMonster.uid,/^m3:/);
  assert.match(activeCandidate.uid,/^m1:/);
  assert.match(inactiveCandidate.uid,/^m3:/);
  assert.match(wrongAttribute.uid,/^m1:/);
  assert.equal(candidateDef.attribute,source.attribute);
  assert.notEqual(kuriboh.attribute,source.attribute);
  assert.ok(attackerDef.atk>sourceCard.atk);
  const before=inventorySnapshot(state);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));

  const battle=tag.tagActions(state,member(0)).find(action=>action.kind==='battle');
  assert.ok(battle);
  state=settleResponses(tag.stepTagDuel(state,member(0),battle));
  const attack=tag.tagActions(state,member(0)).find(action=>
    action.kind==='attack'&&action.card===attacker.uid&&action.target===sourceMonster.uid
  );
  assert.ok(attack);
  state=settleResponses(tag.stepTagDuel(state,member(0),attack));

  assert.ok(state.core.players[1].grave.some(card=>card.uid===sourceMonster.uid),
    'the destroyed recruiter must enter the shared defending team Graveyard');
  assert.equal(state.core.phase,'choice');
  assert.equal(state.core.choice.source,'triggerOptional');
  assert.equal(state.core.choice.actor,1);
  assert.equal(tag.tagDecisionMember(state).id,member(1),
    'the active physical teammate resolves the optional trigger');
  assert.deepEqual(tag.tagActions(state,member(3)),[],
    'the inactive source owner must not receive the activation decision');
  const activate=tag.tagActions(state,member(1)).find(action=>
    action.kind==='choose'&&action.target===sourceMonster.uid
  );
  assert.ok(activate);
  state=settleResponses(tag.stepTagDuel(state,member(1),activate));

  assert.equal(state.core.phase,'choice');
  assert.equal(state.core.choice.source,'monsterRecruit');
  assert.equal(state.core.choice.actor,1);
  const choices=tag.tagActions(state,member(1)).filter(action=>action.kind==='choose');
  assert.ok(choices.some(action=>action.target===activeCandidate.uid),
    'the matching candidate in the active physical Deck must be offered');
  assert.ok(!choices.some(action=>action.target===inactiveCandidate.uid),
    'the inactive partner physical Deck must not leak into the choice list');
  assert.ok(!choices.some(action=>action.target===wrongAttribute.uid),
    'a monster with the wrong Attribute must be excluded even below the ATK limit');
  const chosen=choices.find(action=>action.target===activeCandidate.uid);
  state=settleResponses(tag.stepTagDuel(state,member(1),chosen));

  assert.ok(state.core.players[1].monsters.some(card=>
    card.uid===activeCandidate.uid&&card.id===candidateDef.id
  ),'the selected physical UID must be Special Summoned to the shared team field');
  assert.ok(state.reserves[3].deck.some(card=>card.uid===inactiveCandidate.uid),
    'the inactive partner copy must remain in its physical reserve Deck');
  assert.ok(state.core.players[1].deck.some(card=>card.uid===wrongAttribute.uid),
    'the wrong-Attribute card must remain in the active physical Deck');
  assert.ok(!state.core.players[1].deck.some(card=>card.uid===activeCandidate.uid));
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000-(attackerDef.atk-sourceCard.atk));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

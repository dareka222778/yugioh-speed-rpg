'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getMonsterEffect}=require('../dist/effectRegistry');

const KURIBOH='40640057';
const sources=[
  {id:'39191307',name:'Masked Dragon',race:'Dragon',atk:1400},
  {id:'93107608',name:'Howling Insect',race:'Insect',atk:1200}
];
const normal=tag.tagNormalCardIds.map(id=>getPlayableCard(id)).filter(card=>card&&Number.isInteger(card.atk));
const fixtures=sources.map(source=>{
  const candidate=normal.filter(card=>card.race===source.race&&card.atk<=1500).sort((a,b)=>b.atk-a.atk)[0];
  const attacker=normal.filter(card=>card.atk>source.atk).sort((a,b)=>b.atk-a.atk)[0];
  assert.ok(candidate,source.name+' needs an eligible '+source.race+' Normal Monster');
  assert.ok(attacker,source.name+' needs a stronger Normal Monster attacker');
  const effect=getMonsterEffect(source.id);
  assert.equal(effect?.trigger,'onBattleDestroyed');
  assert.deepEqual(effect?.operation,{kind:'recruit',filter:{race:source.race,maximumAtk:1500},positions:['atk','def']});
  return {source,candidate,attacker};
});
assert.equal(getPlayableCard(KURIBOH)?.kind,'monster');

function member(seat){return 'm96-seat-'+seat;}
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
  throw new Error('M96 fixture card missing from physical seat '+seat+': '+id);
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

for(const fixture of fixtures)test(fixture.source.name+' recruits only its race/ATK filter from the active physical teammate Deck',()=>{
  const sourceDef=fixture.source,candidateDef=fixture.candidate,attackerDef=fixture.attacker;
  const players=[
    {id:member(0),name:'M96 Seat 0',cards:deck([attackerDef.id])},
    {id:member(1),name:'M96 Seat 1',cards:deck([candidateDef.id,KURIBOH])},
    {id:member(2),name:'M96 Seat 2',cards:deck()},
    {id:member(3),name:'M96 Seat 3',cards:deck([sourceDef.id,candidateDef.id])}
  ];
  let state=tag.createTagDuel(players,{classic:true,first:0,seed:'m96-'+sourceDef.id});
  const attacker=deploy(state,0,attackerDef.id,'atk');
  const source=deploy(state,3,sourceDef.id,'atk');
  const activeCandidate=ensureInDeck(state,1,candidateDef.id);
  const inactiveCandidate=ensureInDeck(state,3,candidateDef.id);
  const nonMatching=ensureInDeck(state,1,KURIBOH);
  state.core.turn=3;
  assert.ok(attackerDef.atk>sourceDef.atk);
  assert.equal(candidateDef.race,sourceDef.race);
  assert.ok(candidateDef.atk<=1500);
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

  assert.ok(state.core.players[1].grave.some(card=>card.uid===source.uid));
  assert.equal(state.core.phase,'choice');
  assert.equal(state.core.choice.source,'triggerOptional');
  assert.equal(tag.tagDecisionMember(state).id,member(1));
  assert.deepEqual(tag.tagActions(state,member(3)),[]);
  const activate=tag.tagActions(state,member(1)).find(action=>action.kind==='choose'&&action.target===source.uid);
  assert.ok(activate);
  state=settleResponses(tag.stepTagDuel(state,member(1),activate));

  assert.equal(state.core.phase,'choice');
  assert.equal(state.core.choice.source,'monsterRecruit');
  assert.equal(state.core.choice.actor,1);
  const choices=tag.tagActions(state,member(1)).filter(action=>action.kind==='choose');
  assert.ok(choices.some(action=>action.target===activeCandidate.uid));
  assert.ok(!choices.some(action=>action.target===inactiveCandidate.uid));
  assert.ok(!choices.some(action=>action.target===nonMatching.uid),'Kuriboh must fail the race filter');
  const chosen=choices.find(action=>action.target===activeCandidate.uid);
  state=settleResponses(tag.stepTagDuel(state,member(1),chosen));
  assert.equal(state.core.choice.source,'monsterRecruitPosition');
  const position=tag.tagActions(state,member(1)).find(action=>action.kind==='choose'&&action.target==='__recruit_def__');
  assert.ok(position);
  state=settleResponses(tag.stepTagDuel(state,member(1),position));

  assert.ok(state.core.players[1].monsters.some(card=>card.uid===activeCandidate.uid&&card.id===candidateDef.id));
  assert.ok(state.reserves[3].deck.some(card=>card.uid===inactiveCandidate.uid));
  assert.ok(state.core.players[1].deck.some(card=>card.uid===nonMatching.uid));
  assert.equal(state.core.players[0].lp,4000);
  assert.equal(state.core.players[1].lp,4000-(attackerDef.atk-sourceDef.atk));
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  assertConserved(state,before);
});

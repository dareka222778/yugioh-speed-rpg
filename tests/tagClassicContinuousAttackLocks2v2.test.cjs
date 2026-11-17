'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const ATTACK_LOCKS=[
  {id:'23615409',name:'Insect Barrier',kind:'spell',effect:{kind:'continuous',activation:{speed:1,window:'main',damage:'never'},rules:[{kind:'preventAttack',filter:{controller:'opponent',races:['Insect']},declarationOnly:true}]}},
  {id:'85742772',name:'Gravity Bind',kind:'trap',effect:{kind:'continuous',activation:{speed:2,window:'free',damage:'never'},rules:[{kind:'preventAttack',filter:{minimumLevel:4}}]}},
  {id:'95220856',name:'Vengeful Bog Spirit',kind:'spell',effect:{kind:'continuous',activation:{speed:1,window:'main',damage:'never'},rules:[{kind:'preventAttack',filter:{summonedThisTurn:true}}]}}
];
for(const entry of ATTACK_LOCKS){
  assert.equal(getPlayableCard(entry.id)?.englishName,entry.name);
  assert.deepEqual(getEffect(entry.id),entry.effect,entry.name+' must retain its exact continuous attack restriction');
}

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>getPlayableCard(id))
  .filter(card=>card?.kind==='monster');
const used=new Set();
function choose(predicate,count,label){
  const chosen=NORMALS.filter(card=>!used.has(card.id)&&predicate(card)).slice(0,count);
  assert.equal(chosen.length,count,'the fixture needs '+count+' distinct '+label+' Normal Monsters');
  for(const card of chosen)used.add(card.id);
  return chosen;
}
const INSECTS=choose(card=>card.race==='Insect',2,'Insect');
const WARRIORS=choose(card=>card.race==='Warrior',2,'Warrior');
const HIGH_LEVEL=choose(card=>card.level>=4,2,'Level 4+');
const LOW_LEVEL=choose(card=>card.level<=3,2,'Level 3 or lower');
const FILLERS=choose(()=>true,9,'additional');
const ROLE_MONSTERS=[...INSECTS,...WARRIORS,...HIGH_LEVEL,...LOW_LEVEL,...FILLERS];
assert.equal(ROLE_MONSTERS.length,17);
const POOL=[...ATTACK_LOCKS.map(card=>card.id),...ROLE_MONSTERS.map(card=>card.id)];
assert.equal(POOL.length,20,'each physical participant must use a legal 20-card Deck');
assert.equal(new Set(POOL).size,20,'the fixture must not duplicate card identities');

function member(seat){return 'm247-seat-'+seat;}
function deck(){return [...POOL];}
function game(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M247 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.turn=3;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.deepEqual(state.active,[0,1]);
  return state;
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takePhysical(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M247 fixture card missing from physical seat '+seat+': '+id);
}
function placeMonster(state,seat,id,{entered=state.core.turn-1}={}){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,owner:seat%2,position:'atk',faceUp:true,
    entered,changed:0,attacked:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function putSpellInHand(state,seat,id){
  const card=takePhysical(state,seat,id);
  holder(state,seat).hand.push(card);
  return card;
}
function setTrap(state,seat,id,setTurn=1){
  const card=takePhysical(state,seat,id);
  holder(state,seat).backrow.push({...card,faceUp:false,setTurn});
  return card;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'continuous-effect response windows must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function activateContinuous(state,seat,id,kind){
  const source=kind==='spell'?putSpellInHand(state,seat,id):setTrap(state,seat,id);
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>
    candidate.kind===kind&&candidate.card===source.uid
  );
  assert.ok(action,id+' must be activatable by its active physical owner');
  state=settle(tag.stepTagDuel(state,actor,action));
  const live=state.core.players[seat%2].backrow.find(card=>card.uid===source.uid);
  assert.ok(live&&live.faceUp&&live.resolved,id+' must remain face-up as a resolved continuous source');
  return {state,source};
}
function activePerspective(state,team){
  const copy=structuredClone(state);
  copy.cursor=team;
  copy.core.current=team;
  copy.core.priority=team;
  copy.core.teamRotation.cursor=team;
  assert.doesNotThrow(()=>tag.assertTagDuel(copy));
  return copy;
}
function attackCards(state,team){
  let copy=activePerspective(state,team);
  const actor=tag.tagDecisionMember(copy).id;
  const battle=tag.tagActions(copy,actor).find(action=>action.kind==='battle');
  assert.ok(battle,'each team must be able to enter its Battle Phase');
  copy=tag.stepTagDuel(copy,actor,battle);
  return [...new Set(tag.tagActions(copy,actor).filter(action=>action.kind==='attack').map(action=>action.card))];
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute exactly 80 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,80,'all physical UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'continuous restrictions must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'continuous restrictions must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical card identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(let seat=0;seat<4;seat++)for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for physical seat '+seat);
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}

test('M247 metadata and legal format: the three continuous attack restrictions are exact and playable',()=>{
  for(const entry of ATTACK_LOCKS){
    assert.equal(getPlayableCard(entry.id)?.kind,entry.kind);
    assert.deepEqual(getEffect(entry.id),entry.effect);
  }
  const state=game('m247-format');
  assert.equal(tag.tagInventory(state).length,80);
  assertRestorable(state);
});

test('Insect Barrier blocks only opposing Insect attacks across both physical seats',()=>{
  let state=game('m247-insect-barrier');
  const before=inventorySnapshot(state);
  const alliedActiveInsect=placeMonster(state,0,INSECTS[0].id);
  const alliedPartnerWarrior=placeMonster(state,2,WARRIORS[0].id);
  const opposingActiveInsect=placeMonster(state,1,INSECTS[1].id);
  const opposingPartnerWarrior=placeMonster(state,3,WARRIORS[1].id);
  assert.match(alliedPartnerWarrior.uid,/^m2:/);
  assert.match(opposingPartnerWarrior.uid,/^m3:/);
  const {state:next}=activateContinuous(state,0,'23615409','spell');
  state=next;
  const alliedAttacks=attackCards(state,0);
  const opposingAttacks=attackCards(state,1);
  assert.ok(alliedAttacks.includes(alliedActiveInsect.uid),'the source team may still attack with its own Insect');
  assert.ok(alliedAttacks.includes(alliedPartnerWarrior.uid),'the source team partner may still attack');
  assert.ok(!opposingAttacks.includes(opposingActiveInsect.uid),'opposing Insects must be unable to declare attacks');
  assert.ok(opposingAttacks.includes(opposingPartnerWarrior.uid),'opposing non-Insects remain able to attack');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Gravity Bind blocks Level 4+ monsters on both teams but permits Level 3 and lower attackers',()=>{
  let state=game('m247-gravity-bind');
  const before=inventorySnapshot(state);
  const alliedHigh=placeMonster(state,0,HIGH_LEVEL[0].id);
  const alliedLow=placeMonster(state,2,LOW_LEVEL[0].id);
  const opposingHigh=placeMonster(state,1,HIGH_LEVEL[1].id);
  const opposingLow=placeMonster(state,3,LOW_LEVEL[1].id);
  const {state:next}=activateContinuous(state,0,'85742772','trap');
  state=next;
  const alliedAttacks=attackCards(state,0);
  const opposingAttacks=attackCards(state,1);
  assert.ok(!alliedAttacks.includes(alliedHigh.uid),'the source team Level 4+ monster is blocked');
  assert.ok(alliedAttacks.includes(alliedLow.uid),'the source team Level 3 or lower monster remains legal');
  assert.ok(!opposingAttacks.includes(opposingHigh.uid),'the opposing Level 4+ monster is also blocked');
  assert.ok(opposingAttacks.includes(opposingLow.uid),'the opposing Level 3 or lower monster remains legal');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Vengeful Bog Spirit blocks monsters summoned this turn on both teams and expires by turn number',()=>{
  let state=game('m247-vengeful-bog-spirit');
  const before=inventorySnapshot(state);
  const alliedOld=placeMonster(state,0,FILLERS[0].id,{entered:2});
  const alliedNew=placeMonster(state,2,FILLERS[1].id,{entered:3});
  const opposingOld=placeMonster(state,1,FILLERS[2].id,{entered:2});
  const opposingNew=placeMonster(state,3,FILLERS[3].id,{entered:3});
  const {state:next}=activateContinuous(state,0,'95220856','spell');
  state=next;
  assert.deepEqual(new Set(attackCards(state,0)),new Set([alliedOld.uid]));
  assert.deepEqual(new Set(attackCards(state,1)),new Set([opposingOld.uid]));
  const later=structuredClone(state);
  later.core.turn=4;
  assert.deepEqual(new Set(attackCards(later,0)),new Set([alliedOld.uid,alliedNew.uid]));
  assert.deepEqual(new Set(attackCards(later,1)),new Set([opposingOld.uid,opposingNew.uid]));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('a continuous attack restriction remains attached to the physical source after serialization',()=>{
  let state=game('m247-restore');
  placeMonster(state,0,INSECTS[0].id);
  placeMonster(state,1,INSECTS[1].id);
  state=activateContinuous(state,0,'23615409','spell').state;
  const restored=JSON.parse(JSON.stringify(state));
  assert.doesNotThrow(()=>tag.assertTagDuel(restored));
  assert.deepEqual(attackCards(restored,0),attackCards(state,0));
  assert.deepEqual(attackCards(restored,1),attackCards(state,1));
});

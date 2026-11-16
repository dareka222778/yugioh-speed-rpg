'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const POSITION_CARDS=[
  {id:'82828051',name:'Earthquake',kind:'spell',effect:{kind:'positionChange',activation:{speed:1,window:'main',damage:'never'},rule:{scope:'both',mode:'def'}}},
  {id:'59744639',name:'Windstorm of Etaqua',kind:'trap',effect:{kind:'positionChange',activation:{speed:2,window:'free',damage:'never'},rule:{scope:'opponent',mode:'switch'}}},
  {id:'83133491',name:'Zero Gravity',kind:'trap',effect:{kind:'positionChange',activation:{speed:2,window:'free',damage:'never'},rule:{scope:'both',mode:'switch'}}},
  {id:'31785398',name:'Ready for Intercepting',kind:'trap',effect:{kind:'positionChange',activation:{speed:2,window:'free',damage:'never'},rule:{scope:'selected',mode:'set',races:['Warrior','Spellcaster']}}}
];
for(const entry of POSITION_CARDS){
  assert.equal(getPlayableCard(entry.id)?.englishName,entry.name,entry.name+' must be an enabled historical card');
  assert.deepEqual(getEffect(entry.id),entry.effect,entry.name+' must retain its exact audited position rule');
}

const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>getPlayableCard(id))
  .filter(card=>card?.kind==='monster');
const WARRIORS=NORMALS.filter(card=>card.race==='Warrior');
const SPELLCASTERS=NORMALS.filter(card=>card.race==='Spellcaster');
const DRAGONS=NORMALS.filter(card=>card.race==='Dragon');
assert.ok(WARRIORS.length>=2,'the fixture needs two distinct Normal Warrior targets');
assert.ok(SPELLCASTERS.length>=1,'the fixture needs a Normal Spellcaster target');
assert.ok(DRAGONS.length>=1,'the fixture needs a Normal Dragon control target');
const TARGETS=[WARRIORS[0].id,WARRIORS[1].id,SPELLCASTERS[0].id,DRAGONS[0].id];
const excluded=new Set([...POSITION_CARDS.map(card=>card.id),...TARGETS]);
const FILLERS=NORMALS.map(card=>card.id).filter(id=>!excluded.has(id)).slice(0,12);
assert.equal(FILLERS.length,12,'the fixture needs twelve distinct certified Normal Monster fillers');
const POOL=[...POSITION_CARDS.map(card=>card.id),...TARGETS,...FILLERS];
assert.equal(POOL.length,20,'each physical participant must use a legal 20-card Deck');
assert.equal(new Set(POOL).size,20,'the fixture must not duplicate card identities');

function member(seat){return 'm246-seat-'+seat;}
function deck(){return [...POOL];}
function game(seed,first=0){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M246 Seat '+seat,cards:deck()
  }));
  const state=tag.createTagDuel(players,{classic:true,first,seed});
  state.core.turn=3;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(state.active[first%2],first);
  assert.equal(tag.tagDecisionMember(state).id,member(first));
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
  throw new Error('M246 fixture card missing from physical seat '+seat+': '+id);
}
function placeMonster(state,seat,id,{position='atk',faceUp=true}={}){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,owner:seat%2,position,faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0
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
  const physical=holder(state,seat);
  assert.ok(Array.isArray(physical.backrow),'only the active physical seat may set a Trap');
  physical.backrow.push({...card,faceUp:false,setTurn});
  return card;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'position-change response windows must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function activate(state,seat,id,kind,target){
  const source=kind==='spell'?putSpellInHand(state,seat,id):setTrap(state,seat,id);
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>
    candidate.kind===kind&&candidate.card===source.uid&&
    (target===undefined||candidate.target===target)
  );
  assert.ok(action,id+' must expose a legal action to the active physical seat');
  state=settle(tag.stepTagDuel(state,actor,action));
  assert.ok(state.core.players[seat%2].grave.some(card=>card.uid===source.uid),
    id+' must send its resolved source to the activating team Graveyard');
  return {state,source};
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
  assert.equal(cards.length,before.size,'position changes must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'position changes must not duplicate UIDs');
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
function byUid(state,team,card){return state.core.players[team].monsters.find(entry=>entry.uid===card.uid);}

test('M246 metadata and legal format: all four position effects retain exact identities and rules',()=>{
  for(const entry of POSITION_CARDS){
    assert.equal(getPlayableCard(entry.id)?.kind,entry.kind);
    assert.deepEqual(getEffect(entry.id),entry.effect);
  }
  const state=game('m246-format-metadata');
  assert.equal(tag.tagInventory(state).length,80);
  assertRestorable(state);
});

test('Earthquake changes every face-up monster on both shared fields to Defense and leaves hidden cards untouched',()=>{
  let state=game('m246-earthquake-both-fields');
  const before=inventorySnapshot(state);
  const alliedPartner=placeMonster(state,2,TARGETS[0]);
  const alliedHidden=placeMonster(state,0,FILLERS[0],{position:'def',faceUp:false});
  const opposingActive=placeMonster(state,1,TARGETS[2]);
  const opposingPartner=placeMonster(state,3,FILLERS[1],{position:'def'});
  assert.match(alliedPartner.uid,/^m2:/);
  assert.match(opposingPartner.uid,/^m3:/);
  const {state:next,source}=activate(state,0,'82828051','spell');
  state=next;
  assert.equal(byUid(state,0,alliedPartner).position,'def');
  assert.equal(byUid(state,0,alliedPartner).faceUp,true);
  assert.equal(byUid(state,0,alliedHidden).position,'def');
  assert.equal(byUid(state,0,alliedHidden).faceUp,false);
  assert.equal(byUid(state,1,opposingActive).position,'def');
  assert.equal(byUid(state,1,opposingPartner).position,'def');
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

for(const actorSeat of [0,1]){
  test('Windstorm of Etaqua switches only the opposing shared field when team '+(actorSeat%2)+' activates it',()=>{
    let state=game('m246-windstorm-'+actorSeat,actorSeat);
    const before=inventorySnapshot(state);
    const ownPartnerSeat=actorSeat+2;
    const enemySeat=1-actorSeat;
    const enemyPartnerSeat=enemySeat+2;
    const ownActive=placeMonster(state,actorSeat,FILLERS[0],{position:'atk'});
    const ownPartner=placeMonster(state,ownPartnerSeat,FILLERS[1],{position:'def'});
    const ownHidden=placeMonster(state,actorSeat,FILLERS[2],{position:'def',faceUp:false});
    const enemyActive=placeMonster(state,enemySeat,FILLERS[3],{position:'atk'});
    const enemyPartner=placeMonster(state,enemyPartnerSeat,FILLERS[4],{position:'def'});
    const enemyHidden=placeMonster(state,enemyPartnerSeat,FILLERS[5],{position:'def',faceUp:false});
    assert.match(ownPartner.uid,new RegExp('^m'+ownPartnerSeat+':'));
    assert.match(enemyPartner.uid,new RegExp('^m'+enemyPartnerSeat+':'));
    const {state:next}=activate(state,actorSeat,'59744639','trap');
    state=next;
    assert.equal(byUid(state,actorSeat%2,ownActive).position,'atk');
    assert.equal(byUid(state,actorSeat%2,ownPartner).position,'def');
    assert.equal(byUid(state,actorSeat%2,ownHidden).position,'def');
    assert.equal(byUid(state,actorSeat%2,ownHidden).faceUp,false);
    assert.equal(byUid(state,enemySeat%2,enemyActive).position,'def');
    assert.equal(byUid(state,enemySeat%2,enemyPartner).position,'atk');
    assert.equal(byUid(state,enemySeat%2,enemyHidden).position,'def');
    assert.equal(byUid(state,enemySeat%2,enemyHidden).faceUp,false);
    assertConserved(state,before);
    assertPrivateHands(state);
    assertRestorable(state);
  });
}

test('Zero Gravity switches face-up monsters in both shared fields without revealing or changing hidden monsters',()=>{
  let state=game('m246-zero-gravity');
  const before=inventorySnapshot(state);
  const alliedAttack=placeMonster(state,2,FILLERS[6],{position:'atk'});
  const alliedDefense=placeMonster(state,0,FILLERS[7],{position:'def'});
  const opposingAttack=placeMonster(state,1,FILLERS[8],{position:'atk'});
  const opposingDefense=placeMonster(state,3,FILLERS[9],{position:'def'});
  const opposingHidden=placeMonster(state,3,FILLERS[10],{position:'def',faceUp:false});
  const {state:next}=activate(state,0,'83133491','trap');
  state=next;
  assert.equal(byUid(state,0,alliedAttack).position,'def');
  assert.equal(byUid(state,0,alliedDefense).position,'atk');
  assert.equal(byUid(state,1,opposingAttack).position,'def');
  assert.equal(byUid(state,1,opposingDefense).position,'atk');
  assert.equal(byUid(state,1,opposingHidden).position,'def');
  assert.equal(byUid(state,1,opposingHidden).faceUp,false);
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Ready for Intercepting can select an eligible partner-owned or opposing monster, but not a Dragon or a hidden monster',()=>{
  let state=game('m246-ready-for-intercepting');
  const before=inventorySnapshot(state);
  const alliedWarrior=placeMonster(state,2,WARRIORS[0].id,{position:'atk'});
  const opposingSpellcaster=placeMonster(state,3,SPELLCASTERS[0].id,{position:'atk'});
  const opposingDragon=placeMonster(state,1,DRAGONS[0].id,{position:'atk'});
  const alliedHiddenWarrior=placeMonster(state,0,WARRIORS[1].id,{position:'def',faceUp:false});
  const source=setTrap(state,0,'31785398');
  const offered=tag.tagActions(state,member(0)).filter(action=>
    action.kind==='trap'&&action.card===source.uid
  );
  assert.deepEqual(new Set(offered.map(action=>action.target)),new Set([alliedWarrior.uid,opposingSpellcaster.uid]),
    'the target selector must span both teams but reveal only face-up Warriors and Spellcasters');
  const selected=offered.find(action=>action.target===opposingSpellcaster.uid);
  assert.ok(selected,'the active player may select a Spellcaster owned by the inactive opposing partner');
  state=settle(tag.stepTagDuel(state,member(0),selected));
  const liveTarget=byUid(state,1,opposingSpellcaster);
  assert.equal(liveTarget.faceUp,false);
  assert.equal(liveTarget.position,'def');
  assert.equal(byUid(state,0,alliedWarrior).faceUp,true);
  assert.equal(byUid(state,1,opposingDragon).faceUp,true);
  assert.equal(byUid(state,0,alliedHiddenWarrior).faceUp,false);
  const publicState=tag.publicTagDuel(state);
  assert.equal(publicState.teams[1].monsters.find(card=>card.faceUp===false&&card.id===null)?.id,null);
  assert.ok(state.core.players[0].grave.some(card=>card.uid===source.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('target-dependent position Traps cannot activate on an empty shared field',()=>{
  for(const entry of POSITION_CARDS.filter(card=>card.kind==='trap')){
    const state=game('m246-empty-'+entry.id);
    const source=setTrap(state,0,entry.id);
    assert.ok(!tag.tagActions(state,member(0)).some(action=>action.card===source.uid),
      entry.name+' must not offer an action without an eligible field target');
  }
});



test('a position-changing Trap set this turn remains unavailable even when the shared field has valid targets',()=>{
  const state=game('m246-set-turn');
  placeMonster(state,1,TARGETS[0]);
  const source=setTrap(state,0,'83133491',state.core.turn);
  assert.ok(!tag.tagActions(state,member(0)).some(action=>action.kind==='trap'&&action.card===source.uid));
});

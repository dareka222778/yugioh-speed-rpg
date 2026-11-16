'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const HAMMER_SHOT='26412047';
const SMASHING_GROUND='97169186';
const SHIELD_CRUSH='30683373';
const BLUE_EYES='89631139';
const DARK_MAGICIAN='46986414';
const CELTIC_GUARDIAN='91152256';
const MYSTICAL_ELF='15025844';

const DESTRUCTION_CARDS=[
  {id:HAMMER_SHOT,name:'Hammer Shot',effect:{kind:'destroyExtreme',scope:'all',stat:'atk',position:'atk'}},
  {id:SMASHING_GROUND,name:'Smashing Ground',effect:{kind:'destroyExtreme',scope:'opponent',stat:'defense',faceUp:true}},
  {id:SHIELD_CRUSH,name:'Shield Crush',effect:{kind:'destroyTargetPosition',position:'def'}}
];
const FIXED_NORMALS=[BLUE_EYES,DARK_MAGICIAN,CELTIC_GUARDIAN,MYSTICAL_ELF];
for(const id of FIXED_NORMALS){
  assert.equal(getPlayableCard(id)?.kind,'monster','fixture Normal Monster must be enabled: '+id);
}
const NORMALS=[...new Set(tag.tagNormalCardIds)]
  .map(id=>getPlayableCard(id))
  .filter(card=>card?.kind==='monster');
const EXCLUDED=new Set([...DESTRUCTION_CARDS.map(card=>card.id),...FIXED_NORMALS]);
const FILLERS=NORMALS.map(card=>card.id).filter(id=>!EXCLUDED.has(id)).slice(0,13);
assert.equal(FILLERS.length,13,'the fixture needs thirteen additional distinct certified Normal Monsters');
const POOL=[...DESTRUCTION_CARDS.map(card=>card.id),...FIXED_NORMALS,...FILLERS];
assert.equal(POOL.length,20,'each physical participant must use a legal 20-card Deck');
assert.equal(new Set(POOL).size,20,'each physical Deck must contain distinct identities');

function member(seat){return 'm251-seat-'+seat;}
function deck(){return [...POOL];}
function game(seed,first=0){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M251 Seat '+seat,cards:deck()}));
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
  throw new Error('M251 fixture card missing from physical seat '+seat+': '+id);
}
function placeMonster(state,seat,id,options={}){
  const card=takePhysical(state,seat,id);
  const monster={
    ...card,
    owner:seat%2,
    faceUp:options.faceUp!==false,
    position:options.position??'atk',
    entered:0,
    changed:0,
    attacked:0,
    atkBoost:options.atkBoost??0,
    defBoost:options.defBoost??0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function putSpellInHand(state,seat,id){
  const card=takePhysical(state,seat,id);
  holder(state,seat).hand.push(card);
  return card;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'M251 response windows must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function activateUntargetedSpell(state,seat,id){
  const source=putSpellInHand(state,seat,id);
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>
    candidate.kind==='spell'&&candidate.card===source.uid
  );
  assert.ok(action,id+' must expose a legal activation to the active physical seat');
  return {state:settle(tag.stepTagDuel(state,actor,action)),source};
}
function chooseTarget(state,seat,uid){
  const actor=member(seat);
  const action=tag.tagActions(state,actor).find(candidate=>
    candidate.kind==='choose'&&candidate.target===uid
  );
  assert.ok(action,'the active physical seat must be able to choose the exact eligible UID');
  return tag.stepTagDuel(state,actor,action);
}
function monster(state,team,uid){
  return state.core.players[team].monsters.find(card=>card.uid===uid);
}
function inGrave(state,team,uid){
  return state.core.players[team].grave.some(card=>card.uid===uid);
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
  assert.equal(cards.length,before.size,'destruction must not create or remove physical cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'destruction must not duplicate UIDs');
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

test('M251 metadata and legal format: all three current-stat destruction effects retain their audited definitions',()=>{
  for(const entry of DESTRUCTION_CARDS){
    assert.equal(getPlayableCard(entry.id)?.englishName,entry.name,entry.name+' must be enabled');
    assert.deepEqual(getEffect(entry.id),entry.effect,entry.name+' must retain its exact destruction rule');
  }
  const state=game('m251-format');
  assert.equal(tag.tagInventory(state).length,80);
  assertRestorable(state);
});

test('Hammer Shot destroys the unique highest current ATK monster across both shared fields, including the inactive opponent partner',()=>{
  let state=game('m251-hammer-unique');
  const before=inventorySnapshot(state);
  const ownActive=placeMonster(state,0,DARK_MAGICIAN,{atkBoost:400});
  const ownPartner=placeMonster(state,2,CELTIC_GUARDIAN);
  const enemyActive=placeMonster(state,1,MYSTICAL_ELF);
  const enemyPartner=placeMonster(state,3,BLUE_EYES);
  assert.match(enemyPartner.uid,/^m3:/);
  const result=activateUntargetedSpell(state,0,HAMMER_SHOT);
  state=result.state;
  assert.equal(state.core.phase,'main');
  assert.ok(inGrave(state,1,enemyPartner.uid),'the unique highest-ATK monster on the partner-owned opposing field must be destroyed');
  assert.equal(monster(state,1,enemyPartner.uid),undefined);
  assert.ok(monster(state,0,ownActive.uid));
  assert.ok(monster(state,0,ownPartner.uid));
  assert.ok(monster(state,1,enemyActive.uid));
  assert.ok(inGrave(state,0,result.source.uid),'the resolving Normal Spell must reach the activating team Graveyard');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Hammer Shot opens a choice among tied highest-ATK monsters from either team and preserves the unselected copy',()=>{
  let state=game('m251-hammer-tie');
  const before=inventorySnapshot(state);
  const ownActive=placeMonster(state,0,BLUE_EYES);
  const ownPartner=placeMonster(state,2,DARK_MAGICIAN);
  const enemyActive=placeMonster(state,1,CELTIC_GUARDIAN);
  const enemyPartner=placeMonster(state,3,BLUE_EYES);
  const result=activateUntargetedSpell(state,0,HAMMER_SHOT);
  state=result.state;
  assert.equal(state.core.phase,'choice');
  assert.equal(state.core.choice.source,'extremeDestroy');
  assert.deepEqual(new Set(state.core.choice.targets),new Set([ownActive.uid,enemyPartner.uid]),
    'only the tied monsters with the highest current ATK may be offered');
  const offered=tag.tagActions(state,member(0)).filter(action=>action.kind==='choose');
  assert.deepEqual(new Set(offered.map(action=>action.target)),new Set([ownActive.uid,enemyPartner.uid]));
  state=chooseTarget(state,0,enemyPartner.uid);
  assert.equal(state.core.phase,'main');
  assert.ok(inGrave(state,1,enemyPartner.uid));
  assert.equal(monster(state,1,enemyPartner.uid),undefined);
  assert.ok(monster(state,0,ownActive.uid),'the tied allied monster must survive when the opposing tie is selected');
  assert.ok(monster(state,0,ownPartner.uid));
  assert.ok(monster(state,1,enemyActive.uid));
  assert.ok(inGrave(state,0,result.source.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

for(const actorSeat of [0,1]){
  test('Smashing Ground selects only tied highest-DEF face-up opposing monsters across both physical seats when team '+(actorSeat%2)+' activates it',()=>{
    let state=game('m251-smashing-tie-'+actorSeat,actorSeat);
    const before=inventorySnapshot(state);
    const ownActive=placeMonster(state,actorSeat,BLUE_EYES);
    const ownPartner=placeMonster(state,actorSeat+2,DARK_MAGICIAN);
    const enemyActiveSeat=1-actorSeat;
    const enemyPartnerSeat=enemyActiveSeat+2;
    const enemyActive=placeMonster(state,enemyActiveSeat,MYSTICAL_ELF,{defBoost:200});
    const enemyPartner=placeMonster(state,enemyPartnerSeat,MYSTICAL_ELF,{defBoost:200});
    const enemyHidden=placeMonster(state,enemyPartnerSeat,BLUE_EYES,{position:'def',faceUp:false});
    assert.match(enemyPartner.uid,new RegExp('^m'+enemyPartnerSeat+':'));
    const result=activateUntargetedSpell(state,actorSeat,SMASHING_GROUND);
    state=result.state;
    assert.equal(state.core.phase,'choice');
    assert.equal(state.core.choice.source,'extremeDestroy');
    assert.deepEqual(new Set(state.core.choice.targets),new Set([enemyActive.uid,enemyPartner.uid]),
      'the tie must include both opposing physical seats but exclude the higher-DEF face-down monster and both allies');
    state=chooseTarget(state,actorSeat,enemyPartner.uid);
    const enemyTeam=1-(actorSeat%2);
    assert.equal(state.core.phase,'main');
    assert.ok(inGrave(state,enemyTeam,enemyPartner.uid));
    assert.equal(monster(state,enemyTeam,enemyPartner.uid),undefined);
    assert.ok(monster(state,enemyTeam,enemyActive.uid),'the unselected tied monster must survive');
    assert.ok(monster(state,enemyTeam,enemyHidden.uid),'face-down monsters must not enter Smashing Ground target selection');
    assert.ok(monster(state,actorSeat%2,ownActive.uid),'allied monsters must be excluded');
    assert.ok(monster(state,actorSeat%2,ownPartner.uid),'partner-owned allied monsters must also be excluded');
    assert.ok(inGrave(state,actorSeat%2,result.source.uid));
    assertConserved(state,before);
    assertPrivateHands(state);
    assertRestorable(state);
  });
}

test('Smashing Ground is unavailable when the opposing team has only face-down monsters, even if an allied monster has higher DEF',()=>{
  const state=game('m251-smashing-no-face-up');
  placeMonster(state,0,BLUE_EYES);
  placeMonster(state,3,BLUE_EYES,{position:'def',faceUp:false});
  const source=putSpellInHand(state,0,SMASHING_GROUND);
  const actions=tag.tagActions(state,member(0)).filter(action=>
    action.kind==='spell'&&action.card===source.uid
  );
  assert.equal(actions.length,0,'face-down opposing monsters and allied monsters cannot make Smashing Ground activatable');
  assertRestorable(state);
});

test('Shield Crush can target Defense Position monsters on either shared field, including a face-down monster without revealing its identity',()=>{
  let state=game('m251-shield-crush-shared-fields');
  const before=inventorySnapshot(state);
  const ownActive=placeMonster(state,0,DARK_MAGICIAN);
  const ownPartner=placeMonster(state,2,MYSTICAL_ELF,{position:'def'});
  const enemyActive=placeMonster(state,1,CELTIC_GUARDIAN);
  const enemyPartnerHidden=placeMonster(state,3,BLUE_EYES,{position:'def',faceUp:false});
  const publicBefore=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicBefore.includes(enemyPartnerHidden.id),'the face-down card identity must remain hidden in the public projection');
  assert.ok(!publicBefore.includes(enemyPartnerHidden.uid),'the face-down physical UID must remain hidden in the public projection');
  const source=putSpellInHand(state,0,SHIELD_CRUSH);
  const offered=tag.tagActions(state,member(0)).filter(action=>
    action.kind==='spell'&&action.card===source.uid
  );
  assert.deepEqual(new Set(offered.map(action=>action.target)),new Set([ownPartner.uid,enemyPartnerHidden.uid]),
    'Shield Crush must offer every Defense Position monster on both teams and no Attack Position monster');
  const selected=offered.find(action=>action.target===enemyPartnerHidden.uid);
  assert.ok(selected);
  state=settle(tag.stepTagDuel(state,member(0),selected));
  assert.equal(state.core.phase,'main');
  assert.ok(inGrave(state,1,enemyPartnerHidden.uid),'the selected face-down Defense monster must be destroyed');
  assert.equal(monster(state,1,enemyPartnerHidden.uid),undefined);
  assert.ok(monster(state,0,ownActive.uid));
  assert.ok(monster(state,0,ownPartner.uid),'the unselected allied Defense monster must survive');
  assert.ok(monster(state,1,enemyActive.uid));
  assert.ok(inGrave(state,0,source.uid));
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Shield Crush is unavailable when no monster is in Defense Position on either shared field',()=>{
  const state=game('m251-shield-crush-no-target');
  placeMonster(state,0,DARK_MAGICIAN);
  placeMonster(state,1,CELTIC_GUARDIAN);
  const source=putSpellInHand(state,0,SHIELD_CRUSH);
  const actions=tag.tagActions(state,member(0)).filter(action=>
    action.kind==='spell'&&action.card===source.uid
  );
  assert.equal(actions.length,0,'Attack Position monsters cannot make Shield Crush activatable');
  assertRestorable(state);
});

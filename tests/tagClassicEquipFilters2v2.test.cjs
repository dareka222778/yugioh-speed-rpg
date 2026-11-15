'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');

const CYBER_SHIELD='63224564';
const FUSION_WEAPON='27967615';
const HARPIE_LADY_1='91932350';
const CELTIC_GUARDIAN='91152256';
const POLYMERIZATION='24094653';
const BABY_DRAGON='88819587';
const ALLIGATOR_SWORD='64428736';
const ALLIGATOR_SWORD_DRAGON='03366982';
const BLUE_EYES='89631139';
const BLUE_EYES_ULTIMATE='23995348';

assert.equal(getPlayableCard(CYBER_SHIELD)?.englishName,'Cyber Shield');
assert.equal(getEffect(CYBER_SHIELD)?.kind,'equip');
assert.deepEqual(getEffect(CYBER_SHIELD),{kind:'equip',names:['Harpie Lady','Harpie Lady Sisters'],atk:500,def:0});
assert.equal(getPlayableCard(FUSION_WEAPON)?.englishName,'Fusion Weapon');
assert.equal(getEffect(FUSION_WEAPON)?.kind,'equip');
assert.deepEqual(getEffect(FUSION_WEAPON),{kind:'equip',monsterType:'fusion',maxLevel:6,atk:1500,def:1500});
assert.equal(getPlayableCard(HARPIE_LADY_1)?.alwaysTreatedAs,'Harpie Lady');
assert.equal(getPlayableCard(ALLIGATOR_SWORD_DRAGON)?.monsterType,'fusion');
assert.equal(getPlayableCard(ALLIGATOR_SWORD_DRAGON)?.level,5);
assert.equal(getPlayableCard(BLUE_EYES_ULTIMATE)?.monsterType,'fusion');
assert.equal(getPlayableCard(BLUE_EYES_ULTIMATE)?.level,12);

const CORE_IDS=[CYBER_SHIELD,FUSION_WEAPON,POLYMERIZATION,BABY_DRAGON,ALLIGATOR_SWORD,BLUE_EYES,HARPIE_LADY_1,CELTIC_GUARDIAN];
const FILLER_IDS=[...new Set(tag.tagNormalCardIds)].filter(id=>!CORE_IDS.includes(id)).slice(0,3);
const DECK_POOL=[
  CYBER_SHIELD,CYBER_SHIELD,FUSION_WEAPON,FUSION_WEAPON,
  POLYMERIZATION,POLYMERIZATION,BABY_DRAGON,BABY_DRAGON,
  ALLIGATOR_SWORD,ALLIGATOR_SWORD,BLUE_EYES,BLUE_EYES,BLUE_EYES,
  HARPIE_LADY_1,HARPIE_LADY_1,CELTIC_GUARDIAN,CELTIC_GUARDIAN,
  ...FILLER_IDS
];
assert.equal(DECK_POOL.length,20,'each physical Deck must contain exactly 20 cards');
assert.ok(DECK_POOL.every(id=>DECK_POOL.filter(candidate=>candidate===id).length<=3),
  'no physical Deck may contain more than three copies of a card');
function member(seat){return 'm226-seat-'+seat;}
function deck(){return [...DECK_POOL];}
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
  throw new Error('M226 physical card missing from seat '+seat+': '+id);
}
function ensureInHand(state,seat,id){
  const physical=holder(state,seat);
  const existing=physical.hand.find(card=>card.id===id);
  if(existing)return existing;
  const card=takePhysical(state,seat,id);
  physical.hand.push(card);
  return card;
}
function createGame(seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M226 Seat '+seat,cards:deck(),
    ...(seat===0?{extra:[ALLIGATOR_SWORD_DRAGON,BLUE_EYES_ULTIMATE]}:{})
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  return state;
}
function deploy(state,seat,id,faceUp=true,position='atk'){
  const card=takePhysical(state,seat,id);
  const monster={...card,owner:seat%2,position:faceUp?position:'def',faceUp,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function settle(state){
  for(let guard=0;state.core.phase==='response';guard++){
    assert.ok(guard<30,'the response chain must terminate');
    const actor=tag.tagDecisionMember(state).id;
    const pass=tag.tagActions(state,actor).find(action=>action.kind==='pass');
    assert.ok(pass,'the current physical responder must receive a legal pass');
    state=tag.stepTagDuel(state,actor,pass);
  }
  return state;
}
function endTurn(state){
  const actor=tag.tagDecisionMember(state).id;
  const action=tag.tagActions(state,actor).find(candidate=>candidate.kind==='end');
  assert.ok(action,'the active physical participant must be able to end the turn');
  state=settle(tag.stepTagDuel(state,actor,action));
  for(let guard=0;state.core.phase==='discard';guard++){
    assert.ok(guard<8,'End Phase hand-limit discard must terminate');
    const owner=tag.tagDecisionMember(state).id;
    const discard=tag.tagActions(state,owner).find(candidate=>candidate.kind==='discard');
    assert.ok(discard,'the physical owner above six cards must receive a legal End Phase discard');
    state=tag.stepTagDuel(state,owner,discard);
  }
  return state;
}
function rotateToSeat2(state){
  for(let guard=0;tag.tagDecisionMember(state).id!==member(2);guard++){
    assert.ok(guard<4,'turn rotation must reach allied partner seat 2');
    state=endTurn(state);
  }
  assert.equal(state.active[0],2);
  assert.equal(state.active[1],1);
  return state;
}
function fusionSummon(state,seat,extraId,materialIds){
  const poly=takePhysical(state,seat,POLYMERIZATION);
  holder(state,seat).hand.push(poly);
  const materials=materialIds.map(id=>{
    const card=takePhysical(state,seat,id);
    holder(state,seat).hand.push(card);
    return card;
  });
  const extra=holder(state,seat).extra.find(card=>card.id===extraId);
  assert.ok(extra,'the requested Fusion Monster must remain in the physical Extra Deck');
  assert.match(extra.uid,new RegExp('^m'+seat+':'),'the Extra Deck UID must retain its physical owner');
  const action=tag.tagActions(state,member(seat)).find(candidate=>
    candidate.kind==='fusion'&&candidate.card===poly.uid&&candidate.extra===extra.uid&&
    candidate.materials.length===materials.length&&materials.every(card=>candidate.materials.includes(card.uid))
  );
  assert.ok(action,'the exact physical materials must permit the requested Fusion Summon');
  state=settle(tag.stepTagDuel(state,member(seat),action));
  const monster=state.core.players[seat%2].monsters.find(card=>card.uid===extra.uid&&card.id===extraId);
  assert.ok(monster,'the properly summoned Fusion Monster must enter the shared team field');
  assert.ok(state.core.players[seat%2].grave.some(card=>card.uid===poly.uid));
  for(const material of materials)assert.ok(state.core.players[seat%2].grave.some(card=>card.uid===material.uid));
  tag.assertTagDuel(state);
  return {state,monster};
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,82,'four physical 20-card Decks plus two physical Extra Deck cards contribute 82 cards');
  const map=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(map.size,82,'all Main/Extra Deck UIDs must be unique');
  return map;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'Equip resolution must conserve every physical card');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size);
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3])for(const card of tag.tagMemberHand(state,member(seat))){
    assert.ok(!publicState.includes(card.uid),'private hand UID leaked for seat '+seat+': '+card.uid);
  }
}
function assertRestorable(state){
  assert.doesNotThrow(()=>tag.assertTagDuel(JSON.parse(JSON.stringify(state))));
}
function equipAction(state,seat,equip,target){
  return tag.tagActions(state,member(seat)).find(action=>
    action.kind==='spell'&&action.card===equip.uid&&action.target===target.uid
  );
}
function activateEquip(state,seat,equip,target){
  const action=equipAction(state,seat,equip,target);
  assert.ok(action,'the exact eligible shared-field target must be offered to the active teammate');
  return settle(tag.stepTagDuel(state,member(seat),action));
}

test('Cyber Shield recognizes partner-owned Harpie Lady 1 by its always-treated-as name and grants exactly 500 ATK',()=>{
  let state=createGame('m226-cyber-shield-partner-owned-harpie');
  const before=inventorySnapshot(state);
  const partnerHarpie=deploy(state,0,HARPIE_LADY_1,true,'atk');
  const alliedWrongRace=deploy(state,2,CELTIC_GUARDIAN,true,'atk');
  const hiddenHarpie=deploy(state,1,HARPIE_LADY_1,false,'def');
  const shield=ensureInHand(state,2,CYBER_SHIELD);
  const publicBefore=JSON.stringify(tag.publicTagDuel(state));
  assert.ok(!publicBefore.includes(hiddenHarpie.uid),'the hidden monster UID must remain private');
  assert.ok(!publicBefore.includes(HARPIE_LADY_1),'the hidden Harpie identity must remain private');

  state=rotateToSeat2(state);
  assert.equal(tag.tagActions(state,member(0)).length,0,'inactive partner seat 0 cannot activate the Spell');
  const options=tag.tagActions(state,member(2)).filter(action=>action.kind==='spell'&&action.card===shield.uid);
  assert.ok(options.some(action=>action.target===partnerHarpie.uid),
    'Cyber Shield can equip a Harpie Lady controlled physically by the inactive partner');
  assert.ok(!options.some(action=>action.target===alliedWrongRace.uid),'a non-Harpie monster is not eligible');
  assert.ok(!options.some(action=>action.target===hiddenHarpie.uid),'a face-down Harpie is not eligible or revealed');

  const currentHarpie=state.core.players[0].monsters.find(card=>card.uid===partnerHarpie.uid);
  const beforeAtk=engine.atk(currentHarpie,state.core);
  state=activateEquip(state,2,shield,currentHarpie);
  const equipped=state.core.players[0].backrow.find(card=>card.uid===shield.uid);
  const afterHarpie=state.core.players[0].monsters.find(card=>card.uid===partnerHarpie.uid);
  assert.equal(equipped?.equippedTo,partnerHarpie.uid);
  assert.equal(equipped?.resolved,true);
  assert.equal(engine.atk(afterHarpie,state.core),beforeAtk+500,
    'Cyber Shield adds exactly 500 ATK on top of the existing Harpie Lady 1 modifier');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

test('Fusion Weapon equips a partner-owned Level 5 Fusion but rejects a Level 12 Fusion and a non-Fusion',()=>{
  let state=createGame('m226-fusion-weapon-level-filter');
  const before=inventorySnapshot(state);
  const low= fusionSummon(state,0,ALLIGATOR_SWORD_DRAGON,[BABY_DRAGON,ALLIGATOR_SWORD]);
  state=low.state;
  const high=fusionSummon(state,0,BLUE_EYES_ULTIMATE,[BLUE_EYES,BLUE_EYES,BLUE_EYES]);
  state=high.state;
  const nonFusion=deploy(state,0,HARPIE_LADY_1,true,'atk');
  const weapon=ensureInHand(state,2,FUSION_WEAPON);
  state=rotateToSeat2(state);

  const options=tag.tagActions(state,member(2)).filter(action=>action.kind==='spell'&&action.card===weapon.uid);
  assert.ok(options.some(action=>action.target===low.monster.uid),
    'a partner-owned Level 5 Fusion Monster is a valid shared-field target');
  assert.ok(!options.some(action=>action.target===high.monster.uid),
    'a Level 12 Fusion Monster exceeds Fusion Weapon maximum Level 6');
  assert.ok(!options.some(action=>action.target===nonFusion.uid),
    'a non-Fusion monster cannot receive Fusion Weapon');

  const currentLow=state.core.players[0].monsters.find(card=>card.uid===low.monster.uid);
  const beforeAtk=engine.atk(currentLow,state.core);
  const beforeDef=engine.def(currentLow,state.core);
  const currentHigh=state.core.players[0].monsters.find(card=>card.uid===high.monster.uid);
  state=activateEquip(state,2,weapon,currentLow);
  const equipped=state.core.players[0].backrow.find(card=>card.uid===weapon.uid);
  const afterLow=state.core.players[0].monsters.find(card=>card.uid===low.monster.uid);
  assert.equal(equipped?.equippedTo,low.monster.uid);
  assert.equal(equipped?.resolved,true);
  assert.equal(engine.atk(afterLow,state.core),beforeAtk+1500);
  assert.equal(engine.def(afterLow,state.core),beforeDef+1500);
  assert.ok(state.core.players[0].monsters.some(card=>card.uid===currentHigh.uid),
    'the ineligible Level 12 Fusion remains on the shared field unchanged');
  assertConserved(state,before);
  assertPrivateHands(state);
  assertRestorable(state);
});

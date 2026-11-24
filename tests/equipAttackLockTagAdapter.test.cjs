'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');
const {
  PARALYZING_POTION_ID,MASK_OF_THE_ACCURSED_ID,
  createEquipAttackLockSession,setEquipEffectNegated,
  equipAttackLockForMonster,resolveMaskOfTheAccursedStandby
}=require('../dist/equipAttackLockTagAdapter');

const MACHINE='07359741'; // Mechanicalchaser, Machine / Normal
const WARRIOR='91152256'; // Celtic Guardian, Warrior / Normal
const NORMALS=[...new Set([MACHINE,WARRIOR,...tag.tagNormalCardIds])].slice(0,30);
assert.ok(NORMALS.length>=20);
assert.equal(getPlayableCard(MACHINE)?.race,'Machine');
assert.equal(getPlayableCard(WARRIOR)?.race,'Warrior');
function deck(){return NORMALS.slice(0,20);}
function create(seed='default'){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:'m581-seat-'+seat,name:'M581 Seat '+seat,cards:deck()
  })),{classic:true,first:0,seed:'m581-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function takeMonster(state,seat,id){
  const held=holder(state,seat);
  let index=held.deck.findIndex(card=>card.id===id),card;
  if(index>=0)[card]=held.deck.splice(index,1);
  else{
    index=held.hand.findIndex(item=>item.id===id);
    assert.ok(index>=0,'monster must remain in physical seat '+seat+' deck or hand');
    [card]=held.hand.splice(index,1);
  }
  const monster={...card,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,attackCount:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster.uid;
}
function addEquip(state,controllerTeam,ownerSeat,id,targetUid,{faceUp=true,resolved=true,setTurn=0}={}){
  const uid='m'+ownerSeat+':m581-equip-'+id+'-'+state.core.players[controllerTeam].backrow.length;
  state.core.players[controllerTeam].backrow.push({uid,id,faceUp,resolved,setTurn,equippedTo:targetUid});
  return uid;
}
function addStandby(state,team=0,turn=2){
  state.core.current=team;
  state.core.phase='main';
  state.core.turn=turn;
  state.core.damageStep=false;
  state.core.pending={kind:'none'};
  return {phase:'standby',team,turn};
}
function inventory(state){
  const cards=tag.tagInventory(state).filter(card=>card.entityKind!=='token');
  const result=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(result.size,cards.length);
  return result;
}
function hands(state){
  const result=[];
  for(const player of state.core.players)for(const card of player.hand)result.push(card.uid);
  for(const held of Object.values(state.reserves))for(const card of held.hand)result.push(card.uid);
  return result.sort();
}
function assertConserved(state,before){
  const after=inventory(state);
  assert.equal(after.size,before.size);
  for(const [uid,id] of before)assert.equal(after.get(uid),id);
}
function assertRules(state){
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(rules.extraDeckMax,5);
  for(const player of state.core.players){
    assert.ok(player.monsters.length<=3);
    assert.ok(player.backrow.length<=3);
  }
}

test('M581 cards remain outside catalog and released allowlist until full certification',()=>{
  assert.equal(getPlayableCard(PARALYZING_POTION_ID),undefined);
  assert.equal(getPlayableCard(MASK_OF_THE_ACCURSED_ID),undefined);
});

test('Paralyzing Potion blocks a non-Machine monster and preserves owner/controller identity',()=>{
  const state=create('paralyzing-warrior'),target=takeMonster(state,1,WARRIOR);
  const source=addEquip(state,0,0,PARALYZING_POTION_ID,target);
  const before=inventory(state),beforeHands=hands(state);
  const session=createEquipAttackLockSession(state);
  const lock=equipAttackLockForMonster(session,target);
  assert.equal(lock.isBlocked,true);
  assert.deepEqual(lock.blockedBy,[source]);
  assert.equal(lock.targetControllerTeam,1);
  assert.equal(lock.targetPhysicalOwnerSeat,1);
  assertConserved(session.duel,before);
  assert.deepEqual(hands(session.duel),beforeHands);
  assertRules(session.duel);
});

test('Paralyzing Potion does not block a Machine monster',()=>{
  const state=create('paralyzing-machine'),target=takeMonster(state,1,MACHINE);
  addEquip(state,0,0,PARALYZING_POTION_ID,target);
  const lock=equipAttackLockForMonster(createEquipAttackLockSession(state),target);
  assert.equal(lock.isBlocked,false);
  assert.deepEqual(lock.blockedBy,[]);
});

test('Mask of the Accursed blocks Machine and non-Machine monsters alike',()=>{
  const state=create('mask-any-race'),machine=takeMonster(state,1,MACHINE),warrior=takeMonster(state,3,WARRIOR);
  const maskA=addEquip(state,0,0,MASK_OF_THE_ACCURSED_ID,machine);
  const maskB=addEquip(state,1,1,MASK_OF_THE_ACCURSED_ID,warrior);
  const session=createEquipAttackLockSession(state);
  assert.deepEqual(equipAttackLockForMonster(session,machine).blockedBy,[maskA]);
  assert.deepEqual(equipAttackLockForMonster(session,warrior).blockedBy,[maskB]);
});

test('independent copies accumulate restrictions and removing one copy restores only its own contribution',()=>{
  const state=create('multiple-equips'),target=takeMonster(state,1,WARRIOR);
  const potionA=addEquip(state,0,0,PARALYZING_POTION_ID,target);
  const potionB=addEquip(state,0,2,PARALYZING_POTION_ID,target);
  const mask=addEquip(state,0,0,MASK_OF_THE_ACCURSED_ID,target);
  const session=createEquipAttackLockSession(state);
  assert.deepEqual(equipAttackLockForMonster(session,target).blockedBy,[potionA,potionB,mask]);
  const next=structuredClone(session);
  const removed=next.duel.core.players[0].backrow.find(card=>card.uid===potionA);
  next.duel.core.players[0].backrow=next.duel.core.players[0].backrow.filter(card=>card.uid!==potionA);
  next.duel.core.players[0].grave.push({uid:removed.uid,id:removed.id});
  assert.deepEqual(equipAttackLockForMonster(next,target).blockedBy,[potionB,mask]);
});

test('face-down and unresolved Equip Spells do not apply their continuous restriction',()=>{
  const state=create('hidden-equips'),target=takeMonster(state,1,WARRIOR);
  addEquip(state,0,0,PARALYZING_POTION_ID,target,{faceUp:false});
  addEquip(state,0,2,MASK_OF_THE_ACCURSED_ID,target,{resolved:false});
  const lock=equipAttackLockForMonster(createEquipAttackLockSession(state),target);
  assert.equal(lock.isBlocked,false);
});

test('explicit negation suspends and later restores the same Equip Spell lock',()=>{
  const state=create('negated-equip'),target=takeMonster(state,1,WARRIOR);
  const source=addEquip(state,0,0,MASK_OF_THE_ACCURSED_ID,target);
  let session=createEquipAttackLockSession(state);
  session=setEquipEffectNegated(session,source,true);
  assert.equal(equipAttackLockForMonster(session,target).isBlocked,false);
  session=setEquipEffectNegated(session,source,false);
  assert.deepEqual(equipAttackLockForMonster(session,target).blockedBy,[source]);
});

test('a removed Equip Spell no longer blocks the equipped monster',()=>{
  const state=create('removed-equip'),target=takeMonster(state,1,WARRIOR);
  const source=addEquip(state,0,0,PARALYZING_POTION_ID,target);
  const session=createEquipAttackLockSession(state);
  const removed=session.duel.core.players[0].backrow.find(card=>card.uid===source);
  session.duel.core.players[0].backrow=session.duel.core.players[0].backrow.filter(card=>card.uid!==source);
  session.duel.core.players[0].grave.push({uid:removed.uid,id:removed.id});
  assert.equal(equipAttackLockForMonster(session,target).isBlocked,false);
});

test('Mask upkeep damages the current monster controller, not the Equip Spell controller',()=>{
  const state=create('mask-opponent-lp'),target=takeMonster(state,1,WARRIOR);
  const source=addEquip(state,0,0,MASK_OF_THE_ACCURSED_ID,target,{setTurn:0});
  const context=addStandby(state,0,2);
  state.core.players[1].lp=1000;
  const before=inventory(state),beforeHands=hands(state);
  const resolved=resolveMaskOfTheAccursedStandby(createEquipAttackLockSession(state),source,context);
  assert.equal(resolved.result.damageAmount,500);
  assert.equal(resolved.result.sourceControllerTeam,0);
  assert.equal(resolved.result.targetControllerTeam,1);
  assert.equal(resolved.result.sourcePhysicalOwnerSeat,0);
  assert.equal(resolved.result.targetPhysicalOwnerSeat,1);
  assert.equal(resolved.result.lpBefore,1000);
  assert.equal(resolved.result.lpAfter,500);
  assert.equal(resolved.session.duel.core.players[0].lp,8000);
  assert.equal(resolved.session.duel.core.players[1].lp,500);
  assertConserved(resolved.session.duel,before);
  assert.deepEqual(hands(resolved.session.duel),beforeHands);
  assertRules(resolved.session.duel);
});

test('Mask upkeep can damage the Equip Spell controller when that team controls the equipped monster',()=>{
  const state=create('mask-own-lp'),target=takeMonster(state,0,WARRIOR);
  const source=addEquip(state,0,0,MASK_OF_THE_ACCURSED_ID,target,{setTurn:0});
  const context=addStandby(state,0,2);
  state.core.players[0].lp=2000;
  const result=resolveMaskOfTheAccursedStandby(createEquipAttackLockSession(state),source,context);
  assert.equal(result.result.targetControllerTeam,0);
  assert.equal(result.result.lpAfter,1500);
  assert.equal(result.session.duel.core.players[0].lp,1500);
});

test('each Mask copy resolves once per turn and repeated resolution is idempotent',()=>{
  const state=create('mask-idempotent'),target=takeMonster(state,1,WARRIOR);
  const source=addEquip(state,0,0,MASK_OF_THE_ACCURSED_ID,target,{setTurn:0});
  const context=addStandby(state,0,2);
  state.core.players[1].lp=2000;
  const first=resolveMaskOfTheAccursedStandby(createEquipAttackLockSession(state),source,context);
  const second=resolveMaskOfTheAccursedStandby(first.session,source,context);
  assert.equal(first.result.lpAfter,1500);
  assert.equal(second.result.alreadyProcessed,true);
  assert.equal(second.result.damageAmount,0);
  assert.equal(second.session.duel.core.players[1].lp,1500);
});

test('two Mask copies each inflict 500 once during the same Standby Phase',()=>{
  const state=create('mask-two-copies'),target=takeMonster(state,1,WARRIOR);
  const firstSource=addEquip(state,0,0,MASK_OF_THE_ACCURSED_ID,target,{setTurn:0});
  const secondSource=addEquip(state,0,2,MASK_OF_THE_ACCURSED_ID,target,{setTurn:0});
  const context=addStandby(state,0,2);
  state.core.players[1].lp=1500;
  const first=resolveMaskOfTheAccursedStandby(createEquipAttackLockSession(state),firstSource,context);
  const second=resolveMaskOfTheAccursedStandby(first.session,secondSource,context);
  const repeated=resolveMaskOfTheAccursedStandby(second.session,firstSource,context);
  assert.equal(first.result.lpAfter,1000);
  assert.equal(second.result.lpAfter,500);
  assert.equal(repeated.result.alreadyProcessed,true);
  assert.equal(repeated.session.duel.core.players[1].lp,500);
});

test('damage follows a monster after control changes while physical owner remains unchanged',()=>{
  const state=create('mask-stolen-target'),target=takeMonster(state,1,WARRIOR);
  const source=addEquip(state,1,3,MASK_OF_THE_ACCURSED_ID,target,{setTurn:0});
  const stolen=state.core.players[1].monsters.find(card=>card.uid===target);
  state.core.players[1].monsters=state.core.players[1].monsters.filter(card=>card.uid!==target);
  state.core.players[0].monsters.push(stolen);
  const context=addStandby(state,1,2);
  state.core.players[0].lp=1200;
  state.core.players[1].lp=8000;
  const resolved=resolveMaskOfTheAccursedStandby(createEquipAttackLockSession(state),source,context);
  assert.equal(resolved.result.targetPhysicalOwnerSeat,1);
  assert.equal(resolved.result.targetControllerTeam,0);
  assert.equal(resolved.result.sourcePhysicalOwnerSeat,3);
  assert.equal(resolved.result.sourceControllerTeam,1);
  assert.equal(resolved.result.lpAfter,700);
  assert.equal(resolved.session.duel.core.players[0].lp,700);
  assert.equal(resolved.session.duel.core.players[1].lp,8000);
});

test('a negated Mask resolves as processed but applies no damage',()=>{
  const state=create('mask-negated'),target=takeMonster(state,1,WARRIOR);
  const source=addEquip(state,0,0,MASK_OF_THE_ACCURSED_ID,target,{setTurn:0});
  const context=addStandby(state,0,2);
  const session=setEquipEffectNegated(createEquipAttackLockSession(state),source,true);
  const resolved=resolveMaskOfTheAccursedStandby(session,source,context);
  assert.equal(resolved.result.sourceNegated,true);
  assert.equal(resolved.result.damageAmount,0);
  assert.equal(resolved.result.lpBefore,resolved.result.lpAfter);
  assert.equal(resolved.result.alreadyProcessed,false);
  assert.equal(resolveMaskOfTheAccursedStandby(resolved.session,source,context).result.alreadyProcessed,true);
});

test('500 damage that reaches zero LP finishes the duel and awards the opposing team',()=>{
  const state=create('mask-lethal'),target=takeMonster(state,1,WARRIOR);
  const source=addEquip(state,0,0,MASK_OF_THE_ACCURSED_ID,target,{setTurn:0});
  const context=addStandby(state,0,2);
  state.core.players[1].lp=500;
  const resolved=resolveMaskOfTheAccursedStandby(createEquipAttackLockSession(state),source,context);
  assert.equal(resolved.result.lpAfter,0);
  assert.equal(resolved.result.gameFinished,true);
  assert.equal(resolved.result.winnerTeam,0);
  assert.equal(resolved.session.duel.core.phase,'finished');
  assert.equal(resolved.session.duel.core.winner,resolved.session.duel.core.players[0].id);
  assert.equal(resolved.session.duel.core.reason,'pontos de vida');
});

test('simultaneous zero LP is a draw',()=>{
  const state=create('mask-draw'),target=takeMonster(state,1,WARRIOR);
  const source=addEquip(state,0,0,MASK_OF_THE_ACCURSED_ID,target,{setTurn:0});
  const context=addStandby(state,0,2);
  state.core.players[0].lp=0;
  state.core.players[1].lp=500;
  const resolved=resolveMaskOfTheAccursedStandby(createEquipAttackLockSession(state),source,context);
  assert.equal(resolved.result.gameFinished,true);
  assert.equal(resolved.result.winnerTeam,null);
  assert.equal(resolved.session.duel.core.winner,null);
});

test('Mask upkeep rejects a non-Standby context and the wrong current team',()=>{
  const state=create('mask-context'),target=takeMonster(state,1,WARRIOR);
  const source=addEquip(state,0,0,MASK_OF_THE_ACCURSED_ID,target,{setTurn:0});
  const session=createEquipAttackLockSession(state);
  assert.throws(()=>resolveMaskOfTheAccursedStandby(session,source,{phase:'main',team:0,turn:2}),/Standby/);
  assert.throws(()=>resolveMaskOfTheAccursedStandby(session,source,{phase:'standby',team:1,turn:2}),/Standby/);
});

test('Mask upkeep waits until a later turn after the Equip Spell resolves',()=>{
  const state=create('mask-same-turn'),target=takeMonster(state,1,WARRIOR);
  const source=addEquip(state,0,0,MASK_OF_THE_ACCURSED_ID,target,{setTurn:2});
  const context=addStandby(state,0,2);
  assert.throws(()=>resolveMaskOfTheAccursedStandby(createEquipAttackLockSession(state),source,context),/eligible/);
});

test('Mask upkeep rejects an equipped target that left the field',()=>{
  const state=create('mask-missing-target'),target=takeMonster(state,1,WARRIOR);
  const source=addEquip(state,0,0,MASK_OF_THE_ACCURSED_ID,target,{setTurn:0});
  state.core.players[1].monsters=state.core.players[1].monsters.filter(card=>card.uid!==target);
  state.core.players[1].grave.push({uid:target,id:WARRIOR});
  const context=addStandby(state,0,2);
  assert.throws(()=>resolveMaskOfTheAccursedStandby(createEquipAttackLockSession(state),source,context),/face-up/);
});

test('the adapter never discards a seventh card before the End Phase check',()=>{
  const state=create('mask-hand-limit'),target=takeMonster(state,1,WARRIOR);
  const source=addEquip(state,0,0,MASK_OF_THE_ACCURSED_ID,target,{setTurn:0});
  const held=state.core.players[0];
  while(held.hand.length<7){
    assert.ok(held.deck.length>0);
    held.hand.push(held.deck.shift());
  }
  const beforeHands=hands(state);
  const context=addStandby(state,0,2);
  const resolved=resolveMaskOfTheAccursedStandby(createEquipAttackLockSession(state),source,context);
  assert.equal(resolved.session.duel.core.players[0].hand.length,7);
  assert.deepEqual(hands(resolved.session.duel),beforeHands);
  assertRules(resolved.session.duel);
});

test('the adapter accepts exactly three Monster Zones and rejects a fourth',()=>{
  const state=create('monster-zone-cap');
  for(let i=0;i<3;i++){
    const uid='m'+i+':m581-fixture-'+i;
    state.core.players[0].monsters.push({uid,id:WARRIOR,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
  }
  assert.doesNotThrow(()=>createEquipAttackLockSession(state));
  state.core.players[0].monsters.push({uid:'m0:m581-fixture-overflow',id:WARRIOR,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
  assert.throws(()=>createEquipAttackLockSession(state),/três Monster Zones/);
});

test('the adapter accepts three Spell/Trap Zones and rejects a fourth',()=>{
  const state=create('backrow-zone-cap');
  for(let i=0;i<3;i++)state.core.players[0].backrow.push({
    uid:'m0:m581-backrow-'+i,id:PARALYZING_POTION_ID,faceUp:false,resolved:false,setTurn:0
  });
  assert.doesNotThrow(()=>createEquipAttackLockSession(state));
  state.core.players[0].backrow.push({
    uid:'m0:m581-backrow-overflow',id:PARALYZING_POTION_ID,faceUp:false,resolved:false,setTurn:0
  });
  assert.throws(()=>createEquipAttackLockSession(state),/três Spell\/Trap Zones/);
});

test('a fourth Extra Deck card is rejected per physical seat while five are allowed',()=>{
  const state=create('extra-zone-cap');
  state.core.players[0].extra=[
    {uid:'m0:extra-1',id:'00000001'},
    {uid:'m0:extra-2',id:'00000002'},
    {uid:'m0:extra-3',id:'00000003'},
    {uid:'m0:extra-4',id:'00000004'},
    {uid:'m0:extra-5',id:'00000005'}
  ];
  assert.doesNotThrow(()=>createEquipAttackLockSession(state));
  state.core.players[0].extra.push({uid:'m0:extra-6',id:'00000006'});
  assert.throws(()=>createEquipAttackLockSession(state),/cinco cartas/);
});

test('the adapter rejects a physical Main Deck below 20 cards',()=>{
  const state=create('main-deck-minimum');
  state.core.players[0].deck.splice(0,2);
  assert.throws(()=>createEquipAttackLockSession(state),/20–30/);
});

test('the adapter rejects missing targets and malformed physical UIDs',()=>{
  const state=create('missing-lock-target');
  assert.throws(()=>equipAttackLockForMonster(createEquipAttackLockSession(state),'m4:unknown'),/UID físico/);
  assert.throws(()=>equipAttackLockForMonster(createEquipAttackLockSession(state),'m0:unknown'),/Monster Zone/);
});

test('the Field Zone remains separate from the three Spell/Trap Zones',()=>{
  const state=create('field-zone-separate');
  for(let i=0;i<3;i++)state.core.players[0].backrow.push({
    uid:'m0:m581-backrow-field-'+i,id:PARALYZING_POTION_ID,faceUp:false,resolved:false,setTurn:0
  });
  state.core.players[0].field={uid:'m0:m581-field',id:PARALYZING_POTION_ID,faceUp:true,resolved:true,setTurn:0};
  assert.doesNotThrow(()=>createEquipAttackLockSession(state));
  assertRules(state);
});

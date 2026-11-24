'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');
const {
  THE_DARK_DOOR_ID,
  LEVEL_LIMIT_AREA_B_ID,
  createDarkDoorBattlePhaseSession,
  darkDoorActive,
  darkDoorAllowsAttack,
  recordDarkDoorAttack,
  levelLimitAreaBActive,
  levelLimitAreaBChanges,
  enforceLevelLimitAreaB
}=require('../dist/continuousAttackRestrictionTagAdapter');

const NORMALS=[...new Set(tag.tagNormalCardIds)];
const LEVEL4=NORMALS.filter(id=>Number(getPlayableCard(id)?.level)>=4);
const LEVEL3=NORMALS.find(id=>Number(getPlayableCard(id)?.level)===3);
assert.ok(NORMALS.length>=20,'the normal-monster pool must build four 20-card physical decks');
assert.ok(LEVEL4.length>=4,'the pool must contain four distinct Level 4+ monsters');
assert.ok(LEVEL3,'the pool must contain a Level 3 monster');

function member(seat){return 'm576-seat-'+seat;}
function deck(required=[]){
  const ordered=[...new Set([...required,...NORMALS.filter(id=>!required.includes(id))])];
  assert.ok(ordered.length>=20);
  return ordered.slice(0,20);
}
function create(first=0,seed='default'){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:member(seat),name:'M576 Seat '+seat,cards:deck()
  })),{classic:true,first,seed:'m576-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function takeMonster(state,seat,id,{faceUp=true,position='atk'}={}){
  const held=holder(state,seat);
  const index=held.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'card '+id+' must remain in physical seat '+seat+' deck');
  const [card]=held.deck.splice(index,1);
  const monster={
    ...card,position,faceUp,entered:0,changed:0,attacked:0,
    attackCount:0,atkBoost:0,defBoost:0
  };
  state.core.players[seat%2].monsters.push(monster);
  return monster.uid;
}
function addSource(state,team,seat,id,{faceUp=true}={}){
  assert.equal(seat%2,team);
  const uid='m'+seat+':m576-source-'+id+'-'+seat+'-'+state.core.players[team].backrow.length;
  state.core.players[team].backrow.push({uid,id,setTurn:0,faceUp});
  return uid;
}
function pendingAttack(state,team,uid){
  state.core.current=team;
  state.core.phase='response';
  state.core.pending={kind:'attack',actor:team,card:uid,stage:'declare'};
}
function inventory(state){
  const cards=[
    ...tag.tagInventory(state),
    ...Object.values(state.reserves).flatMap(held=>[...held.deck,...held.hand,...(held.extra??[])])
  ].filter(card=>card.entityKind!=='token');
  const result=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(result.size,cards.length,'physical UIDs must be unique');
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
  for(const [uid,id] of before)assert.equal(after.get(uid),id,'physical identity changed: '+uid);
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

test('M576 cards remain outside the catalog and allowlist until central certification',()=>{
  assert.equal(getPlayableCard(THE_DARK_DOOR_ID),undefined);
  assert.equal(getPlayableCard(LEVEL_LIMIT_AREA_B_ID),undefined);
});

test('The Dark Door allows repeated attacks by the first monster but blocks a second UID',()=>{
  const state=create(0,'dark-door-same-monster');
  addSource(state,0,0,THE_DARK_DOOR_ID);
  addSource(state,0,2,THE_DARK_DOOR_ID);
  const first=takeMonster(state,0,NORMALS[0]);
  const second=takeMonster(state,2,NORMALS[1]);
  const before=inventory(state),beforeHands=hands(state);
  pendingAttack(state,0,first);
  let session=createDarkDoorBattlePhaseSession(state,0,'turn-1-team-0-battle-1');
  assert.equal(darkDoorActive(session.duel),true);
  assert.equal(darkDoorAllowsAttack(session,first),true);
  session=recordDarkDoorAttack(session,first);
  assert.equal(darkDoorAllowsAttack(session,first),true,'the same monster may attack again');
  assert.equal(darkDoorAllowsAttack(session,second),false,'a second physical monster is blocked');
  assert.throws(()=>recordDarkDoorAttack(session,second),/apenas o monstro/);
  assertConserved(session.duel,before);
  assert.deepEqual(hands(session.duel),beforeHands);
  assertRules(session.duel);
});

test('The Dark Door has an independent first attacker for the other team Battle Phase',()=>{
  const state=create(0,'dark-door-team-scope');
  addSource(state,0,0,THE_DARK_DOOR_ID);
  const team0=takeMonster(state,0,NORMALS[0]);
  const team1=takeMonster(state,1,NORMALS[1]);
  pendingAttack(state,0,team0);
  let blue=createDarkDoorBattlePhaseSession(state,0,'turn-1-team-0-battle');
  blue=recordDarkDoorAttack(blue,team0);
  blue.duel.core.current=1;
  pendingAttack(blue.duel,1,team1);
  const red=createDarkDoorBattlePhaseSession(blue.duel,1,'turn-2-team-1-battle');
  assert.equal(darkDoorAllowsAttack(red,team1),true);
  const after=recordDarkDoorAttack(red,team1);
  assert.equal(darkDoorAllowsAttack(after,team1),true);
  assertRules(after.duel);
});

test('The Dark Door remembers the first attacker after it leaves and resets with a new Battle Phase',()=>{
  const state=create(0,'dark-door-reset');
  addSource(state,0,0,THE_DARK_DOOR_ID);
  const first=takeMonster(state,0,NORMALS[0]);
  const second=takeMonster(state,2,NORMALS[1]);
  pendingAttack(state,0,first);
  let session=createDarkDoorBattlePhaseSession(state,0,'turn-1-team-0-battle');
  session=recordDarkDoorAttack(session,first);
  session.duel.core.players[0].monsters=session.duel.core.players[0].monsters.filter(m=>m.uid!==first);
  assert.equal(darkDoorAllowsAttack(session,second),false,'leaving the field does not free the phase for another monster');
  const nextPhase=createDarkDoorBattlePhaseSession(session.duel,0,'turn-1-team-0-extra-battle');
  assert.equal(darkDoorAllowsAttack(nextPhase,second),true,'a new Battle Phase has a fresh ledger');
});

test('attacks recorded before The Dark Door resolves still count when it is activated later',()=>{
  const state=create(0,'dark-door-late-activation');
  const first=takeMonster(state,0,NORMALS[0]);
  const second=takeMonster(state,2,NORMALS[1]);
  pendingAttack(state,0,first);
  let session=createDarkDoorBattlePhaseSession(state,0,'turn-1-team-0-battle');
  session=recordDarkDoorAttack(session,first);
  pendingAttack(session.duel,0,second);
  session=recordDarkDoorAttack(session,second);
  addSource(session.duel,1,1,THE_DARK_DOOR_ID);
  assert.equal(darkDoorActive(session.duel),true);
  assert.equal(darkDoorAllowsAttack(session,first),false,'two different monsters already attacked in this phase');
  assert.equal(darkDoorAllowsAttack(session,second),false,'the restriction does not authorize a third monster');
});

test('Level Limit - Area B changes face-up Level 4+ monsters on both teams only',()=>{
  const state=create(0,'area-b-all-teams');
  addSource(state,0,0,LEVEL_LIMIT_AREA_B_ID);
  const highBlue=takeMonster(state,0,LEVEL4[0],{faceUp:true,position:'atk'});
  const highRed=takeMonster(state,1,LEVEL4[1],{faceUp:true,position:'atk'});
  const low=takeMonster(state,2,LEVEL3,{faceUp:true,position:'atk'});
  const hidden=takeMonster(state,3,LEVEL4[2],{faceUp:false,position:'def'});
  const alreadyDef=takeMonster(state,2,LEVEL4[3],{faceUp:true,position:'def'});
  const before=inventory(state),beforeHands=hands(state);
  assert.equal(levelLimitAreaBActive(state),true);
  assert.deepEqual(new Set(levelLimitAreaBChanges(state)),new Set([highBlue,highRed]));
  const result=enforceLevelLimitAreaB(state);
  for(const uid of [highBlue,highRed]){
    assert.equal(result.duel.core.players[uid===highBlue?0:1].monsters.find(m=>m.uid===uid).position,'def');
  }
  assert.equal(result.duel.core.players[0].monsters.find(m=>m.uid===low).position,'atk');
  assert.equal(result.duel.core.players[1].monsters.find(m=>m.uid===hidden).faceUp,false);
  assert.equal(result.duel.core.players[1].monsters.find(m=>m.uid===alreadyDef).position,'def');
  assert.deepEqual(result.changedUids.sort(),[highBlue,highRed].sort());
  assertConserved(result.duel,before);
  assert.deepEqual(hands(result.duel),beforeHands);
  assertRules(result.duel);
});

test('Level Limit - Area B applies to a newly revealed monster and stops after all copies leave',()=>{
  const state=create(0,'area-b-late-monster');
  const sourceA=addSource(state,0,0,LEVEL_LIMIT_AREA_B_ID);
  const sourceB=addSource(state,1,1,LEVEL_LIMIT_AREA_B_ID);
  const hidden=takeMonster(state,3,LEVEL4[0],{faceUp:false,position:'def'});
  assert.deepEqual(levelLimitAreaBChanges(state),[]);
  state.core.players[1].monsters.find(m=>m.uid===hidden).faceUp=true;
  state.core.players[1].monsters.find(m=>m.uid===hidden).position='atk';
  const applied=enforceLevelLimitAreaB(state);
  assert.deepEqual(applied.changedUids,[hidden]);
  assert.equal(applied.duel.core.players[1].monsters.find(m=>m.uid===hidden).position,'def');
  applied.duel.core.players[0].backrow=applied.duel.core.players[0].backrow.filter(c=>c.uid!==sourceA);
  assert.equal(levelLimitAreaBActive(applied.duel),true,'the second copy keeps the effect active');
  applied.duel.core.players[1].backrow=applied.duel.core.players[1].backrow.filter(c=>c.uid!==sourceB);
  assert.equal(levelLimitAreaBActive(applied.duel),false);
  const monster=applied.duel.core.players[1].monsters.find(m=>m.uid===hidden);
  monster.position='atk';
  const inactive=enforceLevelLimitAreaB(applied.duel);
  assert.deepEqual(inactive.changedUids,[]);
  assert.equal(inactive.duel.core.players[1].monsters.find(m=>m.uid===hidden).position,'atk');
});

test('a face-down Level Limit source does not apply and a fresh phase does not inherit old attack history',()=>{
  const state=create(0,'area-b-source-face-down');
  addSource(state,0,0,LEVEL_LIMIT_AREA_B_ID,{faceUp:false});
  const high=takeMonster(state,0,LEVEL4[0],{faceUp:true,position:'atk'});
  assert.equal(levelLimitAreaBActive(state),false);
  assert.deepEqual(enforceLevelLimitAreaB(state).changedUids,[]);
  assert.equal(state.core.players[0].monsters.find(m=>m.uid===high).position,'atk');

  addSource(state,0,2,THE_DARK_DOOR_ID);
  const first=takeMonster(state,2,NORMALS[1]);
  pendingAttack(state,0,first);
  const oldPhase=createDarkDoorBattlePhaseSession(state,0,'phase-one');
  const recorded=recordDarkDoorAttack(oldPhase,first);
  const nextPhase=createDarkDoorBattlePhaseSession(recorded.duel,0,'phase-two');
  assert.deepEqual(recorded.attackedMonsterUids,[first]);
  assert.deepEqual(nextPhase.attackedMonsterUids,[]);
});

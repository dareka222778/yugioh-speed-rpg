'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {atk}=require('../dist/duelEngine');
const {getPlayableCard}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');
const {
  MIRROR_WALL_ID,FAIRY_BOX_ID,
  createContinuousBattleTrapSession,mirrorWallEffectiveAtk,
  fairyBoxAttackActions,fairyBoxEffectiveAtk,resolveFairyBoxAttack,
  resolveContinuousTrapUpkeep
}=require('../dist/continuousBattleTrapTagAdapter');

const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=20);
function deck(){return NORMALS.slice(0,20);}
function create(seed='default'){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:'m577-seat-'+seat,name:'M577 Seat '+seat,cards:deck()
  })),{classic:true,first:0,seed:'m577-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function takeMonster(state,seat,id=NORMALS[0]){
  const held=holder(state,seat);
  let index=held.deck.findIndex(card=>card.id===id),card;
  if(index>=0)[card]=held.deck.splice(index,1);
  else{
    index=held.hand.findIndex(card=>card.id===id);
    assert.ok(index>=0,'monster card must remain in physical seat '+seat+' deck or hand');
    [card]=held.hand.splice(index,1);
  }
  const monster={...card,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,attackCount:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster.uid;
}
function addSource(state,controllerTeam,ownerSeat,id,{faceUp=true,setTurn=0}={}){
  assert.equal(ownerSeat%2,physicalTeam(controllerTeam));
  const uid='m'+ownerSeat+':m577-source-'+id+'-'+state.core.players[controllerTeam].backrow.length;
  state.core.players[controllerTeam].backrow.push({uid,id,faceUp,setTurn});
  return uid;
}
function physicalTeam(team){return team;}
function pendingAttack(state,attackerTeam,uid,{stage='declare',damageStep=false}={}){
  state.core.current=attackerTeam;
  state.core.priority=1-attackerTeam;
  state.core.phase='response';
  state.core.damageStep=damageStep;
  state.core.pending={kind:'attack',actor:attackerTeam,card:uid,stage};
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
function addStandby(state,controller=0,turn=2){
  state.core.current=controller;
  state.core.phase='standby';
  state.core.turn=turn;
  state.core.damageStep=false;
}

test('M577 cards remain outside the catalog and released-card allowlist until certification',()=>{
  assert.equal(getPlayableCard(MIRROR_WALL_ID),undefined);
  assert.equal(getPlayableCard(FAIRY_BOX_ID),undefined);
});

test('Mirror Wall halves only the opponent attacking monster and does not mutate it',()=>{
  const state=create('mirror-wall');
  addSource(state,0,0,MIRROR_WALL_ID);
  const attacker=takeMonster(state,1);
  pendingAttack(state,1,attacker);
  const monster=state.core.players[1].monsters.find(m=>m.uid===attacker);
  const before=atk(monster,state.core);
  const effective=mirrorWallEffectiveAtk(state);
  assert.equal(effective,Math.floor(before/2));
  assert.equal(monster.atkBoost,0);
  assert.equal(monster.position,'atk');
  assertRules(state);
});

test('Mirror Wall does not affect its controller own attacker or a face-down copy',()=>{
  const state=create('mirror-wall-own');
  addSource(state,0,0,MIRROR_WALL_ID,{faceUp:false});
  const attacker=takeMonster(state,0);
  pendingAttack(state,0,attacker);
  const monster=state.core.players[0].monsters.find(m=>m.uid===attacker);
  assert.equal(mirrorWallEffectiveAtk(state),atk(monster,state.core));
});

test('Fairy Box uses injected coin results and sets ATK to zero only for the named Battle Phase',()=>{
  const state=create('fairy-box-correct');
  const source=addSource(state,0,0,FAIRY_BOX_ID);
  const attacker=takeMonster(state,1);
  pendingAttack(state,1,attacker);
  const session=createContinuousBattleTrapSession(state);
  assert.deepEqual(fairyBoxAttackActions(session.duel),[source]);
  const resolved=resolveFairyBoxAttack(session,source,'heads','heads','turn-1-team-1-battle');
  assert.equal(resolved.result.correct,true);
  assert.equal(resolved.result.attackerAtkAfter,0);
  assert.equal(fairyBoxEffectiveAtk(resolved.session,'turn-1-team-1-battle'),0);
  assert.equal(fairyBoxEffectiveAtk(resolved.session,'turn-2-team-1-battle'),mirrorWallEffectiveAtk(resolved.session.duel));
  assert.throws(()=>resolveFairyBoxAttack(resolved.session,source,'heads','heads','turn-1-team-1-battle'),/duplicada/);
});

test('Fairy Box wrong call leaves ATK unchanged and a second copy can still resolve',()=>{
  const state=create('fairy-box-multiple');
  const sourceA=addSource(state,0,0,FAIRY_BOX_ID);
  const sourceB=addSource(state,0,2,FAIRY_BOX_ID);
  const attacker=takeMonster(state,1);
  pendingAttack(state,1,attacker);
  const session=createContinuousBattleTrapSession(state);
  const first=resolveFairyBoxAttack(session,sourceA,'heads','tails','phase-1');
  assert.equal(first.result.correct,false);
  assert.equal(first.result.attackerAtkAfter,atk(first.session.duel.core.players[1].monsters.find(m=>m.uid===attacker),first.session.duel.core));
  const second=resolveFairyBoxAttack(first.session,sourceB,'tails','tails','phase-1');
  assert.equal(second.result.correct,true);
  assert.equal(fairyBoxEffectiveAtk(second.session,'phase-1'),0);
});

test('Fairy Box is unavailable in Damage Step or during the turn it was Set',()=>{
  const state=create('fairy-box-window');
  const source=addSource(state,0,0,FAIRY_BOX_ID,{setTurn:state.core.turn});
  const attacker=takeMonster(state,1);
  pendingAttack(state,1,attacker);
  const session=createContinuousBattleTrapSession(state);
  assert.deepEqual(fairyBoxAttackActions(session.duel),[]);
  session.duel.core.players[0].backrow.find(c=>c.uid===source).setTurn=0;
  session.duel.core.damageStep=true;
  assert.deepEqual(fairyBoxAttackActions(session.duel),[]);
});

test('Mirror Wall upkeep pays 2000 once per copy and is idempotent for the turn',()=>{
  const state=create('mirror-wall-upkeep');
  const source=addSource(state,0,0,MIRROR_WALL_ID,{setTurn:0});
  addStandby(state,0,2);
  const session=createContinuousBattleTrapSession(state);
  const before=inventory(session.duel),beforeHands=hands(session.duel);
  const paid=resolveContinuousTrapUpkeep(session,source,true);
  assert.equal(paid.result.cost,2000);
  assert.equal(paid.result.paid,true);
  assert.equal(paid.result.paidAmount,2000);
  assert.equal(paid.result.lpAfter,paid.result.lpBefore-2000);
  const repeated=resolveContinuousTrapUpkeep(paid.session,source,false);
  assert.equal(repeated.result.alreadyProcessed,true);
  assert.equal(repeated.result.lpAfter,paid.result.lpAfter);
  assertConserved(paid.session.duel,before);
  assert.deepEqual(hands(paid.session.duel),beforeHands);
  assertRules(paid.session.duel);
});

test('Fairy Box upkeep costs 500 LP; insufficient LP destroys it to its physical owner Graveyard',()=>{
  const state=create('fairy-box-upkeep');
  const source=addSource(state,0,1,FAIRY_BOX_ID,{setTurn:0});
  addStandby(state,0,2);
  state.core.players[0].lp=300;
  const before=inventory(state),beforeHands=hands(state);
  const session=createContinuousBattleTrapSession(state);
  const result=resolveContinuousTrapUpkeep(session,source,true);
  assert.equal(result.result.cost,500);
  assert.equal(result.result.paid,false);
  assert.equal(result.result.destroyed,true);
  assert.equal(result.result.lpAfter,300);
  assert.ok(result.session.duel.core.players[1].grave.some(c=>c.uid===source),'stolen card returns to physical owner grave');
  assertConserved(result.session.duel,before);
  assert.deepEqual(hands(result.session.duel),beforeHands);
  assertRules(result.session.duel);
});

test('declining upkeep destroys Mirror Wall without paying and moves it to owner Graveyard',()=>{
  const state=create('mirror-wall-decline');
  const source=addSource(state,0,0,MIRROR_WALL_ID,{setTurn:0});
  addStandby(state,0,2);
  const session=createContinuousBattleTrapSession(state);
  const before=inventory(session.duel);
  const result=resolveContinuousTrapUpkeep(session,source,false);
  assert.equal(result.result.paid,false);
  assert.equal(result.result.destroyed,true);
  assert.ok(result.session.duel.core.players[0].grave.some(c=>c.uid===source));
  assertConserved(result.session.duel,before);
});

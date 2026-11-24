'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {atk}=require('../dist/duelEngine');
const {getPlayableCard,getEffect}=require('../dist/effectRegistry');
const {getActivationModel}=require('../dist/effectModels');
const {rulesFor}=require('../dist/rulesProfile');
const {
  DRAINING_SHIELD_ID,
  ENCHANTED_JAVELIN_ID,
  createAttackLpGainSession,
  attackLpGainActions,
  activateAttackLpGain,
  resolveAttackLpGain
}=require('../dist/attackLpGainTagAdapter');

const MAGIC_CYLINDER='62279055';
const MAGIC_JAMMER='77414722';
const NORMALS=[...new Set(tag.tagNormalCardIds)];
const ATTACKER_ID=NORMALS.find(id=>Number(getPlayableCard(id)?.atk)>0);
assert.ok(NORMALS.length>=20,'the normal-monster pool must build four 20-card physical decks');
assert.ok(ATTACKER_ID,'the normal-monster pool must contain a positive-ATK attacker');
assert.ok(getPlayableCard(MAGIC_CYLINDER),'Magic Cylinder must be available as a legal attack-response fixture');
assert.equal(getActivationModel(getEffect(MAGIC_JAMMER))?.speed,3,'Magic Jammer must model a Spell Speed 3 chain link');

function member(seat){return 'm574-seat-'+seat;}
function deck(required=[]){
  const ordered=[...new Set([...required,...NORMALS.filter(id=>!required.includes(id))])];
  assert.ok(ordered.length>=20);
  return ordered.slice(0,20);
}
function create(first=1,seed='default'){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:member(seat),name:'M574 Seat '+seat,cards:deck([ATTACKER_ID,MAGIC_CYLINDER])
  })),{classic:true,first,seed:'m574-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function hand(state,seat,id){
  const held=holder(state,seat);
  const found=held.hand.find(card=>card.id===id);
  if(found)return found;
  const index=held.deck.findIndex(card=>card.id===id);
  assert.ok(index>=0,'card '+id+' must remain in physical seat '+seat+' deck');
  const [card]=held.deck.splice(index,1);
  held.hand.push(card);
  return card;
}
function action(state,seat,predicate,label){
  const found=tag.tagActions(state,member(seat)).find(predicate);
  assert.ok(found,'seat '+seat+' must have '+label+' in '+state.core.phase);
  return found;
}
function settleNoOptions(state){
  let guard=0;
  while(state.core.phase==='response'&&guard++<8){
    const seat=state.active[state.core.priority];
    const pass=tag.tagActions(state,member(seat)).find(item=>item.kind==='pass');
    if(!pass)break;
    state=tag.stepTagDuel(state,member(seat),pass);
  }
  assert.ok(guard<8,'response window did not settle');
  return state;
}
function setMagicCylinder(state,seat){
  const card=hand(state,seat,MAGIC_CYLINDER);
  state=tag.stepTagDuel(state,member(seat),
    action(state,seat,item=>item.kind==='set'&&item.card===card.uid,'Set Magic Cylinder'));
  return {state,uid:card.uid};
}
function attackFixture(sourceId,{first=1,turn3=false,seed='fixture'}={}){
  let state=create(first,seed);
  const sourceSet=setMagicCylinder(state,first);
  state=sourceSet.state;
  state=tag.stepTagDuel(state,member(first),action(state,first,item=>item.kind==='end','End Phase'));
  state=settleNoOptions(state);
  assert.equal(state.core.turn,2);

  let dummyUid;
  if(turn3){
    const defenderSeat=state.active[0];
    const dummySet=setMagicCylinder(state,defenderSeat);
    state=dummySet.state;
    dummyUid=dummySet.uid;
    state=tag.stepTagDuel(state,member(defenderSeat),action(state,defenderSeat,item=>item.kind==='end','End Phase'));
    state=settleNoOptions(state);
    assert.equal(state.core.turn,3);
  }

  const attackerTeam=turn3?1:0;
  const attackerSeat=state.active[attackerTeam];
  const attacker=hand(state,attackerSeat,ATTACKER_ID);
  state=tag.stepTagDuel(state,member(attackerSeat),
    action(state,attackerSeat,item=>item.kind==='summon'&&item.card===attacker.uid&&item.position==='atk','Normal Summon'));
  state=settleNoOptions(state);
  assert.equal(state.core.phase,'main');
  state=tag.stepTagDuel(state,member(attackerSeat),action(state,attackerSeat,item=>item.kind==='battle','Battle Phase'));
  state=settleNoOptions(state);
  assert.equal(state.core.phase,'battle');
  state=tag.stepTagDuel(state,member(attackerSeat),
    action(state,attackerSeat,item=>item.kind==='attack'&&item.card===attacker.uid&&!item.target,'direct attack'));
  assert.equal(state.core.phase,'response');
  assert.equal(state.core.pending.kind,'attack');
  assert.equal(state.core.pending.stage,'declare');

  const source=state.core.players[1].backrow.find(card=>card.uid===sourceSet.uid);
  assert.ok(source);
  source.id=sourceId;
  if(turn3){
    const dummy=state.core.players[0].backrow.find(card=>card.uid===dummyUid);
    assert.ok(dummy);
    dummy.faceUp=true;
    state.core.chain.push({actor:0,card:dummy.uid,id:MAGIC_CYLINDER,target:attacker.uid});
    state.core.priority=1;
    state.core.passes=0;
  }
  return {
    state,sourceUid:source.uid,attackerUid:attacker.uid,attackerTeam,
    sourceOwnerSeat:first,dummyUid,before:inventory(state),hands:hands(state)
  };
}
function inventory(state){
  const cards=tag.tagInventory(state).filter(card=>card.entityKind!=='token');
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
function grave(state,team,uid,id){
  return state.core.players[team].grave.some(card=>card.uid===uid&&card.id===id);
}
function activate(f,id){
  assert.ok(attackLpGainActions(f.state).some(action=>action.card===f.sourceUid));
  return activateAttackLpGain(createAttackLpGainSession(f.state),f.sourceUid,id);
}

test('M574 cards are intentionally not admitted by the shared catalog yet',()=>{
  assert.equal(getPlayableCard(DRAINING_SHIELD_ID),undefined);
  assert.equal(getPlayableCard(ENCHANTED_JAVELIN_ID),undefined);
  assert.ok(getPlayableCard(MAGIC_CYLINDER));
  assert.ok(getPlayableCard(ATTACKER_ID));
});

test('Draining Shield is offered only against an opponent attack and fixes the attacking UID',()=>{
  const f=attackFixture(DRAINING_SHIELD_ID,{seed:'draining-opponent'});
  assert.deepEqual(attackLpGainActions(f.state),[
    {kind:'trap',card:f.sourceUid,target:f.attackerUid}
  ]);
});

test('Enchanted Javelin uses the same attack window without an activation-time target',()=>{
  const f=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'javelin-opponent'});
  assert.deepEqual(attackLpGainActions(f.state),[
    {kind:'trap',card:f.sourceUid,target:''}
  ]);
});

test('Draining Shield negates the attack and gains the attacker current ATK for the controlling team',()=>{
  const f=attackFixture(DRAINING_SHIELD_ID,{first:3,seed:'draining-seat-three'});
  const session=activate(f,'draining-seat-three');
  const attacker=session.duel.core.players[0].monsters.find(card=>card.uid===f.attackerUid);
  assert.ok(attacker);
  attacker.atkBoost+=650;
  const expected=atk(attacker,session.duel.core);
  const resolved=resolveAttackLpGain(session,'draining-seat-three');
  const d=resolved.session.duel;
  assert.equal(resolved.result.attackNegated,true);
  assert.equal(d.core.pending.cancelled,true);
  assert.equal(resolved.result.effectApplied,true);
  assert.equal(resolved.result.attackerAtk,expected);
  assert.equal(resolved.result.gainAmount,expected);
  assert.equal(resolved.result.recipientTeam,1);
  assert.equal(d.core.players[1].lp,f.state.core.players[1].lp+expected);
  assert.equal(d.core.players[0].lp,f.state.core.players[0].lp);
  assert.equal(resolved.result.sourcePhysicalOwnerSeat,3);
  assert.ok(grave(d,1,f.sourceUid,DRAINING_SHIELD_ID));
  assert.equal(resolved.result.sourceSentToGrave,true);
  assert.equal(resolved.result.firePrincessEvent.gainingTeam,1);
  assert.equal(resolved.result.firePrincessEvent.lpGained,expected);
  assert.match(resolved.result.firePrincessEvent.eventId,/^m574:/);
  assertConserved(d,f.before);
  assert.deepEqual(hands(d),f.hands);
  assertRules(d);
});

test('Enchanted Javelin gains current ATK but never negates the attack',()=>{
  const f=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'javelin-keeps-attack'});
  const session=activate(f,'javelin-keeps-attack');
  const attacker=session.duel.core.players[0].monsters.find(card=>card.uid===f.attackerUid);
  attacker.atkBoost+=300;
  const expected=atk(attacker,session.duel.core);
  const resolved=resolveAttackLpGain(session,'javelin-keeps-attack');
  assert.equal(resolved.result.effectApplied,true);
  assert.equal(resolved.result.attackNegated,false);
  assert.equal(resolved.session.duel.core.pending.cancelled,undefined);
  assert.equal(resolved.result.targetUid,null,'Enchanted Javelin does not target at activation');
  assert.equal(resolved.result.gainAmount,expected);
  assert.equal(resolved.session.duel.core.players[1].lp,f.state.core.players[1].lp+expected);
  assert.equal(resolved.result.firePrincessEvent.lpGained,expected);
  assertConserved(resolved.session.duel,f.before);
});

test('Enchanted Javelin can respond to its controller team attacking after priority returns through a chain',()=>{
  const f=attackFixture(ENCHANTED_JAVELIN_ID,{turn3:true,seed:'javelin-own-attack'});
  assert.equal(f.attackerTeam,1);
  assert.equal(f.state.core.priority,1);
  assert.equal(f.state.core.chain.length,1);
  assert.deepEqual(attackLpGainActions(f.state),[
    {kind:'trap',card:f.sourceUid,target:''}
  ]);
  const resolved=resolveAttackLpGain(activate(f,'javelin-own-attack'),'javelin-own-attack');
  assert.equal(resolved.result.effectApplied,true);
  assert.equal(resolved.result.attackNegated,false);
  assert.equal(resolved.result.recipientTeam,1);
});

test('Draining Shield cannot respond to its controller team attack even when chain priority returns',()=>{
  const f=attackFixture(DRAINING_SHIELD_ID,{turn3:true,seed:'draining-own-attack'});
  assert.equal(f.attackerTeam,1);
  assert.equal(f.state.core.priority,1);
  assert.deepEqual(attackLpGainActions(f.state),[]);
});

test('a redirected battle target does not invalidate the same attacking monster response',()=>{
  for(const [cardId,shouldNegate] of [[DRAINING_SHIELD_ID,true],[ENCHANTED_JAVELIN_ID,false]]){
    const seed='redirect-'+cardId;
    const f=attackFixture(cardId,{seed});
    const session=activate(f,seed);
    session.duel.core.pending.target='m1:redirected-target';
    const resolved=resolveAttackLpGain(session,seed);
    assert.equal(resolved.result.effectApplied,true);
    assert.equal(resolved.result.attackNegated,shouldNegate);
    assert.ok(resolved.result.gainAmount>0);
    assert.equal(resolved.result.attackerUid,f.attackerUid);
  }
});

test('a Set trap is unavailable during the turn it was Set',()=>{
  const f=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'same-turn-set'});
  const source=f.state.core.players[1].backrow.find(card=>card.uid===f.sourceUid);
  source.setTurn=f.state.core.turn;
  assert.deepEqual(attackLpGainActions(f.state),[]);
});

test('a face-up source, wrong priority, or Damage Step cannot open the adapter window',()=>{
  const faceUp=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'face-up'});
  faceUp.state.core.players[1].backrow.find(card=>card.uid===faceUp.sourceUid).faceUp=true;
  assert.deepEqual(attackLpGainActions(faceUp.state),[]);

  const wrongPriority=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'wrong-priority'});
  wrongPriority.state.core.priority=0;
  assert.deepEqual(attackLpGainActions(wrongPriority.state),[]);

  const damageStep=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'damage-step'});
  damageStep.state.core.damageStep=true;
  assert.deepEqual(attackLpGainActions(damageStep.state),[]);
});

test('a cancelled or negated attack cannot be used for a new LP gain activation',()=>{
  const cancelled=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'cancelled'});
  cancelled.state.core.pending.cancelled=true;
  assert.deepEqual(attackLpGainActions(cancelled.state),[]);

  const negated=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'pending-negated'});
  negated.state.core.pendingNegated=true;
  assert.deepEqual(attackLpGainActions(negated.state),[]);
});

test('Normal Traps cannot chain over a Spell Speed 3 Counter Trap',()=>{
  const f=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'counter-window'});
  f.state.core.chain.push({actor:0,card:'m0:counter-fixture',id:MAGIC_JAMMER,target:''});
  f.state.core.priority=1;
  assert.deepEqual(attackLpGainActions(f.state),[]);
});

test('Draining Shield does not retarget if the declared attacker changes before resolution',()=>{
  const f=attackFixture(DRAINING_SHIELD_ID,{seed:'no-retarget'});
  const session=activate(f,'no-retarget');
  session.duel.core.pending.card='m0:other-attacker';
  const resolved=resolveAttackLpGain(session,'no-retarget');
  assert.equal(resolved.result.effectApplied,false);
  assert.equal(resolved.result.attackNegated,false);
  assert.equal(resolved.result.gainAmount,0);
  assert.ok(grave(resolved.session.duel,1,f.sourceUid,DRAINING_SHIELD_ID));
  assertConserved(resolved.session.duel,f.before);
});

test('the source resolves without gain if the attacker left the field before resolution',()=>{
  const f=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'attacker-left'});
  const session=activate(f,'attacker-left');
  const attacker=session.duel.core.players[0].monsters.find(card=>card.uid===f.attackerUid);
  session.duel.core.players[0].monsters=session.duel.core.players[0].monsters.filter(card=>card.uid!==f.attackerUid);
  session.duel.core.players[0].grave.push({uid:attacker.uid,id:attacker.id});
  const resolved=resolveAttackLpGain(session,'attacker-left');
  assert.equal(resolved.result.effectApplied,false);
  assert.equal(resolved.result.gainAmount,0);
  assert.equal(resolved.result.attackNegated,false);
  assert.ok(grave(resolved.session.duel,1,f.sourceUid,ENCHANTED_JAVELIN_ID));
  assertConserved(resolved.session.duel,f.before);
});

test('a negated Trap activation pays no LP and leaves the attack available',()=>{
  const f=attackFixture(DRAINING_SHIELD_ID,{seed:'trap-activation-negated'});
  const resolved=resolveAttackLpGain(activate(f,'trap-activation-negated'),'trap-activation-negated',{sourceActivationNegated:true});
  assert.equal(resolved.result.sourceActivationNegated,true);
  assert.equal(resolved.result.effectApplied,false);
  assert.equal(resolved.result.attackNegated,false);
  assert.equal(resolved.result.gainAmount,0);
  assert.equal(resolved.session.duel.core.pending.cancelled,undefined);
  assert.equal(resolved.session.duel.core.players[1].lp,f.state.core.players[1].lp);
  assert.equal(resolved.result.firePrincessEvent,null);
});

test('an attack cancelled by another chain link before resolution does not grant LP',()=>{
  const f=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'other-link-cancelled'});
  const session=activate(f,'other-link-cancelled');
  session.duel.core.pending.cancelled=true;
  const resolved=resolveAttackLpGain(session,'other-link-cancelled');
  assert.equal(resolved.result.effectApplied,false);
  assert.equal(resolved.result.gainAmount,0);
  assert.equal(resolved.result.firePrincessEvent,null);
});

test('zero ATK resolves Enchanted Javelin without emitting an LP-gain event',()=>{
  const f=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'zero-atk'});
  const session=activate(f,'zero-atk');
  const attacker=session.duel.core.players[0].monsters.find(card=>card.uid===f.attackerUid);
  attacker.atkBoost=-getPlayableCard(attacker.id).atk;
  const resolved=resolveAttackLpGain(session,'zero-atk');
  assert.equal(resolved.result.effectApplied,true);
  assert.equal(resolved.result.attackerAtk,0);
  assert.equal(resolved.result.gainAmount,0);
  assert.equal(resolved.result.firePrincessEvent,null);
  assert.deepEqual(resolved.session.processedEventIds,[]);
});

test('Draining Shield still negates a zero-ATK attack but emits no LP-gain event',()=>{
  const f=attackFixture(DRAINING_SHIELD_ID,{seed:'draining-zero-atk'});
  const session=activate(f,'draining-zero-atk');
  const attacker=session.duel.core.players[0].monsters.find(card=>card.uid===f.attackerUid);
  attacker.atkBoost=-getPlayableCard(attacker.id).atk;
  const resolved=resolveAttackLpGain(session,'draining-zero-atk');
  assert.equal(resolved.result.effectApplied,true);
  assert.equal(resolved.result.attackNegated,true);
  assert.equal(resolved.result.gainAmount,0);
  assert.equal(resolved.result.firePrincessEvent,null);
  assert.deepEqual(resolved.session.processedEventIds,[]);
});

test('LP is routed to the Trap controller team while the physical owner seat remains explicit',()=>{
  const f=attackFixture(ENCHANTED_JAVELIN_ID,{first:3,seed:'owner-controller'});
  const initial=[f.state.core.players[0].lp,f.state.core.players[1].lp];
  const resolved=resolveAttackLpGain(activate(f,'owner-controller'),'owner-controller');
  assert.equal(resolved.result.sourcePhysicalOwnerSeat,3);
  assert.equal(resolved.result.recipientTeam,1);
  assert.equal(resolved.session.duel.core.players[0].lp,initial[0]);
  assert.ok(resolved.session.duel.core.players[1].lp>initial[1]);
  assert.ok(grave(resolved.session.duel,1,f.sourceUid,ENCHANTED_JAVELIN_ID));
});

test('a Trap whose physical owner belongs to the other team cannot be activated from this backrow',()=>{
  const f=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'owner-mismatch'});
  const sourceIndex=f.state.core.players[1].backrow.findIndex(card=>card.uid===f.sourceUid);
  const [source]=f.state.core.players[1].backrow.splice(sourceIndex,1);
  f.state.core.players[0].backrow.push(source);
  f.state.core.priority=0;
  assert.deepEqual(attackLpGainActions(f.state),[]);
});

test('a malformed physical UID is rejected instead of being silently reassigned',()=>{
  const f=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'malformed-uid'});
  f.state.core.players[1].backrow.find(card=>card.uid===f.sourceUid).uid='not-a-seat:trap';
  assert.throws(()=>attackLpGainActions(f.state),/UID físico 2v2 inválido/);
});

test('LP overflow and negative LP are rejected without mutating the input session',()=>{
  const f=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'lp-overflow'});
  const overflow=activate(f,'lp-overflow');
  overflow.duel.core.players[1].lp=Number.MAX_SAFE_INTEGER;
  const before=structuredClone(overflow);
  assert.throws(()=>resolveAttackLpGain(overflow,'lp-overflow'),/inteiros seguros/);
  assert.deepEqual(overflow,before);

  const negative=activate(f,'negative-lp');
  negative.duel.core.players[1].lp=-1;
  assert.throws(()=>resolveAttackLpGain(negative,'negative-lp'),/inteiro seguro não negativo/);
});

test('activation IDs are unique and resolution is LIFO',()=>{
  const f=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'ids-lifo'});
  const session=activate(f,'ids-lifo');
  assert.throws(()=>activateAttackLpGain(session,f.sourceUid,'ids-lifo'),/ausente ou duplicado/);
  session.duel.core.chain.push({actor:0,card:'m0:later-link',id:MAGIC_CYLINDER,target:''});
  assert.throws(()=>resolveAttackLpGain(session,'ids-lifo'),/topo da corrente/);
});

test('both cards conserve all physical UIDs and private hands while respecting the 2v2 rules profile',()=>{
  for(const [cardId,seed] of [[DRAINING_SHIELD_ID,'conserve-draining'],[ENCHANTED_JAVELIN_ID,'conserve-javelin']]){
    const f=attackFixture(cardId,{seed});
    const session=activate(f,seed);
    const resolved=resolveAttackLpGain(session,seed);
    assertConserved(resolved.session.duel,f.before);
    assert.deepEqual(hands(resolved.session.duel),f.hands);
    assertRules(resolved.session.duel);
    assert.equal(resolved.result.sourceSentToGrave,true);
  }
});

test('the LP event is unique and compatible with the Fire Princess gain-event contract',()=>{
  const f=attackFixture(ENCHANTED_JAVELIN_ID,{seed:'fire-princess-contract'});
  const resolved=resolveAttackLpGain(activate(f,'fire-princess-contract'),'fire-princess-contract');
  const event=resolved.result.firePrincessEvent;
  assert.ok(event);
  assert.equal(event.eventId,'m574:fire-princess-contract');
  assert.equal(event.gainingTeam,1);
  assert.equal(event.lpGained,resolved.result.gainAmount);
  assert.deepEqual(event.teamLifePointsAfterGain,resolved.result.teamLifePoints);
  assert.deepEqual(event.negatedSourceUids,[]);
  assert.deepEqual(resolved.session.processedEventIds,[event.eventId]);
});

test('M574 never certifies or distributes cards merely because the behavior adapter exists',()=>{
  assert.equal(getPlayableCard(DRAINING_SHIELD_ID),undefined);
  assert.equal(getPlayableCard(ENCHANTED_JAVELIN_ID),undefined);
  assert.equal(attackLpGainActions(attackFixture(DRAINING_SHIELD_ID,{seed:'no-admission'}).state).length,1);
});

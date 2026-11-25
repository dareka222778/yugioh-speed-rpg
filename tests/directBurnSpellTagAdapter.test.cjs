'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getDuelCard,getPlayableCard}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {
  FINAL_FLAME_ID,
  RAIMEI_ID,
  DIRECT_BURN_SPELLS,
  assertDirectBurnRules,
  assertPhysicalExtraDeckCounts,
  directBurnSpellActions,
  createDirectBurnSession,
  activateDirectBurnSpell,
  resolveDirectBurnSpell
}=require('../dist/directBurnSpellTagAdapter');

const SOURCE_SPELL_ID='53129443'; // enabled Normal Spell fixture (Dark Hole)
const QUICKPLAY_ID='05318639'; // Mystical Space Typhoon
const normalDeck=tag.tagNormalCardIds.slice(0,20);
assert.equal(normalDeck.length,20);
assert.equal(getDuelCard(SOURCE_SPELL_ID)?.kind,'spell');

function makeDuel(first=0){
  const players=[0,1,2,3].map(seat=>({
    id:'m631-seat-'+seat,
    name:'M631 Seat '+seat,
    cards:[...normalDeck],
    extra:[]
  }));
  const duel=tag.createTagDuel(players,{seed:'m631-burn-'+first,first,classic:true});
  duel.core.players[0].lp=8000;
  duel.core.players[1].lp=8000;
  duel.core.turn=3;
  duel.core.phase='main';
  duel.core.resume='main';
  duel.core.current=0;
  duel.core.priority=0;
  duel.core.pending={kind:'none'};
  duel.core.chain=[];
  duel.core.passes=0;
  duel.core.damageStep=false;
  duel.core.turnEnding=false;
  duel.core.pendingNegated=false;
  duel.core.handFlow=undefined;
  duel.core.choice=undefined;
  return duel;
}
function privateZone(duel,seat,zone){
  const team=seat%2;
  return duel.active[team]===seat
    ?duel.core.players[team][zone]
    :duel.reserves[String(seat)][zone];
}
function partnerSeat(seat){return (seat+2)%4;}
function setup({first=0,team=0,effectCardId=FINAL_FLAME_ID,sourceOwnerSeat,sourceCardId=SOURCE_SPELL_ID,opponentLP=8000,controllerLP=8000}={}){
  const duel=makeDuel(first);
  duel.core.current=team;
  duel.core.priority=team;
  duel.core.players[team].lp=controllerLP;
  duel.core.players[1-team].lp=opponentLP;
  const owner=sourceOwnerSeat??duel.active[team];
  const hand=privateZone(duel,owner,'hand');
  const [source]=hand.splice(0,1);
  assert.ok(source);
  source.id=sourceCardId;
  if(owner===duel.active[team])duel.core.players[team].hand.push(source);
  else privateZone(duel,owner,'hand').push(source);
  tag.assertTagDuel(duel);
  assertDirectBurnRules(duel);
  return {duel,team,owner,sourceUid:source.uid,effectCardId,sourceCardId};
}
function actions(f,effectCardId=f.effectCardId,sourceCardId=f.sourceCardId){
  return directBurnSpellActions(f.duel,effectCardId,{sourceCardId});
}
function activate(f,id='m631-activation',effectCardId=f.effectCardId,sourceCardId=f.sourceCardId){
  return activateDirectBurnSpell(createDirectBurnSession(f.duel),f.sourceUid,id,effectCardId,{sourceCardId});
}
function resolve(session,id='m631-activation',options={}){
  return resolveDirectBurnSpell(session,id,options);
}
function inventory(duel){
  return tag.tagInventory(duel).filter(card=>card.entityKind!=='token')
    .map(card=>card.uid+'|'+card.id).sort();
}
function graveHas(duel,team,uid){
  return duel.core.players[team].grave.some(card=>card.uid===uid);
}
function moveSourceToGraveBeforeResolve(session,team,sourceUid){
  const index=session.duel.core.players[team].backrow.findIndex(card=>card.uid===sourceUid);
  assert.ok(index>=0);
  const [card]=session.duel.core.players[team].backrow.splice(index,1);
  session.duel.core.players[team].grave.push({uid:card.uid,id:card.id});
  synchronizeCardLifetimes(session.duel.core);
}

test('Final Flame and Raimei remain unadmitted and grant no inventory',()=>{
  assert.equal(getPlayableCard(FINAL_FLAME_ID),undefined);
  assert.equal(getDuelCard(FINAL_FLAME_ID),undefined);
  assert.equal(getPlayableCard(RAIMEI_ID),undefined);
  assert.equal(getDuelCard(RAIMEI_ID),undefined);
  assert.equal(DIRECT_BURN_SPELLS[FINAL_FLAME_ID].opponentDamage,600);
  assert.equal(DIRECT_BURN_SPELLS[RAIMEI_ID].opponentDamage,300);
  assertPhysicalExtraDeckCounts([0,1,2,3],5);
  assert.throws(()=>assertPhysicalExtraDeckCounts([0,1,6,3],5),/cinco/);
});
test('offers Final Flame only from the active player's hand in Main Phase',()=>{
  const f=setup();
  assert.deepEqual(actions(f),[{kind:'spell',card:f.sourceUid,target:''}]);
});
test('offers Raimei through the same reusable direct-burn resolver',()=>{
  const f=setup({effectCardId:RAIMEI_ID});
  assert.equal(actions(f).length,1);
});
test('does not expose a target or choose a monster',()=>{
  const f=setup();
  const action=actions(f)[0];
  assert.equal(action.target,'');
  assert.deepEqual(Object.keys(action).sort(),['card','kind','target']);
});
test('activation moves the Normal Spell from hand to face-up backrow and opens the response window',()=>{
  const f=setup();
  const session=activate(f);
  assert.ok(!session.duel.core.players[0].hand.some(card=>card.uid===f.sourceUid));
  assert.ok(session.duel.core.players[0].backrow.some(card=>card.uid===f.sourceUid&&card.faceUp));
  assert.equal(session.duel.core.pending.kind,'spell');
  assert.equal(session.duel.core.pending.actor,0);
  assert.equal(session.duel.core.pending.card,f.sourceUid);
  assert.equal(session.duel.core.pending.id,SOURCE_SPELL_ID);
  assert.equal(session.duel.core.phase,'response');
  assert.equal(session.duel.core.priority,1);
});
test('Final Flame inflicts exactly 600 damage to the opposing shared LP pool',()=>{
  const f=setup();
  const before=inventory(f.duel);
  const resolved=resolve(activate(f));
  assert.equal(resolved.result.damage,600);
  assert.equal(resolved.result.spellName,'Final Flame');
  assert.equal(resolved.result.opponentLPBefore,8000);
  assert.equal(resolved.result.opponentLPAfter,7400);
  assert.equal(resolved.session.duel.core.players[1].lp,7400);
  assert.equal(resolved.session.duel.core.players[0].lp,8000);
  assert.ok(graveHas(resolved.session.duel,0,f.sourceUid));
  assert.deepEqual(inventory(resolved.session.duel),before);
});
test('Raimei inflicts exactly 300 damage to the opposing shared LP pool',()=>{
  const f=setup({effectCardId:RAIMEI_ID});
  const resolved=resolve(activate(f));
  assert.equal(resolved.result.damage,300);
  assert.equal(resolved.result.spellName,'Raimei');
  assert.equal(resolved.session.duel.core.players[1].lp,7700);
  assert.equal(resolved.session.duel.core.players[0].lp,8000);
});
test('does not inflict damage to the controller team',()=>{
  const f=setup({controllerLP:2300,opponentLP:4500});
  const resolved=resolve(activate(f));
  assert.equal(resolved.session.duel.core.players[0].lp,2300);
  assert.equal(resolved.session.duel.core.players[1].lp,3900);
});
test('a negated pending Spell pays no damage but is still sent to its owner Graveyard',()=>{
  const f=setup();
  const session=activate(f);
  session.duel.core.pendingNegated=true;
  const resolved=resolve(session);
  assert.equal(resolved.result.sourceEffectNegated,true);
  assert.equal(resolved.result.damage,0);
  assert.equal(resolved.result.opponentLPAfter,8000);
  assert.ok(graveHas(resolved.session.duel,0,f.sourceUid));
});
test('an explicit effect-negated result is idempotently non-damaging',()=>{
  const f=setup({effectCardId:RAIMEI_ID});
  const resolved=resolve(activate(f),'m631-activation',{effectNegated:true});
  assert.equal(resolved.result.sourceEffectNegated,true);
  assert.equal(resolved.result.damage,0);
  assert.equal(resolved.session.duel.core.players[1].lp,8000);
});
test('ends the duel when Final Flame reduces the opponent to zero LP',()=>{
  const f=setup({opponentLP:500});
  const resolved=resolve(activate(f));
  assert.equal(resolved.session.duel.core.players[1].lp,0);
  assert.equal(resolved.session.duel.core.phase,'finished');
  assert.equal(resolved.session.duel.core.winner,resolved.session.duel.core.players[0].id);
  assert.equal(resolved.result.duelEndedByLP,true);
});
test('LP never becomes negative when damage exceeds the remaining amount',()=>{
  const f=setup({effectCardId:RAIMEI_ID,opponentLP:100});
  const resolved=resolve(activate(f));
  assert.equal(resolved.session.duel.core.players[1].lp,0);
  assert.equal(resolved.result.opponentLPAfter,0);
});
test('requires a live Main Phase, current team and priority',()=>{
  const f=setup();
  const wrongPhase=structuredClone(f.duel);
  wrongPhase.core.phase='response';
  assert.deepEqual(directBurnSpellActions(wrongPhase,f.effectCardId,{sourceCardId:f.sourceCardId}),[]);
  const wrongPriority=structuredClone(f.duel);
  wrongPriority.core.priority=1;
  assert.deepEqual(directBurnSpellActions(wrongPriority,f.effectCardId,{sourceCardId:f.sourceCardId}),[]);
  const wrongCurrent=structuredClone(f.duel);
  wrongCurrent.core.current=1;
  assert.deepEqual(directBurnSpellActions(wrongCurrent,f.effectCardId,{sourceCardId:f.sourceCardId}),[]);
});
test('does not activate while a Pending effect or Chain is already open',()=>{
  const f=setup();
  const pending=structuredClone(f.duel);
  pending.core.pending={kind:'spell',actor:0,card:'m0:pending',id:SOURCE_SPELL_ID};
  assert.deepEqual(directBurnSpellActions(pending,f.effectCardId,{sourceCardId:f.sourceCardId}),[]);
  const chain=structuredClone(f.duel);
  chain.core.chain=[{actor:1,card:'m1:chain',id:SOURCE_SPELL_ID,target:''}];
  assert.deepEqual(directBurnSpellActions(chain,f.effectCardId,{sourceCardId:f.sourceCardId}),[]);
});
test('does not activate from the inactive partner hand',()=>{
  const f=setup({sourceOwnerSeat:partnerSeat(0)});
  assert.deepEqual(actions(f),[]);
});
test('does not treat a Quick-Play Spell as a Normal Spell fixture',()=>{
  const f=setup({sourceCardId:QUICKPLAY_ID});
  assert.deepEqual(actions(f),[]);
});
test('does not offer activation when all three shared Spell/Trap Zones are occupied',()=>{
  const f=setup();
  for(let i=0;i<3;i++)f.duel.core.players[0].backrow.push({...f.duel.core.players[0].backrow[0],uid:'m0:occupied-'+i});
  assert.deepEqual(actions(f),[]);
});
test('does not activate a non-registered direct-burn card ID',()=>{
  const f=setup();
  assert.deepEqual(directBurnSpellActions(f.duel,'00000000',{sourceCardId:f.sourceCardId}),[]);
});
test('requires the exact pending card and actor at resolution',()=>{
  const f=setup();
  const wrongCard=activate(f);
  wrongCard.duel.core.pending.card='m0:wrong';
  assert.throws(()=>resolve(wrongCard),/ponto de resolução exato/);
  const wrongActor=activate(f);
  wrongActor.duel.core.pending.actor=1;
  assert.throws(()=>resolve(wrongActor),/ponto de resolução exato/);
});
test('does not resolve while another Chain link is still pending',()=>{
  const f=setup();
  const session=activate(f);
  session.duel.core.chain.push({actor:1,card:'m1:other',id:SOURCE_SPELL_ID,target:''});
  assert.throws(()=>resolve(session),/ponto de resolução exato/);
});
test('does not resolve after the turn or current team changes',()=>{
  const f=setup();
  const session=activate(f);
  session.duel.core.turn++;
  assert.throws(()=>resolve(session),/ponto de resolução exato/);
  const other=activate(f);
  other.duel.core.current=1;
  assert.throws(()=>resolve(other),/ponto de resolução exato/);
});
test('a Normal Spell removed after activation still resolves its already-open effect',()=>{
  const f=setup();
  const session=activate(f);
  moveSourceToGraveBeforeResolve(session,0,f.sourceUid);
  const resolved=resolve(session);
  assert.equal(resolved.result.damage,600);
  assert.equal(resolved.result.sourceSentToGrave,false);
  assert.equal(resolved.session.duel.core.players[1].lp,7400);
});
test('rejects duplicate activation IDs and duplicate resolution',()=>{
  const f=setup();
  const session=activate(f);
  assert.throws(()=>activateDirectBurnSpell(session,f.sourceUid,'m631-activation',f.effectCardId,{sourceCardId:f.sourceCardId}),/duplicado/);
  const resolved=resolve(session);
  assert.throws(()=>resolveDirectBurnSpell(resolved.session,'m631-activation'),/ausente ou já resolvida/);
});
test('all four opening-seat rotations route damage to the opposing team and the source to its owner',()=>{
  for(const first of [0,1,2,3]){
    const f=setup({first});
    const resolved=resolve(activate(f));
    assert.equal(resolved.session.duel.core.players[1].lp,7400,'first='+first);
    assert.equal(resolved.session.duel.core.players[0].lp,8000,'first='+first);
    assert.ok(graveHas(resolved.session.duel,0,f.sourceUid),'first='+first);
  }
});
test('three shared Spell/Trap slots and the separate Field Zone remain valid',()=>{
  const duel=makeDuel();
  const seat=duel.active[0];
  const hand=duel.core.players[0].hand;
  for(let i=0;i<3;i++){
    const [card]=hand.splice(0,1);
    card.id=SOURCE_SPELL_ID;
    duel.core.players[0].backrow.push({...card,faceUp:true,setTurn:0});
  }
  const [field]=hand.splice(0,1);
  field.id='86318356';
  duel.core.players[0].field={...field,faceUp:true,setTurn:0};
  assert.doesNotThrow(()=>assertDirectBurnRules(duel));
});
test('rejects a fourth shared Spell/Trap Zone',()=>{
  const duel=makeDuel();
  const seat=duel.active[0];
  const hand=duel.core.players[0].hand;
  for(let i=0;i<3;i++){
    const [card]=hand.splice(0,1);
    card.id=SOURCE_SPELL_ID;
    duel.core.players[0].backrow.push({...card,faceUp:true,setTurn:0});
  }
  duel.core.players[0].backrow.push({...duel.core.players[0].backrow[0],uid:'m0:overflow'});
  assert.throws(()=>assertDirectBurnRules(duel),/limite de zonas/);
});
test('hand overflow remains untouched until End Phase',()=>{
  const duel=makeDuel();
  const hand=duel.core.players[0].hand,deck=duel.core.players[0].deck;
  hand.push(deck.pop(),deck.pop());
  const before=hand.length;
  assert.doesNotThrow(()=>assertDirectBurnRules(duel));
  assert.equal(hand.length,before);
});
test('conserves every physical UID and never grants inventory',()=>{
  const f=setup();
  const before=inventory(f.duel);
  const resolved=resolve(activate(f));
  assert.deepEqual(inventory(resolved.session.duel),before);
});

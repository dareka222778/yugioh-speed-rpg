'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel.js');
const {getPlayableCard}=require('../dist/effectRegistry.js');
const {rulesFor}=require('../dist/rulesProfile.js');
const {
  SWORDS_OF_REVEALING_LIGHT_ID,
  DARK_PIERCING_LIGHT_ID,
  planRevealSpell,
  resolveRevealSpell,
  swordsOfRevealingLightLocksTeam,
  canTeamDeclareAttack,
  assertSwordsAttackAllowed,
  advanceSwordsEndPhase
}=require('../dist/revealAndAttackLockTagAdapter.js');

const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=20,'the normal-monster pool must build four physical 20-card decks');
let sourceSequence=0;
function deck(){return NORMALS.slice(0,20);}
function member(seat){return 'm639-seat-'+seat;}
function create(first=0,seed='default',extraBySeat={}){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:member(seat),name:'M639 Seat '+seat,cards:deck(),extra:[...(extraBySeat[seat]||[])]
  })),{classic:true,first,seed:'m639-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function addSpell(state,seat,id,{zone='hand',faceUp=false}={}){
  const uid='m'+seat+':m639-source-'+(++sourceSequence);
  const card={uid,id};
  if(zone==='hand')holder(state,seat).hand.push(card);
  else state.core.players[seat%2].backrow.push({...card,setTurn:state.core.turn,faceUp});
  return uid;
}
function takeMonster(state,seat,id,{faceUp=false,position='def'}={}){
  const held=holder(state,seat);
  let index=held.deck.findIndex(card=>card.id===id),card;
  if(index>=0)[card]=held.deck.splice(index,1);
  else{
    index=held.hand.findIndex(card=>card.id===id);
    assert.ok(index>=0,'card '+id+' must remain in physical seat '+seat+' deck or hand');
    [card]=held.hand.splice(index,1);
  }
  state.core.players[seat%2].monsters.push({
    ...card,position,faceUp,entered:0,changed:0,attacked:0,attackCount:0,
    atkBoost:0,defBoost:0
  });
  return card.uid;
}
function fillHand(state,seat,count){
  const held=holder(state,seat);
  while(held.hand.length<count)held.hand.push(held.deck.shift());
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
function activate(state,seat,id,uid){
  return planRevealSpell(state,{activationId:'m639:'+state.core.turn+':'+uid,actorSeat:seat,sourceUid:uid,cardId:id});
}

test('M639 cards remain outside the catalog and certification allowlist',()=>{
  assert.equal(getPlayableCard(SWORDS_OF_REVEALING_LIGHT_ID),undefined);
  assert.equal(getPlayableCard(DARK_PIERCING_LIGHT_ID),undefined);
});

test('Swords reveals every opposing monster when at least one is face-down and locks the whole opposing team',()=>{
  const state=create(0,'swords-reveal-team');
  const source=addSpell(state,0,SWORDS_OF_REVEALING_LIGHT_ID);
  const hiddenA=takeMonster(state,1,NORMALS[0],{faceUp:false,position:'def'});
  const hiddenB=takeMonster(state,3,NORMALS[1],{faceUp:false,position:'def'});
  const visible=takeMonster(state,1,NORMALS[2],{faceUp:true,position:'atk'});
  const ownHidden=takeMonster(state,0,NORMALS[3],{faceUp:false,position:'def'});
  const before=inventory(state),beforeHands=hands(state);
  const plan=activate(state,0,SWORDS_OF_REVEALING_LIGHT_ID,source);
  const result=resolveRevealSpell(state,plan);
  assert.equal(result.status,'resolved');
  assert.deepEqual(new Set(result.revealedUids),new Set([hiddenA,hiddenB]));
  assert.equal(result.state.core.players[1].monsters.find(m=>m.uid===hiddenA).faceUp,true);
  assert.equal(result.state.core.players[1].monsters.find(m=>m.uid===hiddenB).faceUp,true);
  assert.equal(result.state.core.players[1].monsters.find(m=>m.uid===visible).faceUp,true);
  assert.equal(result.state.core.players[1].monsters.find(m=>m.uid===hiddenA).position,'def');
  assert.equal(result.state.core.players[0].monsters.find(m=>m.uid===ownHidden).faceUp,false);
  assert.equal(result.state.core.players[0].backrow.some(c=>c.uid===source&&c.faceUp),true);
  assert.equal(swordsOfRevealingLightLocksTeam(result.state,1),true);
  assert.equal(canTeamDeclareAttack(result.state,1),false);
  assert.equal(canTeamDeclareAttack(result.state,0),true);
  assert.throws(()=>assertSwordsAttackAllowed(result.state,hiddenA),/Swords of Revealing Light/);
  assertConserved(result.state,before);
  assert.deepEqual(hands(result.state),beforeHands.filter(uid=>uid!==source));
  assertRules(result.state);
});

test('Swords still locks attacks for three opposing End Phases when no monster is face-down',()=>{
  const state=create(0,'swords-no-hidden');
  const source=addSpell(state,0,SWORDS_OF_REVEALING_LIGHT_ID);
  const plan=activate(state,0,SWORDS_OF_REVEALING_LIGHT_ID,source);
  const resolved=resolveRevealSpell(state,plan);
  assert.deepEqual(resolved.revealedUids,[]);
  assert.equal(canTeamDeclareAttack(resolved.state,1),false);
  assert.equal(resolved.state.swordsOfRevealingLight[0].remainingOpponentTurns,3);
});

test('only opposing End Phases decrement Swords and the third one destroys it',()=>{
  let state=create(0,'swords-three-turns');
  const source=addSpell(state,0,SWORDS_OF_REVEALING_LIGHT_ID);
  state=resolveRevealSpell(state,activate(state,0,SWORDS_OF_REVEALING_LIGHT_ID,source)).state;
  state.core.current=1;state.core.turn++;
  let first=advanceSwordsEndPhase(state,1);
  assert.equal(first.status,'advanced');
  assert.equal(first.state.swordsOfRevealingLight[0].remainingOpponentTurns,2);
  const duplicate=advanceSwordsEndPhase(first.state,1);
  assert.equal(duplicate.status,'duplicate');
  assert.equal(duplicate.state.swordsOfRevealingLight[0].remainingOpponentTurns,2);
  state=first.state;
  state.core.current=0;state.core.turn++;
  const ownEnd=advanceSwordsEndPhase(state,0);
  assert.equal(ownEnd.status,'none');
  assert.equal(ownEnd.state.swordsOfRevealingLight[0].remainingOpponentTurns,2);
  state=ownEnd.state;
  state.core.current=1;state.core.turn++;
  const second=advanceSwordsEndPhase(state,1);
  assert.equal(second.state.swordsOfRevealingLight[0].remainingOpponentTurns,1);
  state=second.state;
  state.core.current=0;state.core.turn++;
  const ownEnd2=advanceSwordsEndPhase(state,0);
  state=ownEnd2.state;
  state.core.current=1;state.core.turn++;
  const third=advanceSwordsEndPhase(state,1);
  assert.deepEqual(third.expiredUids,[source]);
  assert.equal(third.state.swordsOfRevealingLight.length,0);
  assert.equal(third.state.core.players[0].backrow.some(c=>c.uid===source),false);
  assert.equal(third.state.core.players[0].grave.some(c=>c.uid===source),true);
  assert.equal(canTeamDeclareAttack(third.state,1),true);
});

test('removing Swords ends the lock immediately without turning revealed monsters face-down again',()=>{
  const state=create(0,'swords-removed');
  const source=addSpell(state,0,SWORDS_OF_REVEALING_LIGHT_ID);
  const hidden=takeMonster(state,1,NORMALS[0],{faceUp:false});
  let resolved=resolveRevealSpell(state,activate(state,0,SWORDS_OF_REVEALING_LIGHT_ID,source)).state;
  const [removed]=resolved.core.players[0].backrow.splice(
    resolved.core.players[0].backrow.findIndex(c=>c.uid===source),1
  );
  resolved.core.players[0].grave.push(removed);
  assert.equal(canTeamDeclareAttack(resolved,1),true);
  assert.equal(resolved.core.players[1].monsters.find(m=>m.uid===hidden).faceUp,true);
  const cleaned=advanceSwordsEndPhase(resolved,0);
  assert.equal(cleaned.state.swordsOfRevealingLight.length,0);
});

test('a face-down Swords source is activated by the current partner and keeps physical ownership',()=>{
  const state=create(2,'swords-partner-set');
  const source=addSpell(state,0,SWORDS_OF_REVEALING_LIGHT_ID,{zone:'backrow',faceUp:false});
  const plan=activate(state,2,SWORDS_OF_REVEALING_LIGHT_ID,source);
  const result=resolveRevealSpell(state,plan);
  assert.equal(result.state.core.players[0].backrow.find(c=>c.uid===source).faceUp,true);
  assert.equal(result.state.swordsOfRevealingLight[0].controllerTeam,0);
  assert.equal(result.state.swordsOfRevealingLight[0].sourceUid,source);
  assert.equal(inventory(result.state).get(source),SWORDS_OF_REVEALING_LIGHT_ID);
});

test('multiple Swords copies keep independent source receipts and locks',()=>{
  const state=create(0,'swords-multiple');
  const first=addSpell(state,0,SWORDS_OF_REVEALING_LIGHT_ID);
  const second=addSpell(state,0,SWORDS_OF_REVEALING_LIGHT_ID);
  const a=resolveRevealSpell(state,activate(state,0,SWORDS_OF_REVEALING_LIGHT_ID,first)).state;
  const b=resolveRevealSpell(a,activate(a,0,SWORDS_OF_REVEALING_LIGHT_ID,second)).state;
  assert.equal(b.swordsOfRevealingLight.length,2);
  const [removed]=b.core.players[0].backrow.splice(b.core.players[0].backrow.findIndex(c=>c.uid===first),1);
  b.core.players[0].grave.push(removed);
  assert.equal(canTeamDeclareAttack(b,1),false,'the second face-up copy continues to lock attacks');
  const cleaned=advanceSwordsEndPhase(b,0);
  assert.equal(cleaned.state.swordsOfRevealingLight.length,1);
  assert.equal(cleaned.state.swordsOfRevealingLight[0].sourceUid,second);
});

test('Dark-Piercing Light reveals only face-down opposing monsters, then goes to the shared Graveyard',()=>{
  const state=create(0,'dark-piercing');
  const source=addSpell(state,0,DARK_PIERCING_LIGHT_ID);
  const hidden=takeMonster(state,1,NORMALS[0],{faceUp:false,position:'def'});
  const visible=takeMonster(state,3,NORMALS[1],{faceUp:true,position:'atk'});
  const ownHidden=takeMonster(state,2,NORMALS[2],{faceUp:false,position:'def'});
  const before=inventory(state);
  const result=resolveRevealSpell(state,activate(state,0,DARK_PIERCING_LIGHT_ID,source));
  assert.equal(result.status,'resolved');
  assert.deepEqual(result.revealedUids,[hidden]);
  assert.equal(result.state.core.players[1].monsters.find(m=>m.uid===hidden).faceUp,true);
  assert.equal(result.state.core.players[1].monsters.find(m=>m.uid===visible).faceUp,true);
  assert.equal(result.state.core.players[0].monsters.find(m=>m.uid===ownHidden).faceUp,false);
  assert.equal(result.state.core.players[0].grave.some(c=>c.uid===source),true);
  assert.equal(canTeamDeclareAttack(result.state,1),true);
  assertConserved(result.state,before);
});

test('a negated Swords activation sends its source to Graveyard without reveal or lock',()=>{
  const state=create(0,'swords-negated');
  const source=addSpell(state,0,SWORDS_OF_REVEALING_LIGHT_ID);
  const hidden=takeMonster(state,1,NORMALS[0],{faceUp:false});
  const before=inventory(state);
  const result=resolveRevealSpell(state,activate(state,0,SWORDS_OF_REVEALING_LIGHT_ID,source),true);
  assert.equal(result.status,'negated');
  assert.deepEqual(result.revealedUids,[]);
  assert.equal(result.state.core.players[0].grave.some(c=>c.uid===source),true);
  assert.equal(result.state.core.players[1].monsters.find(m=>m.uid===hidden).faceUp,false);
  assert.equal(canTeamDeclareAttack(result.state,1),true);
  assertConserved(result.state,before);
});

test('a negated Dark-Piercing Light also leaves monsters hidden and consumes no inventory',()=>{
  const state=create(0,'dark-piercing-negated');
  const source=addSpell(state,0,DARK_PIERCING_LIGHT_ID);
  const hidden=takeMonster(state,1,NORMALS[0],{faceUp:false});
  const before=inventory(state);
  const result=resolveRevealSpell(state,activate(state,0,DARK_PIERCING_LIGHT_ID,source),true);
  assert.equal(result.status,'negated');
  assert.equal(result.state.core.players[1].monsters.find(m=>m.uid===hidden).faceUp,false);
  assert.equal(result.state.core.players[0].grave.some(c=>c.uid===source),true);
  assertConserved(result.state,before);
});

test('Dark-Piercing Light does not grant a battle lock when no Swords source exists',()=>{
  const state=create(0,'dark-piercing-no-lock');
  const source=addSpell(state,0,DARK_PIERCING_LIGHT_ID);
  const result=resolveRevealSpell(state,activate(state,0,DARK_PIERCING_LIGHT_ID,source));
  assert.equal(result.state.swordsOfRevealingLight,undefined);
  assert.equal(canTeamDeclareAttack(result.state,1),true);
});

test('duplicate activation receipts cannot reveal twice or reset Swords duration',()=>{
  const state=create(0,'swords-idempotent');
  const source=addSpell(state,0,SWORDS_OF_REVEALING_LIGHT_ID);
  const plan=activate(state,0,SWORDS_OF_REVEALING_LIGHT_ID,source);
  const first=resolveRevealSpell(state,plan);
  const duplicate=resolveRevealSpell(first.state,plan);
  assert.equal(duplicate.status,'duplicate');
  assert.deepEqual(duplicate.revealedUids,[]);
  assert.equal(duplicate.state.swordsOfRevealingLight[0].remainingOpponentTurns,3);
  assert.equal(duplicate.state.core.players[0].backrow.filter(c=>c.uid===source).length,1);
});

test('a plan is rejected for wrong team, wrong seat, wrong phase, stale turn, or a foreign source',()=>{
  const base=create(0,'invalid-plans');
  const source=addSpell(base,0,SWORDS_OF_REVEALING_LIGHT_ID);
  const event={activationId:'m639:invalid',actorSeat:0,sourceUid:source,cardId:SWORDS_OF_REVEALING_LIGHT_ID};
  for(const patch of [
    {actorSeat:1},
    {actorSeat:2},
    {sourceUid:'m1:foreign-source'},
    {cardId:DARK_PIERCING_LIGHT_ID}
  ])assert.throws(()=>planRevealSpell(base,{...event,...patch}));
  const wrongPhase=structuredClone(base);wrongPhase.core.phase='battle';
  assert.throws(()=>planRevealSpell(wrongPhase,event));
  const stale=structuredClone(base);stale.core.turn++;
  const plan=planRevealSpell(base,event);
  assert.throws(()=>resolveRevealSpell(stale,plan));
});

test('activation requires a free shared S/T Zone and respects the separate Field Zone',()=>{
  const state=create(0,'zones');
  const source=addSpell(state,0,SWORDS_OF_REVEALING_LIGHT_ID);
  state.core.players[0].field={uid:'m0:m639-field',id:NORMALS[4],setTurn:0,faceUp:true};
  for(let i=0;i<3;i++)state.core.players[0].backrow.push({
    uid:'m0:m639-blocker-'+i,id:NORMALS[5+i],setTurn:0,faceUp:false
  });
  assert.throws(()=>planRevealSpell(state,{activationId:'m639:full',actorSeat:0,sourceUid:source,cardId:SWORDS_OF_REVEALING_LIGHT_ID}),/Zona de Magias\/Armadilhas livre/);
});

test('a 7-card hand is not discarded by the adapter; End Phase remains the engine responsibility',()=>{
  const state=create(0,'hand-limit');
  const source=addSpell(state,0,SWORDS_OF_REVEALING_LIGHT_ID);
  fillHand(state,0,8);
  const before=hands(state);
  const result=resolveRevealSpell(state,activate(state,0,SWORDS_OF_REVEALING_LIGHT_ID,source));
  assert.equal(holder(result.state,0).hand.length,7);
  assert.equal(before.length-hands(result.state).length,1);
  assert.equal(result.state.core.phase,'main');
  assert.equal(result.state.core.handFlow,undefined);
  assertRules(result.state);
});

test('three shared Monster Zones and three shared S/T Zones are enforced',()=>{
  const state=create(0,'zone-limits');
  for(let i=0;i<3;i++)takeMonster(state,0,NORMALS[i],{faceUp:true,position:'atk'});
  for(let i=0;i<3;i++)state.core.players[0].backrow.push({
    uid:'m0:m639-zone-'+i,id:NORMALS[4+i],setTurn:0,faceUp:false
  });
  const source=addSpell(state,0,SWORDS_OF_REVEALING_LIGHT_ID);
  assert.throws(()=>planRevealSpell(state,{
    activationId:'m639:zone-full',actorSeat:0,
    sourceUid:source,cardId:SWORDS_OF_REVEALING_LIGHT_ID
  }),/Zona de Magias\/Armadilhas livre/);
  const fourth=structuredClone(state);
  fourth.core.players[0].monsters.push({
    uid:'m0:m639-fourth-monster',id:NORMALS[7],position:'atk',faceUp:true,
    entered:0,changed:0,attacked:0,attackCount:0,atkBoost:0,defBoost:0
  });
  assert.throws(()=>canTeamDeclareAttack(fourth,1),/três Monster Zones/);
});

test('Main Deck 20–30 and Extra Deck maximum 5 remain physical-seat limits',()=>{
  const FUSIONS=[...new Set(require('../dist/effectRegistry.js').enabledCardIds.filter(id=>{
    const c=require('../dist/effectRegistry.js').getDuelCard(id);return c?.fusion;
  }))];
  assert.ok(FUSIONS.length>=6,'fixture requires six enabled Fusion cards');
  const valid=create(0,'extra-five',{2:FUSIONS.slice(0,5)});
  const source=addSpell(valid,0,SWORDS_OF_REVEALING_LIGHT_ID);
  assert.ok(planRevealSpell(valid,{activationId:'m639:extra-five',actorSeat:0,sourceUid:source,cardId:SWORDS_OF_REVEALING_LIGHT_ID}));
  const invalid=structuredClone(valid);
  const sixth={uid:'m2:m639-extra-sixth',id:FUSIONS[5]};
  invalid.reserves['2'].extra.push(sixth);
  assert.throws(()=>canTeamDeclareAttack(invalid,1),/Extra Deck físico excedeu cinco/);
  const short=structuredClone(valid);
  short.reserves['2'].deck.pop();
  assert.throws(()=>canTeamDeclareAttack(short,1),/Deck principal físico fora do limite 20–30/);
});

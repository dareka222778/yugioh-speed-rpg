'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');
const {
  MASS_DRIVER_ID,CATAPULT_TURTLE_ID,
  createTributeBurnSession,activateTributeBurn,resolveTributeBurn,
  resetCatapultSoftOncePerTurn
}=require('../dist/tributeBurnTagAdapter');

const MACHINE='07359741';
const WARRIOR='91152256';
const NORMALS=[...new Set([MACHINE,WARRIOR,...tag.tagNormalCardIds])].slice(0,30);
assert.ok(NORMALS.length>=20);
function deck(){return NORMALS.slice(0,20);}
function create(seed='default'){
  return tag.createTagDuel([0,1,2,3].map(seat=>({
    id:'m582-seat-'+seat,name:'M582 Seat '+seat,cards:deck()
  })),{classic:true,first:0,seed:'m582-'+seed});
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function takeMonster(state,seat,id=WARRIOR,{faceUp=true,atkBoost=0}={}){
  const held=holder(state,seat);
  let index=held.deck.findIndex(card=>card.id===id),card;
  if(index>=0)[card]=held.deck.splice(index,1);
  else{
    index=held.hand.findIndex(item=>item.id===id);
    assert.ok(index>=0,'monster must remain in physical seat '+seat+' deck or hand');
    [card]=held.hand.splice(index,1);
  }
  const monster={...card,faceUp,position:faceUp?'atk':'def',entered:0,changed:0,attacked:0,attackCount:0,atkBoost,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster.uid;
}
function addMassDriver(state,controllerTeam=0,ownerSeat=controllerTeam){
  const uid='m'+ownerSeat+':m582-mass-driver-'+state.core.players[controllerTeam].backrow.length;
  state.core.players[controllerTeam].backrow.push({uid,id:MASS_DRIVER_ID,faceUp:true,resolved:true,setTurn:0});
  return uid;
}
function addCatapult(state,controllerTeam=0,ownerSeat=controllerTeam,{atkBoost=0}={}){
  const uid='m'+ownerSeat+':m582-catapult-'+state.core.players[controllerTeam].monsters.length;
  state.core.players[controllerTeam].monsters.push({
    uid,id:CATAPULT_TURTLE_ID,faceUp:true,position:'atk',entered:1,changed:1,
    attacked:0,attackCount:0,atkBoost,defBoost:0
  });
  return uid;
}
function moveMonster(state,fromTeam,toTeam,uid){
  const index=state.core.players[fromTeam].monsters.findIndex(card=>card.uid===uid);
  assert.ok(index>=0);
  const [monster]=state.core.players[fromTeam].monsters.splice(index,1);
  state.core.players[toTeam].monsters.push(monster);
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
function mainPhase(state,team=0,turn=1){
  state.core.phase='main';
  state.core.current=team;
  state.core.turn=turn;
  state.core.pending={kind:'none'};
  state.core.chain=[];
  state.core.damageStep=false;
}

test('M582 cards remain outside catalog and released allowlist until certification',()=>{
  assert.equal(getPlayableCard(MASS_DRIVER_ID),undefined);
  assert.equal(getPlayableCard(CATAPULT_TURTLE_ID),undefined);
});

test('Mass Driver pays one Tribute immediately and inflicts a fixed 400 damage',()=>{
  const state=create('mass-driver-basic'),source=addMassDriver(state,0,0);
  const tribute=takeMonster(state,0,WARRIOR);
  mainPhase(state,0,1);
  const before=inventory(state),beforeHands=hands(state);
  const activated=activateTributeBurn(createTributeBurnSession(state),source,tribute,'mass-basic');
  assert.equal(activated.result.damageAmount,400);
  assert.equal(activated.result.tributeSentToOwnerGrave,true);
  assert.ok(activated.session.duel.core.players[0].grave.some(card=>card.uid===tribute));
  assert.equal(activated.session.duel.core.players[1].lp,4000);
  const resolved=resolveTributeBurn(activated.session,'mass-basic');
  assert.equal(resolved.result.effectApplied,true);
  assert.equal(resolved.result.damageAmount,400);
  assert.equal(resolved.result.teamLifePoints[1],3600);
  assertConserved(resolved.session.duel,before);
  assert.deepEqual(hands(resolved.session.duel),beforeHands);
  assertRules(resolved.session.duel);
});

test('Mass Driver can activate repeatedly in one turn; it has no invented once-per-turn limit',()=>{
  const state=create('mass-driver-repeat'),source=addMassDriver(state,0,0);
  const firstTribute=takeMonster(state,0,WARRIOR);
  const secondTribute=takeMonster(state,2,MACHINE);
  mainPhase(state,0,1);
  let session=createTributeBurnSession(state);
  session=activateTributeBurn(session,source,firstTribute,'mass-repeat-1').session;
  session=resolveTributeBurn(session,'mass-repeat-1').session;
  session=activateTributeBurn(session,source,secondTribute,'mass-repeat-2').session;
  const second=resolveTributeBurn(session,'mass-repeat-2');
  assert.equal(second.result.teamLifePoints[1],3200);
  assert.equal(second.result.damageAmount,400);
});

test('Mass Driver may Tribute a face-down monster because its damage is fixed',()=>{
  const state=create('mass-driver-face-down'),source=addMassDriver(state,0,0);
  const tribute=takeMonster(state,0,WARRIOR,{faceUp:false});
  mainPhase(state,0,1);
  const result=activateTributeBurn(createTributeBurnSession(state),source,tribute,'mass-face-down');
  assert.equal(result.result.damageAmount,400);
  assert.ok(result.session.duel.core.players[0].grave.some(card=>card.uid===tribute));
});

test('negating Mass Driver leaves the Tribute paid but prevents damage',()=>{
  const state=create('mass-driver-negated'),source=addMassDriver(state,0,0);
  const tribute=takeMonster(state,0,WARRIOR);
  mainPhase(state,0,1);
  const activated=activateTributeBurn(createTributeBurnSession(state),source,tribute,'mass-negated');
  const resolved=resolveTributeBurn(activated.session,'mass-negated',{sourceActivationNegated:true});
  assert.equal(resolved.result.effectApplied,false);
  assert.equal(resolved.result.damageAmount,0);
  assert.equal(resolved.result.teamLifePoints[1],4000);
  assert.ok(resolved.session.duel.core.players[0].grave.some(card=>card.uid===tribute));
});

test('Mass Driver leaving the field before resolution prevents its continuous effect',()=>{
  const state=create('mass-driver-removed'),source=addMassDriver(state,0,0);
  const tribute=takeMonster(state,0,WARRIOR);
  mainPhase(state,0,1);
  const activated=activateTributeBurn(createTributeBurnSession(state),source,tribute,'mass-removed');
  const next=structuredClone(activated.session);
  const removed=next.duel.core.players[0].backrow.find(card=>card.uid===source);
  next.duel.core.players[0].backrow=next.duel.core.players[0].backrow.filter(card=>card.uid!==source);
  next.duel.core.players[0].grave.push({uid:removed.uid,id:removed.id});
  const resolved=resolveTributeBurn(next,'mass-removed');
  assert.equal(resolved.result.sourceStillOnFieldAtResolution,false);
  assert.equal(resolved.result.effectApplied,false);
  assert.equal(resolved.result.damageAmount,0);
  assert.ok(resolved.session.duel.core.players[0].grave.some(card=>card.uid===tribute));
});

test('Catapult Turtle uses current ATK including modifiers when the Tribute is face-up',()=>{
  const state=create('catapult-current-atk'),source=addCatapult(state,0,0);
  const tribute=takeMonster(state,0,WARRIOR,{faceUp:true,atkBoost:600});
  mainPhase(state,0,1);
  const activated=activateTributeBurn(createTributeBurnSession(state),source,tribute,'catapult-current');
  assert.equal(activated.result.tributeAtk,2000);
  assert.equal(activated.result.damageAmount,1000);
  const resolved=resolveTributeBurn(activated.session,'catapult-current');
  assert.equal(resolved.result.damageAmount,1000);
  assert.equal(resolved.result.teamLifePoints[1],3000);
});

test('Catapult Turtle uses original ATK for a face-down Tribute',()=>{
  const state=create('catapult-face-down'),source=addCatapult(state,0,0);
  const tribute=takeMonster(state,0,WARRIOR,{faceUp:false,atkBoost:600});
  mainPhase(state,0,1);
  const activated=activateTributeBurn(createTributeBurnSession(state),source,tribute,'catapult-face-down');
  assert.equal(activated.result.tributeAtk,getPlayableCard(WARRIOR).atk);
  assert.equal(activated.result.damageAmount,Math.floor(getPlayableCard(WARRIOR).atk/2));
});

test('Catapult Turtle can Tribute itself and its already-activated effect still resolves',()=>{
  const state=create('catapult-self'),source=addCatapult(state,0,0);
  mainPhase(state,0,1);
  const activated=activateTributeBurn(createTributeBurnSession(state),source,source,'catapult-self');
  assert.equal(activated.result.sourceWasTributed,true);
  assert.ok(activated.session.duel.core.players[0].grave.some(card=>card.uid===source));
  const resolved=resolveTributeBurn(activated.session,'catapult-self');
  assert.equal(resolved.result.effectApplied,true);
  assert.equal(resolved.result.damageAmount,500);
  assert.equal(resolved.result.sourceStillOnFieldAtResolution,false);
});

test('Catapult Turtle is once per copy per turn',()=>{
  const state=create('catapult-once'),source=addCatapult(state,0,0);
  const firstTribute=takeMonster(state,0,WARRIOR);
  const secondTribute=takeMonster(state,2,MACHINE);
  mainPhase(state,0,1);
  let session=activateTributeBurn(createTributeBurnSession(state),source,firstTribute,'catapult-once-1').session;
  session=resolveTributeBurn(session,'catapult-once-1').session;
  assert.throws(()=>activateTributeBurn(session,source,secondTribute,'catapult-once-2'),/já usou/);
});

test('two Catapult Turtle copies each get their own once-per-turn activation',()=>{
  const state=create('catapult-two-copies'),sourceA=addCatapult(state,0,0),sourceB=addCatapult(state,0,2);
  const firstTribute=takeMonster(state,0,WARRIOR),secondTribute=takeMonster(state,2,MACHINE);
  mainPhase(state,0,1);
  let session=activateTributeBurn(createTributeBurnSession(state),sourceA,firstTribute,'catapult-copy-a').session;
  session=resolveTributeBurn(session,'catapult-copy-a').session;
  session=activateTributeBurn(session,sourceB,secondTribute,'catapult-copy-b').session;
  const resolved=resolveTributeBurn(session,'catapult-copy-b');
  assert.equal(resolved.result.effectApplied,true);
});

test('a negated Catapult Turtle activation still consumes that copy once per turn',()=>{
  const state=create('catapult-negated-once'),source=addCatapult(state,0,0);
  const firstTribute=takeMonster(state,0,WARRIOR),secondTribute=takeMonster(state,2,MACHINE);
  mainPhase(state,0,1);
  let session=activateTributeBurn(createTributeBurnSession(state),source,firstTribute,'catapult-negated').session;
  session=resolveTributeBurn(session,'catapult-negated',{sourceActivationNegated:true}).session;
  assert.throws(()=>activateTributeBurn(session,source,secondTribute,'catapult-after-negation'),/já usou/);
});

test('the soft once-per-turn resets when the host reports a face-down or field-exit event',()=>{
  const state=create('catapult-reset'),source=addCatapult(state,0,0);
  const firstTribute=takeMonster(state,0,WARRIOR),secondTribute=takeMonster(state,2,MACHINE);
  mainPhase(state,0,1);
  let session=activateTributeBurn(createTributeBurnSession(state),source,firstTribute,'catapult-reset-1').session;
  session=resolveTributeBurn(session,'catapult-reset-1').session;
  session=resetCatapultSoftOncePerTurn(session,source);
  const monster=session.duel.core.players[0].monsters.find(card=>card.uid===source);
  monster.faceUp=false;
  monster.position='def';
  monster.faceUp=true;
  monster.position='atk';
  const second=activateTributeBurn(session,source,secondTribute,'catapult-reset-2');
  assert.equal(second.result.damageAmount,Math.floor(getPlayableCard(MACHINE).atk/2));
});

test('a Catapult Turtle source removed after activation still resolves unless negated',()=>{
  const state=create('catapult-source-removed'),source=addCatapult(state,0,0);
  const tribute=takeMonster(state,0,WARRIOR);
  mainPhase(state,0,1);
  const activated=activateTributeBurn(createTributeBurnSession(state),source,tribute,'catapult-removed');
  const next=structuredClone(activated.session);
  const removed=next.duel.core.players[0].monsters.find(card=>card.uid===source);
  next.duel.core.players[0].monsters=next.duel.core.players[0].monsters.filter(card=>card.uid!==source);
  next.duel.core.players[0].grave.push({uid:removed.uid,id:removed.id});
  const resolved=resolveTributeBurn(next,'catapult-removed');
  assert.equal(resolved.result.sourceStillOnFieldAtResolution,false);
  assert.equal(resolved.result.effectApplied,true);
  assert.equal(resolved.result.damageAmount,700);
});

test('a stolen monster may be Tributed by its current controller and returns to its physical owner Graveyard',()=>{
  const state=create('stolen-tribute'),source=addMassDriver(state,0,0);
  const tribute=takeMonster(state,1,WARRIOR);
  moveMonster(state,1,0,tribute);
  mainPhase(state,0,1);
  const activated=activateTributeBurn(createTributeBurnSession(state),source,tribute,'stolen-mass');
  assert.equal(activated.result.tributePhysicalOwnerSeat,1);
  assert.equal(activated.result.tributeOwnerTeam,1);
  assert.ok(activated.session.duel.core.players[1].grave.some(card=>card.uid===tribute));
  const resolved=resolveTributeBurn(activated.session,'stolen-mass');
  assert.equal(resolved.result.teamLifePoints[1],3600);
});

test('a monster controlled by the opposing team cannot be used as the Tribute cost',()=>{
  const state=create('wrong-team-tribute'),source=addMassDriver(state,0,0);
  const tribute=takeMonster(state,1,WARRIOR);
  mainPhase(state,0,1);
  assert.throws(()=>activateTributeBurn(createTributeBurnSession(state),source,tribute,'wrong-team'),/controle da equipe/);
});

test('a stolen source uses its current controller team and damages the opposing team',()=>{
  const state=create('stolen-source'),source=addMassDriver(state,0,3);
  const tribute=takeMonster(state,0,WARRIOR);
  mainPhase(state,0,1);
  const activated=activateTributeBurn(createTributeBurnSession(state),source,tribute,'stolen-source');
  assert.equal(activated.result.sourcePhysicalOwnerSeat,3);
  assert.equal(activated.result.controllerTeam,0);
  assert.equal(activated.result.recipientTeam,1);
});

test('the effect damages the opposing shared LP pool, never the controller team',()=>{
  const state=create('team-lp'),source=addMassDriver(state,0,0);
  const tribute=takeMonster(state,0,WARRIOR);
  mainPhase(state,0,1);
  state.core.players[0].lp=2500;
  state.core.players[1].lp=1800;
  const activated=activateTributeBurn(createTributeBurnSession(state),source,tribute,'team-lp');
  const resolved=resolveTributeBurn(activated.session,'team-lp');
  assert.equal(resolved.result.teamLifePoints[0],2500);
  assert.equal(resolved.result.teamLifePoints[1],1400);
});

test('lethal tribute damage finishes the duel and awards the source controller team',()=>{
  const state=create('tribute-lethal'),source=addMassDriver(state,0,0);
  const tribute=takeMonster(state,0,WARRIOR);
  mainPhase(state,0,1);
  state.core.players[1].lp=400;
  const activated=activateTributeBurn(createTributeBurnSession(state),source,tribute,'tribute-lethal');
  const resolved=resolveTributeBurn(activated.session,'tribute-lethal');
  assert.equal(resolved.result.gameFinished,true);
  assert.equal(resolved.result.winnerTeam,0);
  assert.equal(resolved.session.duel.core.phase,'finished');
  assert.equal(resolved.session.duel.core.winner,resolved.session.duel.core.players[0].id);
});

test('simultaneous zero LP after tribute damage is a draw',()=>{
  const state=create('tribute-draw'),source=addMassDriver(state,0,0);
  const tribute=takeMonster(state,0,WARRIOR);
  mainPhase(state,0,1);
  state.core.players[0].lp=0;
  state.core.players[1].lp=400;
  const activated=activateTributeBurn(createTributeBurnSession(state),source,tribute,'tribute-draw');
  const resolved=resolveTributeBurn(activated.session,'tribute-draw');
  assert.equal(resolved.result.gameFinished,true);
  assert.equal(resolved.result.winnerTeam,null);
  assert.equal(resolved.session.duel.core.winner,null);
});

test('duplicate activation IDs and duplicate resolutions are rejected',()=>{
  const state=create('duplicate-activation'),source=addMassDriver(state,0,0);
  const tribute=takeMonster(state,0,WARRIOR),second=takeMonster(state,2,MACHINE);
  mainPhase(state,0,1);
  let session=createTributeBurnSession(state);
  const activated=activateTributeBurn(session,source,tribute,'duplicate');
  assert.throws(()=>activateTributeBurn(activated.session,source,second,'duplicate'),/duplicado/);
  const resolved=resolveTributeBurn(activated.session,'duplicate');
  assert.throws(()=>resolveTributeBurn(resolved.session,'duplicate'),/ausente ou já resolvida/);
});

test('a seventh card is preserved until the End Phase and the adapter does not discard it',()=>{
  const state=create('hand-limit'),source=addMassDriver(state,0,0);
  const tribute=takeMonster(state,0,WARRIOR);
  const held=state.core.players[0];
  while(held.hand.length<7)held.hand.push(held.deck.shift());
  const beforeHands=hands(state);
  mainPhase(state,0,1);
  const activated=activateTributeBurn(createTributeBurnSession(state),source,tribute,'hand-limit');
  const resolved=resolveTributeBurn(activated.session,'hand-limit');
  assert.equal(resolved.session.duel.core.players[0].hand.length,7);
  assert.deepEqual(hands(resolved.session.duel),beforeHands);
  assertRules(resolved.session.duel);
});

test('the adapter accepts three Monster Zones and rejects a fourth',()=>{
  const state=create('monster-zones');
  for(let i=0;i<3;i++)state.core.players[0].monsters.push({
    uid:'m0:m582-fixture-monster-'+i,id:WARRIOR,faceUp:true,position:'atk',entered:0,changed:0,
    attacked:0,attackCount:0,atkBoost:0,defBoost:0
  });
  assert.doesNotThrow(()=>createTributeBurnSession(state));
  state.core.players[0].monsters.push({
    uid:'m0:m582-fixture-overflow',id:WARRIOR,faceUp:true,position:'atk',entered:0,changed:0,
    attacked:0,attackCount:0,atkBoost:0,defBoost:0
  });
  assert.throws(()=>createTributeBurnSession(state),/três Monster Zones/);
});

test('the adapter accepts three Spell/Trap Zones and rejects a fourth',()=>{
  const state=create('backrow-zones');
  for(let i=0;i<3;i++)state.core.players[0].backrow.push({
    uid:'m0:m582-backrow-'+i,id:MASS_DRIVER_ID,faceUp:false,resolved:false,setTurn:0
  });
  assert.doesNotThrow(()=>createTributeBurnSession(state));
  state.core.players[0].backrow.push({
    uid:'m0:m582-backrow-overflow',id:MASS_DRIVER_ID,faceUp:false,resolved:false,setTurn:0
  });
  assert.throws(()=>createTributeBurnSession(state),/três Spell\/Trap Zones/);
});

test('five Extra Deck cards are accepted and the sixth is rejected per physical seat',()=>{
  const state=create('extra-zones');
  state.core.players[0].extra=Array.from({length:5},(_,i)=>({uid:'m0:m582-extra-'+i,id:'0000000'+(i+1)}));
  assert.doesNotThrow(()=>createTributeBurnSession(state));
  state.core.players[0].extra.push({uid:'m0:m582-extra-6',id:'00000006'});
  assert.throws(()=>createTributeBurnSession(state),/cinco cartas/);
});

test('the physical Main Deck cannot fall below 20 cards',()=>{
  const state=create('main-deck-min');
  state.core.players[0].deck.splice(0,2);
  assert.throws(()=>createTributeBurnSession(state),/20–30/);
});

test('the Field Zone remains separate from the three Spell/Trap Zones',()=>{
  const state=create('field-zone');
  for(let i=0;i<3;i++)state.core.players[0].backrow.push({
    uid:'m0:m582-backrow-field-'+i,id:MASS_DRIVER_ID,faceUp:false,resolved:false,setTurn:0
  });
  state.core.players[0].field={uid:'m0:m582-field',id:MASS_DRIVER_ID,faceUp:true,resolved:true,setTurn:0};
  assert.doesNotThrow(()=>createTributeBurnSession(state));
  assertRules(state);
});

test('activation requires a face-up, resolved source in its controller Main Phase',()=>{
  const state=create('source-state'),source=addMassDriver(state,0,0);
  const tribute=takeMonster(state,0,WARRIOR);
  state.core.players[0].backrow.find(card=>card.uid===source).resolved=false;
  mainPhase(state,0,1);
  assert.throws(()=>activateTributeBurn(createTributeBurnSession(state),source,tribute,'source-unresolved'),/face-up/);
  state.core.players[0].backrow.find(card=>card.uid===source).resolved=true;
  mainPhase(state,1,1);
  assert.throws(()=>activateTributeBurn(createTributeBurnSession(state),source,tribute,'wrong-current'),/Main Phase/);
});

test('the adapter rejects malformed physical UIDs and unknown tribute targets',()=>{
  const state=create('bad-uid'),source=addMassDriver(state,0,0);
  const tribute=takeMonster(state,0,WARRIOR);
  mainPhase(state,0,1);
  const session=createTributeBurnSession(state);
  assert.throws(()=>activateTributeBurn(session,'m4:bad',tribute,'bad-source'),/UID físico/);
  assert.throws(()=>activateTributeBurn(session,source,'m0:unknown','bad-target'),/Monster Zone/);
});

test('inventory and all private hands are conserved across cost and resolution',()=>{
  const state=create('conservation'),source=addMassDriver(state,0,0);
  const tribute=takeMonster(state,0,WARRIOR);
  const before=inventory(state),beforeHands=hands(state);
  mainPhase(state,0,1);
  const activated=activateTributeBurn(createTributeBurnSession(state),source,tribute,'conservation');
  const resolved=resolveTributeBurn(activated.session,'conservation');
  assertConserved(resolved.session.duel,before);
  assert.deepEqual(hands(resolved.session.duel),beforeHands);
  assertRules(resolved.session.duel);
});

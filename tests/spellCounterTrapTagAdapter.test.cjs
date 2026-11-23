'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {getPlayableCard}=require('../dist/effectRegistry');
const {rulesFor}=require('../dist/rulesProfile');
const {
  MAGIC_DRAIN_ID,
  CURSED_SEAL_OF_THE_FORBIDDEN_SPELL_ID,
  createSpellCounterTrapSession,
  spellCounterTrapActions,
  activateSpellCounterTrap,
  resolveSpellCounterTrap,
  canTeamActivateSpell
}=require('../dist/spellCounterTrapTagAdapter');

const POT='55144522';
const MST='05318639';
const SEVEN_TOOLS='03819470';
const HFD='18144506';
const MIRROR='44095762';
const lookup=id=>{
  const c=getPlayableCard(id);
  return c?{kind:c.kind,name:c.englishName}:undefined;
};
const NORMALS=[...new Set(tag.tagNormalCardIds)];
assert.ok(NORMALS.length>=20);

function member(seat){return 'm572-seat-'+seat;}
function deck(required=[]){return [...new Set([...required,...NORMALS])].slice(0,20);}
function create(required=[],seed='fixture'){
  const state=tag.createTagDuel([0,1,2,3].map(seat=>({
    id:member(seat),name:'M572 Seat '+seat,cards:deck(required[seat]||[])
  })),{classic:true,first:0,seed:'m572-'+seed});
  state.core.turn=3;
  return state;
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[String(seat)];
}
function take(state,seat,id){
  const h=holder(state,seat);
  for(const zone of ['hand','deck']){
    const i=h[zone].findIndex(c=>c.id===id);
    if(i>=0)return h[zone].splice(i,1)[0];
  }
  throw new Error('M572 card missing from physical seat '+seat+': '+id);
}
function hand(state,seat,id){
  const h=holder(state,seat);
  const found=h.hand.find(c=>c.id===id);
  if(found)return found;
  const i=h.deck.findIndex(c=>c.id===id);
  assert.ok(i>=0,'card '+id+' must be in seat '+seat+' deck');
  const [card]=h.deck.splice(i,1);
  h.hand.push(card);
  return card;
}
function setTrap(state,seat,suffix){
  const c=take(state,seat,SEVEN_TOOLS);
  c.faceUp=false;
  c.setTurn=1;
  state.core.players[seat%2].backrow.push(c);
  return c;
}
function action(state,seat,predicate,label){
  const found=tag.tagActions(state,member(seat)).find(predicate);
  assert.ok(found,'seat '+seat+' must have '+label+' in '+state.core.phase);
  return found;
}
function inventory(state){
  const cards=tag.tagInventory(state).filter(c=>c.entityKind!=='token');
  assert.equal(cards.length,80);
  const out=new Map(cards.map(c=>[c.uid,c.id]));
  assert.equal(out.size,80);
  return out;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state).filter(c=>c.entityKind!=='token');
  assert.equal(cards.length,before.size);
  assert.equal(new Set(cards.map(c=>c.uid)).size,before.size);
  for(const c of cards)assert.equal(before.get(c.uid),c.id,'physical identity changed: '+c.uid);
}
function physicalHand(state,seat){return holder(state,seat).hand;}
function hands(state){
  const out=[];
  for(const p of state.core.players)for(const c of p.hand)out.push(c.uid);
  for(const h of Object.values(state.reserves))for(const c of h.hand)out.push(c.uid);
  return out.sort();
}
function grave(state,team,c){
  return state.core.players[team].grave.some(x=>x.uid===c.uid&&x.id===c.id);
}
function assertRules(state){
  const rules=rulesFor(state.core);
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.extraDeckMax,5);
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  for(const p of state.core.players){
    assert.ok(p.monsters.length<=3);
    assert.ok(p.backrow.length<=3);
  }
}
function assertPrivateHands(state){
  const publicState=JSON.stringify(tag.publicTagDuel(state));
  for(const seat of [0,1,2,3]){
    for(const c of tag.tagMemberHand(state,member(seat))){
      assert.ok(!publicState.includes(c.uid),'private hand UID leaked for seat '+seat);
    }
  }
}
function fixture(trapId,seed){
  const required=[
    [POT,MST],
    [MST],
    [MST],
    [SEVEN_TOOLS,MST]
  ];
  const state=create(required,seed);
  const pot=hand(state,0,POT);
  const opponentDiscard=hand(state,0,MST);
  const opponentPartnerDecoy=hand(state,2,MST);
  const controllerCost=hand(state,1,MST);
  const controllerPartnerDecoy=hand(state,3,MST);
  const trap=setTrap(state,3,'source');
  assert.ok(pot.uid.startsWith('m0:'));
  assert.ok(opponentDiscard.uid.startsWith('m0:'));
  assert.ok(opponentPartnerDecoy.uid.startsWith('m2:'));
  assert.ok(controllerCost.uid.startsWith('m1:'));
  assert.ok(controllerPartnerDecoy.uid.startsWith('m3:'));
  assert.ok(trap.uid.startsWith('m3:'));
  assert.equal(state.active[0],0);
  assert.equal(state.active[1],1);
  tag.assertTagDuel(state);
  assertRules(state);
  assertPrivateHands(state);
  tag.assertTagDuel(state);
  const spellAction=action(state,0,a=>a.kind==='spell'&&a.card===pot.uid,'Pot of Greed activation');
  const response=tag.stepTagDuel(state,member(0),spellAction);
  assert.equal(response.core.phase,'response');
  assert.equal(response.core.pending.kind,'spell');
  assert.equal(response.core.pending.id,POT);
  assert.equal(response.core.priority,1);
  tag.assertTagDuel(response);
  assertPrivateHands(response);
  const responseTrap=response.core.players[1].backrow.find(c=>c.uid===trap.uid);
  assert.ok(responseTrap);
  responseTrap.id=trapId;
  const before=inventory(response);
  return {state:response,pot,trap:responseTrap,opponentDiscard,opponentPartnerDecoy,controllerCost,controllerPartnerDecoy,before};
}
function activate(f,activationId,costUid){
  const actions=spellCounterTrapActions(f.state,lookup);
  assert.deepEqual(actions,[{kind:'trap',card:f.trap.uid,target:''}]);
  return activateSpellCounterTrap(
    createSpellCounterTrapSession(f.state),f.trap.uid,activationId,lookup,costUid
  );
}

test('M572 cards remain unadmitted and cannot be certified or distributed by the adapter',()=>{
  assert.equal(getPlayableCard(MAGIC_DRAIN_ID),undefined);
  assert.equal(getPlayableCard(CURSED_SEAL_OF_THE_FORBIDDEN_SPELL_ID),undefined);
  assert.ok(getPlayableCard(POT));
  assert.ok(getPlayableCard(MST));
  assert.ok(getPlayableCard(SEVEN_TOOLS));
});

test('Magic Drain opens only for an opponent Spell activation and exposes no target UID',()=>{
  const f=fixture(MAGIC_DRAIN_ID,'magic-eligibility');
  const actions=spellCounterTrapActions(f.state,lookup);
  assert.deepEqual(actions,[{kind:'trap',card:f.trap.uid,target:''}]);
  const wrongKind=structuredClone(f.state);
  wrongKind.core.pending.kind='trap';
  assert.deepEqual(spellCounterTrapActions(wrongKind,lookup),[]);
  const wrongCard=structuredClone(f.state);
  wrongCard.core.pending.id=MIRROR;
  assert.deepEqual(spellCounterTrapActions(wrongCard,lookup),[]);
  const faceUp=structuredClone(f.state);
  faceUp.core.players[1].backrow.find(c=>c.uid===f.trap.uid).faceUp=true;
  assert.deepEqual(spellCounterTrapActions(faceUp,lookup),[]);
  const sameTurn=structuredClone(f.state);
  sameTurn.core.players[1].backrow.find(c=>c.uid===f.trap.uid).setTurn=sameTurn.core.turn;
  assert.deepEqual(spellCounterTrapActions(sameTurn,lookup),[]);
  const alreadyNegated=structuredClone(f.state);
  alreadyNegated.core.pendingNegated=true;
  assert.deepEqual(spellCounterTrapActions(alreadyNegated,lookup),[]);
});

test('Magic Drain lets the active opposing representative discard a Spell to negate Magic Drain itself',()=>{
  const f=fixture(MAGIC_DRAIN_ID,'magic-opponent-pays');
  const beforeHands=hands(f.state);
  const session=activate(f,'md-opponent-pays');
  assert.equal(session.pending['md-opponent-pays'].controllerSeat,1);
  assert.equal(session.pending['md-opponent-pays'].sourceOwnerSeat,3);
  const resolved=resolveSpellCounterTrap(session,'md-opponent-pays',lookup,{
    opponentDiscardUid:f.opponentDiscard.uid
  });
  const d=resolved.session.duel;
  assert.equal(resolved.result.opponentPaidToNegate,true);
  assert.equal(resolved.result.effectApplied,false);
  assert.equal(resolved.result.targetActivationNegated,false);
  assert.equal(d.core.pendingNegated,false);
  assert.ok(grave(d,0,f.opponentDiscard),'the active Spell user pays from its own private hand');
  assert.ok(grave(d,1,f.trap),'Magic Drain resolves to the Graveyard of its physical owner team');
  assert.ok(d.core.players[0].backrow.some(c=>c.uid===f.pot.uid),'Pot of Greed remains available to resolve');
  assert.deepEqual(physicalHand(d,0),[],'only the active opponent seat paid');
  assert.deepEqual(physicalHand(d,2).map(c=>c.uid),[f.opponentPartnerDecoy.uid],
    'the inactive partner private hand is not used');
  assert.deepEqual(physicalHand(d,1).map(c=>c.uid),[f.controllerCost.uid]);
  assert.deepEqual(physicalHand(d,3).map(c=>c.uid),[f.controllerPartnerDecoy.uid]);
  assert.deepEqual(hands(d),beforeHands.filter(uid=>uid!==f.opponentDiscard.uid).sort());
  assertConserved(d,f.before);
  assertRules(d);
});

test('Magic Drain negates and destroys the Spell activation when the opponent does not discard',()=>{
  const f=fixture(MAGIC_DRAIN_ID,'magic-no-discard');
  const beforeHands=hands(f.state);
  const session=activate(f,'md-no-discard');
  const resolved=resolveSpellCounterTrap(session,'md-no-discard',lookup);
  const d=resolved.session.duel;
  assert.equal(resolved.result.effectApplied,true);
  assert.equal(resolved.result.targetActivationNegated,true);
  assert.equal(resolved.result.targetDestroyed,true);
  assert.equal(resolved.result.opponentPaidToNegate,false);
  assert.equal(d.core.pendingNegated,true);
  assert.ok(grave(d,0,f.pot));
  assert.ok(grave(d,1,f.trap));
  assert.ok(!d.core.players[0].backrow.some(c=>c.uid===f.pot.uid));
  assert.deepEqual(hands(d),beforeHands);
  assertConserved(d,f.before);
  assertRules(d);
});

test('Magic Drain rejects a discard from the inactive partner or a non-Spell without mutating the session',()=>{
  const f=fixture(MAGIC_DRAIN_ID,'magic-invalid-discard');
  const session=activate(f,'md-invalid');
  const snapshot=JSON.stringify(session);
  assert.throws(()=>resolveSpellCounterTrap(session,'md-invalid',lookup,{
    opponentDiscardUid:f.opponentPartnerDecoy.uid
  }),/mão privada do representante ativo/);
  assert.equal(JSON.stringify(session),snapshot);
  const bad=structuredClone(session);
  const h=bad.duel.core.players[0].hand;
  assert.ok(h.length);
  const nonSpell=hand(bad.duel,0,NORMALS[0]);
  assert.equal(lookup(nonSpell.id)?.kind,'monster');
  assert.throws(()=>resolveSpellCounterTrap(bad,'md-invalid',lookup,{
    opponentDiscardUid:nonSpell.uid
  }),/Magia da mão privada/);
});

test('Cursed Seal pays its Spell discard at activation from the active representative, not the Set partner',()=>{
  const f=fixture(CURSED_SEAL_OF_THE_FORBIDDEN_SPELL_ID,'cursed-cost');
  const beforeHands=hands(f.state);
  const actions=spellCounterTrapActions(f.state,lookup);
  assert.deepEqual(actions,[{kind:'trap',card:f.trap.uid,target:''}]);
  const session=activate(f,'cs-cost',f.controllerCost.uid);
  assert.ok(grave(session.duel,1,f.controllerCost),'the active representative pays the activation cost');
  assert.ok(!grave(session.duel,1,f.controllerPartnerDecoy),'the inactive Set partner does not pay');
  assert.deepEqual(physicalHand(session.duel,1),[]);
  assert.deepEqual(physicalHand(session.duel,3).map(c=>c.uid),[f.controllerPartnerDecoy.uid]);
  assert.deepEqual(hands(session.duel),beforeHands.filter(uid=>uid!==f.controllerCost.uid).sort());
  assert.equal(session.pending['cs-cost'].costUid,f.controllerCost.uid);
  const resolved=resolveSpellCounterTrap(session,'cs-cost',lookup);
  const d=resolved.session.duel;
  assert.equal(resolved.result.targetActivationNegated,true);
  assert.equal(resolved.result.effectApplied,true);
  assert.equal(resolved.result.lockedSpellName,'Pot of Greed');
  assert.ok(grave(d,0,f.pot));
  assert.ok(grave(d,1,f.trap));
  assert.equal(canTeamActivateSpell(resolved.session,0,POT,lookup),false,
    'the opposing team cannot activate the same Spell name for the rest of the duel');
  assert.equal(canTeamActivateSpell(resolved.session,0,MST,lookup),true,
    'a different Spell name remains legal for the opposing team');
  assert.equal(canTeamActivateSpell(resolved.session,1,POT,lookup),true,
    'the lock applies to the opponent team, not the controller team');
  const roundTrip=JSON.parse(JSON.stringify(resolved.session));
  assert.equal(canTeamActivateSpell(roundTrip,0,POT,lookup),false,
    'the name lock survives JSON persistence');
  assertConserved(d,f.before);
  assertRules(d);
});

test('Cursed Seal requires a Spell in the active hand and rejects partner-owned cost UIDs',()=>{
  const f=fixture(CURSED_SEAL_OF_THE_FORBIDDEN_SPELL_ID,'cursed-invalid-cost');
  const noCost=structuredClone(f.state);
  noCost.core.players[1].hand=[];
  assert.deepEqual(spellCounterTrapActions(noCost,lookup),[],
    'without an active-seat Spell cost the Counter Trap is not offered');
  const session=createSpellCounterTrapSession(f.state);
  assert.throws(()=>activateSpellCounterTrap(session,f.trap.uid,'cs-no-cost',lookup),/exige descartar uma Magia/);
  assert.throws(()=>activateSpellCounterTrap(session,f.trap.uid,'cs-partner-cost',lookup,f.controllerPartnerDecoy.uid),
    /mão privada do representante ativo/);
  assert.deepEqual(session.duel,f.state,'invalid activation does not mutate the input session');
});

test('Cursed Seal keeps its activation cost when its own activation is negated and does not lock the Spell name',()=>{
  const f=fixture(CURSED_SEAL_OF_THE_FORBIDDEN_SPELL_ID,'cursed-negated');
  const session=activate(f,'cs-negated',f.controllerCost.uid);
  const resolved=resolveSpellCounterTrap(session,'cs-negated',lookup,{sourceActivationNegated:true});
  const d=resolved.session.duel;
  assert.equal(resolved.result.sourceActivationNegated,true);
  assert.equal(resolved.result.effectApplied,false);
  assert.equal(resolved.result.targetActivationNegated,false);
  assert.deepEqual(resolved.session.lockedSpellNames,[]);
  assert.ok(grave(d,1,f.controllerCost),'the activation cost is not refunded');
  assert.ok(d.core.players[0].backrow.some(c=>c.uid===f.pot.uid),'the target Spell remains available');
  assert.ok(grave(d,1,f.trap));
  assertConserved(d,f.before);
});

test('Cursed Seal handles a Spell chain link and locks the same name only after successful activation negation',()=>{
  const f=fixture(CURSED_SEAL_OF_THE_FORBIDDEN_SPELL_ID,'cursed-chain');
  const state=structuredClone(f.state);
  state.core.pending={kind:'none'};
  state.core.chain=[{actor:0,card:f.pot.uid,id:POT,target:''}];
  state.core.phase='response';
  state.core.priority=1;
  const chainFixture={...f,state};
  const session=activate(chainFixture,'cs-chain',f.controllerCost.uid);
  const resolved=resolveSpellCounterTrap(session,'cs-chain',lookup);
  assert.equal(resolved.result.targetActivationNegated,true);
  assert.equal(resolved.result.targetDestroyed,true);
  assert.equal(resolved.session.duel.core.chain.length,1);
  assert.equal(resolved.session.duel.core.chain[0].negated,true);
  assert.ok(grave(resolved.session.duel,0,f.pot));
  assert.equal(canTeamActivateSpell(resolved.session,0,POT,lookup),false);
  assertConserved(resolved.session.duel,f.before);
});

test('both Counter Traps reject duplicate activation IDs and preserve the original session on invalid resolution',()=>{
  for(const id of [MAGIC_DRAIN_ID,CURSED_SEAL_OF_THE_FORBIDDEN_SPELL_ID]){
    const f=fixture(id,'duplicate-'+id);
    const session=activate(f,'duplicate-id-'+id,id===CURSED_SEAL_OF_THE_FORBIDDEN_SPELL_ID?f.controllerCost.uid:undefined);
    assert.throws(()=>activateSpellCounterTrap(session,f.trap.uid,'duplicate-id-'+id,lookup,
      id===CURSED_SEAL_OF_THE_FORBIDDEN_SPELL_ID?f.controllerCost.uid:undefined),/ausente ou duplicado/);
    const snapshot=JSON.stringify(session);
    assert.throws(()=>resolveSpellCounterTrap(session,'missing-'+id,lookup),/ausente ou já resolvida/);
    assert.equal(JSON.stringify(session),snapshot);
  }
});


test('Cursed Seal does not lock the Spell name if the activation was negated but the Spell was no longer destroyed',()=>{
  const f=fixture(CURSED_SEAL_OF_THE_FORBIDDEN_SPELL_ID,'cursed-target-left');
  const session=activate(f,'cs-target-left',f.controllerCost.uid);
  const p=session.duel.core.players[0];
  const i=p.backrow.findIndex(c=>c.uid===f.pot.uid);
  assert.ok(i>=0);
  const [moved]=p.backrow.splice(i,1);
  p.grave.push({uid:moved.uid,id:moved.id});
  const resolved=resolveSpellCounterTrap(session,'cs-target-left',lookup);
  assert.equal(resolved.result.targetActivationNegated,true);
  assert.equal(resolved.result.targetDestroyed,false);
  assert.equal(resolved.result.effectApplied,true);
  assert.deepEqual(resolved.session.lockedSpellNames,[],
    'the name lock requires both activation negation and destruction');
  assertConserved(resolved.session.duel,f.before);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ATTRIBUTE_BATTLE_RECRUIT_CARDS, teamOfSeat, planAttributeBattleRecruit, resolveAttributeBattleRecruit } = require('../dist/attributeBattleRecruit.js');

function source(id, o = {}) {
  const owner = o.owner ?? 0;
  return { uid: o.uid ?? 'source', id, physicalOwnerSeat: owner, controllerTeamAtDestruction: o.controller ?? owner % 2,
    zone: o.zone ?? 'grave', graveyardTeam: o.graveyardTeam ?? owner % 2, destroyedByBattle: o.destroyed ?? true,
    sentToGraveByBattle: o.sent ?? true, destroyedTurn: o.destroyedTurn ?? 5 };
}
function card(uid, attribute, atk, owner = 0, id = '00000001') { return { uid, id, physicalOwnerSeat: owner, zone: 'deck', kind: 'monster', attribute, atk }; }
function makePlan(id, o = {}) { return planAttributeBattleRecruit({ source: source(id, o), currentTurn: o.currentTurn ?? 5 }); }
function resolve(id, o = {}) {
  const p = makePlan(id, o); assert.equal(p.ok, true, p.ok ? '' : p.reason);
  return resolveAttributeBattleRecruit({ plan: p.value, ownerDeckAtResolution: o.deck ?? [], occupiedMonsterZoneIndices: o.occupied ?? [], selectedUid: o.selected ?? null });
}

test('passcodes and Konami CIDs are exact', () => assert.deepEqual(ATTRIBUTE_BATTLE_RECRUIT_CARDS, {
  giantRat: { id: '97017120', konamiId: 4915, attribute: 'EARTH', maximumAtk: 1500 },
  shiningAngel: { id: '95956346', konamiId: 4924, attribute: 'LIGHT', maximumAtk: 1500 },
}));
test('2v2 seats map to the correct shared teams', () => { assert.equal(teamOfSeat(0),0); assert.equal(teamOfSeat(2),0); assert.equal(teamOfSeat(1),1); assert.equal(teamOfSeat(3),1); assert.equal(teamOfSeat(4),undefined); });
test('Giant Rat plan searches EARTH up to 1500 ATK', () => { const p=makePlan(ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id); assert.equal(p.ok,true); assert.equal(p.value.attribute,'EARTH'); assert.equal(p.value.maximumAtk,1500); });
test('Shining Angel plan searches LIGHT up to 1500 ATK', () => { const p=makePlan(ATTRIBUTE_BATTLE_RECRUIT_CARDS.shiningAngel.id); assert.equal(p.ok,true); assert.equal(p.value.attribute,'LIGHT'); assert.equal(p.value.maximumAtk,1500); });
test('physical owner gets the trigger when Giant Rat was stolen', () => { const p=makePlan(ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id,{owner:2,controller:1,graveyardTeam:0}); assert.equal(p.ok,true); assert.equal(p.value.ownerTeam,0); assert.equal(p.value.controllerTeamAtDestruction,1); });
test('physical owner gets the trigger when Shining Angel was stolen', () => { const p=makePlan(ATTRIBUTE_BATTLE_RECRUIT_CARDS.shiningAngel.id,{owner:3,controller:0,graveyardTeam:1}); assert.equal(p.ok,true); assert.equal(p.value.ownerTeam,1); assert.equal(p.value.controllerTeamAtDestruction,0); });
test('must be destroyed by battle and sent to Graveyard', () => { assert.equal(makePlan(ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id,{destroyed:false}).ok,false); assert.equal(makePlan(ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id,{sent:false}).ok,false); });
test('stale trigger turn is rejected', () => assert.deepEqual(makePlan(ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id,{currentTurn:6}),{ok:false,reason:'trigger-from-different-turn'}));
test('invalid source owner/controller/Graveyard identities are rejected', () => { assert.equal(makePlan(ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id,{owner:4}).reason,'invalid-physical-owner-seat'); assert.equal(makePlan(ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id,{controller:2}).reason,'invalid-controller-team'); assert.equal(makePlan(ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id,{graveyardTeam:1}).reason,'source-not-in-physical-owners-shared-graveyard'); });
test('unknown source card is rejected', () => assert.equal(makePlan('00000000').reason,'unsupported-card-id'));
test('Giant Rat summons an EARTH monster at the 1500 ATK boundary face-up Attack', () => { const id=ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id; const r=resolve(id,{deck:[card('earth-1500','EARTH',1500)],selected:'earth-1500'}); assert.equal(r.ok,true); assert.deepEqual(r.value.summoned,{uid:'earth-1500',id:'00000001',physicalOwnerSeat:0,controllerTeam:0,monsterZoneIndex:0,position:'face-up-attack'}); });
test('Shining Angel summons a LIGHT monster at the 1500 ATK boundary', () => { const id=ATTRIBUTE_BATTLE_RECRUIT_CARDS.shiningAngel.id; const r=resolve(id,{deck:[card('light-1500','LIGHT',1500)],selected:'light-1500'}); assert.equal(r.ok,true); assert.equal(r.value.summoned.uid,'light-1500'); });
test('ATK 1501 is not eligible', () => { const id=ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id; assert.equal(resolve(id,{deck:[card('strong','EARTH',1501)],selected:'strong'}).reason,'selected-card-does-not-match-attribute-and-atk-filter'); });
test('wrong attribute is not eligible even when ATK is low', () => { const id=ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id; assert.equal(resolve(id,{deck:[card('light','LIGHT',100)],selected:'light'}).reason,'selected-card-does-not-match-attribute-and-atk-filter'); });
test('selection is optional and can resolve without a summon', () => { const id=ATTRIBUTE_BATTLE_RECRUIT_CARDS.shiningAngel.id; const r=resolve(id,{deck:[card('light','LIGHT',1000)]}); assert.equal(r.ok,true); assert.equal(r.value.summoned,null); });
test('only one monster can be summoned by one trigger', () => { const id=ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id; const r=resolveAttributeBattleRecruit({plan:makePlan(id).value,ownerDeckAtResolution:[card('a','EARTH',100),card('b','EARTH',200)],occupiedMonsterZoneIndices:[],selectedUid:['a','b']}); assert.equal(r.ok,false); });
test('only the physical owner private Deck is available, not the teammate Deck', () => { const id=ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id; assert.equal(resolve(id,{deck:[card('partner','EARTH',100,2)],selected:'partner'}).reason,'deck-card-not-in-physical-owners-private-deck'); });
test('team-shared Monster Zone capacity is three and Field Zone is separate', () => { const id=ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id; const p=makePlan(id).value; const full=resolveAttributeBattleRecruit({plan:p,ownerDeckAtResolution:[card('a','EARTH',100)],occupiedMonsterZoneIndices:[0,1,2],selectedUid:'a'}); assert.deepEqual(full,{ok:false,reason:'no-free-shared-monster-zone'}); const none=resolveAttributeBattleRecruit({plan:p,ownerDeckAtResolution:[],occupiedMonsterZoneIndices:[0,1,2],selectedUid:null}); assert.equal(none.ok,true); });
test('first available shared Monster Zone is selected', () => { const id=ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id; const r=resolve(id,{deck:[card('a','EARTH',100)],occupied:[0,2],selected:'a'}); assert.equal(r.ok,true); assert.equal(r.value.summoned.monsterZoneIndex,1); });
test('UID duplicates across source and Deck are rejected', () => { const id=ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id; assert.equal(resolve(id,{deck:[card('source','EARTH',100)]}).reason,'duplicate-physical-uid-across-graveyard-and-deck'); });
test('invalid Deck card data and Deck size above 30 are rejected', () => { const id=ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id; assert.equal(resolve(id,{deck:[{...card('bad','EARTH',100),zone:'hand'}]}).reason,'invalid-owner-deck-card'); const d=Array.from({length:31},(_,i)=>card('u'+i,'EARTH',100)); assert.equal(resolve(id,{deck:d}).reason,'invalid-owner-deck-size'); });
test('duplicate or invalid occupied zones are rejected', () => { const id=ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id; assert.equal(resolve(id,{occupied:[1,1]}).reason,'invalid-occupied-monster-zones'); assert.equal(resolve(id,{occupied:[3]}).reason,'invalid-occupied-monster-zones'); });
test('tampered plan cannot change attribute, ATK threshold, or summon count', () => { const p=makePlan(ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id).value; const r=resolveAttributeBattleRecruit({plan:{...p,maximumAtk:9999},ownerDeckAtResolution:[],occupiedMonsterZoneIndices:[],selectedUid:null}); assert.equal(r.reason,'plan-does-not-match-registered-card-rule'); });
test('inputs are not mutated', () => { const id=ATTRIBUTE_BATTLE_RECRUIT_CARDS.giantRat.id; const d=[card('a','EARTH',100)]; const z=[2]; const before=structuredClone(d); const r=resolve(id,{deck:d,occupied:z,selected:'a'}); assert.equal(r.ok,true); assert.deepEqual(d,before); assert.deepEqual(z,[2]); });

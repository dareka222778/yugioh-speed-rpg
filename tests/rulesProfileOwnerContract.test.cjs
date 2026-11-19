const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RULES_PROFILE,RULES_VERSION,rulesFor,supportedRulesVersion}=require('../dist/rulesProfile');

test('the explicit current profile preserves the owner classic rules contract',()=>{
  assert.equal(RULES_VERSION,'speed-rpg-classic-v1');
  assert.deepEqual({...RULES_PROFILE},{
    id:'speed-rpg-classic-v1',
    name:'Speed RPG Clássico v1',
    startingLP:4000,
    startingHand:4,
    mainDeckMin:20,
    mainDeckMax:30,
    copiesPerCard:3,
    extraDeckMax:5,
    monsterZones:3,
    spellTrapZones:3,
    handLimit:6,
    handCheck:'end',
    skillsEnabled:false,
    afterBattlePhase:'end'
  });
  assert.ok(Object.isFrozen(RULES_PROFILE));
});

test('explicit classic saves use three monster zones, three backrow zones and a six-card End Phase hand limit',()=>{
  const rules=rulesFor({rulesVersion:RULES_VERSION});
  assert.equal(rules.monsterZones,3);
  assert.equal(rules.spellTrapZones,3);
  assert.equal(rules.handLimit,6);
  assert.equal(rules.handCheck,'end');
  assert.equal(rules.mainDeckMin,20);
  assert.equal(rules.mainDeckMax,30);
  assert.equal(rules.extraDeckMax,5);
});

test('legacy v1 and v2 snapshots retain their historical Extra Deck and hand-limit semantics',()=>{
  const v1=rulesFor({rulesVersion:'speed-rpg-v1'});
  assert.equal(v1.id,'speed-rpg-v1');
  assert.equal(v1.extraDeckMax,6);
  assert.equal(v1.handLimit,6);
  assert.equal(v1.handCheck,'end');

  const v2=rulesFor({rulesVersion:'speed-rpg-v2'});
  assert.equal(v2.id,'speed-rpg-v2');
  assert.equal(v2.extraDeckMax,6);
  assert.equal(v2.handLimit,7);
  assert.equal(v2.handCheck,'before-draw');
});

test('missing historical versions remain readable while unknown versions are rejected',()=>{
  assert.equal(rulesFor({}).id,'speed-rpg-v1');
  assert.equal(supportedRulesVersion(undefined),true);
  assert.equal(supportedRulesVersion('speed-rpg-classic-v1'),true);
  assert.equal(supportedRulesVersion('speed-rpg-v1'),true);
  assert.equal(supportedRulesVersion('speed-rpg-v2'),true);
  assert.equal(supportedRulesVersion('speed-rpg-v3'),false);
  assert.equal(supportedRulesVersion(null),false);
});

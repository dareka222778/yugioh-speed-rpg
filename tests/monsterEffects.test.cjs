const {test}=require('node:test');
const assert=require('node:assert/strict');
const {canActivateMonsterEffect,payMonsterEffectCost,monsterEffectOperation}=require('../dist/monsterEffects');
test('monster ignition effect enforces once-per-turn and pays LP cost only when valid',()=>{
 const effect={trigger:'ignition',oncePerTurn:true,cost:{kind:'lp',amount:500},operation:{kind:'burn',amount:800}};
 const ctx={lp:2000,handSize:2,deckSize:10,usedThisTurn:false};
 assert.equal(canActivateMonsterEffect(effect,ctx),true);
 assert.deepEqual(payMonsterEffectCost(effect,ctx),{lpPaid:500,cardsDiscarded:0});
 assert.deepEqual(monsterEffectOperation(effect),{kind:'burn',amount:800});
 assert.equal(canActivateMonsterEffect(effect,{...ctx,usedThisTurn:true}),false);
 assert.equal(canActivateMonsterEffect(effect,{...ctx,lp:500}),false);
 assert.throws(()=>payMonsterEffectCost(effect,{...ctx,lp:500}),/conditions/);
});
test('monster effect checks discard and draw availability',()=>{
 const discard={trigger:'flip',cost:{kind:'discard',count:2},operation:{kind:'heal',amount:300}};
 const draw={trigger:'onSummon',operation:{kind:'draw',count:2}};
 const ctx={lp:4000,handSize:1,deckSize:1,usedThisTurn:false};
 assert.equal(canActivateMonsterEffect(discard,ctx),false);
 assert.equal(canActivateMonsterEffect(discard,{...ctx,handSize:2}),true);
 assert.deepEqual(payMonsterEffectCost(discard,{...ctx,handSize:2}),{lpPaid:0,cardsDiscarded:2});
 assert.equal(canActivateMonsterEffect(draw,ctx),false);
 assert.equal(canActivateMonsterEffect(draw,{...ctx,deckSize:2}),true);
});

test('targeted destruction accepts only opponent monster instance IDs',()=>{
 const {monsterDestructionTarget}=require('../dist/monsterEffects');
 const effect={trigger:'flip',operation:{kind:'destroy',target:'opponentMonster'}};
 assert.equal(monsterDestructionTarget(effect,['enemy-a','enemy-b'],'enemy-b'),'enemy-b');
 assert.throws(()=>monsterDestructionTarget(effect,['enemy-a'],'friendly-a'),/Invalid opponent/);
 assert.throws(()=>monsterDestructionTarget(effect,['enemy-a'],''),/Invalid opponent/);
 assert.throws(()=>monsterDestructionTarget({trigger:'flip',operation:{kind:'draw',count:1}},['enemy-a'],'enemy-a'),/does not destroy/);
});

test('Man-Eater Bug is registered with official FLIP destruction operation',()=>{
 const {getMonsterEffect}=require('../dist/monsterEffects');
 const {getEffect,enabledCardIds}=require('../dist/effectRegistry');
 const {getCard}=require('../dist/collection');
 const e=getMonsterEffect('54652250');
 assert.equal(e.trigger,'flip');
 assert.deepEqual(e.operation,{kind:'destroy',target:'anyMonster'});
 assert.equal(getCard('54652250').atk,450);
 assert.ok(enabledCardIds.includes('54652250'));
 assert.ok(getEffect('54652250'));
});

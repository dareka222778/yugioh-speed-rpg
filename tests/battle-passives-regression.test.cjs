'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {runCase}=require('../scripts/card-batch-scenarios.cjs');
const {cardRulesPT}=require('../dist/cardText');
const {turnMonsterFaceDown}=require('../dist/classicEffects');
const monster=(uid,id,owner)=>({uid,id,owner,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});

test('Needle Burrower burns even when both battling monsters go to grave together',()=>{
 runCase({fixture:{phase:'battle',players:[{monsters:[monster('needle','98162242',0)]},{monsters:[monster('axe','48305365',1)]}]},actions:[{actor:'a',match:{kind:'attack',card:'needle',target:'axe'}},{settle:true}],assertions:[{path:['players',1,'lp'],equals:2000},{path:['players',0,'grave'],containsUID:'needle'},{path:['players',1,'grave'],containsUID:'axe'}]});
});
test('setting a Gate Guardian face down resets its once-while-face-up use',()=>{
 const guardian={...monster('guardian','62340868',1),guardianUsed:true};
 turnMonsterFaceDown(guardian);
 assert.equal(guardian.faceUp,false);
 assert.equal(guardian.guardianUsed,undefined);
});
test('player-facing descriptions explain actual battle windows and ownership',()=>{
 assert.match(cardRulesPT('13945283'),/após o cálculo de dano/);
 assert.match(cardRulesPT('98162242'),/500 de dano/);
 assert.match(cardRulesPT('78658564'),/fim daquela Fase de Batalha/);
 assert.match(cardRulesPT('31553716'),/fim da Etapa de Dano/);
 assert.match(cardRulesPT('62340868'),/Uma vez enquanto/);
});

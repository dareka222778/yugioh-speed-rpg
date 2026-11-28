const assert=require('node:assert/strict');
const fs=require('node:fs');
const evidence=JSON.parse(fs.readFileSync('docs/evidence/m684-targeted-continuous-traps.json','utf8'));
const certificates=fs.readFileSync('src/cardCertifications.ts','utf8');
const testSource=fs.readFileSync('tests/targetedContinuousTrapTagAdapter.test.cjs','utf8');
const {getDuelCard,getEnabledCardIds}=require('../dist/effectRegistry');
const {NIGHTMARE_WHEEL_ID,SHADOW_SPELL_ID,createTargetedContinuousTrapAdapter,assertTargetedContinuousTrapRules}=require('../dist/targetedContinuousTrapTagAdapter');

const expected=[
 {id:NIGHTMARE_WHEEL_ID,cid:5298,name:'Nightmare Wheel',date:'2003-07-18'},
 {id:SHADOW_SPELL_ID,cid:4675,name:'Shadow Spell',date:'2004-03-01'}
];
assert.equal(evidence.mission,'M684');
assert.equal(evidence.cards.length,2);
for(let i=0;i<expected.length;i++){
 const card=evidence.cards[i],want=expected[i];
 assert.equal(card.id,want.id);
 assert.equal(card.konamiCid,want.cid);
 assert.equal(card.name,want.name);
 assert.ok(card.firstTcgRelease<= '2004-09-30','Carta fora do corte histórico.');
 assert.equal(card.metadataPresent,false);
 assert.equal(card.certificationPresent,false);
 assert.equal(getDuelCard(card.id),undefined,'Carta nova entrou no catálogo sem handoff.');
 assert.ok(!getEnabledCardIds().includes(card.id),'Carta nova foi habilitada sem integração.');
 assert.ok(!certificates.includes('"'+card.id+'":'),'Carta nova foi certificada sem testes engine-v9.');
}
const explicitCertificates=[...certificates.matchAll(/^\s*"([0-9]{8})"\s*:/gm)].length;
assert.equal(explicitCertificates,959,'Baseline de certificados mudou; revisar o checkpoint antes de atualizar a evidência.');
assert.equal(evidence.baseline.certificationEntriesObserved,explicitCertificates);
assert.equal(evidence.implementation.adapterBehaviorVerifiedCards,2);
assert.equal((testSource.match(/\btest\(/g)||[]).length,evidence.implementation.focusedScenarios);
assert.equal(evidence.implementation.focusedScenarios,37);
assert.equal(getDuelCard('77585513')?.name,'Jinzo','Jinzo é somente fixture de regressão para negação contínua.');
assert.equal(evidence.implementation.behaviorCertifiedCards,0);
assert.equal(evidence.implementation.newEngineCertifications,0);
assert.equal(evidence.implementation.automaticCertifications,0);
assert.equal(evidence.implementation.inventoryGrants,0);
assert.equal(evidence.rules.mainDeck,'20–30');
assert.equal(evidence.rules.handLimit,6);
assert.equal(evidence.rules.handCheck,'End Phase');
assert.equal(evidence.rules.monsterZones,3);
assert.equal(evidence.rules.spellTrapZones,3);
assert.equal(evidence.rules.extraDeckMax,5);
assert.equal(typeof createTargetedContinuousTrapAdapter,'function');
assert.equal(typeof assertTargetedContinuousTrapRules,'function');
assert.equal(evidence.testFixturePolicy.includes('não certifica'),true);
console.log(JSON.stringify({mission:'M684',explicitCertificates,adapterBehaviorVerifiedCards:2,newCertifications:0,inventoryGrants:0},null,2));

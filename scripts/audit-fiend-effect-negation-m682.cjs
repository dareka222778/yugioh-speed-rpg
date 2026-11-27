const fs=require('node:fs');
const assert=require('node:assert/strict');
const evidence=JSON.parse(fs.readFileSync('docs/evidence/m682-fiend-effect-negation.json','utf8'));
const source=fs.readFileSync('src/fiendEffectNegationTagAdapter.ts','utf8');
const tests=fs.readFileSync('tests/fiendEffectNegationTagAdapter.test.cjs','utf8');
const certifications=fs.readFileSync('src/cardCertifications.ts','utf8');
const {getDuelCard,getCardStatus}=require('../dist/effectRegistry');
const ids=evidence.cards.map(card=>card.id);
assert.equal(evidence.mission,'M682');
assert.equal(new Set(ids).size,ids.length,'Card IDs duplicados na evidência.');
assert.ok(evidence.cards.some(card=>card.id==='53982768'&&card.konamiCid===5301));
assert.ok(evidence.cards.some(card=>card.id==='80071763'&&card.konamiCid===5302));
assert.ok(evidence.cards.some(card=>card.id==='82732705'&&card.konamiCid===5740));
assert.ok(source.includes('assertFiendEffectNegationRules'));
for(const symbol of ['activateSkillDrain','resolveSkillDrain','activateDarkBalterSpellNegation','resolveDarkBalterSpellNegation','recordBattleDestruction','isDestroyedMonsterEffectNegated']){
 assert.ok(source.includes(symbol),'Símbolo ausente: '+symbol);
}
for(const id of ['53982768','80071763','82732705'])assert.ok(source.includes(id),'ID ausente no adapter: '+id);
const certificationIds=[...certifications.matchAll(/^\s*"([0-9]{8})"\s*:/gm)].map(match=>match[1]);
assert.equal(certificationIds.length,evidence.baseline.certificationEntriesObserved,
 'A contagem real de certificações mudou; atualizar evidência e revisar o diff.');
assert.ok(certifications.includes('"82732705":'),'O registro legado de Skill Drain mudou inesperadamente.');
assert.ok(getDuelCard('82732705'),'Skill Drain precisa existir no metadata efetivo via batches gerados.');
assert.equal(getCardStatus('82732705')?.stage,'certified','Skill Drain deve manter apenas seu certificado legado.');
assert.equal(getDuelCard('53982768'),undefined,'Ha Des não pode entrar no catálogo nesta etapa.');
assert.equal(getDuelCard('80071763'),undefined,'Dark Balter não pode entrar no catálogo nesta etapa.');
assert.equal(evidence.implementation.newEngineCertifications,0);
assert.equal(evidence.implementation.newlyBehaviorCertifiedCards,0);
assert.equal(evidence.implementation.automaticCertifications,0);
assert.equal(evidence.implementation.inventoryGrants,0);
assert.equal(evidence.implementation.centralResolverIntegrated,false);
assert.equal(evidence.implementation.productionChanged,false);
assert.ok(evidence.rules.mainDeck==='20–30'&&evidence.rules.handLimit===6&&evidence.rules.handCheck==='End Phase');
assert.ok(evidence.rules.monsterZones===3&&evidence.rules.spellTrapZones===3&&evidence.rules.fieldZoneSeparate&&evidence.rules.extraDeckMax===5);
const testCount=[...tests.matchAll(/\btest\(/g)].length;
assert.ok(testCount>=20,'Esperadas pelo menos 20 cenários comportamentais; encontrados '+testCount);
for(const phrase of ['Skill Drain paga 1000','Ha Des nega','Dark Balter nega','Jinzo impede','Royal Decree permite','Field Zone é independente','Deck Principal aceita 20']){
 assert.ok(tests.includes(phrase),'Cenário obrigatório ausente: '+phrase);
}
console.log(JSON.stringify({mission:'M682',testCases:testCount,baselineCertifiedCards:certificationIds.length,newEngineCertifications:0,adapterVerifiedCards:3,newCardsCovered:2,skillDrainLegacyCertificateWithoutMetadata:false,automaticCertifications:0,inventoryGrants:0,centralResolverIntegrated:false,productionChanged:false},null,2));

/** Existing certificates exercise the reusable adapter above Level 4; no new certificate is generated. */
const r=require('../dist/effectRegistry'),{definitionFingerprint}=require('../dist/cardRegistry'),{getMonsterDefinition}=require('../dist/monsterEffects'),{getEffectModel}=require('../dist/effectModels');
const pool=r.enabledCardIds.filter(id=>r.getEffect(id).kind==='normal').map(id=>r.getPlayableCard(id)),cards=[pool.find(c=>c.level===5),pool.find(c=>c.level===8)];
const reviews=cards.map(c=>({id:c.id,konamiId:c.konamiId,mechanicalFingerprint:definitionFingerprint(c,r.getEffect(c.id),{monster:getMonsterDefinition,model:getEffectModel}),primaryFacts:{atk:c.atk,defense:c.defense,level:c.level,race:c.race,attribute:c.attribute}}));
require('./helpers/normalCertification.cjs').registerNormalCertification(cards,{reviews,reportFile:'artifacts/normal-adapter-existing-samples.json'});

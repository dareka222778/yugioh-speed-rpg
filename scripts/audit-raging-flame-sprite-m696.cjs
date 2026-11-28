'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {getDuelCard,getEnabledCardIds}=require('../dist/effectRegistry');

const runId='work-20261128T032433-0300-M696';
const branch='feat/work-m696-raging-flame-sprite-20261128';
const cardId='90810762';
const evidence=JSON.parse(fs.readFileSync('docs/evidence/m696-raging-flame-sprite.json','utf8'));
const run=JSON.parse(fs.readFileSync('coordination/runs/'+runId+'.json','utf8'));
const state=JSON.parse(fs.readFileSync('coordination/state.json','utf8'));
const source=fs.readFileSync('src/ragingFlameSpriteTagAdapter.ts','utf8');
const tests=fs.readFileSync('tests/ragingFlameSpriteTagAdapter.test.cjs','utf8');
const metadata=fs.readFileSync('src/cardMetadata.ts','utf8');
const certifications=fs.readFileSync('src/cardCertifications.ts','utf8');
const allowed=new Set([
 '.github/workflows/m696-raging-flame-sprite.yml',
 'coordination/runs/'+runId+'.json',
 'docs/evidence/m696-raging-flame-sprite.json',
 'scripts/audit-raging-flame-sprite-m696.cjs',
 'src/ragingFlameSpriteTagAdapter.ts',
 'tests/ragingFlameSpriteTagAdapter.test.cjs'
]);
const required=[...allowed].filter(path=>!path.startsWith('coordination/runs/'));
const changed=execFileSync('git',['diff','--name-only','origin/feat/rea-engine-recovery-20261026...HEAD'],{encoding:'utf8'})
 .split(/\r?\n/).filter(Boolean).sort();
assert.ok(changed.length>=required.length,'M696 não publicou todos os arquivos funcionais.');
assert.ok(changed.every(path=>allowed.has(path)),'M696 tocou caminho fora da reserva: '+changed.filter(path=>!allowed.has(path)).join(', '));
for(const path of required)assert.ok(changed.includes(path),'Arquivo funcional ausente: '+path);
assert.equal(evidence.mission,'M696');
assert.equal(evidence.runId,runId);
assert.equal(evidence.cards.length,1);
assert.equal(evidence.cards[0].id,cardId);
assert.equal(evidence.cards[0].konamiCid,6189);
assert.equal(evidence.cards[0].ocgFirstRelease,'2004-08-05');
assert.equal(evidence.cards[0].tcgFirstRelease,'2004-12-01');
assert.equal(evidence.cards[0].eligibleByHistoricalUnion,true);
assert.ok(new Date(evidence.cards[0].ocgFirstRelease+'T00:00:00Z')<new Date(evidence.historicalCutoff+'T23:59:59Z'));
assert.ok(new Date(evidence.cards[0].tcgFirstRelease+'T00:00:00Z')>new Date(evidence.historicalCutoff+'T23:59:59Z'));
assert.ok(evidence.cards[0].officialOcgSource.startsWith('https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=6189'));
assert.ok(source.includes("export const RAGING_FLAME_SPRITE_ID='90810762'"));
assert.ok(source.includes('RAGING_FLAME_SPRITE_KONAMI_CID=6189'));
for(const token of [
 'canRagingFlameSpriteAttackDirectly','bindRagingFlameSpriteDirectAttack',
 'monsterEffectsNegated','targetBindingValid','event.battleDamage>0',
 'event.opponentLpBefore-event.opponentLpAfter','source.card.atkBoost=current+1000',
 "rules.handLimit!==6","rules.handCheck!=='end'",
 'RULES_PROFILE.monsterZones','RULES_PROFILE.spellTrapZones','rules.extraDeckMax!==5'
])assert.ok(source.includes(token),'Contrato comportamental ausente: '+token);
assert.equal((tests.match(/\btest\(/g)||[]).length,23);
assert.equal(evidence.behaviorCoverage.scenarios,23);
assert.equal(evidence.engineV9Baseline.certified,969);
assert.equal(evidence.engineV9Baseline.remaining,31);
assert.equal(evidence.admission.adapterOnly,true);
assert.equal(evidence.admission.centralResolverIntegrated,false);
assert.equal(evidence.admission.catalogRevisionChanged,false);
assert.equal(evidence.admission.newEngineCertifiedCards,0);
assert.equal(evidence.admission.automaticCertifications,false);
assert.equal(evidence.admission.inventoryGrants,false);
assert.equal(evidence.production.merge,false);
assert.equal(evidence.production.deploy,false);
assert.equal(evidence.production.backupVerified,false);
assert.equal(evidence.production.liveDiscordValidation,false);
assert.equal(metadata.includes(cardId),false,'Candidato não deve entrar no catálogo por importação.');
assert.equal(certifications.includes(cardId),false,'Candidato não deve receber certificação automática.');
assert.equal(getDuelCard(cardId),undefined,'Adapter isolado não habilita a carta.');
assert.equal(getEnabledCardIds().includes(cardId),false,'Adapter isolado não altera o total certificado.');
assert.ok(!source.includes('grantInventory')&&!source.includes('addInventory')&&!source.includes('automaticCertification'));
assert.ok(state.activeReservations.some(item=>item.runId===runId&&item.branch===branch&&
 item.reservedFiles.includes('src/ragingFlameSpriteTagAdapter.ts')));
assert.ok(state.handoffRequests.some(item=>item.runId===runId&&item.targetPR===17&&item.commentId===7235345195));
assert.equal(run.mission,'M696');
assert.equal(run.branch,branch);
assert.equal(run.runId,runId);
assert.equal(run.candidate.id,cardId);
assert.equal(run.counts.newEngineCertified,0);
assert.equal(run.pullRequest.merge,false);
assert.equal(run.deployment.deploy,false);
assert.ok(!changed.some(path=>path.startsWith('catalog/')||
 path==='src/effectRegistry.ts'||path==='src/duelEngineCurrent.ts'||path==='src/monsterEffects.ts'||
 path==='src/cardMetadata.ts'||path==='src/cardCertifications.ts'||path.startsWith('src/commands/')));
process.stdout.write(JSON.stringify({
 mission:'M696',
 changedPaths:changed,
 officialCards:1,
 engineV9Baseline:969,
 adapterBehaviorVerifiedCards:1,
 behaviorScenarios:23,
 newEngineCertifiedCards:0,
 automaticCertifications:0,
 inventoryGrants:0,
 centralIntegration:false
},null,2)+'\n');

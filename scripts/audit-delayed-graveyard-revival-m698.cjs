'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {getDuelCard,getEnabledCardIds}=require('../dist/effectRegistry');

const runId='work-20261128T035737-0300-M698';
const branch='feat/work-m698-delayed-graveyard-revival-20261128';
const cards=['43586926','53839837'];
const evidence=JSON.parse(fs.readFileSync('docs/evidence/m698-delayed-graveyard-revival.json','utf8'));
const run=JSON.parse(fs.readFileSync('coordination/runs/'+runId+'.json','utf8'));
const state=JSON.parse(fs.readFileSync('coordination/state.json','utf8'));
const source=fs.readFileSync('src/delayedGraveyardRevivalTagAdapter.ts','utf8');
const tests=fs.readFileSync('tests/delayedGraveyardRevivalTagAdapter.test.cjs','utf8');
const metadata=fs.readFileSync('src/cardMetadata.ts','utf8');
const certifications=fs.readFileSync('src/cardCertifications.ts','utf8');
const allowed=new Set([
 '.github/workflows/m698-delayed-graveyard-revival.yml',
 'coordination/runs/'+runId+'.json',
 'docs/evidence/m698-delayed-graveyard-revival.json',
 'scripts/audit-delayed-graveyard-revival-m698.cjs',
 'src/delayedGraveyardRevivalTagAdapter.ts',
 'tests/delayedGraveyardRevivalTagAdapter.test.cjs'
]);
const changed=execFileSync('git',['diff','--name-only','origin/feat/rea-engine-recovery-20261026...HEAD'],{encoding:'utf8'})
 .split(/\r?\n/).filter(Boolean).sort();
assert.equal(changed.length,allowed.size,'Quantidade de caminhos alterados inesperada.');
assert.ok(changed.every(path=>allowed.has(path)),'M698 tocou caminho fora da reserva: '+changed.filter(path=>!allowed.has(path)).join(', '));
for(const path of allowed)assert.ok(changed.includes(path),'Arquivo funcional ausente: '+path);
assert.equal(evidence.mission,'M698');assert.equal(evidence.runId,runId);assert.equal(evidence.branch,branch);
assert.equal(evidence.cards.length,2);
assert.equal(evidence.cards[0].konamiCid,5030);assert.equal(evidence.cards[1].konamiCid,5410);
assert.equal(evidence.cards.every(card=>card.eligibleByHistoricalUnion),true);
assert.ok(evidence.cards.every(card=>card.ocgFirstRelease<evidence.historicalCutoff));
assert.ok(evidence.cards.every(card=>card.officialOcgSource.startsWith('https://www.db.yugioh-card.com/')));
assert.equal(evidence.behaviorCoverage.scenarios,31);
assert.equal(evidence.behaviorCoverage.fullyAdapterVerifiedCards,1);
assert.equal(evidence.behaviorCoverage.partiallyAdapterVerifiedCards,1);
assert.equal(evidence.counts.newEngineCertifiedCards,0);
assert.equal(evidence.counts.automaticCertifications,0);
assert.equal(evidence.counts.inventoryGrants,0);
assert.equal(evidence.admission.adapterOnly,true);
assert.equal(evidence.admission.centralResolverIntegrated,false);
assert.equal(evidence.admission.catalogRevisionChanged,false);
assert.equal(evidence.admission.certificationFileChanged,false);
assert.equal(evidence.production.merge,false);assert.equal(evidence.production.deploy,false);
assert.equal(evidence.production.backupVerified,false);assert.equal(evidence.production.liveDiscordValidation,false);
assert.equal((tests.match(/\btest\(/g)||[]).length,31);
for(const token of [
 'recordDelayedGraveyardRevivalDestruction','resolveDelayedGraveyardRevival',
 'TWIN_HEADED_BEHEMOTH_ID','VAMPIRE_LORD_ID',
 "rules.handLimit!==6","rules.handCheck!=='end'",
 'RULES_PROFILE.monsterZones','RULES_PROFILE.spellTrapZones','rules.extraDeckMax!==5',
 'event.graveBinding.epoch!==event.sourceBinding.epoch+1',
 'event.sourceTeam!==event.controllerTeam','state.core.current===ownerTeam?2:1',
 'atkBoost:twin?1000-info.atk:0','defBoost:twin?1000-info.defense:0',
 'targetBindingValid','inventário físico'
])assert.ok(source.includes(token),'Contrato comportamental ausente: '+token);
assert.equal(metadata.includes(cards[0]),false);assert.equal(metadata.includes(cards[1]),false);
for(const id of cards){
 assert.equal(certifications.includes('"'+id+'"'),false,'Candidato não deve receber certificado por importação.');
 assert.equal(getDuelCard(id),undefined,'Adapter isolado não habilita a carta.');
 assert.equal(getEnabledCardIds().includes(id),false,'Adapter isolado não altera a contagem certificada.');
}
assert.ok(!source.includes('grantInventory')&&!source.includes('addInventory')&&!source.includes('automaticCertification'));
const reservation=state.activeReservations.find(item=>item.runId===runId);
assert.ok(reservation&&reservation.branch===branch&&reservation.priority==='P1');
assert.ok(reservation.reservedFiles.includes('src/delayedGraveyardRevivalTagAdapter.ts'));
assert.ok(state.handoffRequests.some(item=>item.runId===runId&&item.targetPR===17&&item.commentId===7235689389));
assert.equal(run.mission,'M698');assert.equal(run.branch,branch);assert.equal(run.runId,runId);
assert.equal(run.counts.newEngineCertifiedCards,0);assert.equal(run.pullRequest.merge,false);
assert.equal(run.deployment.deploy,false);
assert.ok(!changed.some(path=>path.startsWith('catalog/')||
 path==='src/effectRegistry.ts'||path==='src/duelEngineCurrent.ts'||path==='src/monsterEffects.ts'||
 path==='src/cardMetadata.ts'||path==='src/cardCertifications.ts'||path.startsWith('src/commands/')));
process.stdout.write(JSON.stringify({
 mission:'M698',changedPaths:changed,adapterCards:2,fullyAdapterVerifiedCards:1,
 partiallyAdapterVerifiedCards:1,behaviorScenarios:31,engineV9Baseline:969,
 explicitCertificateEntries:959,newEngineCertifiedCards:0,automaticCertifications:0,
 inventoryGrants:0,centralIntegration:false
},null,2)+'\n');

'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {getDuelCard,getEnabledCardIds}=require('../dist/effectRegistry');

const runId='work-20261128T074828-0300-M700';
const branch='feat/work-m700-ioc-graveyard-transitions-20261128';
const ids=['41859700','78243409'];
const expected=new Set([
 '.github/workflows/m700-ioc-graveyard-transitions.yml',
 'coordination/runs/'+runId+'.json',
 'docs/evidence/m700-ioc-graveyard-transitions.json',
 'scripts/audit-ioc-graveyard-transitions-m700.cjs',
 'src/iocGraveyardTransitionTagAdapter.ts',
 'tests/iocGraveyardTransitionTagAdapter.test.cjs'
]);
const evidence=JSON.parse(fs.readFileSync('docs/evidence/m700-ioc-graveyard-transitions.json','utf8'));
const run=JSON.parse(fs.readFileSync('coordination/runs/'+runId+'.json','utf8'));
const state=JSON.parse(fs.readFileSync('coordination/state.json','utf8'));
const source=fs.readFileSync('src/iocGraveyardTransitionTagAdapter.ts','utf8');
const tests=fs.readFileSync('tests/iocGraveyardTransitionTagAdapter.test.cjs','utf8');
const metadata=fs.readFileSync('src/cardMetadata.ts','utf8');
const certifications=fs.readFileSync('src/cardCertifications.ts','utf8');
const changed=execFileSync('git',['diff','--name-only','origin/feat/rea-engine-recovery-20261026...HEAD'],{encoding:'utf8'})
 .split(/\r?\n/).filter(Boolean).sort();
assert.equal(changed.length,expected.size,'Quantidade de caminhos alterados inesperada.');
assert.ok(changed.every(path=>expected.has(path)),'M700 tocou caminho fora da reserva: '+changed.filter(path=>!expected.has(path)).join(', '));
for(const path of expected)assert.ok(changed.includes(path),'Arquivo funcional ausente: '+path);
assert.equal(evidence.mission,'M700');assert.equal(evidence.runId,runId);assert.equal(evidence.branch,branch);
assert.equal(evidence.historicalCutoff,'2004-09-30');assert.equal(evidence.cards.length,2);
assert.deepEqual(evidence.cards.map(card=>card.id),ids);
assert.deepEqual(evidence.cards.map(card=>card.konamiCid),[5877,5878]);
assert.ok(evidence.cards.every(card=>card.ocgFirstRelease==='2004-07-15'&&card.eligibleByHistoricalUnion));
assert.ok(evidence.cards.every(card=>card.officialOcgSource.startsWith('https://www.db.yugioh-card.com/')));
assert.equal(evidence.behaviorCoverage.scenarios,26);
assert.equal((tests.match(/\btest\(/g)||[]).length,26);
assert.equal(evidence.counts.candidateCards,2);
assert.equal(evidence.counts.newMetadataCards,0);
assert.equal(evidence.counts.newEngineCertifiedCards,0);
assert.equal(evidence.counts.automaticCertifications,0);
assert.equal(evidence.counts.inventoryGrants,0);
assert.equal(evidence.admission.adapterOnly,true);
assert.equal(evidence.admission.centralResolverIntegrated,false);
assert.equal(evidence.admission.catalogRevisionChanged,false);
assert.equal(evidence.admission.certificationFileChanged,false);
assert.equal(evidence.production.merge,false);assert.equal(evidence.production.deploy,false);
assert.equal(evidence.production.backupVerified,false);assert.equal(evidence.production.liveDiscordValidation,false);
for(const token of [
 'BURNING_ALGAE_ID','THING_IN_THE_CRATER_ID','recordGraveyardTransition','resolveGraveyardTransition',
 'rules.mainDeckMin!==20','rules.mainDeckMax!==30','rules.handLimit!==6',"rules.handCheck!=='end'",
 'rules.monsterZones!==3','rules.spellTrapZones!==3','rules.extraDeckMax!==5',
 'RULES_PROFILE.monsterZones','RULES_PROFILE.spellTrapZones',
 'event.binding.epoch<0','processed.length>=4096',
 'window.resolvingTeam!==pending.ownerTeam','window.resolvingSeat!==input.active[pending.ownerTeam]',
 'ownerSeatOfUid(state,window.pyroUid)!==ownerActiveSeat',
 "info.race!=='Pyro'",'inventorySnapshot'
])assert.ok(source.includes(token),'Contrato comportamental ausente: '+token);
assert.equal(metadata.includes(ids[0]),false);assert.equal(metadata.includes(ids[1]),false);
for(const id of ids){
 assert.equal(certifications.includes('"'+id+'"'),false,'Candidato não deve receber certificado por importação.');
 assert.equal(getDuelCard(id),undefined,'Adapter isolado não habilita a carta.');
 assert.equal(getEnabledCardIds().includes(id),false,'Adapter isolado não altera o catálogo habilitado.');
}
assert.ok(!source.includes('grantInventory')&&!source.includes('addInventory')&&!source.includes('automaticCertification'));
const reservation=state.activeReservations.find(item=>item.runId===runId);
assert.ok(reservation&&reservation.branch===branch&&reservation.priority==='P1');
assert.deepEqual([...reservation.reservedFiles].sort(),[...expected].sort());
assert.equal(run.mission,'M700');assert.equal(run.branch,branch);assert.equal(run.runId,runId);
assert.equal(run.counts.candidateCards,2);assert.equal(run.counts.newEngineCertifiedCards,0);
assert.equal(run.counts.automaticCertifications,0);assert.equal(run.counts.inventoryGrants,0);
assert.equal(run.pullRequest.merge,false);assert.equal(run.deployment.deploy,false);
assert.ok(run.handoffs.central.commentId===7238246464);
assert.ok(!changed.some(path=>path.startsWith('catalog/')||
 path==='src/effectRegistry.ts'||path==='src/duelEngineCurrent.ts'||path==='src/monsterEffects.ts'||
 path==='src/cardMetadata.ts'||path==='src/cardCertifications.ts'||path.startsWith('src/commands/')));
process.stdout.write(JSON.stringify({
 mission:'M700',changedPaths:changed,candidateCards:2,behaviorScenarios:26,
 adapterBehaviorVerifiedCards:evidence.counts.adapterBehaviorVerifiedCards,
 engineV9Baseline:969,remainingTo1000:31,newEngineCertifiedCards:0,
 automaticCertifications:0,inventoryGrants:0,centralIntegration:false
},null,2)+'\n');

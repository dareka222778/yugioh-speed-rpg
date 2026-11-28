'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const root=process.cwd();
const read=path=>fs.readFileSync(path,'utf8');
const evidence=JSON.parse(read('docs/evidence/m699-ioc-attribute-summons.json'));
const state=JSON.parse(read('coordination/state.json'));
const runPath='coordination/runs/work-20261128T072745-0300-M699.json';
const run=JSON.parse(read(runPath));
const source=read('src/invasionChaosAttributeSummonTagAdapter.ts');
const tests=read('tests/invasionChaosAttributeSummonTagAdapter.test.cjs');
const metadata=read('src/cardMetadata.ts');
const certifications=read('src/cardCertifications.ts');
const changed=execFileSync('git',['diff','--name-only','origin/feat/rea-engine-recovery-20261026...HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const allowed=new Set([
 'src/invasionChaosAttributeSummonTagAdapter.ts',
 'tests/invasionChaosAttributeSummonTagAdapter.test.cjs',
 'docs/evidence/m699-ioc-attribute-summons.json',
 'scripts/audit-ioc-attribute-summons-m699.cjs',
 '.github/workflows/m699-ioc-attribute-summons.yml',
 runPath
]);
assert.ok(changed.length>0,'M699 precisa entregar alterações reais.');
for(const path of changed)assert.ok(allowed.has(path),'Arquivo fora do escopo isolado: '+path);
for(const forbidden of [
 'src/duelEngineCurrent.ts','src/monsterEffects.ts','src/effectRegistry.ts',
 'src/cardMetadata.ts','src/cardCertifications.ts','src/tagDuel.ts','src/commands'
 ])assert.ok(!changed.includes(forbidden),'Arquivo central não liberado foi alterado: '+forbidden);
assert.equal(evidence.mission,'M699');
assert.equal(evidence.branch,'feat/work-m699-ioc-attribute-summons-20261128');
assert.equal(evidence.cards.length,4);
assert.equal(evidence.behaviorCoverage.fullyAdapterVerifiedCards,4);
assert.equal(evidence.behaviorCoverage.scenarios,34);
assert.equal(evidence.counts.newEngineCertifiedCards,0);
assert.equal(evidence.counts.automaticCertifications,0);
assert.equal(evidence.counts.inventoryGrants,0);
assert.equal(evidence.admission.adapterOnly,true);
assert.equal(evidence.admission.centralResolverIntegrated,false);
assert.equal(evidence.production.merge,false);
assert.equal(evidence.production.deploy,false);
assert.equal(evidence.production.liveDiscordValidation,false);
for(const card of evidence.cards){
 assert.ok(card.konamiCid>=5829&&card.konamiCid<=5832);
 assert.ok(card.id&&card.name&&card.officialOcgSource.startsWith('https://www.db.yugioh-card.com/'));
 assert.ok(card.konamiListedSetDate<=evidence.historicalCutoff,'Card fora do corte histórico: '+card.name);
 assert.ok(!metadata.includes(card.id),'Metadata já contém '+card.name);
 assert.ok(!certifications.includes('"'+card.id+'"'),'Certificação já contém '+card.name);
}
const testCalls=(tests.match(/\btest\(/g)||[]).length;
const expanded=testCalls+3; // one four-card loop creates three extra runtime tests
assert.equal(expanded,evidence.behaviorCoverage.scenarios,'Contagem de cenários mudou; atualize a evidência.');
for(const token of [
 'specialSummonInvasionChaosFromHand','assertInvasionChaosNormalSummonForbidden',
 'recordInvasionChaosBattleEvent','resolveInvasionChaosBattleTrigger',
 'consumeInvasionChaosDrawSkip','randomIndex','monsterEffectsNegated',
 'synchronizeCardLifetimes','ownerSeatOfUid','inventorySnapshot'
 ])assert.ok(source.includes(token),'Comportamento ausente: '+token);
for(const token of [
 'mainDeckMin!==20','mainDeckMax!==30','handLimit!==6',"handCheck!=='end'",
 'monsterZones!==3','spellTrapZones!==3','extraDeckMax!==5'
 ])assert.ok(source.includes(token),'Regra do proprietário ausente: '+token);
assert.ok(tests.includes('HMAC'));
assert.ok(tests.includes('partner private hand'));
assert.ok(tests.includes('Field Zone'));
assert.ok(tests.includes('inventory'));
const reservation=state.activeReservations.find(item=>item.runId===run.runId);
assert.ok(reservation,'Reserva M699 ausente na coordenação.');
assert.equal(reservation.branch,run.branch);
assert.equal(reservation.priority,'P1');
assert.ok(state.handoffRequests.some(item=>item.runId===run.runId&&item.commentId===7237927806));
assert.equal(run.runId,'work-20261128T072745-0300-M699');
assert.equal(run.counts.newEngineCertifiedCards,0);
assert.equal(run.counts.inventoryGrants,0);
process.stdout.write(JSON.stringify({
 mission:'M699',cards:evidence.cards.length,scenarios:expanded,
 changedFiles:changed,centralFilesTouched:false,engineCertifiedCards:0,
 automaticCertifications:0,inventoryGrants:0,adapterOnly:true
},null,2)+'\n');

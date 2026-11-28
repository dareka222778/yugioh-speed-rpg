'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');

const runId='work-20261128T022638-0300-M694';
const evidence=JSON.parse(fs.readFileSync('docs/evidence/m694-sarcophagus.json','utf8'));
const run=JSON.parse(fs.readFileSync('coordination/runs/'+runId+'.json','utf8'));
const state=JSON.parse(fs.readFileSync('coordination/state.json','utf8'));
const source=fs.readFileSync('src/sarcophagusTagAdapter.ts','utf8');
const tests=fs.readFileSync('tests/sarcophagusTagAdapter.test.cjs','utf8');
const allowed=new Set([
 '.github/workflows/m694-sarcophagus.yml',
 'coordination/runs/'+runId+'.json',
 'coordination/state.json',
 'docs/evidence/m694-sarcophagus.json',
 'scripts/audit-sarcophagus-m694.cjs',
 'src/sarcophagusTagAdapter.ts',
 'tests/sarcophagusTagAdapter.test.cjs'
]);
const required=[
 '.github/workflows/m694-sarcophagus.yml',
 'docs/evidence/m694-sarcophagus.json',
 'scripts/audit-sarcophagus-m694.cjs',
 'src/sarcophagusTagAdapter.ts',
 'tests/sarcophagusTagAdapter.test.cjs'
];
const changed=execFileSync('git',['diff','--name-only','origin/feat/rea-engine-recovery-20261026...HEAD'],{encoding:'utf8'})
 .split(/\r?\n/).filter(Boolean).sort();
assert.ok(changed.every(path=>allowed.has(path)),'M694 tocou caminho não reservado: '+changed.filter(path=>!allowed.has(path)).join(', '));
for(const path of required)assert.ok(changed.includes(path),'Arquivo funcional não publicado: '+path);
const identities=[
 ['31076103',6063,'THE_FIRST_SARCOPHAGUS_ID','THE_FIRST_SARCOPHAGUS_KONAMI_CID'],
 ['04081094',6062,'THE_SECOND_SARCOPHAGUS_ID','THE_SECOND_SARCOPHAGUS_KONAMI_CID'],
 ['78697395',6061,'THE_THIRD_SARCOPHAGUS_ID','THE_THIRD_SARCOPHAGUS_KONAMI_CID'],
 ['25343280',6024,'SPIRIT_OF_THE_PHARAOH_ID','SPIRIT_OF_THE_PHARAOH_KONAMI_CID']
];
assert.equal(evidence.cards.length,4);
assert.deepEqual(run.cards.map(card=>card.id).sort(),identities.map(item=>item[0]).sort());
for(const [id,cid,idConstant,cidConstant] of identities){
 const item=evidence.cards.find(card=>card.id===id);
 assert.ok(item,'Identidade ausente: '+id);
 assert.equal(item.konamiCid,cid);
 assert.ok(item.officialSource.startsWith('https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid='+cid));
 assert.ok(source.includes("export const "+idConstant+"='"+id+"'"));
 assert.ok(source.includes("export const "+cidConstant+"="+cid));
 assert.ok(new Date(item.ocgFirstRelease+'T00:00:00Z')<new Date(evidence.historicalCutoff+'T23:59:59Z'));
 assert.ok(new Date(item.tcgFirstRelease+'T00:00:00Z')<new Date(evidence.historicalCutoff+'T23:59:59Z'));
}
const activeReservation=state.activeReservations.some(item=>item.runId===runId&&item.branch===run.branch);
const releasedReservation=state.lastWorkRun?.runId===runId&&state.lastWorkRun.branch===run.branch&&
 /completed-adapter/.test(state.lastWorkRun.status||'')&&
 Array.isArray(state.lastWorkRun.scopeReleasedToAuxiliary)&&
 state.lastWorkRun.scopeReleasedToAuxiliary.includes('src/sarcophagusTagAdapter.ts');
assert.ok(activeReservation||releasedReservation,'M694 deve estar reservado ou liberado com checkpoint registrado.');
assert.equal(run.mission,'M694');
assert.equal(run.branch,'feat/work-m694-sarcophagus-tag-adapter-20261128');
assert.equal(evidence.engineV9Baseline.certified,969);
assert.equal(evidence.engineV9Baseline.candidateCardsFoundInRevision,0);
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
for(const token of ['RULES_PROFILE.monsterZones','RULES_PROFILE.spellTrapZones','rules.handLimit!==6',"rules.handCheck!=='end'",'shuffleDuel','synchronizeCardLifetimes','cleanupSarcophagusAfterLeave','resolveSpiritOfPharaohTrigger']){
 assert.ok(source.includes(token),'Contrato de regras/efeito ausente: '+token);
}
assert.ok((tests.match(/\btest\(/g)||[]).length>=23,'Cobertura focada insuficiente.');
for(const token of ['first-sarcophagus-effect','End Phase','Monster Zones','never grant inventory','stolen First Sarcophagus','Estado físico mudou']){
 assert.ok(tests.includes(token),'Cenário comportamental ausente: '+token);
}
assert.ok(!source.includes('grantInventory')&&!source.includes('addInventory')&&!source.includes('automaticCertification'));
assert.ok(!changed.some(path=>path.startsWith('catalog/')||path==='src/effectRegistry.ts'||path==='src/duelEngineCurrent.ts'||path==='src/monsterEffects.ts'||path.startsWith('src/commands/')));
process.stdout.write(JSON.stringify({mission:'M694',changedPaths:changed,officialCards:evidence.cards.length,engineV9Baseline:969,newEngineCertifiedCards:0,behaviorScenarios:(tests.match(/\btest\(/g)||[]).length,automaticCertifications:false,inventoryGrants:false,centralIntegration:false},null,2)+'\n');

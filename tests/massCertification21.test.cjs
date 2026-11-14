/** Synthetic admission-gate manifests below are unit fixtures, never card executions. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {planMassCertification,scenarioPlan,inferCapabilities,sha256}=require('../scripts/mass-certification21.cjs');
const registry=require('../dist/effectRegistry'),{getMonsterDefinition}=require('../dist/monsterEffects');
const history=require('../catalog/historical/2004-10-01/cards.json');
const review=require('../docs/evidence/mission21-individual-reviews.json').find(r=>r.id==='91932350');
function fixture(){
 const card=registry.engineCard(review.id),effect=registry.getEffect(card.id),monster=getMonsterDefinition(card.id);
 const text='Its rule name is Harpie Lady everywhere. While its continuous effect applies, every face-up WIND monster on either field receives 300 ATK. No activation, target, cost or limited duration is required.';
 const suites=['tests/massCertification21.test.cjs'];
 const candidate={card,effect,monster,family:'unit-fixture-only',requirements:inferCapabilities({card,effect,monster}),suites,textEvidence:{text,format:'full-rule-paraphrase',complete:true,source:card.source,sha256:sha256(text)}};
 const reviewed={...review,fullTextReviewed:true,secondaryEffectsReviewed:true,exceptionsReviewed:true,textSha256:sha256(text),semanticCoverage:Object.fromEntries(['activation','conditions','costs','targets','choices','operations','duration','restrictions','negation'].map(d=>[d,['operations','negation','conditions','restrictions'].includes(d)?'represented':'not-applicable']))};
 const execution={id:card.id,fingerprint:review.mechanicalFingerprint,resolverVersion:'engine-v9',activePublicEngine:true,exitCode:0,suites,suiteHashes:{[suites[0]]:sha256(fs.readFileSync(suites[0]))},passed:scenarioPlan(candidate).map(s=>s.name),failed:[]};
 return {history,candidates:[candidate],reviews:[reviewed],executions:[execution]};
}
test('mass gate preserves separate stages and never rewrites an existing certificate or inventory',()=>{
 const input=fixture(),before=JSON.stringify(input),out=planMassCertification(input);
 assert.equal(out.rows[0].stages.tested,true,JSON.stringify(out.rows[0]));assert.deepEqual(out.proposals,[]);
 assert.equal(out.changesRegistry,false);assert.equal(out.grantsInventory,false);assert.equal(out.distributesCards,false);assert.equal(JSON.stringify(input),before);
});
test('importing a complete name/text does not prove identity, execution or certification',()=>{
 const x=fixture();x.reviews=[];x.executions=[];const row=planMassCertification(x).rows[0];
 assert.equal(row.stages.imported,true);assert.equal(row.stages.identityVerified,false);assert.equal(row.stages.tested,false);assert.equal(row.proposal,null);
});
test('mass gate rejects a supported operation with an unreviewed secondary effect',()=>{
 const x=fixture();x.reviews[0].secondaryEffectsReviewed=false;const row=planMassCertification(x).rows[0];assert.equal(row.stages.mechanicallyRepresented,false);assert.ok(row.issues.includes('incomplete-full-effect-review'));
});
test('mass gate rejects changed text, missing test labels, failed tests and stale suite bytes',()=>{
 for(const change of [x=>x.candidates[0].textEvidence.text+=' changed',x=>x.executions[0].passed.pop(),x=>x.executions[0].failed.push('resolution'),x=>x.executions[0].suiteHashes[x.executions[0].suites[0]]='0'.repeat(64)]){
  const x=fixture();change(x);const row=planMassCertification(x).rows[0];assert.equal(row.stages.tested,false);assert.equal(row.proposal,null);
 }
});
test('mass gate rejects archived and isolated-function execution attestations',()=>{
 for(const change of [x=>x.executions[0].resolverVersion='engine-v8',x=>x.executions[0].activePublicEngine=false]){const x=fixture();change(x);assert.equal(planMassCertification(x).rows[0].stages.tested,false);}
});
test('mass gate rejects duplicate identities, alias candidates and traversal suite paths',()=>{
 const duplicate=fixture();duplicate.candidates.push(structuredClone(duplicate.candidates[0]));assert.ok(planMassCertification(duplicate).rows.every(r=>r.issues.includes('duplicate-candidate-identity')));
 const path=fixture();path.candidates[0].suites=['tests/../massCertification21.test.cjs'];assert.ok(planMassCertification(path).rows[0].issues.includes('invalid-or-missing-test-suites'));
});
test('unknown and undeclared operations remain blocked and Ritual categories require compatible definitions',()=>{
 const x=fixture();x.candidates[0].requirements.push('unimplemented:teleport');assert.ok(planMassCertification(x).rows[0].unsupportedRequirements.includes('unimplemented:teleport'));
 const ritual=fixture();ritual.candidates[0].card.monsterType='ritual';assert.equal(planMassCertification(ritual).rows[0].stages.mechanicallyRepresented,false);
 const y=fixture();y.candidates[0].requirements=[];assert.ok(planMassCertification(y).rows[0].issues.includes('undeclared-definition-capability'));
});
test('eligibility requires the reviewed regional printing, not an invented release date',()=>{
 const x=fixture();x.reviews[0].verifiedPrinting.date='2004-10-01';assert.equal(planMassCertification(x).rows[0].stages.identityVerified,false);
 const y=fixture();y.reviews[0].verifiedPrinting.source='https://example.org/?cid=6186';assert.ok(planMassCertification(y).rows[0].issues.includes('missing-official-regional-printing'));
});

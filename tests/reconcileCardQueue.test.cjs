const {test}=require('node:test');
const assert=require('node:assert/strict');
const {current,reconcile}=require('../scripts/reconcile-card-queue.cjs');

test('the live worklist derives counts from the immutable catalog, not from a stale report',()=>{
 const plan=current();
 const manifest=require('../catalog/engine-v9/manifest.json');
 const live=require('../catalog/engine-v9/'+manifest.current+'.json');
 const cache=require('../docs/evidence/mission32-family-queue-summary.json');
 assert.equal(plan.historical,1962);
 assert.equal(plan.certified,live.cards.length);
 assert.equal(plan.pending,plan.historical-live.cards.length);
 assert.equal(plan.cacheBehindBy,live.cards.length-cache.certified);
 assert.equal(plan.automaticCertifications,0);
 assert.ok(plan.staleFamilyIdentitiesRemoved>0);
 assert.ok(plan.families.every(g=>g.pending===g.candidates.length&&g.pending>0));
 assert.ok(!plan.families.some(g=>g.candidates.some(c=>['15960641','88975532','53693416'].includes(c.id))));
});

test('a cached group drops certified aliases but never drops a genuinely pending sibling',()=>{
 const history=[
  {id:'one',passwords:['11111111'],kind:'monster',mechanics:[],classifications:['effect']},
  {id:'two',passwords:['22222222'],kind:'monster',mechanics:[],classifications:['effect']}
 ];
 const cached={certified:0,families:[{signature:'same',category:'effect-monster',pending:[{id:'11111111',canonicalId:'one',name:'One'},{id:'22222222',canonicalId:'two',name:'Two'}]}]};
 const result=reconcile(history,[{id:'11111111'}],cached);
 assert.deepEqual(result.families[0].candidates.map(c=>c.id),['22222222']);
 assert.equal(result.cacheBehindBy,1);
 assert.equal(result.staleFamilyIdentitiesRemoved,1);
});

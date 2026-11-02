const {test}=require('node:test');
const assert=require('node:assert/strict');
const {plan,category}=require('../scripts/milestone1000-plan.cjs');
const sample=(id,pass,name,kind='monster',extra={})=>({id,passwords:pass,konamiId:123+Number(id.replace(/\D/g,'')),names:{en:name},kind,mechanics:[],classifications:['effect'],...extra});
test('dynamic target counts only truly certified historical identities',()=>{
 const h=[sample('1',['11111111'],'One'),sample('2',['22222222'],'Two'),sample('3',['33333333'],'Three')];
 const p=plan({history:h,catalog:[{id:'11111111'}],target:3,batchSize:1});
 assert.equal(p.certified,1);assert.equal(p.remainingToGoal,2);assert.equal(p.pending,2);
 assert.deepEqual(p.plannedBatchSizes.map(x=>x.goal),[1,1]);assert.equal(p.automaticCertifications,0);
 assert.equal(p.inventoryGranted,0);assert.ok(p.triageQueue.every(x=>x.automaticCertification===false));
});
test('ambiguous/missing identities are blocked, not automatically admitted',()=>{
 const h=[sample('1',['11111111'],'A'),sample('2',['11111111'],'B'),sample('3',[],'C')];
 const p=plan({history:h,catalog:[],target:1000});
 assert.equal(p.identityBlocked,3);assert.equal(p.fullyUnreviewed,0);
 assert.equal(p.triageQueue.length,0);assert.equal(category(sample('4',['55555555'],'Fusion','monster',{mechanics:['fusion']})),'fusion');
});

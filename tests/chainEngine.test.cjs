const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveChainLinks,negateChainLink}=require('../dist/chainEngine');
const link=(card)=>({actor:0,card,id:card,target:''});
test('chain resolves in reverse activation order',()=>{
 const seen=[];resolveChainLinks([link('first'),link('second'),link('third')],x=>seen.push(x.card));
 assert.deepEqual(seen,['third','second','first']);
});
test('negated effects are skipped but other links still resolve',()=>{
 const seen=[];const negated=[];const chain=negateChainLink([link('a'),link('b')],'a');
 resolveChainLinks(chain,x=>seen.push(x.card),x=>negated.push(x.card));
 assert.deepEqual(seen,['b']);assert.deepEqual(negated,['a']);
 assert.throws(()=>negateChainLink(chain,'missing'),/not found/);
});
test('duel-ending effect stops subsequent chain links',()=>{
 const seen=[];let finished=false;
 resolveChainLinks([link('first'),link('finisher')],x=>{seen.push(x.card);if(x.card==='finisher')finished=true;},undefined,()=>finished);
 assert.deepEqual(seen,['finisher']);
});

const {test}=require('node:test'),assert=require('node:assert/strict');const {retryNetwork,transientNetworkCode}=require('../dist/networkRetry');
test('DNS and nested transport failures retry with capped delays and safe logs, then recover',async()=>{
 const sleeps=[],logs=[],attempts=[];const result=await retryNetwork(async attempt=>{attempts.push(attempt);if(attempt<=6)throw new Error('fake-secret-must-not-be-logged',{cause:Object.assign(new Error('lookup'),{code:attempt===1?'ENOTFOUND':'EAI_AGAIN'})});return 'connected';},'Conexão ao Discord',{sleep:async ms=>sleeps.push(ms),log:line=>logs.push(line)});assert.equal(result,'connected');assert.deepEqual(attempts,[1,2,3,4,5,6,7]);assert.deepEqual(sleeps,[5000,10000,20000,30000,30000,30000]);assert.ok(!logs.join('\n').includes('fake-secret'));assert.match(logs[0],/ENOTFOUND/);
});
test('invalid token, permission and unknown programming errors are not retried',async()=>{
 for(const error of [Object.assign(new Error('bad token'),{code:'TokenInvalid'}),{status:401},{status:403},new TypeError('logic failure')]){let attempts=0;await assert.rejects(retryNetwork(async()=>{attempts++;throw error;},'auth',{sleep:async()=>assert.fail('must not wait'),log:()=>assert.fail('must not log as transient')}));assert.equal(attempts,1);}
});
test('aggregate transport failures and gateway 503 are recognized without recursive loops',()=>{
 const cyclic={};cyclic.cause=cyclic;assert.equal(transientNetworkCode(cyclic),undefined);assert.equal(transientNetworkCode(new AggregateError([{code:'UND_ERR_CONNECT_TIMEOUT'}])), 'UND_ERR_CONNECT_TIMEOUT');assert.equal(transientNetworkCode({status:503}),'HTTP_503');assert.equal(transientNetworkCode({status:400}),undefined);
});

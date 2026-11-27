const fs=require('node:fs'),path=require('node:path');
const evidence=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/evidence/m681-owner-hand-return.json'),'utf8'));
const source=fs.readFileSync(path.join(__dirname,'../src/ownerHandReturnTagAdapter.ts'),'utf8');
const tests=fs.readFileSync(path.join(__dirname,'../tests/ownerHandReturnTagAdapter.test.cjs'),'utf8');
for(const token of ['81306586','94192409','ownerHolder','physicalSeat','targetBindingValid','removeToken','cleanEquips','publicReturnReceipt','extra'])if(!source.includes(token))throw new Error('Implementação M681 incompleta: '+token);
if(evidence.mission!=='M681'||evidence.cards.length!==2||evidence.adapterBehaviorVerifiedCards!==2||evidence.behaviorCertifiedCards!==0||evidence.newEngineV9Certifications!==0||evidence.automaticCertifications!==0||evidence.inventoryGrants!==0)throw new Error('Evidência M681 inconsistente.');
if(evidence.tests.count!==13||tests.split("test('").length-1!==13)throw new Error('Contagem de testes M681 incorreta.');
if(!tests.includes('proprietário original')||!tests.includes('mão privada')&&!tests.includes('p3'))throw new Error('Regressões de propriedade/privacidade ausentes.');
console.log('M681 evidence audit passed: 2 adapter behaviors, 13 focused scenarios, 0 certifications, 0 inventory grants.');

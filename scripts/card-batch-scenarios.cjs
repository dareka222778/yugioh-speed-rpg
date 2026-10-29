'use strict';
/** Data-driven behavioral oracles executed through the real public duel facade. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),clone=x=>JSON.parse(JSON.stringify(x));
const forbidden=new Set(['__proto__','constructor','prototype']);
function safe(value){if(!value||typeof value!=='object')return;for(const [k,v]of Object.entries(value)){assert.ok(!forbidden.has(k),'Unsafe property');safe(v);}}
function fixture(input){safe(input);const e=require('../dist/duelEngine'),basic=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));let s=e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],undefined,0,{randomSeed:'31'.repeat(32)});s.turn=3;s.players.forEach(p=>{p.hand=[];p.monsters=[];p.backrow=[];p.grave=[];p.banished=[];});
 for(const [k,v]of Object.entries(input??{})){assert.ok(['turn','current','phase','resume','players'].includes(k),'Unsupported fixture key '+k);if(k==='players'){assert.equal(v.length,2);v.forEach((p,i)=>{for(const [key,val]of Object.entries(p)){assert.ok(['hand','deck','monsters','backrow','grave','banished','field','lp','summoned','extra'].includes(key),'Invalid player patch');s.players[i][key]=clone(val);}});}else s[k]=v;}
 require('../dist/duelIntegrity').assertDuelState(s);return s;
}
function resolvePasses(s){const e=require('../dist/duelEngine');for(let n=0;s.phase==='response';n++){assert.ok(n<80,'Unbounded response loop');const actor=s.players[e.decisionPlayer(s)].id,a=e.legalActions(s,actor).find(a=>a.kind==='pass');assert.ok(a,'Response needs a pass');s=e.step(s,actor,a);}return s;}
function runCase(spec){safe(spec);assert.ok(spec&&Array.isArray(spec.actions)&&Array.isArray(spec.assertions)&&spec.assertions.length,'Every scenario needs independent expected results');const e=require('../dist/duelEngine');let s=fixture(spec.fixture),restores=0,rejections=0,decisions=0;
 for(const command of spec.actions){if(command.restore===true){const before=clone(s);s=clone(s);require('../dist/duelIntegrity').assertDuelState(s);assert.deepEqual(clone(s),before);restores++;continue;}if(command.settle===true){s=resolvePasses(s);continue;}
  const actor=command.actor==='decision'?s.players[e.decisionPlayer(s)].id:command.actor??'a';if(command.expectError){assert.ok(command.action&&typeof command.action.kind==='string','Negative cases require an explicit action');const original=JSON.stringify(s);assert.throws(()=>e.step(s,actor,command.action));assert.equal(JSON.stringify(s),original);rejections++;continue;}
  assert.ok(command.match&&typeof command.match==='object','Explicit legal action match required');const options=e.legalActions(s,actor).filter(a=>Object.entries(command.match).every(([k,v])=>JSON.stringify(a[k])===JSON.stringify(v)));assert.equal(options.length,1,'Action must resolve unambiguously: '+JSON.stringify(command.match)+' / '+JSON.stringify(options));s=e.step(s,actor,options[0]);decisions++;
 }
 for(const oracle of spec.assertions){assert.ok(Array.isArray(oracle.path)&&oracle.path.length&&!oracle.path.some(k=>forbidden.has(k)),'Invalid oracle path');let actual=s;for(const key of oracle.path)actual=actual?.[key];if(Object.hasOwn(oracle,'equals'))assert.deepEqual(actual,oracle.equals,oracle.path.join('.'));else if(Object.hasOwn(oracle,'length'))assert.equal(actual?.length,oracle.length,oracle.path.join('.'));else if(Object.hasOwn(oracle,'containsUID'))assert.ok(Array.isArray(actual)&&actual.some(x=>x.uid===oracle.containsUID),oracle.path.join('.'));else throw Error('Missing independent expected result');}
 return {state:clone(s),restores,rejections,decisions};
}
function registerBatch(batchFile,suite){const {test,after}=require('node:test'),b=JSON.parse(fs.readFileSync(batchFile)),{scenarioPlan}=require('./mass-certification21.cjs'),{definitionFingerprint}=require('../dist/cardRegistry'),{getEffectModel}=require('../dist/effectModels'),r=require('../dist/effectRegistry');const rows=[];
 for(const c of b.candidates){const row={id:c.card.id,fingerprint:definitionFingerprint(c.card,c.effect,{monster:()=>c.monster,model:getEffectModel}),resolverVersion:'engine-v9',activePublicEngine:true,sandboxAdmission:process.env.CARD_BATCH_SANDBOX==='1',exitCode:0,suites:[suite],suiteHashes:{[suite]:hash(fs.readFileSync(suite))},passed:[],failed:[]};rows.push(row);
  for(const scenario of scenarioPlan(c)){test(b.batchId+' '+c.card.englishName+': '+scenario.name,()=>{try{
   if(scenario.name==='identity'){const h=require('../catalog/historical/2004-10-01/cards.json').find(h=>h.konamiId===c.card.konamiId);assert.ok(h?.passwords.includes(c.card.id));assert.equal(h.names.en,c.card.englishName);assert.ok(h.firstObserved.world<='2004-09-30');assert.equal(r.getCardStatus(c.card.id)?.stage,'certified');}
   else{const spec=c.cases?.[scenario.name];assert.ok(spec,'Unimplemented scenario: '+scenario.name);const one=runCase(spec),two=runCase(clone(spec));assert.deepEqual(one.state,two.state,'Deterministic public-engine replay');if(scenario.name==='negative')assert.ok(one.rejections>0,'A negative case must actually reject an action');if(scenario.name==='json-restore')assert.ok(one.restores>0,'Restoration must actually be executed');if(scenario.name==='resolution')assert.ok(one.decisions>0,'Resolution must execute at least one real action');}
   row.passed.push(scenario.name);
  }catch(err){row.failed.push(scenario.name);row.exitCode=1;throw err;}});}
 }
 after(()=>{fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/executions-'+b.batchId+'.json',JSON.stringify(rows,null,2)+'\n');});
}
module.exports={runCase,registerBatch,fixture,safe};

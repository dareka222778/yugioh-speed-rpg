const {test}=require('node:test'),assert=require('node:assert/strict');
const {continuousRuleIssues}=require('../dist/continuousRules');
const {inferCapabilities,ACTIVE_CAPABILITIES}=require('../scripts/mass-certification21.cjs');
const rule={kind:'preventActivation',cardKind:'trap',controller:'opponent',window:'battle'};
test('activation restrictions have strict typed selectors and no monster-target filter',()=>{
 for(const cardKind of ['trap','quickplay'])for(const controller of ['opponent','both'])for(const window of ['battle','all'])assert.deepEqual(continuousRuleIssues([{...rule,cardKind,controller,window}]),[]);
 for(const patch of [{cardKind:'spell'},{controller:'self'},{window:'main'},{filter:{}},{negate:true},{cardKind:undefined},{window:null}])assert.ok(continuousRuleIssues([{...rule,...patch}]).length);
});
test('the admission gate requires the reusable active activation-restriction capability',()=>{
 const caps=inferCapabilities({effect:{kind:'monsterEffect'},monster:{effect:{trigger:'continuous',operation:{kind:'continuous',rules:[rule]}}}});
 assert.ok(caps.includes('continuous:preventActivation'));
 assert.ok(ACTIVE_CAPABILITIES.operations.includes('continuous:preventActivation'));
});

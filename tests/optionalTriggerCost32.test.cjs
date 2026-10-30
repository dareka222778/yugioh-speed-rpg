const {test}=require('node:test'),assert=require('node:assert/strict');
const {monsterDefinitionIssues}=require('../dist/monsterEffects'),{inferCapabilities}=require('../scripts/mass-certification21.cjs');
const definition=(operation={kind:'burn',amount:1000})=>({effect:{trigger:'flip',cost:{kind:'lp',amount:2000},operation},activation:{policy:'optional',window:'flip'}});
test('optional FLIP LP costs are explicitly admitted only for supported non-targeting LP operations',()=>{
 for(const kind of ['burn','heal'])assert.deepEqual(monsterDefinitionIssues(definition({kind,amount:1000})),[]);
 for(const patch of [{cost:{kind:'discard',count:1}},{cost:{kind:'tribute',count:1}},{cost:{kind:'lp',amount:0}},{cost:{kind:'lp',amount:-1}}]){const d=definition();Object.assign(d.effect,patch);assert.ok(monsterDefinitionIssues(d).length);}
 const mandatory=definition();mandatory.activation.policy='mandatory';assert.ok(monsterDefinitionIssues(mandatory).includes('unsupported-trigger-cost'));
 const targeted=definition({kind:'destroy',target:'anyMonster'});assert.ok(monsterDefinitionIssues(targeted).includes('unsupported-trigger-cost'));
});
test('a paid optional FLIP requires a distinct active capability in addition to the ordinary LP cost',()=>{
 const caps=inferCapabilities({effect:{kind:'monsterEffect'},monster:definition()});assert.ok(caps.includes('cost:lp'));assert.ok(caps.includes('trigger-cost:lp-optional-flip'));
});

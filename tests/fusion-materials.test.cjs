const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fusionMaterialsMatch}=require('../dist/fusionMaterials');
const isSubstitute=id=>['sub1','sub2'].includes(id);

test('exact Fusion recipes support arbitrary order and repeated named materials',()=>{
 assert.equal(fusionMaterialsMatch(['a','b'],['b','a'],isSubstitute),true);
 assert.equal(fusionMaterialsMatch(['a','a'],['a','a'],isSubstitute),true);
 assert.equal(fusionMaterialsMatch(['a','a'],['a','b'],isSubstitute),false);
 assert.equal(fusionMaterialsMatch(['a','b'],['a'],isSubstitute),false);
 assert.equal(fusionMaterialsMatch([],[],isSubstitute),false);
});

test('one named material may be substituted, never two or by an ordinary monster',()=>{
 assert.equal(fusionMaterialsMatch(['a','b'],['a','sub1'],isSubstitute),true);
 assert.equal(fusionMaterialsMatch(['a','b'],['sub1','b'],isSubstitute),true);
 assert.equal(fusionMaterialsMatch(['a','b'],['sub1','sub2'],isSubstitute),false);
 assert.equal(fusionMaterialsMatch(['a','b'],['a','other'],isSubstitute),false);
 assert.equal(fusionMaterialsMatch(['a','a'],['a','sub2'],isSubstitute),true);
 assert.equal(fusionMaterialsMatch(['a','a'],['sub1','sub2'],isSubstitute),false);
 assert.equal(fusionMaterialsMatch(['a','b'],['a','sub1'],()=>false),false);
});

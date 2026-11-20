const test=require('node:test');
const assert=require('node:assert/strict');
const {crosswalk,audit}=require('../scripts/audit-historical-admission.cjs');

test('a canonical engine ID resolves through any official historical password alias exactly once',()=>{
 const history=[{id:'history-dark-magician',konamiId:4041,passwords:['36996508','46986414','46986420']}];
 const result=crosswalk(history,[{id:'46986414',konamiId:4041}]);
 assert.equal(result.matches.length,1);
 assert.equal(result.matches[0].historicalId,'history-dark-magician');
 assert.equal(result.ambiguous.length,0);
 assert.equal(result.unmatched.length,0);
 assert.deepEqual(result.duplicateHistoricalMatches,[]);
});

test('two engine IDs cannot count the same historical identity twice',()=>{
 const history=[{id:'history-card',konamiId:5000,passwords:['11111111','22222222']}];
 const result=crosswalk(history,[
  {id:'11111111',konamiId:5000},
  {id:'22222222',konamiId:5000}
 ]);
 assert.equal(result.matches.length,2);
 assert.deepEqual(result.duplicateHistoricalMatches,[
  {historicalId:'history-card',engineIds:['11111111','22222222']}
 ]);
});

test('conflicting Konami identity and password identity are reported as ambiguous',()=>{
 const history=[
  {id:'history-a',konamiId:6001,passwords:['33333333']},
  {id:'history-b',konamiId:6002,passwords:['44444444']}
 ];
 const result=crosswalk(history,[{id:'33333333',konamiId:6002}]);
 assert.equal(result.matches.length,0);
 assert.equal(result.ambiguous.length,1);
 assert.deepEqual(result.ambiguous[0].candidateIds,['history-a','history-b']);
});

test('unknown playable IDs remain unmatched rather than being inferred',()=>{
 const result=crosswalk([{id:'history-a',konamiId:7001,passwords:['55555555']}],[{id:'66666666',konamiId:7002}]);
 assert.deepEqual(result.unmatched,['66666666']);
 assert.deepEqual(result.matches,[]);
 assert.deepEqual(result.duplicateHistoricalMatches,[]);
});

test('the current engine catalog has a one-to-one historical crosswalk and no import grants',()=>{
 const result=audit();
 assert.equal(result.matchedExistingCards,result.enabledEngineCards);
 assert.equal(result.uniqueHistoricalMatches,result.enabledEngineCards);
 assert.deepEqual(result.unmatched,[]);
 assert.deepEqual(result.ambiguous,[]);
 assert.deepEqual(result.duplicateHistoricalMatches,[]);
 assert.equal(result.cardsEnabledByImport,0);
 assert.equal(result.cardsGrantedByImport,0);
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const {indexTexts,sha256,verifyTextCache}=require('../scripts/index-full-text21.cjs');
const history=[{id:'unit',names:{en:'Unit fixture'},passwords:['00000001'],konamiId:100,kind:'monster',mechanics:[],firstObserved:{world:'2000-01-01'}}];
const cache=[{canonicalId:'unit',name:'Unit fixture',dbID:100,passwords:['00000001'],source:'https://raw.githubusercontent.com/iconmaster5326/YGOJSON/v1/individual/cards/unit.json',text:'FLIP: Draw 1 card. This unit fixture is not a real card.',fullDatasetRecordRead:true}];
test('full secondary text produces hashed discovery leads, never an implementation or certificate',()=>{const r=indexTexts(history,cache);assert.equal(r.withSecondaryText,1);assert.equal(r.unambiguousSourceRecords,1);assert.equal(r.automaticCertifications,0);assert.equal(r.cards[0].mechanicsEquivalent,false);assert.equal(r.cards[0].officialReviewRequired,true);assert.deepEqual(r.cards[0].discoveryFamilies,['draw-discard','flip-trigger']);assert.match(r.cards[0].secondaryTextSha256,/^[a-f0-9]{64}$/);});
test('duplicate, missing, truncated and wrong-identity source records remain explicit blockers',()=>{
 assert.ok(indexTexts(history,[...cache,...cache]).cards[0].issues.includes('duplicate-cache-identity'));
 assert.ok(indexTexts(history,[]).cards[0].issues.includes('missing-cache-record'));
 for(const patch of [{fullDatasetRecordRead:false},{source:'https://example.com'},{text:''}])assert.ok(indexTexts(history,[{...cache[0],...patch}]).cards[0].issues.includes('invalid-or-incomplete-secondary-record'));
 assert.ok(indexTexts(history,[{...cache[0],dbID:101}]).cards[0].issues.includes('secondary-identity-conflict'));
});
test('already certified aliases are excluded once and order is deterministic without mutating inputs',()=>{const before=JSON.stringify([history,cache]);assert.equal(indexTexts(history,cache,['00000001']).records,0);assert.deepEqual(indexTexts(history,cache),indexTexts(history,cache));assert.equal(JSON.stringify([history,cache]),before);});

test('cache checkpoint verifies file bytes and rejects tampering, missing files and extra batches',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'m21-cache-test-'));
 try{const bytes=Buffer.from(JSON.stringify(cache)),file=path.join(folder,'batch001.json');fs.writeFileSync(file,bytes);
  const manifest={records:1,cacheFiles:[{file:'batch001.json',bytes:bytes.length,sha256:sha256(bytes),records:1}]};
  assert.deepEqual(verifyTextCache(folder,manifest),{verified:true,files:1,records:1});
  fs.appendFileSync(file,' ');assert.throws(()=>verifyTextCache(folder,manifest),/SHA-256/);fs.writeFileSync(file,bytes);
  fs.writeFileSync(path.join(folder,'batch002.json'),'[]');assert.throws(()=>verifyTextCache(folder,manifest),/file set/);
  fs.unlinkSync(path.join(folder,'batch002.json'));fs.unlinkSync(file);assert.throws(()=>verifyTextCache(folder,manifest),/file set/);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});

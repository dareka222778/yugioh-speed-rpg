const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process'),crypto=require('node:crypto');
const {buildHistorical,writeSnapshot,verifySnapshot,outputs}=require('../scripts/import-historical.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'historical-import-'));
const card=(id,extra={})=>({id,cardType:'monster',text:{en:{name:'Card '+id},pt:{name:'Carta '+id}},passwords:['1234'],classifications:['normal'],atk:1000,def:900,level:4,...extra});
const product=(id,when,ids,region='tcg',extra={})=>({id,name:{en:'Product '+id},locales:{locale:{date:when,formats:[region]}},contents:[{cards:ids.map(card=>({card}))}],...extra});
test('deduplicates editions/art/locales/reprints by canonical identity, retaining alternate passwords and regional debut',()=>{
 const a=card('a',{passwords:['1234','00001235']}),b=card('b',{text:{en:{name:'Card a'}}});
 const p=product('p','2002-01-01',['a','a','b']);p.locales.other={date:'2002-01-01',formats:['tcg']};
 const out=buildHistorical([a,b],[product('j','1999-01-01',['a'],'ocg'),p,product('reprint','2003-01-01',['a'])]);
 assert.deepEqual(out.report.counts,{tcg:2,ocg:1,union:2,intersection:1});assert.equal(out.cards.length,2);assert.deepEqual(out.cards[0].passwords,['00001234','00001235']);assert.deepEqual(out.cards[0].firstObserved,{tcg:'2002-01-01',ocg:'1999-01-01',world:'1999-01-01'});assert.equal(out.releases.find(p=>p.productId==='reprint').newWorldCardIds.length,0);assert.equal(out.cards[1].namePTSource,null);
});
test('includes October 1, excludes later commercial anime cards and separates Sep 30 counts',()=>{
 const r=buildHistorical([card('old'),card('oct'),card('seal')],[product('old','2004-09-30',['old']),product('oct','2004-10-01',['oct']),product('seal','2012-10-02',['seal'])]);assert.equal(r.report.counts.union,2);assert.equal(r.report.previousDay.union,1);assert.ok(!r.cards.some(c=>c.id==='seal'));assert.equal(r.report.safety.animeCatalogDerived,false);
});
test('regional format wins over language/locale names; block fallback works only when locale format is absent',()=>{
 const p=product('jp-name','2000-01-01',['a'],'tcg');p.locales={jp:{date:'2000-01-01',formats:['tcg']}};p.contents[0].locales=['jp'];
 const q=product('block','2000-01-02',['a']);delete q.locales.locale.formats;q.contents[0].formats=['ocg'];const r=buildHistorical([card('a')],[p,q]);assert.equal(r.report.counts.tcg,1);assert.equal(r.report.counts.ocg,1);
});
test('excludes Skills/Tokens and flags empty or missing dated content without pretending completeness',()=>{
 const r=buildHistorical([card('a'),card('token',{cardType:'token'}),card('skill',{cardType:'skill'})],[product('p','2000-01-01',['a','token','skill']),product('empty','2000-01-01',[]),product('undated',null,['a'])]);assert.equal(r.cards.length,1);assert.deepEqual(r.releases.find(p=>p.productId==='p').excludedTypes,['skill','token']);assert.deepEqual(r.report.emptyProductIds.tcg,['empty']);assert.ok(r.report.diagnostics.some(d=>d.kind==='missing-or-invalid-release-date'));assert.match(r.report.completeness,/provisional/);
});
test('normal Ritual and Fusion monsters are never mislabeled as free main-deck Normal candidates',()=>{
 const r=buildHistorical([card('normal'),card('ritual',{monsterCardTypes:['ritual']}),card('fusion',{monsterCardTypes:['fusion']})],[product('p','2000-01-01',['normal','ritual','fusion'])]);assert.equal(r.report.normalMainCandidates,1);assert.equal(r.cards.find(c=>c.id==='ritual').normalMainCandidate,false);assert.equal(r.cards.find(c=>c.id==='fusion').normalMainCandidate,false);
});
test('duplicate canonical IDs fail; shared external IDs are diagnosed rather than merging different names/identities',()=>{
 assert.throws(()=>buildHistorical([card('a'),card('a')],[]),/duplicate/);const r=buildHistorical([card('a',{externalIDs:{dbID:1}}),card('b',{externalIDs:{dbID:1}})],[product('p','2000-01-01',['a','b'])]);assert.equal(r.cards.length,2);assert.ok(r.report.identityCollisions.some(c=>c.field==='konamiId'&&c.cardIds.length===2));
});
test('missing card references and unknown dates remain explicit diagnostics; invalid calendar dates are never guessed',()=>{
 const r=buildHistorical([card('a')],[product('missing','2000-01-01',['unknown']),product('bad','2001-02-30',['a'])]);assert.equal(r.cards.length,0);assert.ok(r.report.diagnostics.some(c=>c.kind==='missing-card-metadata'));assert.ok(r.report.diagnostics.some(c=>c.kind==='missing-or-invalid-release-date'));assert.throws(()=>buildHistorical([],[],{cutoff:'2004-02-30'}),/ISO/);
});
test('same-day products have a stable tie order and cannot count the same debut twice',()=>{
 const a=product('a','2000-01-01',['x']),b=product('b','2000-01-01',['x']);const first=buildHistorical([card('x')],[b,a]),second=buildHistorical([card('x')],[a,b]);assert.deepEqual(first,second);assert.equal(first.releases.reduce((n,p)=>n+p.newWorldCardIds.length,0),1);assert.match(first.report.sameDateOrder,/not a claim/);
});
test('factual output strips art/effect text, keeps unknown stats, and grants no admission',()=>{
 const c=card('a',{atk:'?',images:[{url:'https://private.invalid/art'}]});c.text.en.effect='Never copy this effect';const r=buildHistorical([c],[product('p','2000-01-01',['a'])]);assert.equal(r.cards[0].atk,'?');assert.equal(r.cards[0].staging.releaseAuthorization,'not-granted-by-import');const text=JSON.stringify(outputs(r));assert.ok(!text.includes('Never copy'));assert.ok(!text.includes('private.invalid'));assert.equal(r.report.safety.cardsEnabled,0);assert.equal(r.report.safety.cardsGranted,0);
});
test('CSV neutralizes formula-leading names without changing canonical JSON names',()=>{
 const r=buildHistorical([card('a',{text:{en:{name:'=1+1'}}})],[product('p','2000-01-01',['a'])]);assert.equal(r.cards[0].names.en,'=1+1');assert.ok(outputs(r)['cards.csv'].includes("'=1+1"));
});
test('snapshot rerun is byte-identical/idempotent; changed input cannot overwrite or erase existing files',()=>{
 const out=path.join(temp,'snapshot'),r=buildHistorical([card('a')],[product('p','2000-01-01',['a'])]);assert.equal(writeSnapshot(out,r).status,'created');const before=fs.statSync(path.join(out,'cards.json')).mtimeMs;assert.equal(writeSnapshot(out,r).status,'unchanged');assert.equal(fs.statSync(path.join(out,'cards.json')).mtimeMs,before);const modified=structuredClone(r);modified.cards[0].names.en='Changed';assert.throws(()=>writeSnapshot(out,modified),/no overwrite/);assert.equal(JSON.parse(fs.readFileSync(path.join(out,'cards.json')))[0].names.en,'Card a');const m=JSON.parse(fs.readFileSync(path.join(out,'manifest.json')));for(const [f,proof]of Object.entries(m.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex'),proof.sha256);
});
test('protected engine/data output paths and symlink aliases are rejected before writes',()=>{
 const r=buildHistorical([],[]),repo=path.resolve(__dirname,'..');for(const dir of ['src','data','dist','scripts','tests','node_modules','.git'])assert.throws(()=>writeSnapshot(path.join(repo,dir,'history-test'),r),/Protected/);const link=path.join(temp,'alias');fs.symlinkSync(path.join(repo,'src'),link,'dir');assert.throws(()=>writeSnapshot(path.join(link,'history-test'),r),/Protected/);
});
test('CLI verifies source hashes and preserves unrelated database sentinel and playable registry',()=>{
 const dir=path.join(temp,'cli');fs.mkdirSync(dir);const c=path.join(dir,'cards.json'),s=path.join(dir,'sets.json'),db=path.join(dir,'sentinel.sqlite'),out=path.join(dir,'result');fs.writeFileSync(c,JSON.stringify([card('a')]));fs.writeFileSync(s,JSON.stringify([product('p','2000-01-01',['a'])]));fs.writeFileSync(db,'DO NOT MODIFY');const {enabledCardIds}=require('../dist/effectRegistry'),before=[...enabledCardIds];const args=['scripts/import-historical.cjs','--cards',c,'--sets',s,'--output',out,'--retrieved-on','2026-10-25'];
 let run=spawnSync(process.execPath,[...args,'--expected-cards-sha256','bad'],{encoding:'utf8'});assert.notEqual(run.status,0);assert.match(run.stderr,/SHA-256 mismatch/);assert.ok(!fs.existsSync(out));run=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).union,1);assert.equal(fs.readFileSync(db,'utf8'),'DO NOT MODIFY');assert.deepEqual(enabledCardIds,before);assert.equal(enabledCardIds.length,150);
});
test('snapshot verification detects tampering and rejects a forged traversal in the manifest',()=>{
 const out=path.join(temp,'verify'),r=buildHistorical([card('a')],[product('p','2000-01-01',['a'])]);writeSnapshot(out,r);assert.equal(verifySnapshot(out).union,1);const target=path.join(out,'cards.csv'),bytes=fs.readFileSync(target);fs.appendFileSync(target,'tampered');assert.throws(()=>verifySnapshot(out),/checksum/);fs.writeFileSync(target,bytes);const m=JSON.parse(fs.readFileSync(path.join(out,'manifest.json')));m.files['../../sentinel']={sha256:'anything',bytes:0};fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(m));assert.throws(()=>verifySnapshot(out),/file list/);
});
test('published historical snapshot is internally consistent and keeps the prior historical count provisional',()=>{
 const dir=path.resolve(__dirname,'../catalog/historical/2004-10-01'),verified=verifySnapshot(dir),audit=JSON.parse(fs.readFileSync(path.join(dir,'audit.json')));assert.deepEqual({tcg:verified.tcg,ocg:verified.ocg,union:verified.union,intersection:verified.intersection},{tcg:1482,ocg:1897,union:1962,intersection:1417});assert.equal(audit.previousDay.tcg,1422);assert.equal(audit.emptyProductIds.tcg.length,3);assert.equal(audit.emptyProductIds.ocg.length,21);assert.match(verified.completeness,/provisional/);assert.equal(audit.safety.cardsEnabled,0);assert.equal(audit.normalMainCandidates,584);
});
test('existing admitted catalog links to history without importing any historical card into gameplay',()=>{
 const {audit}=require('../scripts/audit-historical-admission.cjs'),r=audit();assert.equal(r.enabledEngineCards,150);assert.equal(r.matchedExistingCards,150);assert.equal(r.uniqueHistoricalMatches,150);assert.deepEqual(r.unmatched,[]);assert.deepEqual(r.ambiguous,[]);assert.equal(r.cardsEnabledByImport,0);assert.equal(r.cardsGrantedByImport,0);
});
test('crosswalk retains alternate passwords and never falls back to a matching name',()=>{
 const {crosswalk}=require('../scripts/audit-historical-admission.cjs'),history=[{id:'canonical',konamiId:12,passwords:['00000001','00000002'],names:{en:'Same name'}}];const r=crosswalk(history,[{id:'00000002',konamiId:null},{id:'99999999',konamiId:null,name:'Same name'}]);assert.equal(r.matches[0].historicalId,'canonical');assert.equal(r.matches[0].matchedBy,'password');assert.deepEqual(r.unmatched,['99999999']);
});
test('conflicting canonical identifiers are quarantined instead of silently choosing a match',()=>{
 const {crosswalk}=require('../scripts/audit-historical-admission.cjs');const r=crosswalk([{id:'a',konamiId:1,passwords:['00000001']},{id:'b',konamiId:2,passwords:['00000002']}],[{id:'00000002',konamiId:1}]);assert.equal(r.matches.length,0);assert.equal(r.ambiguous.length,1);
});
test('factual replay projection reproduces the audit without art or effect text, including missing references',()=>{
 const {projectInputs,expandInputs}=require('../scripts/historical-replay.cjs'),cards=[card('a',{images:['private-art']}),card('outside')],sets=[product('p','2000-01-01',['a','missing']),product('future','2012-01-01',['outside'])];cards[0].text.en.effect='Do not publish this text';const p=projectInputs(cards,sets,new Set(['a'])),expanded=expandInputs(p);assert.deepEqual(buildHistorical(expanded.cards,expanded.sets),buildHistorical(cards,sets));assert.ok(!JSON.stringify(p).includes('private-art'));assert.ok(!JSON.stringify(p).includes('Do not publish'));assert.deepEqual(p.unknownReferences,['missing']);
});
test('out-of-bounds replay references fail instead of manufacturing a card',()=>{
 const {projectInputs,expandInputs}=require('../scripts/historical-replay.cjs'),p=projectInputs([card('a')],[product('p','2000-01-01',['a'])],new Set(['a']));p.sets[0].contents[0].cardIndices=[999];assert.throws(()=>expandInputs(p),/reference index/);
});
test('durable factual input archive reproduces every published snapshot output byte for byte',()=>{
 const {verifyReplay}=require('../scripts/historical-replay.cjs'),r=verifyReplay();assert.equal(r.status,'reproduced-byte-for-byte');assert.equal(r.union,1962);assert.equal(r.inputCards,14616);assert.equal(r.inputProducts,3306);
});
after(()=>fs.rmSync(temp,{recursive:true,force:true}));

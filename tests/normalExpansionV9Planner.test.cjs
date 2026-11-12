'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {planNormalExpansion,REVIEW_REQUIREMENTS}=require('../scripts/plan-normal-expansion-v9.cjs');

const makeCard=(id,overrides={})=>({
 id:'history-'+id,
 konamiId:1000+Number(id.slice(-3)),
 passwords:[id],
 name:'Fixture '+id,
 names:{en:'Fixture '+id},
 kind:'monster',
 mechanics:[],
 normalMainCandidate:true,
 firstObserved:{world:'2000-01-01',ocg:'1999-01-01',tcg:'2002-01-01'},
 level:4,atk:1500,def:1200,race:'warrior',attribute:'earth',
 ...overrides
});

test('planner returns only unique, current-v9-missing TCG Normal Monsters before the cutoff',()=>{
 const historical=[
  makeCard('22222222',{firstObserved:{world:'2000-01-01',ocg:'1999-01-01',tcg:'2002-01-01'}}),
  makeCard('11111111',{firstObserved:{world:'2000-01-01',ocg:'1999-01-01',tcg:'2003-01-01'}}),
  makeCard('33333333',{firstObserved:{world:'2000-01-01',ocg:'1999-01-01',tcg:null}}),
  makeCard('44444444',{firstObserved:{world:'2000-01-01',ocg:'1999-01-01',tcg:'2005-01-01'}}),
  makeCard('55555555',{firstObserved:{world:'2005-01-01',ocg:'2000-01-01',tcg:'2002-01-01'}}),
  makeCard('66666666',{passwords:['66666666','66666667']}),
  makeCard('bad-id',{passwords:['bad-id']}),
  makeCard('77777777'),
  makeCard('77777777',{id:'history-duplicate'}),
  makeCard('88888888'),
  makeCard('99999999'),
  makeCard('10101010',{level:0}),
  makeCard('12121212',{normalMainCandidate:false})
 ];
 const snapshot={engineVersion:'engine-v9',revision:'a'.repeat(64),cards:[{id:'99999999'}],certificates:{'88888888':{fingerprint:'b'.repeat(64)}}};
 const report=planNormalExpansion(historical,snapshot);
 assert.deepEqual(report.candidates.map(card=>card.id),['22222222','11111111']);
 assert.equal(report.candidateCount,2);
 assert.equal(report.enabledBefore,1);
 assert.equal(report.certifiedBefore,1);
 assert.equal(report.excluded.missingTcgDate,1);
 assert.equal(report.excluded.tcgAfterCutoff,1);
 assert.equal(report.excluded.worldAfterCutoff,1);
 assert.equal(report.excluded.ambiguousPasscode,1);
 assert.equal(report.excluded.invalidPasscode,1);
 assert.equal(report.excluded.duplicatePasscode,2);
 assert.equal(report.excluded.alreadyCatalogued,2);
 assert.equal(report.excluded.invalidMetadata,1);
 assert.equal(report.candidates[0].sourceUrl,'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=1222&request_locale=en');
 assert.equal(report.candidates[0].sourceStatus,'official-lookup-required-not-yet-verified');
 assert.deepEqual(report.candidates[0].reviewRequirements,REVIEW_REQUIREMENTS);
 assert.equal(report.enablesCards,false);
 assert.equal(report.grantsInventory,false);
 assert.equal(report.releaseAuthorized,false);
 assert.equal(report.basis,'planning-only-not-certification');
 assert.equal(Object.hasOwn(report.candidates[0],'certificate'),false);
});

test('planner rejects repeated canonical and Konami identities across the historical source',()=>{
 const historical=[
  makeCard('13131313',{id:'shared-canonical'}),
  makeCard('14141414',{id:'shared-canonical',normalMainCandidate:false}),
  makeCard('15151515',{id:'konami-a',konamiId:1515}),
  makeCard('16161616',{id:'konami-b',konamiId:1515,normalMainCandidate:false}),
  makeCard('17171717',{id:'unique-canonical',konamiId:1717})
 ];
 const snapshot={engineVersion:'engine-v9',revision:'a'.repeat(64),cards:[],certificates:{}};
 const report=planNormalExpansion(historical,snapshot);
 assert.deepEqual(report.candidates.map(card=>card.id),['17171717']);
 assert.equal(report.excluded.duplicateCanonicalIdentity,1);
 assert.equal(report.excluded.duplicateKonamiId,1);
 assert.equal(new Set(report.candidates.map(card=>card.historicalCanonicalId)).size,report.candidateCount);
 assert.equal(new Set(report.candidates.map(card=>card.konamiId)).size,report.candidateCount);
});

test('planner rejects incomplete snapshots and malformed cutoff dates',()=>{
 assert.throws(()=>planNormalExpansion([],{}),/complete engine-v9 catalog snapshot/);
 assert.throws(()=>planNormalExpansion([],{cards:[],certificates:{}},{cutoff:'2004-13-99'}),/Invalid historical cutoff/);
});

test('real engine-v9 plan is deterministic and cannot include an enabled or certified identity',()=>{
 const root=path.resolve(__dirname,'..');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'catalog','engine-v9','manifest.json'),'utf8'));
 const snapshot=JSON.parse(fs.readFileSync(path.join(root,'catalog','engine-v9',manifest.current+'.json'),'utf8'));
 snapshot.revision=manifest.current;
 const historicalBytes=fs.readFileSync(path.join(root,'catalog','historical','2004-10-01','cards.json'));
 const historical=JSON.parse(historicalBytes.toString('utf8'));
 const sourceSha256=crypto.createHash('sha256').update(historicalBytes).digest('hex');
 const first=planNormalExpansion(historical,snapshot,{sourceSha256});
 const second=planNormalExpansion(historical,snapshot,{sourceSha256});
 const enabled=new Set(snapshot.cards.map(card=>card.id));
 const certified=new Set(Object.keys(snapshot.certificates));
 assert.deepEqual(first,second);
 assert.equal(first.snapshotRevision,manifest.current);
 assert.equal(first.sourceSha256,sourceSha256);
 assert.equal(first.candidateCount,first.candidates.length);
 assert.equal(new Set(first.candidates.map(card=>card.id)).size,first.candidateCount);
 assert.equal(new Set(first.candidates.map(card=>card.historicalCanonicalId)).size,first.candidateCount);
 assert.equal(new Set(first.candidates.map(card=>card.konamiId)).size,first.candidateCount);
 assert.ok(first.candidates.every(card=>!enabled.has(card.id)&&!certified.has(card.id)));
 assert.ok(first.candidates.every(card=>card.firstObserved.world<='2004-09-30'&&card.firstObserved.tcg<='2004-09-30'));
 assert.ok(first.candidates.every(card=>card.reviewRequirements.length===REVIEW_REQUIREMENTS.length));
 assert.equal(first.enablesCards,false);
 assert.equal(first.grantsInventory,false);
 assert.equal(first.releaseAuthorized,false);
 console.log('engine-v9 historical Normal planning candidates:',first.candidateCount,'of',first.normalCandidateRecords,'normal historical records');
});

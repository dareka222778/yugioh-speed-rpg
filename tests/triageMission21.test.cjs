const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {triage,category,evidenceRecords,inventory}=require('../scripts/triage-mission21.cjs');
const fp='f'.repeat(64),source='https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=100&request_locale=en';
// Synthetic unit fixtures describe gate behavior, not historical evidence for a real card.
function history(extra={}){return {id:'synthetic-a',names:{en:'Synthetic Normal'},kind:'monster',passwords:['00000001'],konamiId:100,attribute:'earth',race:'warrior',level:4,atk:1000,def:800,classifications:['normal'],mechanics:[],firstObserved:{tcg:'2004-06-01',ocg:'2005-01-01',world:'2004-06-01'},...extra};}
function card(extra={}){return {id:'00000001',konamiId:100,name:'Synthetic Normal',englishName:'Synthetic Normal',kind:'monster',monsterType:'normal',attribute:'EARTH',race:'Warrior',level:4,atk:1000,defense:800,source,...extra};}
function runtime(extra={}){return {resolverVersion:'synthetic-test',cards:[],enabled:[],effects:{},monsters:{},certificates:{},fingerprints:{},validDefinitions:{},...extra};}
function review(extra={}){return {id:'00000001',canonicalId:'synthetic-a',konamiId:100,identityApproved:true,primarySource:source,reviewer:'synthetic-test',reviewedAt:'2026-10-28',primaryFacts:{level:4,atk:1000,defense:800,attribute:'EARTH',race:'Warrior'},verifiedPrinting:{region:'tcg',date:'2004-06-01',set:'SYNTHETIC-001',source},evidenceFile:'synthetic-review-only',...extra};}
function represented(extra={}){return runtime({cards:[card()],effects:{'00000001':{kind:'normal'}},fingerprints:{'00000001':fp},validDefinitions:{'00000001':true},...extra});}
test('M21 triage distinguishes Fusion and Ritual mechanics from Normal classification',()=>{
 assert.equal(category(history()),'normal-monster');assert.equal(category(history({mechanics:['fusion'],classifications:[]})),'fusion');
 assert.equal(category(history({mechanics:['ritual']})),'ritual-monster');assert.equal(category(history({mechanics:['fusion'],classifications:['effect']})),'fusion');
 assert.equal(category(history({kind:'spell'})),'spell');assert.equal(category(history({kind:'trap'})),'trap');assert.equal(category(history({classifications:['effect']})),'effect-monster');
});
test('M17 imported rows never become implemented, tested or certified from text or eligibility',()=>{
 const result=triage([history()],runtime()),row=result.records[0];assert.equal(row.highestRecordedStage,'imported');assert.deepEqual(row.lifecycle,{imported:true,identityVerified:false,mechanicRepresented:false,tested:false,certified:false});assert.equal(row.eligibility.eligibleByImport,true);assert.equal(row.certificationAllowed,false);assert.equal(result.mutationPolicy.automaticCertifications,0);
});
test('M17 reviewed identity can precede mechanic representation and uses verified TCG eligibility separately',()=>{
 const row=triage([history()],runtime(),{reviews:[review()]}).records[0];assert.equal(row.lifecycle.identityVerified,true);assert.equal(row.lifecycle.mechanicRepresented,false);assert.equal(row.highestRecordedStage,'identity-verified');assert.equal(row.eligibility.verifiedPrintings[0].region,'tcg');
});
test('M17 mismatching CID, canonical identity, stats or source does not verify identity',()=>{
 for(const r of [review({konamiId:101}),review({canonicalId:'other'}),review({primarySource:source.replace('cid=100','cid=101')}),review({primaryFacts:{...review().primaryFacts,atk:1001}})])assert.equal(triage([history()],runtime(),{reviews:[r]}).records[0].lifecycle.identityVerified,false);
});
test('M17 mechanical representation is distinct from tests and a certificate',()=>{
 const row=triage([history()],represented()).records[0];assert.equal(row.highestRecordedStage,'mechanic-represented');assert.equal(row.lifecycle.tested,false);assert.equal(row.lifecycle.certified,false);
 const invalid=triage([history()],represented({validDefinitions:{'00000001':false}})).records[0];assert.equal(invalid.lifecycle.mechanicRepresented,false);
});
test('M17 a current successful execution fingerprint can establish tested before certification',()=>{
 const execution={id:'00000001',fingerprint:fp,passed:['mechanic'],failed:[],evidenceFile:'synthetic-execution-only'},row=triage([history()],represented(),{executions:[execution]}).records[0];assert.equal(row.highestRecordedStage,'tested');assert.equal(row.lifecycle.certified,false);
 for(const e of [{...execution,fingerprint:'0'.repeat(64)},{...execution,failed:['mechanic']},{...execution,passed:[]}])assert.equal(triage([history()],represented(),{executions:[e]}).records[0].lifecycle.tested,false);
});
test('M17 an existing certificate remains certified while absent historical artifacts stay explicit',()=>{
 const row=triage([history()],represented({enabled:['00000001'],certificates:{'00000001':{fingerprint:fp,suites:['tests/synthetic.test.cjs']}}})).records[0];assert.equal(row.highestRecordedStage,'certified');assert.equal(row.lifecycle.tested,false);assert.equal(row.lifecycle.identityVerified,false);assert.ok(row.evidence.gaps.includes('fingerprinted-execution-manifest-not-recovered'));assert.equal(row.needsWork,false);
});
test('M17 duplicate canonical IDs, CIDs and passcodes flag every colliding record',()=>{
 const result=triage([history(),history({names:{en:'Other'}})],runtime());assert.equal(result.counts.pendingWithIdentityIssues,2);for(const row of result.records)for(const key of ['canonical:synthetic-a','cid:100','passcode:00000001'])assert.ok(row.identityIssues.includes('identity-collision:'+key));
});
test('M17 missing or multiple passcodes are identity problems without invented primary identities',()=>{
 const result=triage([history({passwords:[]}),history({id:'synthetic-b',konamiId:101,passwords:['00000002','00000003']})],runtime());assert.deepEqual(result.records.map(r=>r.id),[null,null]);assert.ok(result.records.every(r=>r.identityIssues.includes('primary-passcode-review')));assert.ok(result.implementationQueue.every(r=>r.priority===4));
});
test('M17 M13 examples stay incomplete leads even when short; 300-character entries are flagged',()=>{
 const prior={groups:[{family:'spell:simple-burn-heal-draw',matchingCards:100,examples:[{id:'00000001',description:'x'.repeat(300)}]}]},row=triage([history({kind:'spell'})],runtime(),{prior}).records[0];assert.equal(row.lifecycle.mechanicRepresented,false);assert.equal(row.discoveryText.truncatedLeadCount,1);assert.equal(row.discoveryText.fullOfficialTextCached,false);assert.equal(row.mechanic.keywordEquivalenceApproved,false);assert.ok(row.mechanic.dependenciesRequiringReview.includes('simultaneous-vs-sequential'));
 const report=triage([history({kind:'spell'})],runtime(),{prior});assert.equal(report.familyQueue[0].knownPendingLeadCount,1);assert.equal(report.familyQueue[0].membershipComplete,false);
});
test('M17 full text cache requires content hash, complete attestation and matching official identity',()=>{
 const fullText='Synthetic text for a unit gate only.',fullTextSha256=crypto.createHash('sha256').update(fullText).digest('hex'),record={id:'00000001',konamiId:100,source,fullText,fullTextSha256,fullTextComplete:true};
 assert.equal(evidenceRecords(record,'synthetic-cache').texts.length,1);assert.equal(evidenceRecords({...record,fullTextSha256:'bad'},'synthetic-cache').texts.length,0);
 const report=triage([history()],runtime(),{texts:evidenceRecords(record,'synthetic-cache').texts});assert.equal(report.records[0].discoveryText.fullOfficialTextCached,true);assert.equal(report.records[0].lifecycle.mechanicRepresented,false);
 assert.equal(triage([history()],runtime(),{texts:[{...record,konamiId:101}]}).records[0].discoveryText.fullOfficialTextCached,false);
});
test('M17 discovery and execution extraction do not infer successful tests from an arbitrary passed array',()=>{
 const result=evidenceRecords({cards:[{id:'00000001',fingerprint:fp,passed:['mechanic']}]},'synthetic');assert.equal(result.executions.length,0);
 assert.equal(evidenceRecords({cards:[{id:'00000001',fingerprint:fp,passed:['mechanic'],failed:[]}]},'synthetic').executions.length,1);
});
test('M17 inventory separates structural data, typed declarative effects and specialized legacy handlers',()=>{
 const r=runtime({cards:[card(),card({id:'00000002'}),card({id:'00000003'}),card({id:'00000004'})],effects:{'00000001':{kind:'normal'},'00000002':{kind:'fusion'},'00000003':{kind:'sequence',operations:[{kind:'draw',count:1}]},'00000004':{kind:'cardDestruction'}}}),result=inventory(r);assert.equal(result.counts.structural,2);assert.equal(result.counts.declarative,1);assert.equal(result.counts.specialized,1);assert.equal(result.observedOperations.draw,1);
});
test('M21 triage is deterministic, rejects invalid cutoff and never mutates runtime or imported evidence',()=>{
 const h=[history()],r=represented(),options={reviews:[review()]},before=JSON.stringify({h,r,options}),a=triage(h,r,options),b=triage(h,r,options);assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(JSON.stringify({h,r,options}),before);assert.throws(()=>triage(h,r,{cutoff:'2004-02-31'}));
});

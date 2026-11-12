#!/usr/bin/env node
'use strict';
// Read-only planner for historical Normal Monsters against the current engine-v9 snapshot.
// A plan is not a review, certificate, admission, inventory grant or release authorization.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const DEFAULT_CUTOFF='2004-09-30';
const REVIEW_REQUIREMENTS=[
 'official-identity-and-card-facts',
 'historical-tcg-printing',
 'name-and-stat-normalization',
 'mechanical-fingerprint',
 'normal-monster-regression',
 'explicit-certificate',
 'release-authorization'
];
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const validPasscode=value=>typeof value==='string'&&/^\d{8}$/.test(value);
const positiveInteger=value=>Number.isSafeInteger(value)&&value>0;
const nonNegativeInteger=value=>Number.isSafeInteger(value)&&value>=0;

function planNormalExpansion(historical,snapshot,{cutoff=DEFAULT_CUTOFF,sourceSha256=null}={}){
 if(!Array.isArray(historical))throw new TypeError('Historical card source must be an array.');
 if(!snapshot||!Array.isArray(snapshot.cards)||!snapshot.certificates||typeof snapshot.certificates!=='object'||Array.isArray(snapshot.certificates))throw new TypeError('A complete engine-v9 catalog snapshot is required.');
 if(!validDate(cutoff))throw new Error('Invalid historical cutoff: '+cutoff);
 const catalogIds=new Set(snapshot.cards.map(card=>card?.id).filter(id=>typeof id==='string'));
 const certificateIds=new Set(Object.keys(snapshot.certificates));
 const passcodeCounts=new Map();
 for(const card of historical)for(const id of Array.isArray(card?.passwords)?card.passwords:[])passcodeCounts.set(id,(passcodeCounts.get(id)??0)+1);
 const excluded={
  missingWorldDate:0,worldAfterCutoff:0,missingTcgDate:0,tcgAfterCutoff:0,
  ambiguousPasscode:0,invalidPasscode:0,duplicatePasscode:0,alreadyCatalogued:0,invalidMetadata:0
 };
 const candidates=[];
 let normalCandidateRecords=0;
 for(const card of historical){
  if(card?.normalMainCandidate!==true)continue;
  normalCandidateRecords++;
  const observed=card.firstObserved??{};
  if(!validDate(observed.world)){excluded.missingWorldDate++;continue;}
  if(observed.world>cutoff){excluded.worldAfterCutoff++;continue;}
  if(!validDate(observed.tcg)){excluded.missingTcgDate++;continue;}
  if(observed.tcg>cutoff){excluded.tcgAfterCutoff++;continue;}
  if(!Array.isArray(card.passwords)||card.passwords.length!==1){excluded.ambiguousPasscode++;continue;}
  const id=card.passwords[0];
  if(!validPasscode(id)){excluded.invalidPasscode++;continue;}
  if(passcodeCounts.get(id)!==1){excluded.duplicatePasscode++;continue;}
  if(catalogIds.has(id)||certificateIds.has(id)){excluded.alreadyCatalogued++;continue;}
  const names=card.names;
  if(card.kind!=='monster'||card.mechanics?.includes('fusion')||!names||typeof names.en!=='string'||!names.en.trim()||
     !positiveInteger(card.konamiId)||!Number.isSafeInteger(card.level)||card.level<1||card.level>12||
     !nonNegativeInteger(card.atk)||!nonNegativeInteger(card.def)||
     typeof card.race!=='string'||!card.race.trim()||typeof card.attribute!=='string'||!card.attribute.trim()){
   excluded.invalidMetadata++;continue;
  }
  candidates.push({
   id,
   konamiId:card.konamiId,
   historicalCanonicalId:card.id,
   name:names.en,
   names,
   facts:{level:card.level,atk:card.atk,def:card.def,race:card.race,attribute:card.attribute},
   firstObserved:{world:observed.world,ocg:observed.ocg??null,tcg:observed.tcg},
   sourceUrl:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid='+card.konamiId+'&request_locale=en',
   sourceStatus:'official-lookup-required-not-yet-verified',
   reviewRequirements:[...REVIEW_REQUIREMENTS]
  });
 }
 candidates.sort((a,b)=>a.firstObserved.tcg.localeCompare(b.firstObserved.tcg)||a.id.localeCompare(b.id));
 return {
  format:1,
  kind:'historical-normal-expansion-plan',
  basis:'planning-only-not-certification',
  status:'review-required-not-admitted',
  cutoff,
  source:'catalog/historical/2004-10-01/cards.json',
  sourceSha256,
  engineVersion:snapshot.engineVersion??'engine-v9',
  snapshotRevision:snapshot.revision??null,
  enabledBefore:snapshot.cards.length,
  certifiedBefore:certificateIds.size,
  normalCandidateRecords,
  candidateCount:candidates.length,
  excluded,
  enablesCards:false,
  grantsInventory:false,
  releaseAuthorized:false,
  candidates
 };
}

function main(args=process.argv.slice(2)){
 if(args.length>1)throw new Error('Usage: npm run plan:normal-v9');
 const root=path.resolve(__dirname,'..');
 const historicalPath=path.join(root,'catalog','historical','2004-10-01','cards.json');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'catalog','engine-v9','manifest.json'),'utf8'));
 if(!Array.isArray(manifest.revisions)||typeof manifest.current!=='string')throw new Error('Invalid engine-v9 manifest.');
 const snapshot=JSON.parse(fs.readFileSync(path.join(root,'catalog','engine-v9',manifest.current+'.json'),'utf8'));
 snapshot.revision=manifest.current;
 const bytes=fs.readFileSync(historicalPath);
 const historical=JSON.parse(bytes.toString('utf8'));
 const report=planNormalExpansion(historical,snapshot,{sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 console.log(JSON.stringify(report,null,2));
 return report;
}
if(require.main===module){try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={planNormalExpansion,main,REVIEW_REQUIREMENTS};

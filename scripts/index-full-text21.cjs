/** Index secondary discovery evidence without admitting cards or copying texts into Git. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
const leads=[
 ['ritual',/ritual summon|ritual spell/i],['fusion',/fusion summon|fusion material/i],
 ['continuous-stat',/gains? \d+ (?:ATK|DEF)|(?:ATK|DEF).*(?:increase|decrease|equal)/i],
 ['direct-attack',/attack.*directly/i],['piercing',/piercing battle damage/i],
 ['search',/(?:add|special summon).*from (?:your |the )?deck/i],
 ['grave-recovery',/(?:graveyard|\bGY\b).*(?:hand|summon)|(?:hand|summon).*(?:graveyard|\bGY\b)/i],
 ['destruction',/destroy/i],['banishment',/banish|remove.*from play/i],
 ['draw-discard',/draw|discard/i],['lp',/(?:damage|LP|Life Points)/i],
 ['flip-trigger',/\bFLIP\b/i],['tribute',/tribute/i],['negation',/negat/i],
 ['duration-or-phase',/(?:end|standby|battle|draw|main) phase|until.*turn/i],
 ['control-or-position',/control|battle position/i],['summon-restriction',/cannot be.*summon|must.*summon/i]
];
function indexTexts(history,cache,enabled=[]){
 if(!Array.isArray(history)||!Array.isArray(cache)||!Array.isArray(enabled))throw Error('Expected arrays');
 const buckets=new Map();for(const row of cache){if(!row||typeof row.canonicalId!=='string')throw Error('Missing canonical cache identity');const b=buckets.get(row.canonicalId)??[];b.push(row);buckets.set(row.canonicalId,b);}
 const familyCounts={},records=[];for(const h of history){if(h.passwords.some(id=>enabled.includes(id)))continue;
  const candidates=buckets.get(h.id)??[],c=candidates.length===1?candidates[0]:null,issues=[];
  if(candidates.length!==1)issues.push(candidates.length?'duplicate-cache-identity':'missing-cache-record');
  const expected=`https://raw.githubusercontent.com/iconmaster5326/YGOJSON/v1/individual/cards/${h.id}.json`;
  if(c&&(c.source!==expected||c.fullDatasetRecordRead!==true||typeof c.text!=='string'||!c.text.trim()))issues.push('invalid-or-incomplete-secondary-record');
  if(c&&(c.name!==h.names.en||c.dbID!==h.konamiId||!Array.isArray(c.passwords)||h.passwords.some(id=>!c.passwords.includes(id))))issues.push('secondary-identity-conflict');
  if(!h.konamiId||!h.passwords.length)issues.push('missing-official-identity-or-passcode');
  const families=c&&typeof c.text==='string'?leads.filter(([,pattern])=>pattern.test(c.text)).map(([name])=>name):[];
  for(const f of families)familyCounts[f]=(familyCounts[f]??0)+1;
  records.push({canonicalId:h.id,name:h.names.en,passwords:h.passwords,konamiId:h.konamiId,kind:h.kind,subcategory:h.subcategory,mechanics:h.mechanics,eligibleDates:h.firstObserved,source:c?.source??expected,secondaryTextSha256:typeof c?.text==='string'?sha256(c.text):null,textCharacters:typeof c?.text==='string'?c.text.length:0,discoveryFamilies:families,issues,officialReviewRequired:true,mechanicsEquivalent:false,certificationGranted:false});
 }
 records.sort((a,b)=>a.canonicalId.localeCompare(b.canonicalId));
 return {format:1,scope:'Complete secondary-text discovery index. Pattern matches are review leads, never proof of mechanical equivalence, complete engine support or official text review.',records:records.length,withSecondaryText:records.filter(r=>r.secondaryTextSha256).length,identityConflicts:records.filter(r=>r.issues.includes('secondary-identity-conflict')).length,unambiguousSourceRecords:records.filter(r=>!r.issues.length).length,automaticCertifications:0,distributionChanges:0,familyQueue:Object.entries(familyCounts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([family,discoveryLeads])=>({family,discoveryLeads,individuallyReviewFullText:true})),cards:records};
}
function verifyTextCache(folder,index){
 if(!Array.isArray(index.cacheFiles)||!index.cacheFiles.length)throw Error('Cache manifest required');
 const expected=index.cacheFiles.map(f=>f.file).sort(),actual=fs.readdirSync(folder).filter(n=>/^batch\d+\.json$/.test(n)).sort();
 if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Cache file set mismatch');
 let records=0;for(const f of index.cacheFiles){if(!/^batch\d+\.json$/.test(f.file))throw Error('Invalid cache filename');const bytes=fs.readFileSync(path.join(folder,f.file));if(bytes.length!==f.bytes||sha256(bytes)!==f.sha256)throw Error('Cache SHA-256 mismatch: '+f.file);const rows=JSON.parse(bytes);if(!Array.isArray(rows)||rows.length!==f.records)throw Error('Cache record count mismatch');records+=rows.length;}
 if(records!==index.records)throw Error('Total cache record count mismatch');
 return {verified:true,files:expected.length,records};
}
module.exports={indexTexts,sha256,verifyTextCache};
if(require.main===module){if(process.argv.length!==3)throw Error('Usage: node scripts/index-full-text21.cjs CACHE_DIRECTORY');const folder=path.resolve(process.argv[2]),cache=fs.readdirSync(folder).filter(n=>/^batch\d+\.json$/.test(n)).sort().flatMap(n=>JSON.parse(fs.readFileSync(path.join(folder,n),'utf8'))),report=indexTexts(require('../catalog/historical/2004-10-01/cards.json'),cache,require('../dist/effectRegistry').enabledCardIds);fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/mission21-full-text-index.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,cards:undefined}));}

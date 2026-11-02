#!/usr/bin/env node
/** Offline planning only: text-pattern matches are NOT executable card effects. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const families=[
 ['mass-destruction',/destroy all (?:face-up )?(?:\w+(?:-type)? )?monsters|destroy all (?:spell|trap)|destroy all cards/i],
 ['deck-search',/(?:add|select|place|special summon) .{0,110}(?:from|in) (?:your|the) deck|from your deck to your hand/i],
 ['hand-discard',/discard|random card from (?:your|their|opponent.s) hand/i],
 ['battle-modifier',/piercing|second attack|attack twice|battle damage|damage calculation|attacks directly|attack directly/i],
 ['graveyard-interaction',/graveyard|\bGY\b|banish|removed from play/i],
 ['choice-or-cost',/choose|select|tribute|pay \d|pay life points|target (?:1|2|up to)/i],
 ['turn-timing',/standby phase|end phase|once per turn|until the end|during your next turn/i],
 ['continuous-lock',/cannot (?:activate|attack|summon|change)|negate|unaffected|must (?:be|not)/i],
 ['field-or-equip',/equip|field spell|"umi"|"necrovalley"|while .*face-up on the field/i],
 ['simple-burn-heal-draw',/(?:gain|increase) \d+ (?:life points|LP)|inflict \d+ (?:points of )?damage|draw \d+ cards?/i],
];
const category=c=>c.kind==='monster'?(c.mechanics.includes('fusion')?'fusion':c.classifications.includes('normal')?'normal':'effect-monster'):c.kind;
function planRemaining(historical,catalog,refs,sourceHashes={}){
 const certified=new Set(catalog.cards.map(c=>c.id)),refMap=new Map();
 for(const response of refs)for(const c of response.data??[]){
  const id=String(c.id).padStart(8,'0');
  if(refMap.has(id))throw Error('Duplicate independent card ID '+id);
  refMap.set(id,c);
 }
 const eligible=historical.filter(c=>c.firstObserved?.ocg&&c.firstObserved.ocg<='2004-09-30');
 const remaining=eligible.filter(c=>!c.passwords?.some(id=>certified.has(id)));
 const slots=new Map(),counts={};let blockedIdentity=0,missingIndependent=0,matched=0;
 for(const c of remaining){
  const kind=category(c),ids=c.passwords??[],id=ids.length===1?ids[0]:null;
  if(!id||!/^\d{8}$/.test(id)){blockedIdentity++;continue;}
  const independent=refMap.get(id);
  if(!independent){missingIndependent++;counts[`${kind}:missing-independent`]=(counts[`${kind}:missing-independent`]??0)+1;continue;}
  matched++;
  const text=String(independent.desc??''),tags=families.filter(([,pattern])=>pattern.test(text)).map(([label])=>label);
  if(!tags.length)tags.push('unclassified');
  for(const tag of tags){
   const key=`${kind}:${tag}`;counts[key]=(counts[key]??0)+1;
   const list=slots.get(key)??[];
   if(list.length<12)list.push({id,name:c.names.en,latestName:independent.name,ocgDate:c.firstObserved.ocg,description:text.slice(0,300),referenceNameMatches:independent.name===c.names.en,reviewRequired:true});
   slots.set(key,list);
  }
 }
 const groups=[...slots].map(([family,examples])=>({family,matchingCards:counts[family],examples})).sort((a,b)=>b.matchingCards-a.matchingCards||a.family.localeCompare(b.family));
 return {basis:'planning-only-not-certification',historicalCutoff:'2004-09-30',certifiedCount:certified.size,historicalCount:eligible.length,
  remainingHistoricalRecords:remaining.length,blockedIdentityRecords:blockedIdentity,missingIndependentRecords:missingIndependent,
  matchedIndependentRecords:matched,sourceHashes,groups,missingByKind:Object.fromEntries(Object.entries(counts).filter(([k])=>k.endsWith(':missing-independent')).sort()),
  caveats:['Pattern families overlap: matchingCards are not additive and do not certify rules.',
   'Modern independent text is an investigative lead, not necessarily the correct historical ruling.',
   'Each future admission needs identity, region, complete effect verification, a typed implementation, regression tests and an immutable catalog revision.',
   'Absent independent sources remain unclassified; never assume Normal/vanilla behavior.']};
}
function main(args=process.argv.slice(2)){
 if(args.length<2||args.length>7)throw Error('Usage: node scripts/plan-remaining-families.cjs SPELL_JSON EFFECT_JSON [TRAP_JSON] [FLIP_JSON] [NORMAL_JSON] [FUSION_JSON] [--write]');
 const write=args.includes('--write'),files=args.filter(x=>x!=='--write');
 if(files.length<2||files.length>6)throw Error('Provide Spell, Effect, optionally Trap, Flip, Normal and Fusion API JSON files');
 const bytes=files.map(file=>fs.readFileSync(file)),refs=bytes.map(b=>JSON.parse(b.toString('utf8')));
 if(refs.some(r=>!Array.isArray(r.data)||r.data.length<100))throw Error('Truncated independent card reference');
 const h=require('../catalog/historical/2004-10-01/cards.json'),manifest=require('../catalog/engine-v7/manifest.json');
 const current=require('../catalog/engine-v7/'+manifest.current+'.json');
 const result=planRemaining(h,current,refs,Object.fromEntries(files.map((file,i)=>[path.basename(file),sha(bytes[i])])));
 if(write){
  const dest=path.join(root,'docs/evidence/mission13-remaining-families.json');
  if(fs.existsSync(dest)&&JSON.parse(fs.readFileSync(dest,'utf8')).basis!=='planning-only-not-certification')throw Error('Existing report is not a mechanically generated planning report');
  fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');
 }else console.log(JSON.stringify(result,null,2));
 return result;
}
if(require.main===module){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={planRemaining,main};

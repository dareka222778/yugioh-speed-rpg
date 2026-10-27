/** Offline factual normalization and evidence gates. Never admits or distributes cards. */
import type {Card} from './cardCatalog';
import {definitionFingerprint} from './cardRegistry';
export const NORMAL_SCENARIOS=['identity','normal-summon','set','destroy','temporary-control','tribute-owner','json-restore','zone-capacity'] as const;
const races:Record<string,string>={aqua:'Aqua',beast:'Beast',beastwarrior:'Beast-Warrior',dinosaur:'Dinosaur',dragon:'Dragon',fairy:'Fairy',fiend:'Fiend',fish:'Fish',insect:'Insect',machine:'Machine',plant:'Plant',pyro:'Pyro',reptile:'Reptile',rock:'Rock',seaserpent:'Sea Serpent',spellcaster:'Spellcaster',thunder:'Thunder',warrior:'Warrior',wingedbeast:'Winged Beast',zombie:'Zombie'};
const attributes=new Set(['DARK','LIGHT','EARTH','WATER','FIRE','WIND','DIVINE']);
export type HistoryInput={id:string;names:{en?:string;pt?:string;ja?:string};kind:string;passwords:string[];konamiId:number|null;attribute:string|null;race:string|null;level:number|null;atk:number|null;def:number|null;classifications:string[];mechanics:string[];firstObserved:{tcg:string|null;ocg:string|null;world:string|null};normalMainCandidate:boolean};
export type IndividualReview={id:string;canonicalId:string;konamiId:number;reviewer:string;reviewedAt:string;identityApproved:boolean;mechanicsApproved:boolean;primarySource:string;primaryFacts:{level:number|null;atk:number|null;defense:number|null;race:string|null;attribute:string|null;ocgDate:string};tcgSource?:string;tcgDate?:string;mechanicalFingerprint:string};
export type ExecutionEvidence={id:string;fingerprint:string;passed:readonly string[];failed:readonly string[]};
export type EngineAdmission={id:string;family:string;fingerprint:string;certified:boolean;distributionAuthorized:boolean;card?:Card;requiredScenarios?:readonly string[]};
const key=(v:string)=>v.toLowerCase().replace(/[\s_-]/g,'');
export function validCatalogDate(v:unknown):v is string{return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;}
export function normalizeHistoricalCard(input:unknown){
 const c=input as Partial<HistoryInput>|null,issues:string[]=[];
 if(!c||typeof c!=='object')return {issues:['invalid-input'],card:undefined,family:'unknown',canonicalId:undefined,dates:{tcg:null,ocg:null,world:null}};
 if(typeof c.id!=='string'||!c.id.trim())issues.push('invalid-canonical-id');
 const ids=Array.isArray(c.passwords)?c.passwords:[];if(ids.length!==1||typeof ids[0]!=='string'||!/^\d{8}$/.test(ids[0]))issues.push('ambiguous-or-invalid-passcode');
 if(!Number.isSafeInteger(c.konamiId)||Number(c.konamiId)<1)issues.push('invalid-konami-id');
 const name=typeof c.names?.en==='string'?c.names.en.trim().normalize('NFC'):'';if(!name)issues.push('missing-english-identity');
 if(!['monster','spell','trap'].includes(c.kind??''))issues.push('invalid-kind');
 const categories=Array.isArray(c.classifications)?c.classifications:[],mechanics=Array.isArray(c.mechanics)?c.mechanics:[];
 const normal=c.kind==='monster'&&c.normalMainCandidate===true&&categories.length===1&&categories[0]==='normal'&&mechanics.length===0;
 const family=normal?'normal-monster':c.kind==='monster'?'monster:curation-required':c.kind==='spell'?'spell:curation-required':c.kind==='trap'?'trap:curation-required':'unknown';
 if(c.normalMainCandidate===true&&!normal)issues.push('conflicting-normal-classification');
 const race=typeof c.race==='string'&&Object.hasOwn(races,key(c.race))?races[key(c.race)]:undefined,attribute=typeof c.attribute==='string'?c.attribute.toUpperCase():undefined;
 if(c.kind==='monster'){
  if(!race)issues.push('unknown-race');if(!attribute||!attributes.has(attribute))issues.push('unknown-attribute');
  if(!Number.isSafeInteger(c.level)||Number(c.level)<1||Number(c.level)>12||!Number.isSafeInteger(c.atk)||Number(c.atk)<0||!Number.isSafeInteger(c.def)||Number(c.def)<0)issues.push('invalid-monster-stats');
 }
 const dates={tcg:c.firstObserved?.tcg??null,ocg:c.firstObserved?.ocg??null,world:c.firstObserved?.world??null};
 for(const [region,date]of Object.entries(dates))if(date!==null&&!validCatalogDate(date))issues.push('invalid-date:'+region);
 const observed=[dates.tcg,dates.ocg].filter(validCatalogDate).sort();if(!observed.length||dates.world!==observed[0])issues.push('inconsistent-world-date');
 if(c.kind==='monster'&&!normal&&!categories.includes('effect'))issues.push('monster-category-requires-curation');
 const card:Card|undefined=!issues.length?{id:ids[0],konamiId:Number(c.konamiId),name,englishName:name,kind:c.kind as Card['kind'],...c.kind==='monster'?{monsterType:normal?'normal' as const:'effect' as const}:{},race:c.kind==='monster'?race!:null,attribute:c.kind==='monster'?attribute!:null,level:c.kind==='monster'?c.level!:null,atk:c.kind==='monster'?c.atk!:null,defense:c.kind==='monster'?c.def!:null,summary:normal?'Monstro Normal.':'Revisão mecânica pendente.',source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid='+c.konamiId+'&request_locale=ja'}:undefined;
 return {issues,card,family,canonicalId:c.id,dates};
}
/** A factual Fusion/Ritual or a set of aliases can be normalized without claiming an engine projection. */
export function normalizeHistoricalFacts(input:unknown){
 const projection=normalizeHistoricalCard(input),raw=input as Partial<HistoryInput>|null,aliases=Array.isArray(raw?.passwords)?raw.passwords:[];
 const validAliases=aliases.length>0&&new Set(aliases).size===aliases.length&&aliases.every(id=>typeof id==='string'&&/^\d{8}$/.test(id));
 const issues=projection.issues.filter(i=>i!=='monster-category-requires-curation'&&!(i==='ambiguous-or-invalid-passcode'&&validAliases));
 return {issues,normalized:issues.length===0,canonicalId:raw?.id??null,aliases:[...aliases],konamiId:raw?.konamiId??null,classifications:[...raw?.classifications??[]],mechanics:[...raw?.mechanics??[]],engineProjectionReady:!!projection.card,projectionIssues:projection.issues};
}
export function planHistoricalCatalog(inputs:readonly unknown[],options:{cutoff:string;region:'tcg'|'ocg'|'world';admissions?:readonly EngineAdmission[];reviews?:readonly IndividualReview[];executions?:readonly ExecutionEvidence[]}){
 if(!validCatalogDate(options.cutoff)||!['tcg','ocg','world'].includes(options.region))throw new Error('Invalid regional cutoff');
 const rows=inputs.map(normalizeHistoricalCard),conflicts=new Map<string,number[]>();
 const claims=(value:string|number|undefined,prefix:string,i:number)=>{if(value===undefined)return;const k=prefix+value,bucket=conflicts.get(k)??[];bucket.push(i);conflicts.set(k,bucket);};
 inputs.forEach((raw,i)=>{const c=raw as Partial<HistoryInput>|null;if(!c||typeof c!=='object')return;claims(c.id,'canonical:',i);if(c.konamiId!=null)claims(c.konamiId,'konami:',i);if(Array.isArray(c.passwords))for(const id of new Set(c.passwords))claims(id,'passcode:',i);});
 const duplicateIndexes=new Set<number>();for(const indexes of conflicts.values())if(indexes.length>1)indexes.forEach(i=>duplicateIndexes.add(i));
 const reviews=options.reviews??[],executions=options.executions??[],admissions=options.admissions??[];
 function index<T extends {id:string}>(items:readonly T[]){const map=new Map<string,T[]>();for(const item of items){const bucket=map.get(item.id)??[];bucket.push(item);map.set(item.id,bucket);}return map;}
 const reviewIndex=index(reviews),executionIndex=index(executions),admissionIndex=index(admissions);
 const plan=rows.map((row,i)=>{
  const raw=inputs[i] as Partial<HistoryInput>|null,facts=normalizeHistoricalFacts(raw),aliases=facts.aliases,matches=[...new Set(aliases.flatMap(id=>admissionIndex.get(id)??[]))],admission=matches.length===1?matches[0]:undefined,id=admission?.id??row.card?.id??(typeof aliases[0]==='string'?aliases[0]:null),issues=[...facts.issues];if(duplicateIndexes.has(i))issues.push('identity-collision');
  const date=row.dates[options.region],eligible=validCatalogDate(date)&&date<=options.cutoff;if(!eligible)issues.push(date===null?'regional-date-not-recovered':'outside-cutoff');
  if(matches.length>1)issues.push('ambiguous-admission');
  const rs=reviewIndex.get(id??'')??[],review=rs.length===1?rs[0]:undefined;if(rs.length>1)issues.push('duplicate-review');
  const primary=review?.primaryFacts,card=row.card??admission?.card;
  const reviewed=!!card&&!!review&&!!review.reviewer?.trim()&&validCatalogDate(review.reviewedAt)&&review.canonicalId===row.canonicalId&&review.konamiId===card.konamiId&&review.identityApproved===true&&review.mechanicsApproved===true&&review.primarySource===card.source&&!!primary&&primary.level===card.level&&primary.atk===card.atk&&primary.defense===card.defense&&primary.race===card.race&&primary.attribute===card.attribute&&validCatalogDate(primary.ocgDate)&&primary.ocgDate===row.dates.ocg&&!!admission&&review.mechanicalFingerprint===admission.fingerprint;
  const tcgVerified=!!review&&validCatalogDate(review.tcgDate)&&review.tcgDate===row.dates.tcg&&review.tcgDate<=options.cutoff&&typeof review.tcgSource==='string'&&review.tcgSource.startsWith('https://www.db.yugioh-card.com/');
  const ocgVerified=!!primary&&validCatalogDate(primary.ocgDate)&&primary.ocgDate<=options.cutoff;
  const regionVerified=reviewed&&(options.region==='ocg'?ocgVerified:options.region==='tcg'?tcgVerified:ocgVerified||tcgVerified);
  const dependency=admission?.family??(facts.mechanics.includes('fusion')?'fusion:curation-required':facts.mechanics.includes('ritual')?'ritual:curation-required':row.family),implemented=!!admission,requirements=admission?.requiredScenarios?[...admission.requiredScenarios]:row.family==='normal-monster'?[...NORMAL_SCENARIOS]:['individual-mechanical-scenarios-required'];
  const es=executionIndex.get(id??'')??[],execution=es.length===1?es[0]:undefined;
  const tested=!!admission&&!!execution&&execution.fingerprint===admission.fingerprint&&execution.failed.length===0&&requirements.every(s=>execution.passed.includes(s));
  const normalized=facts.normalized&&!issues.some(s=>s!=='regional-date-not-recovered'&&s!=='outside-cutoff');
  const baseMatches=!!card&&card.konamiId===raw?.konamiId&&aliases.includes(card.id)&&card.kind===raw?.kind&&(raw.kind!=='monster'||card.level===raw.level&&card.atk===raw.atk&&card.defense===raw.def&&card.race===(typeof raw.race==='string'?races[key(raw.race)]:undefined)&&card.attribute===raw.attribute?.toUpperCase());
  const factsMatchImplementation=baseMatches&&(row.family!=='normal-monster'||!!card&&!!admission&&definitionFingerprint(card,{kind:'normal'},{})===admission.fingerprint);
  const ready=normalized&&eligible&&implemented&&reviewed&&regionVerified&&tested&&factsMatchImplementation;
  return {id,canonicalId:row.canonicalId??null,family:dependency,cataloged:true,normalized,engineProjectionReady:!!card,projectionIssues:row.issues,aliases,eligible,implemented,tested,individualReview:reviewed,regionVerified,factsMatchImplementation,certified:!!admission?.certified,distributionAuthorized:!!admission?.certified&&!!admission?.distributionAuthorized,readyForIndividualCertification:ready,issues,missingMechanics:implemented?[]:[...(aliases.length!==1?['primary-passcode-review']:[]),...(row.family==='normal-monster'?['normal-adapter-admission']:['curated-effect-definition',...(raw?.mechanics??[])])],scenarioPlan:requirements,card};
 });
 const families:Record<string,{cataloged:number;normalized:number;implemented:number;tested:number;certified:number;distributionAuthorized:number}>=Object.create(null);for(const row of plan){const f=families[row.family]??={cataloged:0,normalized:0,implemented:0,tested:0,certified:0,distributionAuthorized:0};for(const stage of Object.keys(f) as (keyof typeof f)[])if(row[stage])f[stage]++;}
 return {kind:'read-only-historical-certification-pipeline',region:options.region,cutoff:options.cutoff,enablesCards:false,grantsInventory:false,automation:{unit:'candidate-card',candidates:plan.length,normalized:plan.filter(r=>r.normalized).length,scenarioPlans:plan.filter(r=>r.normalized&&r.family==='normal-monster').length,individualApprovalsRequired:plan.length,automaticCertifications:0},families,plan};
}

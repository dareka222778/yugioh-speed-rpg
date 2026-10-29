import type {Card} from './cardCatalog';
import type {DuelState,CardRef} from './duelEngine';
import {namedCard,archetypeCard} from './cardIdentity';

/** A searched card is selected by its immutable duel UID, not by text or ID.
 * The player's own Deck and Graveyard are the only searchable sources here. */
export type SearchZoneRule={from:'deck'|'grave'|'either';filter:{kind?:'monster'|'spell'|'trap';race?:string;maxLevel?:number;name?:string;field?:boolean;archetype?:string;category?:'equipSpell'|'ritualSpell'|'ritualMonster'|'ritual';excludeNames?:readonly string[]}};
export function searchZoneIssues(rule:unknown):string[]{
 if(!rule||typeof rule!=='object')return ['invalid-search-rule'];
 const r=rule as SearchZoneRule;
 if(!['deck','grave','either'].includes(r.from)||Object.keys(r).some(k=>!['from','filter'].includes(k))||!r.filter||typeof r.filter!=='object')return ['invalid-search-source'];
 const f=r.filter;
 if(Object.keys(f).some(k=>!['kind','race','maxLevel','name','field','archetype','category','excludeNames'].includes(k))||!Object.keys(f).length)return ['invalid-search-filter'];
 if(f.kind!==undefined&&!['monster','spell','trap'].includes(f.kind)||f.race!==undefined&&(!f.race||typeof f.race!=='string')||f.maxLevel!==undefined&&(!Number.isSafeInteger(f.maxLevel)||f.maxLevel<1||f.maxLevel>12)||f.name!==undefined&&(!f.name||typeof f.name!=='string')||f.field!==undefined&&typeof f.field!=='boolean'||f.archetype!==undefined&&(!f.archetype||typeof f.archetype!=='string'))return ['invalid-search-field'];
 if(f.category!==undefined&&!['equipSpell','ritualSpell','ritualMonster','ritual'].includes(f.category)||f.excludeNames!==undefined&&(!Array.isArray(f.excludeNames)||!f.excludeNames.length||f.excludeNames.length>32||f.excludeNames.some(n=>typeof n!=='string'||!n)||new Set(f.excludeNames).size!==f.excludeNames.length))return ['invalid-search-category'];
 if(f.maxLevel!==undefined&&f.kind!=='monster'||f.race!==undefined&&f.kind!=='monster'||f.field!==undefined&&f.kind!=='spell')return ['incompatible-search-filter'];
 return [];
}
export function searchZoneTargets(s:DuelState,actor:number,rule:SearchZoneRule,getCard:(id:string)=>Card|undefined,getEffect?:(id:string)=>{kind:string}|undefined):CardRef[]{
 const p=s.players[actor];
 const pools=[...rule.from!=='grave'?p.deck:[],...rule.from!=='deck'?p.grave:[]];
 return pools.filter(ref=>{
  const c=getCard(ref.id),f=rule.filter;if(!c)return false;
  const effect=getEffect?.(c.id),category=f.category==='equipSpell'?c.kind==='spell'&&effect?.kind==='equip':f.category==='ritualSpell'?c.kind==='spell'&&effect?.kind==='ritualSummon':f.category==='ritualMonster'?c.monsterType==='ritual':f.category==='ritual'?c.monsterType==='ritual'||c.kind==='spell'&&effect?.kind==='ritualSummon':true;
  return category&&(!f.excludeNames?.some(n=>namedCard(c,n)))&&(f.kind===undefined||c.kind===f.kind)&&(f.race===undefined||c.race===f.race)&&(f.maxLevel===undefined||!!c.level&&c.level<=f.maxLevel)&&(f.name===undefined||namedCard(c,f.name))&&(f.field===undefined||!!c.field===f.field)&&(f.archetype===undefined||archetypeCard(c,f.archetype));
 });
}

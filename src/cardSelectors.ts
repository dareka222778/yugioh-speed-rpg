/** Typed predicates; text matching is never used to infer executable operations. */
import type {Card} from './cardCatalog';
import {namedCard,archetypeCard} from './cardIdentity';
export type MonsterSelector={race?:string;name?:string;archetype?:string;maximumAtk?:number;maximumDef?:number};
export function monsterSelectorIssues(f:any):string[]{
 if(!f||typeof f!=='object'||Array.isArray(f)||!Object.keys(f).length||Object.keys(f).some(k=>!['race','name','archetype','maximumAtk','maximumDef'].includes(k)))return ['invalid-monster-selector'];
 for(const k of ['race','name','archetype'])if(f[k]!==undefined&&(typeof f[k]!=='string'||!f[k].trim()))return ['invalid-monster-selector'];
 for(const k of ['maximumAtk','maximumDef'])if(f[k]!==undefined&&(!Number.isSafeInteger(f[k])||f[k]<0))return ['invalid-monster-selector'];
 return [];
}
export function matchesMonsterSelector(c:Card,f:MonsterSelector):boolean{return c.kind==='monster'&&(!f.race||c.race===f.race)&&(!f.name||namedCard(c,f.name))&&(!f.archetype||archetypeCard(c,f.archetype))&&(f.maximumAtk===undefined||typeof c.atk==='number'&&c.atk<=f.maximumAtk)&&(f.maximumDef===undefined||typeof c.defense==='number'&&c.defense<=f.maximumDef);}

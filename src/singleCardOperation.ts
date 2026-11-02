/** One activation-time target, a precise public-zone filter, and one physical operation. */
import type {DuelState,CardRef} from './duelEngine';
import {getDuelCard} from './effectRegistry';
import {canAffectMonster} from './continuousEffects';
import {ownedPrivateZone} from './teamRotation';
import {shuffleDuel} from './duelRandom';
import type {SingleCardRule} from './singleCardRules';
function pool(s:DuelState,actor:number,r:SingleCardRule){return s.players.flatMap((p,owner)=>r.controller!=='both'&&(owner===actor)!==(r.controller==='self')?[]:(r.from==='backrow'?[...p.backrow,...p.field?[p.field]:[]]:p[r.from]).map(ref=>({ref,owner,field:p.field?.uid===ref.uid})));}
function matches(ref:CardRef,r:SingleCardRule){const c=getDuelCard(ref.id);if(!c)return false;const up='faceUp' in ref?ref.faceUp===true:undefined;return (!r.faceUpOnly||up)&&(!r.race||up&&c.race===r.race)&&(!r.kind||r.inspectSetAs&&up===false||c.kind===r.kind);}
export function singleCardTargets(s:DuelState,actor:number,r:SingleCardRule):string[]{return pool(s,actor,r).filter(x=>!(x.field&&r.kind==='trap')&&matches(x.ref,r)).map(x=>x.ref.uid);}
export type SingleCardServices={destroyMonster:(s:DuelState,uid:string)=>unknown;destroyBackrow:(s:DuelState,uid:string)=>unknown;note:(s:DuelState,text:string)=>void};
export function executeSingleCard(s:DuelState,actor:number,r:SingleCardRule,uid:string|undefined,service:SingleCardServices):boolean{
 const found=pool(s,actor,r).find(x=>x.ref.uid===uid&&!(x.field&&r.kind==='trap')&&matches(x.ref,r));if(!found)return false;const {ref,owner}=found,info=getDuelCard(ref.id)!;
 if(r.inspectSetAs&&'faceUp' in ref&&ref.faceUp===false){service.note(s,'Carta revelada para verificação: '+info.name+'.');if(info.kind!==r.inspectSetAs)return false;}
 if(r.from==='monsters'&&!canAffectMonster(s,ref.uid,'monster'))return false;
 if(r.action==='destroy'){if(r.from==='monsters')service.destroyMonster(s,ref.uid);else service.destroyBackrow(s,ref.uid);return true;}
 const source=s.players[owner].grave,index=source.findIndex(c=>c.uid===ref.uid);if(index<0)return false;source.splice(index,1);
 if(r.action==='banish')(s.players[owner].banished??=[]).push(ref);
 else{const destination=ownedPrivateZone(s,ref,owner,info.fusion?'extra':'deck');destination.push({uid:ref.uid,id:ref.id});if(!info.fusion)shuffleDuel(destination,s);}
 return true;
}

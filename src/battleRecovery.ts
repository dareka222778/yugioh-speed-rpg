import type {DuelState} from './duelEngine';
import {getEffect,getDuelCard} from './effectRegistry';
import {ownedPrivateZone} from './teamRotation';
export type RecoveryKind='trap'|'continuousSpell';
export function graveRecoveryTargets(s:DuelState,actor:number,kind:RecoveryKind){
 return s.players[actor].grave.filter(c=>{const type=getDuelCard(c.id)?.kind;return kind==='trap'?type==='trap':type==='spell'&&getEffect(c.id)?.kind==='continuous';}).map(c=>c.uid);
}
export function recoverToTop(s:DuelState,actor:number,kind:RecoveryKind,target?:string){
 if(!target||!graveRecoveryTargets(s,actor,kind).includes(target))return;
 const pool=s.players[actor].grave,index=pool.findIndex(c=>c.uid===target),[ref]=pool.splice(index,1);
 ownedPrivateZone(s,ref,actor,'deck').unshift(ref);
}

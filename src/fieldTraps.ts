import type {DuelState,Monster} from './duelEngine';
import type {TargetBinding} from './cardLifetime';
import {targetBindingValid} from './cardLifetime';
import {executeTargetGroup,type GroupServices} from './targetGroupOperation';
import {addTemporaryModifier,canAffectMonster} from './continuousEffects';
export type FieldTrapMode='returnHand'|'reduceAttacker'|'reduceDefense'|'handBoost';
export function fieldTrapTargets(s:DuelState,actor:number,mode:FieldTrapMode):Monster[]{
 return s.players.flatMap((p,i)=>p.monsters.filter(m=>mode==='returnHand'||m.faceUp&&(mode==='handBoost'?i===actor:mode==='reduceAttacker'?s.pending.kind==='attack'&&s.pending.card===m.uid&&!s.pending.cancelled:true)));
}
export function resolveFieldTrap(s:DuelState,actor:number,mode:FieldTrapMode,uid:string,binding:TargetBinding|undefined,services:GroupServices){
 if(!binding||binding.uid!==uid||!targetBindingValid(s,binding))return;
 if(mode==='returnHand'){executeTargetGroup(s,{from:'monsters',action:'returnHand',minimum:1,maximum:1},[uid],[binding],services,'trap');return;}
 const m=s.players.flatMap(p=>p.monsters).find(m=>m.uid===uid);if(!m?.faceUp||!canAffectMonster(s,uid,'trap'))return;
 const n=mode==='handBoost'?200*s.players[1-actor].hand.length:0;
 addTemporaryModifier(s,uid,mode==='reduceAttacker'?-700:n,mode==='reduceDefense'?-500:n);
}

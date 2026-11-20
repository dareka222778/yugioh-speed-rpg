import type {CardRef,DuelState} from './duelEngine';
import {typedDiscardTargets,payTypedDiscardCost,type TypedDiscardCardLookup} from './typedDiscard';
import {fieldCardTargets,returnFieldCardToOwner,type FieldCardLookup,type FieldCardTarget} from './fieldCardReturn';

export const ABYSS_SOLDIER_ID='18318842';

/** Explicit adapter contract to be registered after the reserved resolver handoff. */
export const ABYSS_SOLDIER_PLAN=Object.freeze({
 cardId:ABYSS_SOLDIER_ID,
 oncePerTurn:true,
 activationWindow:'main',
 cost:{kind:'discard',count:1,cardKind:'monster',attribute:'WATER'},
 target:{kind:'fieldCard',count:1},
 resolution:{kind:'returnToPhysicalOwnerHand',fusionDestination:'physicalOwnerExtraDeck'},
});

export function abyssSoldierDiscardTargets(s:DuelState,actor:number,getCard:TypedDiscardCardLookup):CardRef[]{
 return typedDiscardTargets(s,actor,'WATER',getCard);
}
export function payAbyssSoldierDiscard(s:DuelState,actor:number,uid:string,getCard:TypedDiscardCardLookup):CardRef{
 return payTypedDiscardCost(s,actor,uid,'WATER',getCard);
}
export function abyssSoldierFieldTargets(s:DuelState):FieldCardTarget[]{
 return fieldCardTargets(s);
}
export function resolveAbyssSoldierTarget(s:DuelState,uid:string,getCard:FieldCardLookup){
 return returnFieldCardToOwner(s,uid,getCard);
}

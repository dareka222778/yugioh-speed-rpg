import type {CardRef,DuelState} from './duelEngine';
import {
 ABYSS_SOLDIER_ID,
 abyssSoldierDiscardTargets,
 abyssSoldierFieldTargets,
 payAbyssSoldierDiscard,
 resolveAbyssSoldierTarget,
} from './abyssSoldier';
import type {FieldCardTarget,FieldCardLookup} from './fieldCardReturn';
import type {TypedDiscardCardLookup} from './typedDiscard';

export const ABYSS_SOLDIER_TAG_ADAPTER=Object.freeze({
 cardId:ABYSS_SOLDIER_ID,
 oncePerTurn:true,
 activationWindow:'main',
 cost:{kind:'discard',count:1,cardKind:'monster',attribute:'WATER'},
 target:{kind:'fieldCard',count:1,zones:['monsters','backrow','field'] as const},
 privateTargetPresentation:true,
});

/** A Discord-safe target projection: card identity is omitted for face-down refs. */
export type AbyssSoldierTargetView={
 uid:string;
 label:string;
 controller:number;
 ownerTeam:number;
 zone:FieldCardTarget['zone'];
 visibility:'public'|'hidden';
};

function assertActiveRepresentative(s:DuelState,team:number,activeSeat:number):void{
 if((team!==0&&team!==1)||!Number.isInteger(activeSeat)||s.teamRotation?.active?.[team]!==activeSeat){
  throw new Error('O assento físico não é o representante ativo da equipe.');
 }
}

function fieldRef(s:DuelState,target:FieldCardTarget):{uid:string;id:string;faceUp?:boolean}|undefined{
 const player=s.players[target.controller];
 if(target.zone==='monsters')return player.monsters.find(ref=>ref.uid===target.uid);
 if(target.zone==='backrow')return player.backrow.find(ref=>ref.uid===target.uid);
 return player.field?.uid===target.uid?player.field:undefined;
}

/** Cost candidates are restricted to the active physical representative's private hand. */
export function abyssSoldierTagCostTargets(
 s:DuelState,team:number,activeSeat:number,getCard:TypedDiscardCardLookup,
):CardRef[]{
 assertActiveRepresentative(s,team,activeSeat);
 return abyssSoldierDiscardTargets(s,team,getCard);
}

/** Pays the WATER-monster discard from the active representative only. */
export function payAbyssSoldierTagCost(
 s:DuelState,team:number,activeSeat:number,uid:string,getCard:TypedDiscardCardLookup,
):CardRef{
 assertActiveRepresentative(s,team,activeSeat);
 return payAbyssSoldierDiscard(s,team,uid,getCard);
}

/**
 * Returns only presentation-safe targets. Face-down backrow/Field refs never
 * expose their card ID or name; the UID remains internal for resolution.
 */
export function abyssSoldierTagTargetViews(
 s:DuelState,getCardName:(id:string)=>string|undefined,
):AbyssSoldierTargetView[]{
 return abyssSoldierFieldTargets(s).map((target)=>{
  const ref=fieldRef(s,target);
  if(!ref)throw new Error('A carta escolhida não está mais no campo.');
  const visible=ref.faceUp===true;
  return {
   uid:target.uid,
   label:visible?(getCardName(ref.id)??'Carta'):'Carta oculta',
   controller:target.controller,
   ownerTeam:target.ownerTeam,
   zone:target.zone,
   visibility:visible?'public' as const:'hidden' as const,
  };
 });
}

/** Resolves by opaque UID; the underlying primitive routes to the physical owner's private zone. */
export function resolveAbyssSoldierTagTarget(
 s:DuelState,team:number,activeSeat:number,uid:string,getCard:FieldCardLookup,
):{uid:string;id:string;controller:number;ownerTeam:number;destination:'hand'|'extra'|'removed'}{
 assertActiveRepresentative(s,team,activeSeat);
 return resolveAbyssSoldierTarget(s,uid,getCard);
}

import type {CardRef,DuelState} from './duelEngine';
import {ownedPrivateZone} from './teamRotation';
import {removeToken} from './tokens';
import {cleanEquips} from './classicEffects';
import {synchronizeCardLifetimes} from './cardLifetime';

export type FieldCardZone='monsters'|'backrow'|'field';
export type FieldCardInfo={fusion?:unknown;kind?:string};
export type FieldCardLookup=(id:string)=>FieldCardInfo|undefined;
export type FieldCardTarget={uid:string;id:string;controller:number;ownerTeam:number;zone:FieldCardZone};
type LocatedFieldCard={controller:number;ownerTeam:number;zone:FieldCardZone;ref:CardRef&{owner?:number;entityKind?:'token';properlySummoned?:boolean}};

function locateFieldCard(s:DuelState,uid:string):LocatedFieldCard[]{
 const found:LocatedFieldCard[]=[];
 for(let controller=0;controller<2;controller++){
  const p=s.players[controller];
  for(const ref of p.monsters)if(ref.uid===uid)found.push({controller,ownerTeam:ref.owner??controller,zone:'monsters',ref});
  for(const ref of p.backrow)if(ref.uid===uid)found.push({controller,ownerTeam:controller,zone:'backrow',ref});
  if(p.field?.uid===uid)found.push({controller,ownerTeam:controller,zone:'field',ref:p.field});
 }
 return found;
}

/** Lists every public field card, including both teams' monsters, backrow and Field Spell. */
export function fieldCardTargets(s:DuelState):FieldCardTarget[]{
 const targets:FieldCardTarget[]=[];
 for(let controller=0;controller<2;controller++){
  const p=s.players[controller];
  for(const ref of p.monsters)targets.push({uid:ref.uid,id:ref.id,controller,ownerTeam:ref.owner??controller,zone:'monsters'});
  for(const ref of p.backrow)targets.push({uid:ref.uid,id:ref.id,controller,ownerTeam:controller,zone:'backrow'});
  if(p.field)targets.push({uid:p.field.uid,id:p.field.id,controller,ownerTeam:controller,zone:'field'});
 }
 return targets;
}

/**
 * Returns one field card to its physical owner's private hand. Fusion monsters
 * return to that owner's Extra Deck; tokens leave the field and disappear.
 */
export function returnFieldCardToOwner(
 s:DuelState,
 uid:string,
 getCard:FieldCardLookup,
):{uid:string;id:string;controller:number;ownerTeam:number;destination:'hand'|'extra'|'removed'}{
 const matches=locateFieldCard(s,uid);
 if(matches.length!==1)throw new Error(matches.length?'UID de campo ambíguo.':'A carta escolhida não está no campo.');
 const target=matches[0];
 const {controller,ownerTeam,zone,ref}=target;

 if(ref.entityKind==='token'){
  if(!removeToken(s,uid,'return'))throw new Error('Ficha não encontrada no campo.');
  cleanEquips(s);
  synchronizeCardLifetimes(s);
  return {uid,id:ref.id,controller,ownerTeam,destination:'removed'};
 }

 const info=getCard(ref.id);
 if(!info)throw new Error('Metadados da carta escolhida não estão disponíveis.');
 const destination: 'hand'|'extra'=zone==='monsters'&&!!info.fusion?'extra':'hand';
 const cardRef:CardRef={uid:ref.uid,id:ref.id,...ref.properlySummoned?{properlySummoned:true}:{}};

 if(zone==='monsters')s.players[controller].monsters=s.players[controller].monsters.filter(card=>card.uid!==uid);
 else if(zone==='backrow')s.players[controller].backrow=s.players[controller].backrow.filter(card=>card.uid!==uid);
 else s.players[controller].field=null;

 ownedPrivateZone(s,cardRef,ownerTeam,destination).push(cardRef);
 cleanEquips(s);
 synchronizeCardLifetimes(s);
 return {uid,id:ref.id,controller,ownerTeam,destination};
}

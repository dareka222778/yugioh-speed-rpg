import type {CardRef,DuelState} from './duelEngine';
import {synchronizeCardLifetimes} from './cardLifetime';

export type TypedDiscardCardInfo={kind?:string;attribute?:string};
export type TypedDiscardCardLookup=(id:string)=>TypedDiscardCardInfo|undefined;

/** Only the active representative's physical hand is eligible for a discard cost. */
export function typedDiscardTargets(
 s:DuelState,
 actor:number,
 attribute:string,
 getCard:TypedDiscardCardLookup,
):CardRef[]{
 if(actor!==0&&actor!==1)throw new Error('Equipe inválida para custo de descarte.');
 if(typeof attribute!=='string'||!attribute.trim())throw new Error('Atributo de descarte inválido.');
 return s.players[actor].hand
  .filter(ref=>{const info=getCard(ref.id);return info?.kind==='monster'&&info.attribute===attribute;})
  .map(ref=>({uid:ref.uid,id:ref.id,...ref.properlySummoned?{properlySummoned:true}:{}}));
}

/** Pays a typed discard cost from the representative's hand into the shared Graveyard. */
export function payTypedDiscardCost(
 s:DuelState,
 actor:number,
 uid:string,
 attribute:string,
 getCard:TypedDiscardCardLookup,
):CardRef{
 const eligible=typedDiscardTargets(s,actor,attribute,getCard);
 const selected=eligible.find(ref=>ref.uid===uid);
 if(!selected)throw new Error(`Custo inválido: escolha um monstro ${attribute} da mão ativa.`);
 const player=s.players[actor];
 const index=player.hand.findIndex(ref=>ref.uid===uid);
 if(index<0)throw new Error('A carta de custo não está mais na mão ativa.');
 synchronizeCardLifetimes(s);
 const [paid]=player.hand.splice(index,1);
 const ref:CardRef={uid:paid.uid,id:paid.id,...paid.properlySummoned?{properlySummoned:true}:{}};
 player.grave.push(ref);
 synchronizeCardLifetimes(s);
 return ref;
}

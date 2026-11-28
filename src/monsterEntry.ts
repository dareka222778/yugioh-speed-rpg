import {getMonsterEffect} from './monsterEffects';
import {RULES_PROFILE} from './rulesProfile';
import {getDuelCard as getCard} from './effectRegistry';
import type {DuelState,Monster} from './duelEngine';
import {synchronizeCardLifetimes} from './cardLifetime';

/** Moves a real Monster from its owner's Deck or Graveyard to a controller's field.
 * All eligibility and zone checks happen before removing the source card.
 * The physical owner and successful Fusion Summon history survive the move. */
export function specialSummonFromPile(
 s:DuelState,controller:number,sourceOwner:number,pile:'deck'|'grave',
 uid:string,position:'atk'|'def'='atk'
):Monster|undefined{
 const destination=s.players[controller]?.monsters;
 const source=s.players[sourceOwner]?.[pile];
 if(!destination||!source||destination.length>=RULES_PROFILE.monsterZones)return;
 const index=source.findIndex(c=>c.uid===uid);
 if(index<0)return;
 const ref=source[index],info=getCard(ref.id);if(ref.entityKind==='token')return;
 if(info?.kind!=='monster'||((info.fusion||info.monsterType==='ritual')&&(pile==='deck'||!ref.properlySummoned)))return;
 synchronizeCardLifetimes(s);
 const [card]=source.splice(index,1);
 const summoned:Monster={...card,owner:sourceOwner,faceUp:true,position,entered:s.turn,changed:s.turn,attacked:0,atkBoost:0,defBoost:0};
 destination.push(summoned);
 const effect=getMonsterEffect(card.id);if(effect?.trigger==='onSummon'&&effect.summons?.includes('special'))(s.graveTriggers??=[]).push({actor:controller,card:uid,id:card.id});
 synchronizeCardLifetimes(s);
 return summoned;
}

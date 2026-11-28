import type {CardRef} from './duelEngine';
import {getDuelCard} from './effectRegistry';
import {rulesFor} from './rulesProfile';
import {assertTagDuel,tagInventory,type TagDuel} from './tagDuel';

export const HIRO_SHADOW_SCOUT_ID='81863068';
export type HiroFlipCause='flip-summon'|'battle'|'card-effect';
export type HiroFlipEvent={
 id:string;
 kind:'flip-face-up';
 sourceUid:string;
 sourceId:string;
 controllerTeam:0|1;
 turn:number;
 cause:HiroFlipCause;
 wasFaceDown:true;
 faceUp:true;
};
export type HiroShadowScoutPlan={
 eventId:string;
 sourceUid:string;
 sourceId:string;
 ownerSeat:0|1|2|3;
 ownerTeam:0|1;
 controllerTeam:0|1;
 turn:number;
 cause:HiroFlipCause;
};
export type HiroRevealedCard={uid:string;id:string;name:string;kind:string};
export type HiroShadowScoutResolution={
 state:TagDuel;
 affectedTeam:0|1;
 activeOpponentSeat:number;
 revealedCards:HiroRevealedCard[];
 discardedSpellUids:string[];
 keptUids:string[];
 deckOut:boolean;
 negated:boolean;
};

const isTeam=(value:unknown):value is 0|1=>value===0||value===1;
function physicalSeat(uid:string):0|1|2|3|null{
 const match=/^m([0-3]):/.exec(uid);
 return match?Number(match[1]) as 0|1|2|3:null;
}
function privateDeckForSeat(duel:TagDuel,seat:number):CardRef[]{
 const team=(seat%2) as 0|1;
 if(duel.active[team]===seat)return duel.core.players[team].deck;
 const reserve=duel.reserves[String(seat)];
 if(!reserve)throw new Error('Deck privado do assento físico não encontrado.');
 return reserve.deck;
}
function privateHandForSeat(duel:TagDuel,seat:number):CardRef[]{
 const team=(seat%2) as 0|1;
 if(duel.active[team]===seat)return duel.core.players[team].hand;
 const reserve=duel.reserves[String(seat)];
 if(!reserve)throw new Error('Mão privada do assento físico não encontrada.');
 return reserve.hand;
}
function inventorySignature(duel:TagDuel):string{
 return tagInventory(duel).map(card=>card.uid+'|'+card.id).sort().join('\n');
}

/** Validates 20–30 cards per physical Main Deck, 3+3 shared zones and Extra 5. */
export function assertHiroPhysicalRules(duel:TagDuel):void{
 assertTagDuel(duel);
 if(duel.mode!=='tag-classic')throw new Error('O adapter M587 exige TagDuel clássico.');
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5)throw new Error('Perfil de regras incompatível com o proprietário.');
 const main=[0,0,0,0],extra=[0,0,0,0];
 for(const ref of tagInventory(duel)){
  if(ref.entityKind==='token')continue;
  const seat=physicalSeat(ref.uid);
  if(seat===null)throw new Error('UID sem proprietário físico m0–m3.');
  const metadata=getDuelCard(ref.id);
  if(!metadata)throw new Error('Carta sem metadados habilitados no estado de teste.');
  if(metadata.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck principal físico fora do limite 20–30.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excede cinco cartas.');
 }
 for(const team of duel.core.players){
  if(team.monsters.length>rules.monsterZones)throw new Error('Equipe excedeu as três Zonas de Monstros.');
  if(team.backrow.length>rules.spellTrapZones)throw new Error('Equipe excedeu as três Zonas de Magias/Armadilhas.');
  // Field Zone is a separate zone and is not counted among the three backrow slots.
 }
}
function finishForDeckOut(duel:TagDuel,winnerTeam:0|1):void{
 delete duel.core.movementSelection;
 delete duel.core.afterEffectFlips;
 delete duel.core.effectFlips;
 delete duel.core.ritual;
 delete duel.core.standby;
 duel.core.phase='finished';
 duel.core.damageStep=undefined;
 duel.core.triggerBuild=undefined;
 duel.core.chainRoot=undefined;
 duel.core.choice=undefined;
 duel.core.handFlow=undefined;
 duel.core.graveTriggers=[];
 duel.core.summonTriggers=[];
 duel.core.battleFlip=undefined;
 duel.core.winner=duel.core.players[winnerTeam].id;
 duel.core.reason='não conseguiu comprar 3 cartas';
 duel.core.log.push(duel.core.players[winnerTeam].name+' venceu: não conseguiu comprar 3 cartas.');
 duel.core.log=duel.core.log.slice(-12);
}

/** Accepts Flip Summon, battle and card-effect face-up events, including a source already sent to GY. */
export function prepareHiroShadowScoutTrigger(duel:TagDuel,event:HiroFlipEvent,cardId=HIRO_SHADOW_SCOUT_ID):HiroShadowScoutPlan|null{
 assertHiroPhysicalRules(duel);
 if(duel.core.phase==='finished'||!event||event.kind!=='flip-face-up'||event.wasFaceDown!==true||event.faceUp!==true||event.turn!==duel.core.turn||!isTeam(event.controllerTeam)||typeof event.id!=='string'||!event.id.trim()||event.id.length>128||!['flip-summon','battle','card-effect'].includes(event.cause)||event.sourceId!==cardId)return null;
 const ownerSeat=physicalSeat(event.sourceUid);
 if(ownerSeat===null)return null;
 const source=tagInventory(duel).find(card=>card.uid===event.sourceUid);
 if(!source||source.id!==cardId||source.entityKind==='token')return null;
 for(let team=0;team<2;team++){
  const onField=duel.core.players[team].monsters.find(monster=>monster.uid===event.sourceUid);
  if(onField&&(!onField.faceUp||team!==event.controllerTeam))return null;
 }
 return {eventId:event.id,sourceUid:event.sourceUid,sourceId:cardId,ownerSeat,ownerTeam:(ownerSeat%2) as 0|1,controllerTeam:event.controllerTeam,turn:event.turn,cause:event.cause};
}

/**
 * Mirrors the classic engine's drawCards contract: if fewer than three cards
 * remain, no partial draw occurs and the opposing active seat loses by deck-out.
 */
export function resolveHiroShadowScout(input:TagDuel,plan:HiroShadowScoutPlan,options:{negated?:boolean;cardId?:string}={}):HiroShadowScoutResolution|null{
 assertHiroPhysicalRules(input);
 const cardId=options.cardId??HIRO_SHADOW_SCOUT_ID;
 if(!plan||input.core.phase==='finished'||plan.turn!==input.core.turn||!isTeam(plan.controllerTeam)||!isTeam(plan.ownerTeam)||plan.ownerSeat<0||plan.ownerSeat>3||plan.ownerTeam!==plan.ownerSeat%2||physicalSeat(plan.sourceUid)!==plan.ownerSeat||typeof plan.eventId!=='string'||!plan.eventId.trim()||!['flip-summon','battle','card-effect'].includes(plan.cause)||plan.sourceId!==cardId)return null;
 const source=tagInventory(input).find(card=>card.uid===plan.sourceUid);
 if(!source||source.id!==cardId||source.entityKind==='token')return null;
 const before=inventorySignature(input);
 const next=structuredClone(input);
 next.reserves=next.core.teamRotation!.reserves as TagDuel['reserves'];
 const affectedTeam=(1-plan.controllerTeam) as 0|1;
 const activeOpponentSeat=next.active[affectedTeam];
 const revealedCards:HiroRevealedCard[]=[];
 const discardedSpellUids:string[]=[];
 const keptUids:string[]=[];
 let deckOut=false;
 const negated=options.negated===true;
 if(!negated){
  const deck=privateDeckForSeat(next,activeOpponentSeat);
  if(deck.length<3){
   deckOut=true;
   finishForDeckOut(next,plan.controllerTeam);
  }else{
   const drawn=deck.splice(0,3);
   for(const card of drawn){
    const metadata=getDuelCard(card.id);
    if(!metadata)throw new Error('Carta comprada sem metadados habilitados.');
    revealedCards.push({uid:card.uid,id:card.id,name:metadata.name,kind:metadata.kind});
    if(metadata.kind==='spell'){
     next.core.players[affectedTeam].grave.push(card);
     discardedSpellUids.push(card.uid);
    }else{
     privateHandForSeat(next,activeOpponentSeat).push(card);
     keptUids.push(card.uid);
    }
   }
   next.core.log.push('Hiro’s Shadow Scout revelou: '+revealedCards.map(card=>card.name).join(', ')+'.');
   if(discardedSpellUids.length)next.core.log.push('As Magias reveladas foram enviadas ao Cemitério.');
   next.core.log=next.core.log.slice(-12);
  }
 }
 assertHiroPhysicalRules(next);
 if(before!==inventorySignature(next))throw new Error('M587 alterou a identidade ou o inventário físico das cartas.');
 assertTagDuel(next);
 return {state:next,affectedTeam,activeOpponentSeat,revealedCards,discardedSpellUids,keptUids,deckOut,negated};
}

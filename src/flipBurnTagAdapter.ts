import type {CardRef} from './duelEngine';
import {getDuelCard} from './effectRegistry';
import {rulesFor} from './rulesProfile';
import {assertTagDuel,tagInventory,type TagDuel} from './tagDuel';

export type FlipBurnCardIds={desKoala:string;princessOfTsurugi:string};
export const DEFAULT_FLIP_BURN_CARD_IDS:Readonly<FlipBurnCardIds>=Object.freeze({
 desKoala:'69579761',
 princessOfTsurugi:'51371017'
});
export type FlipCause='flip-summon'|'battle'|'card-effect';
export type FlipFaceUpEvent={
 id:string;
 kind:'flip-face-up';
 sourceUid:string;
 sourceId:string;
 controllerTeam:0|1;
 turn:number;
 cause:FlipCause;
 wasFaceDown:true;
 faceUp:true;
};
export type FlipBurnKind='des-koala'|'princess-of-tsurugi';
export type FlipBurnPlan={
 kind:FlipBurnKind;
 eventId:string;
 sourceUid:string;
 sourceId:string;
 ownerSeat:0|1|2|3;
 ownerTeam:0|1;
 controllerTeam:0|1;
 turn:number;
 cause:FlipCause;
};
export type FlipBurnResolution={
 state:TagDuel;
 damage:number;
 countedCards:number;
 affectedTeam:0|1;
 negated:boolean;
};

const isTeam=(value:unknown):value is 0|1=>value===0||value===1;
function physicalSeat(uid:string):0|1|2|3|null{
 const match=/^m([0-3]):/.exec(uid);
 return match?Number(match[1]) as 0|1|2|3:null;
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

/** Validates the owner's 20–30/3+3/Extra 5 profile without enforcing the hand cap mid-turn. */
export function assertFlipBurnPhysicalRules(duel:TagDuel):void{
 assertTagDuel(duel);
 if(duel.mode!=='tag-classic')throw new Error('O adapter M586 exige TagDuel clássico.');
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5)throw new Error('Perfil de regras incompatível com o proprietário.');
 const main=[0,0,0,0],extra=[0,0,0,0];
 for(const ref of tagInventory(duel)){
  if(ref.entityKind==='token')continue;
  const seat=physicalSeat(ref.uid);
  if(seat===null)throw new Error('UID sem proprietário físico m0–m3.');
  const metadata=getDuelCard(ref.id);
  if(!metadata)throw new Error('Carta sem metadados certificados no estado de teste.');
  if(metadata.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck principal físico fora do limite 20–30.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excede cinco cartas.');
 }
 for(const team of duel.core.players){
  if(team.monsters.length>rules.monsterZones)throw new Error('Equipe excedeu as três Zonas de Monstros.');
  if(team.backrow.length>rules.spellTrapZones)throw new Error('Equipe excedeu as três Zonas de Magias/Armadilhas.');
  // Field Zone is intentionally separate from the three Spell/Trap Zones.
 }
}

function finishForLifePoints(duel:TagDuel):void{
 const zero0=duel.core.players[0].lp<=0;
 const zero1=duel.core.players[1].lp<=0;
 if(!zero0&&!zero1)return;
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
 duel.core.winner=zero0&&zero1?null:zero0?duel.core.players[1].id:duel.core.players[0].id;
 duel.core.reason='pontos de vida';
 duel.core.log.push('Duelo encerrado por pontos de vida.');
 duel.core.log=duel.core.log.slice(-12);
}

/**
 * Builds a FLIP trigger from the engine's flip-face-up event snapshot.
 * The event may be caused by Flip Summon, battle, or a card effect. The source
 * may already have left the field when the event is queued; its physical UID
 * and the controller at the moment of the flip are captured here.
 */
export function prepareFlipBurnTrigger(duel:TagDuel,event:FlipFaceUpEvent,cardIds:FlipBurnCardIds=DEFAULT_FLIP_BURN_CARD_IDS):FlipBurnPlan|null{
 assertFlipBurnPhysicalRules(duel);
 if(duel.core.phase==='finished'||!event||event.kind!=='flip-face-up'||event.wasFaceDown!==true||event.faceUp!==true||event.turn!==duel.core.turn||!isTeam(event.controllerTeam)||typeof event.id!=='string'||!event.id.trim()||event.id.length>128||!['flip-summon','battle','card-effect'].includes(event.cause))return null;
 const kind:FlipBurnKind|null=event.sourceId===cardIds.desKoala?'des-koala':event.sourceId===cardIds.princessOfTsurugi?'princess-of-tsurugi':null;
 if(!kind)return null;
 const ownerSeat=physicalSeat(event.sourceUid);
 if(ownerSeat===null)return null;
 const source=tagInventory(duel).find(card=>card.uid===event.sourceUid);
 if(!source||source.id!==event.sourceId||source.entityKind==='token')return null;
 for(let team=0;team<2;team++){
  const onField=duel.core.players[team].monsters.find(monster=>monster.uid===event.sourceUid);
  if(onField&&(!onField.faceUp||team!==event.controllerTeam))return null;
 }
 return {kind,eventId:event.id,sourceUid:event.sourceUid,sourceId:event.sourceId,ownerSeat,ownerTeam:(ownerSeat%2) as 0|1,controllerTeam:event.controllerTeam,turn:event.turn,cause:event.cause};
}

/**
 * Resolves against the opponent state at resolution time. Des Koala reads only
 * the active opposing seat's private hand; Princess counts all opposing-team
 * backrow cards (including face-down/equipped) and the separate Field Zone.
 * The trigger's controller is captured, so a later control change cannot retarget.
 */
export function resolveFlipBurn(input:TagDuel,plan:FlipBurnPlan,options:{negated?:boolean;cardIds?:FlipBurnCardIds}={}):FlipBurnResolution|null{
 assertFlipBurnPhysicalRules(input);
 if(!plan||input.core.phase==='finished'||plan.turn!==input.core.turn||!isTeam(plan.controllerTeam)||!isTeam(plan.ownerTeam)||plan.ownerSeat<0||plan.ownerSeat>3||plan.ownerTeam!==plan.ownerSeat%2||physicalSeat(plan.sourceUid)!==plan.ownerSeat||typeof plan.eventId!=='string'||!plan.eventId.trim())return null;
 const cardIds=options.cardIds??DEFAULT_FLIP_BURN_CARD_IDS;
 const expectedId=plan.kind==='des-koala'?cardIds.desKoala:plan.kind==='princess-of-tsurugi'?cardIds.princessOfTsurugi:null;
 if(!expectedId||plan.sourceId!==expectedId||!['flip-summon','battle','card-effect'].includes(plan.cause))return null;
 const source=tagInventory(input).find(card=>card.uid===plan.sourceUid);
 if(!source||source.id!==plan.sourceId||source.entityKind==='token')return null;
 const before=inventorySignature(input);
 const next=structuredClone(input);
 next.reserves=next.core.teamRotation!.reserves as TagDuel['reserves'];
 const affectedTeam=(1-plan.controllerTeam) as 0|1;
 let countedCards=0,damage=0;
 const negated=options.negated===true;
 if(!negated){
  if(plan.kind==='des-koala'){
   const opposingActiveSeat=next.active[affectedTeam];
   countedCards=privateHandForSeat(next,opposingActiveSeat).length;
   damage=countedCards*400;
  }else{
   const opposingField=next.core.players[affectedTeam];
   countedCards=opposingField.backrow.length+(opposingField.field?1:0);
   damage=countedCards*500;
  }
  if(damage>0)next.core.players[affectedTeam].lp-=damage;
  finishForLifePoints(next);
  if(damage>0){
   next.core.log.push((plan.kind==='des-koala'?'Des Koala':'Princess of Tsurugi')+' causou '+damage+' de dano à Equipe '+(affectedTeam===0?'Azul':'Vermelha')+'.');
   next.core.log=next.core.log.slice(-12);
  }
 }
 assertFlipBurnPhysicalRules(next);
 if(before!==inventorySignature(next))throw new Error('M586 alterou a identidade ou o inventário físico das cartas.');
 assertTagDuel(next);
 return {state:next,damage,countedCards,affectedTeam,negated};
}

import type {CardRef} from './duelEngine';
import {getDuelCard} from './effectRegistry';
import {rulesFor} from './rulesProfile';
import {assertTagDuel,tagInventory,type TagDuel} from './tagDuel';

export const MAGICAL_MERCHANT_ID='32362575';
type Seat=0|1|2|3;
type Team=0|1;
export type MagicalMerchantCause='flip-summon'|'battle'|'card-effect';
export type MagicalMerchantFlipEvent={
 id:string;
 kind:'flip-face-up';
 sourceUid:string;
 sourceId:string;
 controllerTeam:Team;
 turn:number;
 cause:MagicalMerchantCause;
 wasFaceDown:true;
 faceUp:true;
};
export type MagicalMerchantPlan={
 eventId:string;
 sourceUid:string;
 sourceId:string;
 ownerSeat:Seat;
 ownerTeam:Team;
 controllerTeam:Team;
 activeSeat:Seat;
 turn:number;
 cause:MagicalMerchantCause;
};
export type MagicalMerchantRevealedCard={uid:string;id:string;name:string;kind:string};
export type MagicalMerchantResolution={
 state:TagDuel;
 revealedCards:MagicalMerchantRevealedCard[];
 addedUid:string|null;
 sentToGraveUids:string[];
 remainingDeckUids:string[];
 negated:boolean;
};

function isTeam(value:unknown):value is Team{return value===0||value===1;}
function physicalSeat(uid:string):Seat|null{
 const match=/^m([0-3]):/.exec(uid);
 return match?Number(match[1]) as Seat:null;
}
function privateDeckForSeat(duel:TagDuel,seat:Seat):CardRef[]{
 const team=(seat%2) as Team;
 if(duel.active[team]===seat)return duel.core.players[team].deck;
 const reserve=duel.reserves[String(seat)];
 if(!reserve)throw new Error('Deck privado do assento físico não encontrado.');
 return reserve.deck;
}
function privateHandForSeat(duel:TagDuel,seat:Seat):CardRef[]{
 const team=(seat%2) as Team;
 if(duel.active[team]===seat)return duel.core.players[team].hand;
 const reserve=duel.reserves[String(seat)];
 if(!reserve)throw new Error('Mão privada do assento físico não encontrada.');
 return reserve.hand;
}
function inventorySignature(duel:TagDuel):string{
 return tagInventory(duel).map(card=>card.uid+'|'+card.id).sort().join('\n');
}
function assertSameInventory(before:string,after:TagDuel):void{
 if(before!==inventorySignature(after))throw new Error('M589 alterou a identidade ou o inventário físico das cartas.');
}

/** Pure physical Extra Deck cap used by the same invariant applied to all four seats. */
export function assertMagicalMerchantExtraDeckCounts(extraCounts:readonly number[],maximum=5):void{
 if(!Array.isArray(extraCounts)||extraCounts.length!==4||!Number.isSafeInteger(maximum)||maximum<0||
    extraCounts.some(count=>!Number.isSafeInteger(count)||count<0))throw new Error('Contagem do Deck Adicional inválida.');
 if(extraCounts.some(count=>count>maximum))throw new Error('Deck Adicional físico excede cinco cartas.');
}

/** Enforces the owner's 20–30 / hand-six-End-Phase / 3+3 / Extra-5 classic profile. */
export function assertMagicalMerchantPhysicalRules(duel:TagDuel):void{
 assertTagDuel(duel);
 if(duel.mode!=='tag-classic')throw new Error('O adapter M589 exige TagDuel clássico.');
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
    rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5)throw new Error('Perfil de regras incompatível com o proprietário.');
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
 }
 assertMagicalMerchantExtraDeckCounts(extra,rules.extraDeckMax);
 for(const team of duel.core.players){
  if(team.monsters.length>rules.monsterZones)throw new Error('Equipe excedeu as três Zonas de Monstros.');
  if(team.backrow.length>rules.spellTrapZones)throw new Error('Equipe excedeu as três Zonas de Magias/Armadilhas.');
  // Field Zone is separate from the three shared Spell/Trap slots.
 }
}

/** The controller's active representative supplies the private Deck, even if the card was stolen. */
export function prepareMagicalMerchantTrigger(
 duel:TagDuel,
 event:MagicalMerchantFlipEvent,
 cardId=MAGICAL_MERCHANT_ID
):MagicalMerchantPlan|null{
 assertMagicalMerchantPhysicalRules(duel);
 if(duel.core.phase==='finished'||!event||event.kind!=='flip-face-up'||
    typeof event.id!=='string'||!event.id.trim()||event.id.length>128||
    event.sourceId!==cardId||event.wasFaceDown!==true||event.faceUp!==true||
    !isTeam(event.controllerTeam)||event.turn!==duel.core.turn||
    !['flip-summon','battle','card-effect'].includes(event.cause))return null;
 const ownerSeat=physicalSeat(event.sourceUid);
 if(ownerSeat===null)return null;
 const ownerTeam=(ownerSeat%2) as Team;
 const activeSeat=duel.active[event.controllerTeam] as Seat;
 if(duel.members[activeSeat]?.team!==event.controllerTeam)return null;
 const source=duel.core.players[event.controllerTeam].monsters.find(monster=>
  monster.uid===event.sourceUid&&monster.id===cardId&&monster.faceUp);
 if(!source||source.position!=='atk'&&source.position!=='def')return null;
 return {
  eventId:event.id,sourceUid:event.sourceUid,sourceId:cardId,ownerSeat,ownerTeam,
  controllerTeam:event.controllerTeam,activeSeat,turn:event.turn,cause:event.cause
 };
}

/**
 * Reveals the controller's active physical Deck until the first Spell/Trap.
 * That one card goes to the same seat's hand; all other excavated cards go to
 * the team's shared Graveyard. If no Spell/Trap exists, the whole Deck is sent.
 */
export function resolveMagicalMerchant(
 input:TagDuel,
 plan:MagicalMerchantPlan,
 options:{negated?:boolean;cardId?:string}={}
):MagicalMerchantResolution|null{
 assertMagicalMerchantPhysicalRules(input);
 const cardId=options.cardId??MAGICAL_MERCHANT_ID;
 if(!plan||typeof plan.eventId!=='string'||!plan.eventId.trim()||plan.sourceId!==cardId||
    !Number.isSafeInteger(plan.turn)||plan.turn!==input.core.turn||
    !isTeam(plan.ownerTeam)||!isTeam(plan.controllerTeam)||
    plan.ownerSeat<0||plan.ownerSeat>3||plan.ownerTeam!==plan.ownerSeat%2||
    plan.activeSeat<0||plan.activeSeat>3||plan.activeSeat%2!==plan.controllerTeam||
    physicalSeat(plan.sourceUid)!==plan.ownerSeat||
    input.active[plan.controllerTeam]!==plan.activeSeat)return null;
 const source=tagInventory(input).find(card=>card.uid===plan.sourceUid&&card.id===cardId);
 if(!source||source.entityKind==='token')return null;
 const before=inventorySignature(input);
 const next=structuredClone(input);
 const revealedCards:MagicalMerchantRevealedCard[]=[];
 const sentToGraveUids:string[]=[];
 let addedUid:string|null=null;
 const negated=options.negated===true;
 if(!negated){
  const deck=privateDeckForSeat(next,plan.activeSeat);
  const hand=privateHandForSeat(next,plan.activeSeat);
  let foundSpellTrap=false;
  for(const ref of deck){
   const metadata=getDuelCard(ref.id);
   if(!metadata)throw new Error('Carta revelada sem metadados habilitados.');
   revealedCards.push({uid:ref.uid,id:ref.id,name:metadata.name,kind:metadata.kind});
   if(metadata.kind==='spell'||metadata.kind==='trap'){foundSpellTrap=true;break;}
  }
  const excavated=deck.splice(0,revealedCards.length);
  if(foundSpellTrap){
   const selected=excavated.pop()!;
   hand.push(selected);
   addedUid=selected.uid;
   for(const card of excavated){next.core.players[plan.controllerTeam].grave.push(card);sentToGraveUids.push(card.uid);}
  }else{
   for(const card of excavated){next.core.players[plan.controllerTeam].grave.push(card);sentToGraveUids.push(card.uid);}
  }
  const summary=foundSpellTrap
   ?'Magical Merchant revelou '+revealedCards.length+' cartas, adicionou '+revealedCards[revealedCards.length-1].name+' à mão de '+next.members[plan.activeSeat].name+' e enviou '+sentToGraveUids.length+' ao Cemitério.'
   :'Magical Merchant não encontrou Magia/Armadilha; enviou '+sentToGraveUids.length+' cartas reveladas ao Cemitério.';
  next.core.log.push(summary);
  next.core.log=next.core.log.slice(-12);
 }
 assertMagicalMerchantPhysicalRules(next);
 assertSameInventory(before,next);
 assertTagDuel(next);
 return {
  state:next,revealedCards,addedUid,sentToGraveUids,
  remainingDeckUids:privateDeckForSeat(next,plan.activeSeat).map(card=>card.uid),negated
 };
}

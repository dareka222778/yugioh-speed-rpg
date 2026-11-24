import type {CardRef} from './duelEngine';
import {getDuelCard} from './effectRegistry';
import {rulesFor} from './rulesProfile';
import {assertTagDuel,tagInventory,type TagDuel} from './tagDuel';

export const DICE_JAR_ID='03549275';
export const FIRE_SORCERER_ID='27132350';
type Seat=0|1|2|3;
type Team=0|1;
export type FlipCause='flip-summon'|'battle'|'card-effect';
export type FlipFaceUpEvent={
 id:string;
 kind:'flip-face-up';
 sourceUid:string;
 sourceId:string;
 controllerTeam:Team;
 turn:number;
 cause:FlipCause;
 wasFaceDown:true;
 faceUp:true;
};
export type FlipRandomCardIds={diceJar:string;fireSorcerer:string};
export const DEFAULT_FLIP_RANDOM_CARD_IDS:Readonly<FlipRandomCardIds>=Object.freeze({
 diceJar:DICE_JAR_ID,
 fireSorcerer:FIRE_SORCERER_ID
});
export type FlipRandomKind='dice-jar'|'fire-sorcerer';
export type FlipRandomPlan={
 kind:FlipRandomKind;
 eventId:string;
 sourceUid:string;
 sourceId:string;
 ownerSeat:Seat;
 ownerTeam:Team;
 controllerTeam:Team;
 controllerSeat:Seat;
 turn:number;
 cause:FlipCause;
};
export type DiceJarResolution={
 state:TagDuel;
 controllerRoll:number|null;
 opponentRoll:number|null;
 loserTeam:Team|null;
 damage:number;
 tiedRolls:number;
 negated:boolean;
};
export type FireSorcererResolution={
 state:TagDuel;
 banishedUids:string[];
 damage:number;
 affectedTeam:Team;
 controllerSeat:Seat;
 insufficientHand:boolean;
 negated:boolean;
};

const isTeam=(value:unknown):value is Team=>value===0||value===1;
const isSeat=(value:unknown):value is Seat=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=3;
function physicalSeat(uid:string):Seat|null{
 const match=/^m([0-3]):/.exec(uid);
 return match?Number(match[1]) as Seat:null;
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
 if(before!==inventorySignature(after))throw new Error('M590 alterou a identidade ou o inventário físico das cartas.');
}

/** Pure physical Extra Deck cap used by the full TagDuel invariant. */
export function assertPhysicalExtraDeckCounts(extraCounts:readonly number[],maximum=5):void{
 if(!Array.isArray(extraCounts)||extraCounts.length!==4||!Number.isSafeInteger(maximum)||maximum<0||
    extraCounts.some(count=>!Number.isSafeInteger(count)||count<0))throw new Error('Contagem do Deck Adicional inválida.');
 if(extraCounts.some(count=>count>maximum))throw new Error('Deck Adicional físico excede cinco cartas.');
}

/** Enforces 20–30 per physical seat, hand 6 at End Phase, 3+3 shared zones,
 * separate Field Zone and Extra Deck 5 without discarding a mid-turn hand. */
export function assertFlipRandomPhysicalRules(duel:TagDuel):void{
 assertTagDuel(duel);
 if(duel.mode!=='tag-classic')throw new Error('Os adapters M590 exigem TagDuel clássico.');
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
 assertPhysicalExtraDeckCounts(extra,rules.extraDeckMax);
 for(const team of duel.core.players){
  if(team.monsters.length>rules.monsterZones)throw new Error('Equipe excedeu o limite de zonas de monstros.');
  if(team.backrow.length>rules.spellTrapZones)throw new Error('Equipe excedeu o limite de zonas de magias/armadilhas.');
  // The Field Zone is separate and is deliberately not counted in the three backrow slots.
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

function validPlan(input:TagDuel,plan:FlipRandomPlan,kind:FlipRandomKind,cardIds:FlipRandomCardIds):boolean{
 if(!plan||input.core.phase==='finished'||plan.kind!==kind||plan.turn!==input.core.turn||
    !isTeam(plan.controllerTeam)||!isTeam(plan.ownerTeam)||!isSeat(plan.ownerSeat)||!isSeat(plan.controllerSeat)||
    plan.ownerTeam!==plan.ownerSeat%2||plan.controllerSeat%2!==plan.controllerTeam||
    input.active[plan.controllerTeam]!==plan.controllerSeat||physicalSeat(plan.sourceUid)!==plan.ownerSeat||
    typeof plan.eventId!=='string'||!plan.eventId.trim()||
    !['flip-summon','battle','card-effect'].includes(plan.cause))return false;
 const expectedId=kind==='dice-jar'?cardIds.diceJar:cardIds.fireSorcerer;
 if(plan.sourceId!==expectedId)return false;
 const source=tagInventory(input).find(card=>card.uid===plan.sourceUid);
 return !!source&&source.id===plan.sourceId&&source.entityKind!=='token';
}

/** Captures the active controller and physical owner when a real FLIP event is queued.
 * The trigger remains resolvable if the source leaves the field before resolution. */
export function prepareFlipRandomTrigger(
 duel:TagDuel,
 event:FlipFaceUpEvent,
 cardIds:FlipRandomCardIds=DEFAULT_FLIP_RANDOM_CARD_IDS
):FlipRandomPlan|null{
 assertFlipRandomPhysicalRules(duel);
 if(duel.core.phase==='finished'||!event||event.kind!=='flip-face-up'||event.wasFaceDown!==true||
    event.faceUp!==true||event.turn!==duel.core.turn||!isTeam(event.controllerTeam)||
    typeof event.id!=='string'||!event.id.trim()||event.id.length>128||
    !['flip-summon','battle','card-effect'].includes(event.cause))return null;
 const kind:FlipRandomKind|null=event.sourceId===cardIds.diceJar?'dice-jar':
  event.sourceId===cardIds.fireSorcerer?'fire-sorcerer':null;
 if(!kind)return null;
 const ownerSeat=physicalSeat(event.sourceUid);
 if(ownerSeat===null)return null;
 const source=tagInventory(duel).find(card=>card.uid===event.sourceUid);
 if(!source||source.id!==event.sourceId||source.entityKind==='token')return null;
 for(let team=0;team<2;team++){
  const onField=duel.core.players[team].monsters.find(monster=>monster.uid===event.sourceUid);
  if(onField&&(!onField.faceUp||team!==event.controllerTeam))return null;
 }
 return {
  kind,eventId:event.id,sourceUid:event.sourceUid,sourceId:event.sourceId,ownerSeat,
  ownerTeam:(ownerSeat%2) as Team,controllerTeam:event.controllerTeam,
  controllerSeat:duel.active[event.controllerTeam] as Seat,turn:event.turn,cause:event.cause
 };
}

/** Dice Jar rerolls both teams on ties. Rolls are injected from the host RNG so
 * the result is deterministic and testable; a 6 by the higher roller means 6000. */
export function resolveDiceJar(
 input:TagDuel,
 plan:FlipRandomPlan,
 rolls:readonly (readonly [number,number])[],
 options:{negated?:boolean;cardIds?:FlipRandomCardIds}={}
):DiceJarResolution|null{
 assertFlipRandomPhysicalRules(input);
 const cardIds=options.cardIds??DEFAULT_FLIP_RANDOM_CARD_IDS;
 if(!validPlan(input,plan,'dice-jar',cardIds))return null;
 const next=structuredClone(input);
 next.reserves=next.core.teamRotation!.reserves as TagDuel['reserves'];
 if(options.negated===true){
  assertFlipRandomPhysicalRules(next);
  assertTagDuel(next);
  return {state:next,controllerRoll:null,opponentRoll:null,loserTeam:null,damage:0,tiedRolls:0,negated:true};
 }
 if(!Array.isArray(rolls)||rolls.length===0||rolls.length>128)return null;
 let tiedRolls=0;
 for(const pair of rolls){
  if(!Array.isArray(pair)||pair.length!==2||!Number.isInteger(pair[0])||!Number.isInteger(pair[1])||
     pair[0]<1||pair[0]>6||pair[1]<1||pair[1]>6)return null;
  const controllerRoll=pair[0],opponentRoll=pair[1];
  if(controllerRoll===opponentRoll){tiedRolls++;continue;}
  const opponentTeam=(1-plan.controllerTeam) as Team;
  const loserTeam=(controllerRoll<opponentRoll?plan.controllerTeam:opponentTeam) as Team;
  const winnerRoll=Math.max(controllerRoll,opponentRoll);
  const damage=winnerRoll===6?6000:winnerRoll*500;
  next.core.players[loserTeam].lp-=damage;
  finishForLifePoints(next);
  next.core.log.push('Dice Jar: Equipe '+(loserTeam===0?'Azul':'Vermelha')+' perdeu '+damage+' PV após '+tiedRolls+' empate(s).');
  next.core.log=next.core.log.slice(-12);
  assertFlipRandomPhysicalRules(next);
  assertSameInventory(inventorySignature(input),next);
  assertTagDuel(next);
  return {state:next,controllerRoll,opponentRoll,loserTeam,damage,tiedRolls,negated:false};
 }
 return null;
}

/** Fire Sorcerer uses the active physical controller's private hand, not the
 * source card's original owner's hand. selectedUids are the host RNG's two choices. */
export function resolveFireSorcerer(
 input:TagDuel,
 plan:FlipRandomPlan,
 selectedUids:readonly string[],
 options:{negated?:boolean;cardIds?:FlipRandomCardIds}={}
):FireSorcererResolution|null{
 assertFlipRandomPhysicalRules(input);
 const cardIds=options.cardIds??DEFAULT_FLIP_RANDOM_CARD_IDS;
 if(!validPlan(input,plan,'fire-sorcerer',cardIds))return null;
 const affectedTeam=(1-plan.controllerTeam) as Team;
 const before=inventorySignature(input);
 const next=structuredClone(input);
 next.reserves=next.core.teamRotation!.reserves as TagDuel['reserves'];
 let banishedUids:string[]=[];
 let damage=0;
 let insufficientHand=false;
 const negated=options.negated===true;
 if(!negated){
  const hand=privateHandForSeat(next,plan.controllerSeat);
  if(hand.length<2){
   insufficientHand=true;
  }else{
   if(!Array.isArray(selectedUids)||selectedUids.length!==2||
      selectedUids.some(uid=>typeof uid!=='string'||!uid)||new Set(selectedUids).size!==2)return null;
   const chosen=selectedUids.map(uid=>hand.find(card=>card.uid===uid));
   if(chosen.some(card=>!card||physicalSeat(card.uid)!==plan.controllerSeat||card.entityKind==='token'))return null;
   const banished=next.core.players[plan.controllerTeam].banished??=[];
   for(const uid of selectedUids){
    const index=hand.findIndex(card=>card.uid===uid);
    if(index<0)return null;
    const [card]=hand.splice(index,1);
    banished.push(card);
    banishedUids.push(uid);
   }
   next.core.players[plan.controllerTeam].banished=banished;
   damage=800;
   next.core.players[affectedTeam].lp-=damage;
   finishForLifePoints(next);
   next.core.log.push('Fire Sorcerer baniu duas cartas da mão privada do assento '+plan.controllerSeat+' e causou 800 de dano à Equipe '+(affectedTeam===0?'Azul':'Vermelha')+'.');
   next.core.log=next.core.log.slice(-12);
  }
 }
 assertFlipRandomPhysicalRules(next);
 assertSameInventory(before,next);
 assertTagDuel(next);
 return {state:next,banishedUids,damage,affectedTeam,controllerSeat:plan.controllerSeat,insufficientHand,negated};
}

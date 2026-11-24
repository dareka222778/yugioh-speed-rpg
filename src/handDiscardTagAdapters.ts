import type {CardRef} from './duelEngine';
import {getDuelCard} from './effectRegistry';
import {rulesFor} from './rulesProfile';
import {assertTagDuel,tagInventory,type TagDuel} from './tagDuel';

export const THUNDER_DRAGON_ID='31786629';
export const ELECTRIC_SNAKE_ID='11324436';
type Seat=0|1|2|3;
type Team=0|1;

export type ThunderDragonPlan={
 eventId:string;
 sourceUid:string;
 sourceId:string;
 ownerSeat:Seat;
 ownerTeam:Team;
 turn:number;
};
export type ThunderDragonActivation={state:TagDuel;plan:ThunderDragonPlan};
export type ThunderDragonResolution={state:TagDuel;addedUids:string[];negated:boolean};

export type ElectricSnakeDiscardEvent={
 id:string;
 kind:'discard-to-grave';
 sourceUid:string;
 sourceId:string;
 from:'hand';
 to:'grave';
 by:'effect'|'cost'|'rule';
 effectControllerTeam:Team;
 turn:number;
};
export type ElectricSnakePlan={
 eventId:string;
 sourceUid:string;
 sourceId:string;
 ownerSeat:Seat;
 ownerTeam:Team;
 effectControllerTeam:Team;
 turn:number;
};
export type ElectricSnakeResolution={
 state:TagDuel;
 drawnUids:string[];
 deckOut:boolean;
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
 if(before!==inventorySignature(after))throw new Error('O adapter alterou a identidade ou o inventário físico das cartas.');
}

/** Enforces the owner's classic 2v2 profile without changing the saved duel. */
export function assertHandDiscardPhysicalRules(duel:TagDuel):void{
 assertTagDuel(duel);
 if(duel.mode!=='tag-classic')throw new Error('Os adapters M588 exigem TagDuel clássico.');
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
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excede cinco cartas.');
 }
 for(const team of duel.core.players){
  if(team.monsters.length>rules.monsterZones)throw new Error('Equipe excedeu as três Zonas de Monstros.');
  if(team.backrow.length>rules.spellTrapZones)throw new Error('Equipe excedeu as três Zonas de Magias/Armadilhas.');
  // The Field Zone is separate and is deliberately not counted in the three backrow slots.
 }
}
function activeMainHandSource(duel:TagDuel,sourceUid:string,cardId:string):{team:Team;seat:Seat;source:CardRef}|null{
 const core=duel.core;
 if(core.phase!=='main'||core.pending.kind!=='none'||core.chain.length!==0||core.turnEnding||core.handFlow||
    core.choice||typeof sourceUid!=='string'||!sourceUid)return null;
 const team=core.current as Team;
 const seat=duel.cursor as Seat;
 if(!isTeam(team)||duel.active[team]!==seat||duel.members[seat]?.team!==team)return null;
 const source=privateHandForSeat(duel,seat).find(card=>card.uid===sourceUid&&card.id===cardId&&card.entityKind!=='token');
 if(!source||physicalSeat(source.uid)!==seat)return null;
 return {team,seat,source};
}

/** Thunder Dragon discards itself as activation cost; each physical copy may be used independently. */
export function activateThunderDragon(input:TagDuel,sourceUid:string,options:{cardId?:string}={}):ThunderDragonActivation|null{
 assertHandDiscardPhysicalRules(input);
 const cardId=options.cardId??THUNDER_DRAGON_ID;
 const active=activeMainHandSource(input,sourceUid,cardId);
 if(!active)return null;
 const before=inventorySignature(input);
 const next=structuredClone(input);
 const hand=privateHandForSeat(next,active.seat);
 const index=hand.findIndex(card=>card.uid===sourceUid&&card.id===cardId);
 if(index<0)return null;
 const [cost]=hand.splice(index,1);
 next.core.players[active.team].grave.push(cost);
 const plan:ThunderDragonPlan={
  eventId:'thunder-dragon:'+next.core.turn+':'+sourceUid,
  sourceUid,sourceId:cardId,ownerSeat:active.seat,ownerTeam:active.team,turn:next.core.turn
 };
 assertHandDiscardPhysicalRules(next);
 assertSameInventory(before,next);
 assertTagDuel(next);
 return {state:next,plan};
}

/** Search is non-targeting and occurs at resolution; zero, one or two copies may be added. */
export function resolveThunderDragonSearch(
 input:TagDuel,
 plan:ThunderDragonPlan,
 selectedUids:readonly string[],
 options:{negated?:boolean;cardId?:string}={}
):ThunderDragonResolution|null{
 assertHandDiscardPhysicalRules(input);
 const cardId=options.cardId??THUNDER_DRAGON_ID;
 if(!plan||typeof plan.eventId!=='string'||!plan.eventId.trim()||plan.sourceId!==cardId||
    !Number.isInteger(plan.turn)||plan.turn!==input.core.turn||!isTeam(plan.ownerTeam)||
    plan.ownerSeat<0||plan.ownerSeat>3||plan.ownerTeam!==plan.ownerSeat%2||
    physicalSeat(plan.sourceUid)!==plan.ownerSeat||input.active[plan.ownerTeam]!==plan.ownerSeat||
    !Array.isArray(selectedUids)||selectedUids.length>2||
    selectedUids.some(uid=>typeof uid!=='string'||!uid)||new Set(selectedUids).size!==selectedUids.length)return null;
 const source=tagInventory(input).find(card=>card.uid===plan.sourceUid&&card.id===cardId);
 if(!source||source.entityKind==='token')return null;
 const negated=options.negated===true;
 if(negated&&selectedUids.length!==0)return null;
 const before=inventorySignature(input);
 const next=structuredClone(input);
 const deck=privateDeckForSeat(next,plan.ownerSeat);
 const hand=privateHandForSeat(next,plan.ownerSeat);
 const addedUids:string[]=[];
 for(const uid of selectedUids){
  const index=deck.findIndex(card=>card.uid===uid&&card.id===cardId&&card.entityKind!=='token');
  if(index<0)return null;
  const [card]=deck.splice(index,1);
  hand.push(card);
  addedUids.push(card.uid);
 }
 assertHandDiscardPhysicalRules(next);
 assertSameInventory(before,next);
 assertTagDuel(next);
 return {state:next,addedUids,negated};
}

function finishForDeckOut(duel:TagDuel,winnerTeam:Team):void{
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
 duel.core.reason='não conseguiu comprar 2 cartas';
 duel.core.log.push(duel.core.players[winnerTeam].name+' venceu: não conseguiu comprar 2 cartas.');
 duel.core.log=duel.core.log.slice(-12);
}

/** Only an opponent-controlled card effect that discards the active seat's own hand can trigger Electric Snake. */
export function prepareElectricSnakeTrigger(
 duel:TagDuel,
 event:ElectricSnakeDiscardEvent,
 cardId=ELECTRIC_SNAKE_ID
):ElectricSnakePlan|null{
 assertHandDiscardPhysicalRules(duel);
 if(duel.core.phase==='finished'||!event||event.kind!=='discard-to-grave'||
    typeof event.id!=='string'||!event.id.trim()||event.id.length>128||
    event.sourceId!==cardId||event.from!=='hand'||event.to!=='grave'||event.by!=='effect'||
    !isTeam(event.effectControllerTeam)||event.turn!==duel.core.turn)return null;
 const ownerSeat=physicalSeat(event.sourceUid);
 if(ownerSeat===null)return null;
 const ownerTeam=(ownerSeat%2) as Team;
 if(ownerTeam===event.effectControllerTeam||duel.active[ownerTeam]!==ownerSeat)return null;
 const source=duel.core.players[ownerTeam].grave.find(card=>card.uid===event.sourceUid&&card.id===cardId);
 if(!source||source.entityKind==='token')return null;
 return {
  eventId:event.id,sourceUid:event.sourceUid,sourceId:cardId,ownerSeat,ownerTeam,
  effectControllerTeam:event.effectControllerTeam,turn:event.turn
 };
}

/** Draws from the same physical owner's private Deck; classic drawCards fails atomically if fewer than two remain. */
export function resolveElectricSnakeDraw(
 input:TagDuel,
 plan:ElectricSnakePlan,
 options:{negated?:boolean;cardId?:string}={}
):ElectricSnakeResolution|null{
 assertHandDiscardPhysicalRules(input);
 const cardId=options.cardId??ELECTRIC_SNAKE_ID;
 if(!plan||typeof plan.eventId!=='string'||!plan.eventId.trim()||plan.sourceId!==cardId||
    !Number.isInteger(plan.turn)||plan.turn!==input.core.turn||!isTeam(plan.ownerTeam)||
    !isTeam(plan.effectControllerTeam)||plan.ownerTeam===plan.effectControllerTeam||
    plan.ownerSeat<0||plan.ownerSeat>3||plan.ownerTeam!==plan.ownerSeat%2||
    physicalSeat(plan.sourceUid)!==plan.ownerSeat||input.active[plan.ownerTeam]!==plan.ownerSeat)return null;
 const source=tagInventory(input).find(card=>card.uid===plan.sourceUid&&card.id===cardId);
 if(!source||source.entityKind==='token')return null;
 const before=inventorySignature(input);
 const next=structuredClone(input);
 const drawnUids:string[]=[];
 const negated=options.negated===true;
 let deckOut=false;
 if(!negated){
  const deck=privateDeckForSeat(next,plan.ownerSeat);
  if(deck.length<2){
   deckOut=true;
   finishForDeckOut(next,(1-plan.ownerTeam) as Team);
  }else{
   const drawn=deck.splice(0,2);
   privateHandForSeat(next,plan.ownerSeat).push(...drawn);
   drawnUids.push(...drawn.map(card=>card.uid));
   next.core.log.push('Electric Snake comprou duas cartas do Deck privado de '+next.members[plan.ownerSeat].name+'.');
   next.core.log=next.core.log.slice(-12);
  }
 }
 assertHandDiscardPhysicalRules(next);
 assertSameInventory(before,next);
 assertTagDuel(next);
 return {state:next,drawnUids,deckOut,negated};
}

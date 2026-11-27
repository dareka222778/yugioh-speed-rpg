import type {CardRef} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';

export const GRAVEKEEPERS_SERVANT_ID='16762927';
export const GRAVEKEEPERS_SERVANT_KONAMI_CID=4893;

export type GravekeeperServantLookup=(id:string)=>{kind:'spell';effect:'gravekeepers-servant'}|undefined;
export type AttackDeclarationEvent={eventId:string;attackerUid:string;attackerSeat:Seat;turn:number};
type Team=0|1;
type Seat=0|1|2|3;
type PhysicalHolder={deck:CardRef[];hand:CardRef[];extra?:CardRef[]};
type BackrowCard=TagDuel['core']['players'][number]['backrow'][number];
type ActiveSource={sourceUid:string;sourceId:string;sourceOwnerSeat:Seat;controllerTeam:Team;registeredTurn:number;epoch:number};
export type GravekeeperServantAttackResult={
 eventId:string;attackerUid:string;attackerSeat:Seat;sourceCount:number;requiredCards:number;paidUids:string[];
 allowed:boolean;reason:'no-active-source'|'paid'|'insufficient-deck'|'destination-replaced';replayed:boolean
};
export type GravekeeperServantSession={
 duel:TagDuel;activeSources:Record<string,ActiveSource>;negatedSources:Record<string,true>;
 receipts:Record<string,{event:AttackDeclarationEvent;result:GravekeeperServantAttackResult}>
};
export type CanSendDeckCardToGrave=(duel:TagDuel,card:CardRef,team:Team)=>boolean;

const defaultLookup:GravekeeperServantLookup=id=>id===GRAVEKEEPERS_SERVANT_ID?{kind:'spell',effect:'gravekeepers-servant'}:undefined;
const teamForSeat=(seat:Seat):Team=>(seat%2) as Team;
function physicalSeat(uid:string):Seat|null{const match=/^m([0-3]):/.exec(uid);return match?Number(match[1]) as Seat:null;}
function assertId(value:string,max=128):void{
 if(typeof value!=='string'||!value.trim()||value.length>max||!/^[a-zA-Z0-9:_-]+$/.test(value))throw new Error('Identificador de ataque inválido.');
}
function assertClassic(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic')throw new Error('O adapter exige TagDuel clássico.');
 assertTagDuel(duel);
 if(!duel.core.teamRotation||duel.core.players.length!==2||duel.members.length!==4||duel.active.length!==2)throw new Error('Estrutura física TagDuel incompleta.');
}
export function assertGravekeeperServantRules(duel:TagDuel):void{
 assertClassic(duel);
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5)throw new Error('O adapter exige Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra Deck 5.');
 for(let team=0;team<2;team++){
  const player=duel.core.players[team];
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Limite de zonas: mais de três Monster Zones.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Limite de zonas: mais de três Spell/Trap Zones.');
 }
 const extraUids=new Set<string>();
 for(const player of duel.core.players)for(const card of player.extra??[])extraUids.add(card.uid);
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 const main=[0,0,0,0],extra=[0,0,0,0];
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  const owner=physicalSeat(card.uid);if(owner===null)throw new Error('Carta sem proprietário físico.');
  if(extraUids.has(card.uid)||!!getDuelCard(card.id)?.fusion)extra[owner]++;else main[owner]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
 // A mão pode exceder seis durante o turno; o limite só é aplicado na End Phase.
}
function physicalHolder(duel:TagDuel,seat:Seat):PhysicalHolder{
 const team=teamForSeat(seat);
 if(duel.active[team]===seat)return duel.core.players[team] as PhysicalHolder;
 const held=duel.reserves[String(seat)];
 if(!held)throw new Error('Zona privada do assento físico não encontrada.');
 return held as PhysicalHolder;
}
function findMonster(duel:TagDuel,uid:string){
 for(const team of [0,1] as const){
  const monster=duel.core.players[team].monsters.find(card=>card.uid===uid);
  if(monster)return {team,monster};
 }
 return undefined;
}
function findSource(duel:TagDuel,team:Team,uid:string):BackrowCard|undefined{
 return duel.core.players[team].backrow.find(card=>card.uid===uid);
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
  result.set(card.uid,card.id);
 }
 return result;
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size)throw new Error('A resolução alterou a quantidade de cartas físicas.');
 for(const [uid,id]of before)if(after.get(uid)!==id)throw new Error('A resolução alterou a identidade física: '+uid);
}
function sourceEpoch(duel:TagDuel,uid:string):number{return duel.core.cardLifetimes?.[uid]?.epoch??0;}
function sourceIsActive(duel:TagDuel,session:GravekeeperServantSession,source:ActiveSource):boolean{
 const card=findSource(duel,source.controllerTeam,source.sourceUid);
 return !!card&&card.id===source.sourceId&&card.faceUp&&card.resolved===true&&sourceEpoch(duel,source.sourceUid)===source.epoch&&!session.negatedSources[source.sourceUid];
}
function assertAttackEvent(duel:TagDuel,event:AttackDeclarationEvent):void{
 if(!event||typeof event!=='object')throw new Error('Evento de declaração de ataque inválido.');
 assertId(event.eventId,96);assertId(event.attackerUid,128);
 if(!Number.isInteger(event.attackerSeat)||event.attackerSeat<0||event.attackerSeat>3||!Number.isSafeInteger(event.turn)||event.turn!==duel.core.turn||duel.core.phase!=='battle')throw new Error('Assento, fase ou turno da declaração inválido.');
 const team=teamForSeat(event.attackerSeat);
 if(duel.cursor!==event.attackerSeat||duel.active[team]!==event.attackerSeat||duel.core.current!==team)throw new Error('A declaração não pertence ao representante físico ativo.');
 const attacker=findMonster(duel,event.attackerUid);
 if(!attacker||attacker.team!==team||!attacker.monster.faceUp||attacker.monster.position!=='atk')throw new Error('O atacante não é um monstro face-up em Ataque da equipe ativa.');
}
function sameEvent(a:AttackDeclarationEvent,b:AttackDeclarationEvent):boolean{
 return a.eventId===b.eventId&&a.attackerUid===b.attackerUid&&a.attackerSeat===b.attackerSeat&&a.turn===b.turn;
}
function assertSession(session:GravekeeperServantSession):void{
 if(!session||!session.duel||!session.activeSources||!session.negatedSources||!session.receipts)throw new Error('Sessão Gravekeeper inválida.');
 assertGravekeeperServantRules(session.duel);
 for(const [uid,source]of Object.entries(session.activeSources)){
  if(uid!==source.sourceUid||physicalSeat(uid)!==source.sourceOwnerSeat||!Number.isInteger(source.controllerTeam)||source.controllerTeam<0||source.controllerTeam>1||!Number.isInteger(source.registeredTurn)||source.registeredTurn<1||!Number.isSafeInteger(source.epoch)||source.epoch<0)throw new Error('Registro de fonte contínua inválido.');
 }
 for(const [id,receipt]of Object.entries(session.receipts)){
  if(id!==receipt.event.eventId||receipt.result.eventId!==id||!Array.isArray(receipt.result.paidUids))throw new Error('Recibo de declaração inconsistente.');
 }
}

export function lookupGravekeeperServantEffect(id:string){return defaultLookup(id);}
export function createGravekeeperServantAdapter(
 lookup:GravekeeperServantLookup=defaultLookup,
 canSendToGrave:CanSendDeckCardToGrave=()=>true
){
 if(typeof lookup!=='function'||typeof canSendToGrave!=='function')throw new Error('Dependência do adapter inválida.');
 function createSession(duel:TagDuel):GravekeeperServantSession{
  assertGravekeeperServantRules(duel);
  return {duel:structuredClone(duel),activeSources:{},negatedSources:{},receipts:{}};
 }
 function registerSource(session:GravekeeperServantSession,controllerTeam:Team,sourceUid:string):ActiveSource{
  assertSession(session);assertId(sourceUid);
  if(controllerTeam!==0&&controllerTeam!==1)throw new Error('Equipe controladora inválida.');
  const card=findSource(session.duel,controllerTeam,sourceUid),effect=card?lookup(card.id):undefined,ownerSeat=physicalSeat(sourceUid);
  if(!card||!effect||effect.kind!=='spell'||effect.effect!=='gravekeepers-servant')throw new Error('A fonte não pertence à família Gravekeeper.');
  if(ownerSeat===null)throw new Error('A fonte não possui proprietário físico.');
  if(!card.faceUp||card.resolved!==true)throw new Error('Gravekeeper precisa estar face-up e resolvida.');
  const epoch=sourceEpoch(session.duel,sourceUid),previous=session.activeSources[sourceUid];
  if(previous&&previous.epoch!==epoch)delete session.negatedSources[sourceUid];
  const source:ActiveSource={sourceUid,sourceId:card.id,sourceOwnerSeat:ownerSeat,controllerTeam,registeredTurn:session.duel.core.turn,epoch};
  session.activeSources[sourceUid]=source;
  return structuredClone(source);
 }
 function setSourceNegated(session:GravekeeperServantSession,sourceUid:string,negated=true):boolean{
  assertSession(session);
  if(!session.activeSources[sourceUid])throw new Error('Fonte Gravekeeper não registrada.');
  if(negated)session.negatedSources[sourceUid]=true;else delete session.negatedSources[sourceUid];
  return !!session.negatedSources[sourceUid];
 }
 function removeSource(session:GravekeeperServantSession,sourceUid:string):boolean{
  assertSession(session);
  const existed=!!session.activeSources[sourceUid];
  delete session.activeSources[sourceUid];delete session.negatedSources[sourceUid];
  return existed;
 }
 function captureAttackDeclaration(session:GravekeeperServantSession,event:AttackDeclarationEvent):GravekeeperServantAttackResult{
  assertSession(session);
  const previous=session.receipts[event?.eventId];
  if(previous){
   if(!sameEvent(previous.event,event))throw new Error('ID de declaração reutilizado com dados diferentes.');
   return {...structuredClone(previous.result),replayed:true};
  }
  assertAttackEvent(session.duel,event);
  const attackerTeam=teamForSeat(event.attackerSeat);
  const active=Object.values(session.activeSources).filter(source=>source.controllerTeam!==attackerTeam&&sourceIsActive(session.duel,session,source));
  const requiredCards=active.length,before=inventorySnapshot(session.duel),holder=physicalHolder(session.duel,event.attackerSeat);
  let result:GravekeeperServantAttackResult;
  if(requiredCards===0){
   result={eventId:event.eventId,attackerUid:event.attackerUid,attackerSeat:event.attackerSeat,sourceCount:0,requiredCards:0,paidUids:[],allowed:true,reason:'no-active-source',replayed:false};
  }else if(holder.deck.length<requiredCards){
   result={eventId:event.eventId,attackerUid:event.attackerUid,attackerSeat:event.attackerSeat,sourceCount:requiredCards,requiredCards,paidUids:[],allowed:false,reason:'insufficient-deck',replayed:false};
  }else{
   const payment=holder.deck.slice(0,requiredCards);
   const replaceable=payment.some(card=>card.entityKind==='token'||!canSendToGrave(session.duel,card,attackerTeam));
   if(replaceable){
    result={eventId:event.eventId,attackerUid:event.attackerUid,attackerSeat:event.attackerSeat,sourceCount:requiredCards,requiredCards,paidUids:[],allowed:false,reason:'destination-replaced',replayed:false};
   }else{
    holder.deck.splice(0,requiredCards);
    session.duel.core.players[attackerTeam].grave.push(...payment);
    result={eventId:event.eventId,attackerUid:event.attackerUid,attackerSeat:event.attackerSeat,sourceCount:requiredCards,requiredCards,paidUids:payment.map(card=>card.uid),allowed:true,reason:'paid',replayed:false};
   }
  }
  assertSameInventory(before,session.duel);
  session.receipts[event.eventId]={event:structuredClone(event),result:structuredClone(result)};
  return structuredClone(result);
 }
 return {createSession,registerSource,setSourceNegated,removeSource,captureAttackDeclaration};
}

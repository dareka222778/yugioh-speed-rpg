import type {CardRef} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {assertDuelRandom,randomIndex} from './duelRandom';
import {getDuelCard} from './effectRegistry';

export const ROBBIN_GOBLIN_ID='88279736';
export const ROBBIN_GOBLIN_KONAMI_CID=4876;
export const ROBBIN_ZOMBIE_ID='83258273';
export const ROBBIN_ZOMBIE_KONAMI_CID=5920;

export type BattleDamageEffect='robbin-goblin'|'robbin-zombie';
export type BattleDamageLookup=(id:string)=>{kind:'trap';effect:BattleDamageEffect}|undefined;
export type BattleDamageEvent={eventId:string;attackerUid:string;attackerSeat:Seat;damagedSeat:Seat;damage:number;turn:number};
type Team=0|1;
type Seat=0|1|2|3;
type PhysicalHolder={deck:CardRef[];hand:CardRef[];extra?:CardRef[]};
type BackrowCard=TagDuel['core']['players'][number]['backrow'][number];
type ActiveSource={sourceUid:string;sourceId:string;sourceOwnerSeat:Seat;controllerTeam:Team;effect:BattleDamageEffect;registeredTurn:number};
type PendingTrigger={activationId:string;event:BattleDamageEvent;source:ActiveSource};
type CapturedEvent={event:BattleDamageEvent;activationIds:string[]};
export type BattleDamageTriggerResult={activationId:string;eventId:string;effect:BattleDamageEffect;negation:'none'|'activation'|'effect'|'source-inactive';targetSeat:Seat;applied:boolean;destination:'grave'|'none';replayed:boolean};
export type BattleDamageDisruptionSession={duel:TagDuel;activeSources:Record<string,ActiveSource>;negatedSources:Record<string,true>;events:Record<string,CapturedEvent>;pending:Record<string,PendingTrigger>;resolved:Record<string,BattleDamageTriggerResult>};

const defaultLookup:BattleDamageLookup=(id)=>{
 if(id===ROBBIN_GOBLIN_ID)return {kind:'trap',effect:'robbin-goblin'};
 if(id===ROBBIN_ZOMBIE_ID)return {kind:'trap',effect:'robbin-zombie'};
 return undefined;
};
export function lookupBattleDamageEffect(id:string){return defaultLookup(id);}
function teamForSeat(seat:Seat):Team{return (seat%2) as Team;}
function physicalSeat(uid:string):Seat|null{const match=/^m([0-3]):/.exec(uid);return match?Number(match[1]) as Seat:null;}
function assertId(value:string,max=128):void{if(typeof value!=='string'||!value.trim()||value.length>max||!/^[-a-zA-Z0-9:_]+$/.test(value))throw new Error('Identificador de evento inválido.');}
function assertClassic(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic')throw new Error('O adapter exige TagDuel clássico.');
 assertTagDuel(duel);
 if(!duel.core.teamRotation||duel.core.players.length!==2||duel.members.length!==4||duel.active.length!==2)throw new Error('Estrutura física TagDuel incompleta.');
}
export function assertBattleDamageRules(duel:TagDuel):void{
 assertClassic(duel);
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5)throw new Error('O adapter exige Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra Deck 5.');
 const extraUids=new Set<string>();
 for(let team=0;team<2;team++){
  const player=duel.core.players[team];
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Limite de zonas: mais de três Monster Zones.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Limite de zonas: mais de três Spell/Trap Zones.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 const main=[0,0,0,0],extra=[0,0,0,0];
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  const seat=physicalSeat(card.uid);if(seat===null)throw new Error('Carta sem proprietário físico.');
  if(extraUids.has(card.uid)||!!getDuelCard(card.id)?.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck Principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Deck Adicional físico excedeu cinco cartas no assento '+seat+'.');
 }
 // A mão pode exceder seis durante o turno; o limite é aplicado somente na End Phase.
}
function physicalHolder(duel:TagDuel,seat:Seat):PhysicalHolder{
 const team=teamForSeat(seat);
 if(duel.active[team]===seat)return duel.core.players[team] as PhysicalHolder;
 const held=duel.reserves[String(seat)];
 if(!held)throw new Error('Zona privada do assento físico não encontrada.');
 return held as PhysicalHolder;
}
function findMonster(duel:TagDuel,uid:string){
 for(const team of [0,1] as const){const monster=duel.core.players[team].monsters.find(card=>card.uid===uid);if(monster)return {team,monster};}
 return undefined;
}
function findSource(duel:TagDuel,team:Team,uid:string):BackrowCard|undefined{return duel.core.players[team].backrow.find(card=>card.uid===uid);}
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
function sourceIsActive(duel:TagDuel,session:BattleDamageDisruptionSession,source:ActiveSource):boolean{
 const card=findSource(duel,source.controllerTeam,source.sourceUid);
 return !!card&&card.id===source.sourceId&&card.faceUp&&card.resolved===true&&card.setTurn<duel.core.turn&&!session.negatedSources[source.sourceUid];
}
function assertDamageEvent(duel:TagDuel,event:BattleDamageEvent):void{
 if(!event||typeof event!=='object')throw new Error('Evento de dano de batalha inválido.');
 assertId(event.eventId,96);assertId(event.attackerUid,128);
 if(!Number.isInteger(event.attackerSeat)||event.attackerSeat<0||event.attackerSeat>3||!Number.isInteger(event.damagedSeat)||event.damagedSeat<0||event.damagedSeat>3)throw new Error('Assento físico inválido.');
 if(!Number.isSafeInteger(event.damage)||event.damage<0||!Number.isSafeInteger(event.turn)||event.turn!==duel.core.turn||duel.core.phase!=='battle')throw new Error('Dano, fase ou turno do evento inválido.');
 const attackerTeam=teamForSeat(event.attackerSeat),defenderTeam=teamForSeat(event.damagedSeat);
 if(attackerTeam===defenderTeam||duel.cursor!==event.attackerSeat||duel.active[attackerTeam]!==event.attackerSeat||duel.active[defenderTeam]!==event.damagedSeat||duel.core.current!==attackerTeam)throw new Error('O evento não corresponde aos assentos ativos das equipes.');
 const ownerSeat=physicalSeat(event.attackerUid),attacker=findMonster(duel,event.attackerUid);
 if(ownerSeat===null||teamForSeat(ownerSeat)!==attackerTeam||!attacker||attacker.team!==attackerTeam||!attacker.monster.faceUp||attacker.monster.position!=='atk')throw new Error('O atacante não é um monstro face-up em Ataque da equipe ativa.');
}
function sameEvent(a:BattleDamageEvent,b:BattleDamageEvent):boolean{return a.eventId===b.eventId&&a.attackerUid===b.attackerUid&&a.attackerSeat===b.attackerSeat&&a.damagedSeat===b.damagedSeat&&a.damage===b.damage&&a.turn===b.turn;}
function assertSession(session:BattleDamageDisruptionSession):void{
 if(!session||!session.duel||!session.activeSources||!session.negatedSources||!session.events||!session.pending||!session.resolved)throw new Error('Sessão de dano de batalha inválida.');
 assertBattleDamageRules(session.duel);assertDuelRandom(session.duel.core.random);
 for(const [uid,source]of Object.entries(session.activeSources))if(uid!==source.sourceUid||physicalSeat(uid)!==source.sourceOwnerSeat||!Number.isInteger(source.registeredTurn)||source.registeredTurn<1)throw new Error('Registro de fonte contínua inválido.');
 for(const [id,pending]of Object.entries(session.pending))if(id!==pending.activationId||!session.events[pending.event.eventId])throw new Error('Gatilho pendente inconsistente.');
 for(const [id,result]of Object.entries(session.resolved))if(id!==result.activationId)throw new Error('Recibo de resolução inconsistente.');
}
export function createBattleDamageDisruptionAdapter(lookup:BattleDamageLookup=defaultLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):BattleDamageDisruptionSession{
  assertBattleDamageRules(duel);assertDuelRandom(duel.core.random);
  return {duel:structuredClone(duel),activeSources:{},negatedSources:{},events:{},pending:{},resolved:{}};
 }
 function registerSource(session:BattleDamageDisruptionSession,controllerTeam:Team,sourceUid:string):ActiveSource{
  assertSession(session);assertId(sourceUid);
  if(controllerTeam!==0&&controllerTeam!==1)throw new Error('Equipe controladora inválida.');
  const source=findSource(session.duel,controllerTeam,sourceUid),ownerSeat=physicalSeat(sourceUid);
  if(!source||ownerSeat===null)throw new Error('A Armadilha não está na Zona de Magias/Armadilhas.');
  const info=lookup(source.id);
  if(!info||info.kind!=='trap')throw new Error('A carta não pertence à família Robbin.');
  if(!source.faceUp||source.resolved!==true||source.setTurn>=session.duel.core.turn)throw new Error('A Armadilha contínua ainda não foi ativada e resolvida.');
  const existing=session.activeSources[sourceUid];
  if(existing){
   if(existing.sourceId!==source.id||existing.controllerTeam!==controllerTeam||existing.effect!==info.effect)throw new Error('A fonte já está registrada com outra identidade.');
   if(sourceIsActive(session.duel,session,existing))return structuredClone(existing);
   delete session.activeSources[sourceUid];
  }
  const active:ActiveSource={sourceUid,sourceId:source.id,sourceOwnerSeat:ownerSeat,controllerTeam,effect:info.effect,registeredTurn:session.duel.core.turn};
  session.activeSources[sourceUid]=active;assertSession(session);return structuredClone(active);
 }
 function setSourceNegated(session:BattleDamageDisruptionSession,sourceUid:string,negated:boolean):void{
  assertSession(session);assertId(sourceUid);
  if(!session.activeSources[sourceUid])throw new Error('Fonte contínua não registrada.');
  if(negated)session.negatedSources[sourceUid]=true;else delete session.negatedSources[sourceUid];
 }
 function captureBattleDamage(session:BattleDamageDisruptionSession,event:BattleDamageEvent):{eventId:string;activationIds:string[];replayed:boolean}{
  assertSession(session);assertDamageEvent(session.duel,event);
  const previous=session.events[event.eventId];
  if(previous){if(!sameEvent(previous.event,event))throw new Error('Identificador de evento reutilizado com outro dano.');return {eventId:event.eventId,activationIds:[...previous.activationIds],replayed:true};}
  const working=structuredClone(session),activationIds:string[]=[];
  if(event.damage>0)for(const source of Object.values(working.activeSources)){
   if(source.controllerTeam!==teamForSeat(event.attackerSeat)||!sourceIsActive(working.duel,working,source))continue;
   const activationId=event.eventId+':'+source.sourceUid;assertId(activationId,256);
   if(working.pending[activationId]||working.resolved[activationId])throw new Error('Gatilho duplicado para a mesma fonte e evento.');
   working.pending[activationId]={activationId,event:structuredClone(event),source:structuredClone(source)};activationIds.push(activationId);
  }
  working.events[event.eventId]={event:structuredClone(event),activationIds:[...activationIds]};
  session.duel=working.duel;session.activeSources=working.activeSources;session.negatedSources=working.negatedSources;session.events=working.events;session.pending=working.pending;session.resolved=working.resolved;
  assertSession(session);return {eventId:event.eventId,activationIds,replayed:false};
 }
 function resolveTrigger(session:BattleDamageDisruptionSession,activationId:string,negation:'none'|'activation'|'effect'='none'):BattleDamageTriggerResult{
  assertSession(session);assertId(activationId,256);
  const cached=session.resolved[activationId];if(cached)return {...structuredClone(cached),replayed:true};
  const pending=session.pending[activationId];if(!pending)throw new Error('Gatilho de dano de batalha não preparado.');
  const working=structuredClone(session.duel),before=inventorySnapshot(working);
  let effectiveNegation:'none'|'activation'|'effect'|'source-inactive'=negation,applied=false;
  if(negation==='none'){
   if(!sourceIsActive(working,session,pending.source))effectiveNegation='source-inactive';
   else{
    const seat=pending.event.damagedSeat,team=teamForSeat(seat),holder=physicalHolder(working,seat),grave=working.core.players[team].grave;
    if(pending.source.effect==='robbin-goblin'&&holder.hand.length){
     const random=working.core.random;assertDuelRandom(random);
     const index=randomIndex(random,holder.hand.length),discarded=holder.hand.splice(index,1)[0];
     if(discarded){grave.push(discarded);applied=true;}
    }else if(pending.source.effect==='robbin-zombie'&&holder.deck.length){
     const top=holder.deck.splice(0,1)[0];if(top){grave.push(top);applied=true;}
    }
   }
  }
  const result:BattleDamageTriggerResult={activationId,eventId:pending.event.eventId,effect:pending.source.effect,negation:effectiveNegation,targetSeat:pending.event.damagedSeat,applied,destination:applied?'grave':'none',replayed:false};
  assertBattleDamageRules(working);assertSameInventory(before,working);assertTagDuel(working);
  session.duel=working;delete session.pending[activationId];session.resolved[activationId]=result;assertSession(session);
  return structuredClone(result);
 }
 return {createSession,registerSource,setSourceNegated,captureBattleDamage,resolveTrigger};
}

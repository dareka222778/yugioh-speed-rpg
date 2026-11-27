import type {CardRef} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';
import {synchronizeCardLifetimes} from './cardLifetime';

export const MATAZA_THE_ZAPPER_ID='22609617';
export const MATAZA_THE_ZAPPER_KONAMI_CID=5898;
export const ASURA_PRIEST_ID='02134346';
export const ASURA_PRIEST_KONAMI_CID=5381;

export type MultiAttackEffect='mataza-second-attack'|'asura-all-monsters';
export type MultiAttackLookup=(id:string)=>{kind:'monster';effect:MultiAttackEffect}|undefined;
export type AttackDeclarationEvent={
 eventId:string;attackerUid:string;attackerSeat:Seat;turn:number;targetUid?:string;direct?:boolean
};
export type AttackResult={
 eventId:string;attackerUid:string;effect:MultiAttackEffect;allowed:boolean;
 reason:'allowed'|'attack-limit'|'opponent-monsters-remain'|'target-already-attacked'|'direct-already-used'|'direct-after-monster'|'monster-after-direct';
 attacksUsed:number;replayed:boolean
};
export type SpiritSummonEvent={
 eventId:string;uid:string;controllerSeat:Seat;turn:number;kind:'normal'|'flip'|'special'
};
export type SpiritSummonReceipt={eventId:string;uid:string;ownerSeat:Seat;turn:number;kind:'normal'|'flip';replayed:boolean};
export type SpiritEndPhaseResult={eventId:string;turn:number;activationIds:string[];replayed:boolean};
export type SpiritReturnResult={
 activationId:string;uid:string;applied:boolean;
 reason:'returned'|'activation-negated'|'effect-negated'|'not-on-field'|'not-face-up'|'source-changed';replayed:boolean;nextActivationId?:string
};
type Team=0|1;
type Seat=0|1|2|3;
type MonsterCard=TagDuel['core']['players'][number]['monsters'][number];
type PhysicalHolder={deck:CardRef[];hand:CardRef[];extra?:CardRef[]};
type AttackLedger={turn:number;attacks:number;directAttacks:number;directBlocked:boolean;targetEpochs:Record<string,number>};
type AttackReceipt={event:AttackDeclarationEvent;result:AttackResult};
type SpiritSummon={eventId:string;uid:string;ownerSeat:Seat;controllerTeam:Team;turn:number;kind:'normal'|'flip'};
type SpiritActivation={activationId:string;endPhaseEventId:string;uid:string;ownerSeat:Seat;controllerTeam:Team;turn:number;retry:number};
type SpiritEndPhaseReceipt={eventId:string;activationIds:string[]};
type SpiritReceipt={outcome:'activation-negated'|'effect-negated'|'resolved';result:SpiritReturnResult};
export type MultiAttackSpiritSession={
 duel:TagDuel;
 attacks:Record<string,AttackLedger>;
 attackReceipts:Record<string,AttackReceipt>;
 spiritSummons:Record<string,SpiritSummon>;
 endPhases:Record<string,SpiritEndPhaseReceipt>;
 pendingReturns:Record<string,SpiritActivation>;
 spiritReceipts:Record<string,SpiritReceipt>
};

const defaultLookup:MultiAttackLookup=id=>{
 if(id===MATAZA_THE_ZAPPER_ID)return {kind:'monster',effect:'mataza-second-attack'};
 if(id===ASURA_PRIEST_ID)return {kind:'monster',effect:'asura-all-monsters'};
 return undefined;
};
const teamForSeat=(seat:Seat):Team=>(seat%2) as Team;
function physicalSeat(uid:string):Seat|null{
 const match=/^m([0-3]):/.exec(uid);return match?Number(match[1]) as Seat:null;
}
function assertId(value:string,max=192):void{
 if(typeof value!=='string'||!value.trim()||value.length>max||!/^[a-zA-Z0-9:_-]+$/.test(value)||['__proto__','constructor','prototype'].includes(value))throw new Error('Identificador do evento inválido.');
}
function assertClassic(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic')throw new Error('O adapter exige TagDuel clássico.');
 assertTagDuel(duel);
 if(!duel.core.teamRotation||duel.core.players.length!==2||duel.members.length!==4||duel.active.length!==2)throw new Error('Estrutura física TagDuel incompleta.');
}
export function assertMultiAttackSpiritRules(duel:TagDuel):void{
 assertClassic(duel);
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5)throw new Error('O adapter exige Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra Deck 5.');
 const extraUids=new Set<string>();
 for(const player of duel.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Limite de três Monster Zones excedido.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Limite de três Spell/Trap Zones excedido.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
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
 // A mão pode exceder seis durante o turno; o limite é aplicado apenas na End Phase.
}
function physicalHolder(duel:TagDuel,seat:Seat):PhysicalHolder{
 const team=teamForSeat(seat);
 if(duel.active[team]===seat)return duel.core.players[team] as PhysicalHolder;
 const held=duel.reserves[String(seat)];
 if(!held)throw new Error('Zona privada do proprietário físico não encontrada.');
 return held as PhysicalHolder;
}
function findMonster(duel:TagDuel,uid:string):{team:Team;monster:MonsterCard}|undefined{
 let found:{team:Team;monster:MonsterCard}|undefined;
 for(const team of [0,1] as const){
  const monster=duel.core.players[team].monsters.find(card=>card.uid===uid);
  if(monster){if(found)throw new Error('UID duplicado no campo.');found={team,monster};}
 }
 return found;
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
function cardEpoch(duel:TagDuel,uid:string):number{
 synchronizeCardLifetimes(duel.core);
 return duel.core.cardLifetimes?.[uid]?.epoch??0;
}
function assertAttackEvent(duel:TagDuel,event:AttackDeclarationEvent,lookup:MultiAttackLookup):{team:Team;attacker:{team:Team;monster:MonsterCard};effect:MultiAttackEffect}{
 if(!event||typeof event!=='object')throw new Error('Declaração de ataque inválida.');
 assertId(event.eventId,96);assertId(event.attackerUid,128);
 if(event.direct!==undefined&&typeof event.direct!=='boolean')throw new Error('Indicador de ataque direto inválido.');
 const direct=event.direct===true;
 if(direct===!!event.targetUid)throw new Error('Informe exatamente um alvo ou ataque direto.');
 if(event.targetUid)assertId(event.targetUid,128);
 if(!Number.isInteger(event.attackerSeat)||event.attackerSeat<0||event.attackerSeat>3||!Number.isSafeInteger(event.turn)||event.turn!==duel.core.turn||duel.core.phase!=='battle')throw new Error('Assento, fase ou turno da declaração inválido.');
 const team=teamForSeat(event.attackerSeat);
 if(duel.cursor!==event.attackerSeat||duel.active[team]!==event.attackerSeat||duel.core.current!==team)throw new Error('A declaração não pertence ao representante físico ativo.');
 const attacker=findMonster(duel,event.attackerUid);
 if(!attacker||attacker.team!==team||!attacker.monster.faceUp||attacker.monster.position!=='atk')throw new Error('O atacante não é um monstro face-up em Ataque da equipe ativa.');
 const effect=lookup(attacker.monster.id);
 if(!effect||effect.kind!=='monster')throw new Error('O atacante não pertence à família de ataques múltiplos.');
 if(event.targetUid){
  const target=findMonster(duel,event.targetUid);
  if(!target||target.team===team)throw new Error('O alvo não pertence à equipe adversária ou não está no campo.');
 }
 return {team,attacker,effect:effect.effect};
}
function sameAttackEvent(a:AttackDeclarationEvent,b:AttackDeclarationEvent):boolean{
 return a.eventId===b.eventId&&a.attackerUid===b.attackerUid&&a.attackerSeat===b.attackerSeat&&a.turn===b.turn&&a.targetUid===b.targetUid&&a.direct===b.direct;
}
function sameSpiritSummon(a:SpiritSummon,b:SpiritSummonEvent):boolean{
 return a.eventId===b.eventId&&a.uid===b.uid&&a.turn===b.turn&&a.kind===b.kind&&a.controllerTeam===teamForSeat(b.controllerSeat);
}
function assertSession(session:MultiAttackSpiritSession):void{
 if(!session||!session.duel||!session.attacks||!session.attackReceipts||!session.spiritSummons||!session.endPhases||!session.pendingReturns||!session.spiritReceipts)throw new Error('Sessão de ataques múltiplos/Spirit inválida.');
 assertMultiAttackSpiritRules(session.duel);
 for(const [uid,ledger] of Object.entries(session.attacks)){
  if(!uid||!Number.isSafeInteger(ledger.turn)||ledger.turn<1||!Number.isSafeInteger(ledger.attacks)||ledger.attacks<0||!Number.isSafeInteger(ledger.directAttacks)||ledger.directAttacks<0||typeof ledger.directBlocked!=='boolean'||!ledger.targetEpochs)throw new Error('Registro de ataques inconsistente.');
  for(const epoch of Object.values(ledger.targetEpochs))if(!Number.isSafeInteger(epoch)||epoch<0)throw new Error('Época de alvo inválida.');
 }
 for(const [id,receipt]of Object.entries(session.attackReceipts))if(id!==receipt.event.eventId||id!==receipt.result.eventId)throw new Error('Recibo de ataque inconsistente.');
 for(const [uid,summon]of Object.entries(session.spiritSummons))if(uid!==summon.uid||physicalSeat(uid)!==summon.ownerSeat||!Number.isSafeInteger(summon.turn)||summon.turn<1)throw new Error('Registro de Invocação Spirit inconsistente.');
 for(const [id,pending]of Object.entries(session.pendingReturns))if(id!==pending.activationId||physicalSeat(pending.uid)!==pending.ownerSeat||!Number.isSafeInteger(pending.retry)||pending.retry<0)throw new Error('Retorno Spirit pendente inconsistente.');
 for(const [id,receipt]of Object.entries(session.spiritReceipts))if(id!==receipt.result.activationId||!['activation-negated','effect-negated','resolved'].includes(receipt.outcome))throw new Error('Recibo de retorno Spirit inconsistente.');
}

export function lookupMultiAttackSpiritEffect(id:string){return defaultLookup(id);}
export function createMultiAttackSpiritAdapter(lookup:MultiAttackLookup=defaultLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):MultiAttackSpiritSession{
  assertMultiAttackSpiritRules(duel);
  return {duel:structuredClone(duel),attacks:{},attackReceipts:{},spiritSummons:{},endPhases:{},pendingReturns:{},spiritReceipts:{}};
 }
 function declareAttack(session:MultiAttackSpiritSession,event:AttackDeclarationEvent):AttackResult{
  assertSession(session);
  const previous=session.attackReceipts[event?.eventId];
  if(previous){
   if(!sameAttackEvent(previous.event,event))throw new Error('ID de ataque reutilizado com dados diferentes.');
   return {...previous.result,replayed:true};
  }
  const {team,attacker,effect}=assertAttackEvent(session.duel,event,lookup);
  const uid=attacker.monster.uid;
  const current=session.attacks[uid];
  const ledger:AttackLedger=current?.turn===event.turn?structuredClone(current):{turn:event.turn,attacks:0,directAttacks:0,directBlocked:false,targetEpochs:{}};
  const opposing=session.duel.core.players[1-team].monsters;
  const direct=event.direct===true;
  let allowed=false;
  let reason:AttackResult['reason']='allowed';
  if(effect==='mataza-second-attack'){
   if(ledger.attacks>=2)reason='attack-limit';
   else if(direct&&opposing.length>0)reason='opponent-monsters-remain';
   else allowed=true;
  }else if(direct){
   if(ledger.directAttacks>=1)reason='direct-already-used';
   else if(ledger.directBlocked)reason='direct-after-monster';
   else if(opposing.length>0)reason='opponent-monsters-remain';
   else allowed=true;
  }else{
   const targetUid=event.targetUid!;
   const epoch=cardEpoch(session.duel,targetUid);
   if(ledger.directAttacks>0)reason='monster-after-direct';
   else if(ledger.targetEpochs[targetUid]===epoch)reason='target-already-attacked';
   else allowed=true;
   if(allowed){ledger.targetEpochs[targetUid]=epoch;ledger.directBlocked=true;}
  }
  if(allowed){
   ledger.attacks++;
   if(effect==='asura-all-monsters'&&direct)ledger.directAttacks++;
  }
  session.attacks[uid]=ledger;
  const result:AttackResult={eventId:event.eventId,attackerUid:uid,effect,allowed,reason,attacksUsed:ledger.attacks,replayed:false};
  session.attackReceipts[event.eventId]={event:{...event},result};
  return result;
 }
 function canChangeControl(session:MultiAttackSpiritSession,uid:string):boolean{
  assertSession(session);assertId(uid,128);
  const found=findMonster(session.duel,uid);
  if(!found)return true;
  return !(found.monster.faceUp&&lookup(found.monster.id)?.effect==='mataza-second-attack');
 }
 function canSpecialSummon(id:string):boolean{return lookup(id)?.effect!=='asura-all-monsters';}
 function assertSummonAllowed(id:string,kind:'normal'|'flip'|'special'):true{
  if(kind==='special'&&!canSpecialSummon(id))throw new Error('Asura Priest não pode ser Invocado-Especialmente.');
  return true;
 }
 function recordSpiritSummon(session:MultiAttackSpiritSession,event:SpiritSummonEvent):SpiritSummonReceipt{
  assertSession(session);
  if(!event||typeof event!=='object')throw new Error('Evento de Invocação Spirit inválido.');
  assertId(event.eventId,96);assertId(event.uid,128);
  assertSummonAllowed(ASURA_PRIEST_ID,event.kind);
  if(event.kind!=='normal'&&event.kind!=='flip')throw new Error('Tipo de Invocação Spirit inválido.');
  if(!Number.isSafeInteger(event.turn)||event.turn!==session.duel.core.turn||!Number.isInteger(event.controllerSeat)||event.controllerSeat<0||event.controllerSeat>3)throw new Error('Turno ou assento de Invocação Spirit inválido.');
  const found=findMonster(session.duel,event.uid),effect=found?lookup(found.monster.id):undefined;
  if(!found||!found.monster.faceUp||effect?.effect!=='asura-all-monsters')throw new Error('A carta não é Asura Priest face-up no campo.');
  const team=found.team;
  if(session.duel.cursor!==event.controllerSeat||session.duel.active[team]!==event.controllerSeat||session.duel.core.current!==team)throw new Error('A Invocação não pertence ao representante ativo.');
  const ownerSeat=physicalSeat(event.uid);
  if(ownerSeat===null)throw new Error('Asura Priest não possui proprietário físico.');
  const previous=session.spiritSummons[event.uid];
  const summon:SpiritSummon={eventId:event.eventId,uid:event.uid,ownerSeat,controllerTeam:team,turn:event.turn,kind:event.kind};
  if(previous){
   if(!sameSpiritSummon(previous,event))throw new Error('A mesma instância Spirit foi registrada com evento diferente.');
   return {eventId:previous.eventId,uid:previous.uid,ownerSeat:previous.ownerSeat,turn:previous.turn,kind:previous.kind,replayed:true};
  }
  session.spiritSummons[event.uid]=summon;
  return {eventId:summon.eventId,uid:summon.uid,ownerSeat:summon.ownerSeat,turn:summon.turn,kind:summon.kind,replayed:false};
 }
 function beginSpiritEndPhase(session:MultiAttackSpiritSession,eventId:string,turn:number):SpiritEndPhaseResult{
  assertSession(session);assertId(eventId,96);
  if(!Number.isSafeInteger(turn)||turn!==session.duel.core.turn||session.duel.core.turnEnding!==true)throw new Error('O retorno Spirit só pode ser preparado durante a End Phase real do turno.');
  const key=String(turn),previous=session.endPhases[key];
  if(previous){
   if(previous.eventId!==eventId)throw new Error('A End Phase do turno já foi registrada com outro evento.');
   return {eventId,turn,activationIds:[...previous.activationIds],replayed:true};
  }
  const activationIds:string[]=[];
  for(const [uid,summon] of Object.entries(session.spiritSummons)){
   if(summon.turn!==turn)continue;
   const found=findMonster(session.duel,uid);
   if(!found||!found.monster.faceUp||lookup(found.monster.id)?.effect!=='asura-all-monsters'){delete session.spiritSummons[uid];continue;}
   const activationId=eventId+':'+uid;assertId(activationId);
   const pending:SpiritActivation={activationId,endPhaseEventId:eventId,uid,ownerSeat:summon.ownerSeat,controllerTeam:found.team,turn,retry:0};
   session.pendingReturns[activationId]=pending;activationIds.push(activationId);delete session.spiritSummons[uid];
  }
  session.endPhases[key]={eventId,activationIds:[...activationIds]};
  return {eventId,turn,activationIds,replayed:false};
 }
 function resolveSpiritReturn(session:MultiAttackSpiritSession,activationId:string,outcome:{activationNegated?:boolean;effectNegated?:boolean}={}):SpiritReturnResult{
  assertSession(session);assertId(activationId);
  if(!outcome||typeof outcome!=='object'||typeof outcome.activationNegated==='undefined'&&typeof outcome.effectNegated==='undefined'&&Object.keys(outcome).length||outcome.activationNegated!==undefined&&typeof outcome.activationNegated!=='boolean'||outcome.effectNegated!==undefined&&typeof outcome.effectNegated!=='boolean')throw new Error('Resultado de resolução Spirit inválido.');
  const activationNegated=outcome.activationNegated===true,effectNegated=outcome.effectNegated===true;
  if(activationNegated&&effectNegated)throw new Error('Uma ativação não pode ser simultaneamente negada e resolvida com efeito negado.');
  const outcomeKey:SpiritReceipt['outcome']=activationNegated?'activation-negated':effectNegated?'effect-negated':'resolved';
  const previous=session.spiritReceipts[activationId];
  if(previous){
   if(previous.outcome!==outcomeKey)throw new Error('O recibo Spirit foi repetido com resultado diferente.');
   return {...previous.result,replayed:true};
  }
  const pending=session.pendingReturns[activationId];
  if(!pending)throw new Error('Ativação Spirit pendente não encontrada.');
  let applied=false;
  let reason:SpiritReturnResult['reason']='not-on-field';
  let nextActivationId:string|undefined;
  if(activationNegated){
   const found=findMonster(session.duel,pending.uid);
   if(!found)reason='not-on-field';
   else if(!found.monster.faceUp)reason='not-face-up';
   else if(lookup(found.monster.id)?.effect!=='asura-all-monsters')reason='source-changed';
   else{
    nextActivationId=activationId+':retry:'+(pending.retry+1);assertId(nextActivationId);
    session.pendingReturns[nextActivationId]={...pending,activationId:nextActivationId,controllerTeam:found.team,retry:pending.retry+1};
    reason='activation-negated';
   }
  }else if(effectNegated)reason='effect-negated';
  else{
   const found=findMonster(session.duel,pending.uid);
   if(!found)reason='not-on-field';
   else if(!found.monster.faceUp)reason='not-face-up';
   else if(lookup(found.monster.id)?.effect!=='asura-all-monsters')reason='source-changed';
   else{
    const before=inventorySnapshot(session.duel);
    const card:CardRef={uid:found.monster.uid,id:found.monster.id,...(found.monster.properlySummoned?{properlySummoned:true}:{})};
    session.duel.core.players[found.team].monsters=session.duel.core.players[found.team].monsters.filter(monster=>monster.uid!==pending.uid);
    physicalHolder(session.duel,pending.ownerSeat).hand.push(card);
    synchronizeCardLifetimes(session.duel.core);
    assertSameInventory(before,session.duel);
    applied=true;reason='returned';
   }
  }
  delete session.pendingReturns[activationId];
  const result:SpiritReturnResult={activationId,uid:pending.uid,applied,reason,replayed:false,...(nextActivationId?{nextActivationId}:{})};
  session.spiritReceipts[activationId]={outcome:outcomeKey,result};
  return result;
 }
 return {createSession,declareAttack,canChangeControl,canSpecialSummon,assertSummonAllowed,recordSpiritSummon,beginSpiritEndPhase,resolveSpiritReturn};
}

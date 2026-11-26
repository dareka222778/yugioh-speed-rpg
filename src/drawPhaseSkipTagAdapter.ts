import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {assertTagDuel,tagInventory,type TagDuel} from './tagDuel';
import {engineCard} from './effectRegistry';
import {bindTarget,targetBindingValid,type TargetBinding} from './cardLifetime';
import {sendMonsterToGrave} from './monsterExit';
import type {DuelState} from './duelEngine';

export const OFFERINGS_TO_THE_DOOMED_ID='19230407';
export const TIME_SEAL_ID='35316708';
export type DrawSkipTeam=0|1;
export type DrawSkipSeat=0|1|2|3;
export type DrawSkipEffect='offerings'|'time-seal';
export type DrawSkipLookup=(id:string)=>{kind:'spell'|'trap';effect:DrawSkipEffect}|undefined;
export type DrawSkipReceipt={
 activationId:string;sourceUid:string;controllerTeam:DrawSkipTeam;actorSeat:DrawSkipSeat;turn:number;
 activationZone:'hand'|'set';setTurn?:number;targetUid?:string;
};
export type DrawSkipPlan={
 activationId:string;sourceUid:string;sourceOwnerSeat:DrawSkipSeat;controllerTeam:DrawSkipTeam;
 actorSeat:DrawSkipSeat;effect:DrawSkipEffect;turn:number;skipSeat:DrawSkipSeat;dueTurn:number;
 targetUid?:string;targetBinding?:TargetBinding;
};
export type DrawSkipResolution={
 activationId:string;effect:DrawSkipEffect;status:'destroyed'|'target-lost'|'scheduled'|'negated';
 skipSeat:DrawSkipSeat;dueTurn:number;destroyedUid?:string;turn:number;
};
export type DrawSkipSession={
 duel:TagDuel;pending:Record<string,DrawSkipPlan>;resolved:Record<string,DrawSkipResolution>;
 usedActivations:Record<string,true>;skipDrawBySeat:Record<string,number[]>;
};

export const defaultDrawSkipLookup:DrawSkipLookup=(id)=>{
 if(id===OFFERINGS_TO_THE_DOOMED_ID)return {kind:'spell',effect:'offerings'};
 if(id===TIME_SEAL_ID)return {kind:'trap',effect:'time-seal'};
 return undefined;
};
function validTeam(value:unknown):value is DrawSkipTeam{return value===0||value===1;}
function validSeat(value:unknown):value is DrawSkipSeat{return Number.isInteger(value)&&Number(value)>=0&&Number(value)<=3;}
function validId(value:unknown):value is string{return typeof value==='string'&&value.trim().length>0&&value.length<=128&&/^[-a-zA-Z0-9:_]+$/.test(value);}
function physicalSeat(uid:string):DrawSkipSeat|null{
 const match=/^m([0-3]):/.exec(uid);return match?Number(match[1]) as DrawSkipSeat:null;
}
function assertClassicShape(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic'||!duel.core||!Array.isArray(duel.core.players)||
  duel.core.players.length!==2||!Array.isArray(duel.active)||duel.active.length!==2||
  !Array.isArray(duel.members)||duel.members.length!==4||!duel.reserves||
  !duel.core.teamRotation||!Array.isArray(duel.core.chain)){
  throw new Error('O adapter exige TagDuel clássico 2v2.');
 }
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const result=new Map<string,string>();
 for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
  if(result.has(card.uid)||physicalSeat(card.uid)===null)throw new Error('Identidade física inválida: '+card.uid);
  result.set(card.uid,card.id);
 }
 return result;
}
function handSnapshot(duel:TagDuel):string[]{
 const result:string[]=[];
 for(const player of duel.core.players)for(const card of player.hand)result.push(card.uid);
 for(const held of Object.values(duel.reserves))for(const card of held.hand)result.push(card.uid);
 return result.sort();
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
 const after=inventorySnapshot(duel);
 if(after.size!==before.size)throw new Error('A operação alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('A operação alterou a identidade física: '+uid);
}
function assertHandsUnchanged(before:string[],duel:TagDuel):void{
 if(JSON.stringify(before)!==JSON.stringify(handSnapshot(duel)))throw new Error('A operação alterou uma mão privada.');
}
export function assertDrawPhaseSkipRules(duel:TagDuel):void{
 assertClassicShape(duel);
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
  rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('Regras incompatíveis: deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5.');
 }
 const extraUids=new Set<string>(),extra=[0,0,0,0],main=[0,0,0,0];
 for(const player of duel.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 for(const [uid,id] of inventorySnapshot(duel)){
  const seat=physicalSeat(uid);if(seat===null)throw new Error('Carta sem proprietário físico.');
  if(extraUids.has(uid)||!!engineCard(id)?.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)throw new Error('Deck principal fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)throw new Error('Extra Deck excedeu cinco cartas no assento '+seat+'.');
 }
}
function assertSession(session:DrawSkipSession):void{
 if(!session||!session.duel||!session.pending||!session.resolved||!session.usedActivations||!session.skipDrawBySeat)
  throw new Error('Sessão M660 inválida.');
 assertTagDuel(session.duel);assertDrawPhaseSkipRules(session.duel);
 for(let seat=0;seat<4;seat++){
  const due=session.skipDrawBySeat[String(seat)]??[];
  if(!Array.isArray(due)||due.some(turn=>!Number.isSafeInteger(turn)||turn<session.duel.core.turn)||
   new Set(due).size!==due.length)throw new Error('Fila de Draw Phase inválida para o assento '+seat+'.');
 }
}
function assertReceipt(receipt:DrawSkipReceipt):void{
 if(!receipt||!validId(receipt.activationId)||typeof receipt.sourceUid!=='string'||!receipt.sourceUid||
  !validTeam(receipt.controllerTeam)||!validSeat(receipt.actorSeat)||!Number.isSafeInteger(receipt.turn)||
  receipt.turn<1||(receipt.activationZone!=='hand'&&receipt.activationZone!=='set')){
  throw new Error('Recibo de ativação M660 inválido.');
 }
 if(receipt.activationZone==='set'&&(!Number.isSafeInteger(receipt.setTurn)||Number(receipt.setTurn)<0))
  throw new Error('Carta setada sem turno de preparação verificável.');
}
function findMonster(core:DuelState,uid:string){
 for(let team=0;team<2;team++){
  const monster=core.players[team].monsters.find(card=>card.uid===uid);
  if(monster)return {team:team as DrawSkipTeam,monster};
 }
 return undefined;
}
export function nextDrawTurnForSeat(duel:TagDuel,seat:DrawSkipSeat):number{
 assertClassicShape(duel);
 const steps=(seat-duel.cursor+4)%4||4;
 return duel.core.turn+steps;
}
export function nextOpponentDrawSeat(duel:TagDuel,controllerTeam:DrawSkipTeam):DrawSkipSeat{
 assertClassicShape(duel);
 const opponentTeam=(1-controllerTeam) as DrawSkipTeam;
 if(duel.core.current===opponentTeam)return ((duel.cursor+2)%4) as DrawSkipSeat;
 return duel.active[opponentTeam] as DrawSkipSeat;
}
function scheduleSkip(session:DrawSkipSession,seat:DrawSkipSeat,dueTurn:number):void{
 const key=String(seat),queue=session.skipDrawBySeat[key]??[];
 if(dueTurn<=session.duel.core.turn)throw new Error('O Draw Phase agendado não está no futuro.');
 if(!queue.includes(dueTurn))queue.push(dueTurn);
 queue.sort((a,b)=>a-b);session.skipDrawBySeat[key]=queue;
}

export function createDrawPhaseSkipAdapter(lookup:DrawSkipLookup=defaultDrawSkipLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):DrawSkipSession{
  assertTagDuel(duel);assertDrawPhaseSkipRules(duel);
  return {duel:structuredClone(duel),pending:{},resolved:{},usedActivations:{},
   skipDrawBySeat:{'0':[],'1':[],'2':[],'3':[]}};
 }
 function prepare(session:DrawSkipSession,receipt:DrawSkipReceipt):DrawSkipPlan{
  assertSession(session);assertReceipt(receipt);
  const duel=session.duel,core=duel.core;
  if(core.phase==='finished'||receipt.turn!==core.turn)throw new Error('Ativação obsoleta.');
  if(session.usedActivations[receipt.activationId])throw new Error('ID de ativação reutilizado.');
  const ownerSeat=physicalSeat(receipt.sourceUid);
  if(ownerSeat===null)throw new Error('UID físico da carta inválido.');
  const ownerTeam=(ownerSeat%2) as DrawSkipTeam;
  if(receipt.controllerTeam!==ownerTeam||duel.active[ownerTeam]!==receipt.actorSeat)
   throw new Error('O ativador precisa ser o membro ativo da equipe proprietária.');
  const source=core.players[ownerTeam].grave.find(card=>card.uid===receipt.sourceUid);
  const definition=source&&lookup(source.id);
  if(!source||!definition)throw new Error('A carta ativada precisa estar no Cemitério da equipe.');
  if(receipt.activationZone==='set'&&Number(receipt.setTurn)>=core.turn)
   throw new Error('A carta não pode ser ativada no mesmo turno em que foi setada.');
  let skipSeat:DrawSkipSeat,dueTurn:number,targetBinding:TargetBinding|undefined;
  if(definition.effect==='offerings'){
   if(definition.kind!=='spell'||!receipt.targetUid)throw new Error('Offerings exige um alvo face-up e um recibo de Quick-Play.');
   if(receipt.activationZone==='hand'&&(ownerSeat!==receipt.actorSeat||ownerTeam!==core.current||receipt.actorSeat!==duel.cursor))
    throw new Error('Quick-Play da mão só pode ser ativada pelo assento ativo no próprio turno.');
   const target=findMonster(core,receipt.targetUid);
   if(!target||!target.monster.faceUp)throw new Error('Offerings só pode selecionar monstro face-up.');
   targetBinding=bindTarget(core,receipt.targetUid);
   if(!targetBinding||targetBinding.zone!=='monsters')throw new Error('Target binding de monstro inválido.');
   skipSeat=receipt.actorSeat;dueTurn=nextDrawTurnForSeat(duel,skipSeat);
  }else{
   if(definition.kind!=='trap'||receipt.activationZone!=='set')throw new Error('Time Seal precisa ser uma Trap setada.');
   skipSeat=nextOpponentDrawSeat(duel,ownerTeam);dueTurn=nextDrawTurnForSeat(duel,skipSeat);
  }
  const plan:DrawSkipPlan={activationId:receipt.activationId,sourceUid:receipt.sourceUid,sourceOwnerSeat:ownerSeat,
   controllerTeam:ownerTeam,actorSeat:receipt.actorSeat,effect:definition.effect,turn:core.turn,skipSeat,dueTurn,
   targetUid:receipt.targetUid,targetBinding};
  session.pending[plan.activationId]=structuredClone(plan);session.usedActivations[plan.activationId]=true;
  return structuredClone(plan);
 }
 function resolve(session:DrawSkipSession,activationId:string,negated=false):DrawSkipResolution{
  assertSession(session);
  const previous=session.resolved[activationId];if(previous)return structuredClone(previous);
  const plan=session.pending[activationId];if(!plan)throw new Error('Não existe ativação M660 pendente.');
  if(session.duel.core.turn!==plan.turn||session.duel.active[plan.controllerTeam]!==plan.actorSeat)
   throw new Error('Turno ou assento mudou antes da resolução.');
  const working=structuredClone(session.duel),before=inventorySnapshot(session.duel),handsBefore=handSnapshot(session.duel);
  const queues=structuredClone(session.skipDrawBySeat);
  let status:DrawSkipResolution['status']='scheduled',destroyedUid:string|undefined;
  if(negated)status='negated';
  else{
   if(plan.effect==='offerings'){
    const target=plan.targetUid&&findMonster(working.core,plan.targetUid);
    if(target&&target.monster.faceUp&&plan.targetBinding&&targetBindingValid(working.core,plan.targetBinding)){
     if(sendMonsterToGrave(working.core,plan.targetUid,false,'destroy')){destroyedUid=plan.targetUid;status='destroyed';}
     else status='target-lost';
    }else status='target-lost';
   }
   if(!negated){
    const next:DrawSkipSession={...session,duel:working,skipDrawBySeat:queues};
    scheduleSkip(next,plan.skipSeat,plan.dueTurn);
    session.skipDrawBySeat=next.skipDrawBySeat;
   }
  }
  const result:DrawSkipResolution={activationId,effect:plan.effect,status,skipSeat:plan.skipSeat,
   dueTurn:plan.dueTurn,destroyedUid,turn:plan.turn};
  session.duel=working;delete session.pending[activationId];session.resolved[activationId]=structuredClone(result);
  assertSameInventory(before,session.duel);assertHandsUnchanged(handsBefore,session.duel);
  assertDrawPhaseSkipRules(session.duel);assertTagDuel(session.duel);
  return structuredClone(result);
 }
 function consumeDrawSkip(session:DrawSkipSession,seat:DrawSkipSeat,turn:number):boolean{
  assertSession(session);
  if(!validSeat(seat)||!Number.isSafeInteger(turn)||turn!==session.duel.core.turn||seat!==session.duel.cursor)return false;
  const key=String(seat),queue=session.skipDrawBySeat[key]??[];
  const dueIndex=queue.indexOf(turn);
  session.skipDrawBySeat[key]=queue.filter(due=>due>turn);
  return dueIndex>=0;
 }
 function scheduledDrawSkips(session:DrawSkipSession):Record<string,number[]>{
  assertSession(session);return structuredClone(session.skipDrawBySeat);
 }
 return {createSession,prepare,resolve,consumeDrawSkip,scheduledDrawSkips};
}

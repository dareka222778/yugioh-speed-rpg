import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {getDuelCard} from './effectRegistry';
import {assertTagDuel,tagInventory,type TagDuel} from './tagDuel';
import type {Monster} from './duelEngine';
import {monsterEffectsNegated} from './continuousEffects';
import {sendMonsterToGrave} from './monsterExit';
import {cleanEquips,discardBackrow,turnMonsterFaceDown} from './classicEffects';

export const SWARM_OF_SCARABS_ID='15383415';
export const SWARM_OF_LOCUSTS_ID='41872150';
export type SwarmEffect='scarabs'|'locusts';
export type SwarmTeam=0|1;
export type SwarmSeat=0|1|2|3;
export type SwarmZone='monster'|'backrow'|'field';
export type SwarmTarget={uid:string;zone:SwarmZone};
export type SwarmCardInfo={kind:'monster';effect:SwarmEffect};
export type SwarmLookup=(id:string)=>SwarmCardInfo|undefined;
export type SwarmFlipPlan={
 activationId:string;effect:SwarmEffect;actorSeat:SwarmSeat;sourceUid:string;
 sourceOwnerSeat:SwarmSeat;controllerTeam:SwarmTeam;targetTeam:SwarmTeam;
 turn:number;targetOptions:SwarmTarget[];
};
export type SwarmFlipResolution={
 activationId:string;effect:SwarmEffect;sourceUid:string;sourceOwnerSeat:SwarmSeat;
 controllerTeam:SwarmTeam;targetTeam:SwarmTeam;selectedUid:string;
 status:'destroyed'|'target-lost';destroyedZone?:SwarmZone;turn:number;
};
export type SwarmFlipSession={
 duel:TagDuel;pending:Record<string,SwarmFlipPlan>;
 resolved:Record<string,SwarmFlipResolution>;
 positionReceipts:Record<string,number>;
};
export const defaultSwarmLookup:SwarmLookup=(id)=>{
 if(id===SWARM_OF_SCARABS_ID)return {kind:'monster',effect:'scarabs'};
 if(id===SWARM_OF_LOCUSTS_ID)return {kind:'monster',effect:'locusts'};
 return undefined;
};
function validTeam(value:unknown):value is SwarmTeam{return value===0||value===1;}
function physicalSeat(uid:string):SwarmSeat|null{
 const match=/^m([0-3]):/.exec(uid);
 return match?Number(match[1]) as SwarmSeat:null;
}
function validActivationId(value:unknown):value is string{
 return typeof value==='string'&&value.trim().length>0&&value.length<=128&&/^[-a-zA-Z0-9:_]+$/.test(value);
}
function assertClassicShape(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic'||!duel.core||!Array.isArray(duel.core.players)||
  duel.core.players.length!==2||!Array.isArray(duel.active)||duel.active.length!==2||
  !Array.isArray(duel.members)||duel.members.length!==4||!duel.reserves||
  !duel.core.teamRotation||!Array.isArray(duel.core.chain)){
  throw new Error('O adapter exige um TagDuel clássico 2v2 válido.');
 }
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
 const cards=tagInventory(duel).filter(card=>card.entityKind!=='token'),result=new Map<string,string>();
 for(const card of cards){
  if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
  if(physicalSeat(card.uid)===null)throw new Error('UID físico 2v2 inválido: '+card.uid);
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
 if(after.size!==before.size)throw new Error('O adapter alterou a quantidade de cartas físicas.');
 for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('O adapter alterou a identidade física: '+uid);
}
function assertHandsUnchanged(before:string[],duel:TagDuel):void{
 if(JSON.stringify(before)!==JSON.stringify(handSnapshot(duel)))throw new Error('O adapter alterou uma mão privada.');
}
export function assertSwarmFlipRules(duel:TagDuel):void{
 assertClassicShape(duel);
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||
  rules.handCheck!=='end'||rules.monsterZones!==3||rules.spellTrapZones!==3||
  rules.extraDeckMax!==5){
  throw new Error('Regras incompatíveis: deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra 5 são obrigatórios.');
 }
 const extraUids=new Set<string>(),extra=[0,0,0,0],main=[0,0,0,0];
 for(const player of duel.core.players){
  if(player.monsters.length>RULES_PROFILE.monsterZones)throw new Error('Mais de três Monster Zones na equipe.');
  if(player.backrow.length>RULES_PROFILE.spellTrapZones)throw new Error('Mais de três Spell/Trap Zones na equipe.');
  for(const card of player.extra??[])extraUids.add(card.uid);
 }
 for(const held of Object.values(duel.reserves))for(const card of held.extra??[])extraUids.add(card.uid);
 for(const [uid,id] of inventorySnapshot(duel)){
  const seat=physicalSeat(uid);
  if(seat===null)throw new Error('Carta sem proprietário físico.');
  if(extraUids.has(uid)||!!getDuelCard(id)?.fusion)extra[seat]++;else main[seat]++;
 }
 for(let seat=0;seat<4;seat++){
  if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax)
   throw new Error('Deck principal físico fora de 20–30 no assento '+seat+'.');
  if(extra[seat]>rules.extraDeckMax)
   throw new Error('Extra Deck físico excedeu cinco cartas no assento '+seat+'.');
 }
 // A Field Zone é independente das três Spell/Trap Zones.
}
function assertSession(session:SwarmFlipSession):void{
 if(!session||!session.duel||!session.pending||!session.resolved||!session.positionReceipts||
  typeof session.pending!=='object'||typeof session.resolved!=='object'){
  throw new Error('Sessão de Swarm Flip inválida.');
 }
 assertTagDuel(session.duel);
 assertSwarmFlipRules(session.duel);
}
function findMonster(duel:TagDuel,team:SwarmTeam,uid:string):Monster|undefined{
 return duel.core.players[team].monsters.find(monster=>monster.uid===uid);
}
function targetOptions(duel:TagDuel,effect:SwarmEffect,targetTeam:SwarmTeam):SwarmTarget[]{
 const opponent=duel.core.players[targetTeam];
 if(effect==='scarabs')return opponent.monsters.map(monster=>({uid:monster.uid,zone:'monster'}));
 return [
  ...opponent.backrow.map(card=>({uid:card.uid,zone:'backrow' as const})),
  ...(opponent.field?[{uid:opponent.field.uid,zone:'field' as const}]:[])
 ];
}
function locateTarget(duel:TagDuel,team:SwarmTeam,uid:string):SwarmZone|null{
 if(duel.core.players[team].monsters.some(card=>card.uid===uid))return 'monster';
 if(duel.core.players[team].backrow.some(card=>card.uid===uid))return 'backrow';
 if(duel.core.players[team].field?.uid===uid)return 'field';
 return null;
}
function validFlipWindow(duel:TagDuel,actorSeat:number,sourceUid:string,lookup:SwarmLookup){
 const pending=duel.core.pending;
 if((duel.core.phase!=='response'&&duel.core.phase!=='choice')||pending.kind!=='flip'||
  !pending.triggersQueued||duel.core.turnEnding||duel.core.damageStep||!validTeam(pending.actor)||
  duel.core.current!==pending.actor||!Number.isInteger(actorSeat)||actorSeat<0||actorSeat>3||
  duel.active[pending.actor]!==actorSeat||pending.card!==sourceUid){
  throw new Error('A ativação exige a janela de gatilho de uma Flip Summon pelo participante ativo.');
 }
 const source=findMonster(duel,pending.actor,sourceUid);
 if(!source||source.id!==pending.id||!source.faceUp||source.position!=='atk'||
  source.lastSummonedTurn!==duel.core.turn||source.changed!==duel.core.turn){
  throw new Error('A fonte não é o monstro face-up recém-Flip Summoned.');
 }
 const info=lookup(source.id);
 if(!info||info.kind!=='monster')throw new Error('A fonte não pertence à família Swarm.');
 if(monsterEffectsNegated(duel.core,sourceUid))throw new Error('O efeito do monstro está negado.');
 return {source,info,controllerTeam:pending.actor as SwarmTeam,targetTeam:(1-pending.actor) as SwarmTeam};
}
function assertTargetStillValid(duel:TagDuel,plan:SwarmFlipPlan,selectedUid:string):SwarmZone|null{
 const zone=locateTarget(duel,plan.targetTeam,selectedUid);
 if(!zone)return null;
 if(plan.effect==='scarabs'&&zone!=='monster')return null;
 if(plan.effect==='locusts'&&zone==='monster')return null;
 const planned=plan.targetOptions.find(target=>target.uid===selectedUid);
 return planned?.zone===zone?zone:null;
}
export function createSwarmFlipAdapter(lookup:SwarmLookup=defaultSwarmLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):SwarmFlipSession{
  assertTagDuel(duel);assertSwarmFlipRules(duel);
  const positionReceipts:Record<string,number>={};
  for(const player of duel.core.players)for(const monster of player.monsters){
   if(lookup(monster.id)&&monster.effectUsedTurn===duel.core.turn)positionReceipts[monster.uid]=duel.core.turn;
  }
  return {duel:structuredClone(duel),pending:{},resolved:{},positionReceipts};
 }
 function prepareFlipSummonEffect(session:SwarmFlipSession,actorSeat:number,sourceUid:string,activationId:string):SwarmFlipPlan{
  assertSession(session);
  if(!validActivationId(activationId)||typeof sourceUid!=='string'||!sourceUid||
   !Number.isInteger(actorSeat)||actorSeat<0||actorSeat>3)throw new Error('Evento de ativação inválido.');
  if(Object.prototype.hasOwnProperty.call(session.pending,activationId)||
   Object.prototype.hasOwnProperty.call(session.resolved,activationId))throw new Error('Ativação duplicada.');
  const window=validFlipWindow(session.duel,actorSeat,sourceUid,lookup),sourceOwnerSeat=physicalSeat(sourceUid);
  if(sourceOwnerSeat===null)throw new Error('UID físico do monstro inválido.');
  const options=targetOptions(session.duel,window.info.effect,window.targetTeam);
  if(!options.length)throw new Error('Não existe alvo legal para o efeito Flip.');
  const plan:SwarmFlipPlan={
   activationId,effect:window.info.effect,actorSeat:actorSeat as SwarmSeat,sourceUid,
   sourceOwnerSeat,controllerTeam:window.controllerTeam,targetTeam:window.targetTeam,
   turn:session.duel.core.turn,targetOptions:options
  };
  session.pending[activationId]=structuredClone(plan);
  return structuredClone(plan);
 }
 function resolveFlipSummonEffect(session:SwarmFlipSession,activationId:string,selectedUid:string):SwarmFlipResolution{
  assertSession(session);
  const plan=session.pending[activationId];
  if(!plan||Object.prototype.hasOwnProperty.call(session.resolved,activationId))
   throw new Error('A ativação não aguarda alvo ou já foi resolvida.');
  if(typeof selectedUid!=='string'||!selectedUid||!plan.targetOptions.some(target=>target.uid===selectedUid))
   throw new Error('Selecione um alvo anunciado na ativação.');
  const working=structuredClone(session.duel);
  if(working.core.turn!==plan.turn||working.core.phase==='finished')
   throw new Error('A ativação ficou obsoleta antes da resolução.');
  const before=inventorySnapshot(working),handsBefore=handSnapshot(working);
  const zone=assertTargetStillValid(working,plan,selectedUid);
  let status:SwarmFlipResolution['status']='target-lost';
  if(zone==='monster'){
   if(!sendMonsterToGrave(working.core,selectedUid,false,'destroy'))
    throw new Error('O monstro-alvo deixou o campo durante a resolução.');
   status='destroyed';
  }else if(zone==='backrow'||zone==='field'){
   discardBackrow(working.core,selectedUid);
   cleanEquips(working.core);
   status='destroyed';
  }
  const result:SwarmFlipResolution={
   activationId,effect:plan.effect,sourceUid:plan.sourceUid,sourceOwnerSeat:plan.sourceOwnerSeat,
   controllerTeam:plan.controllerTeam,targetTeam:plan.targetTeam,selectedUid,status,
   ...(status==='destroyed'?{destroyedZone:zone!}:{}),turn:plan.turn
  };
  session.duel=working;
  delete session.pending[activationId];
  session.resolved[activationId]=structuredClone(result);
  assertSameInventory(before,session.duel);
  assertHandsUnchanged(handsBefore,session.duel);
  assertSwarmFlipRules(session.duel);assertTagDuel(session.duel);
  return {...structuredClone(result)};
 }
 function changeToFaceDownDefense(session:SwarmFlipSession,actorSeat:number,sourceUid:string){
  assertSession(session);
  if(!Number.isInteger(actorSeat)||actorSeat<0||actorSeat>3||typeof sourceUid!=='string'||!sourceUid)
   throw new Error('Participante ou UID inválido.');
  const duel=session.duel,team=duel.core.current as SwarmTeam;
  if(!validTeam(team)||duel.core.phase!=='main'||duel.core.pending.kind!=='none'||
   duel.core.priority!==team||duel.core.chain.length!==0||duel.core.choice||
   duel.core.turnEnding||duel.core.damageStep||duel.active[team]!==actorSeat){
   throw new Error('A mudança para face-down só pode ser ativada pelo participante ativo na Main Phase.');
  }
  const source=findMonster(duel,team,sourceUid);
  if(!source||!source.faceUp||source.entityKind==='token'||!lookup(source.id))
   throw new Error('A fonte precisa ser um Swarm face-up controlado pela equipe ativa.');
  if(monsterEffectsNegated(duel.core,sourceUid))throw new Error('O efeito do monstro está negado.');
  if(source.positionLockedThrough!==undefined&&source.positionLockedThrough>=duel.core.turn)
   throw new Error('O monstro não pode mudar de posição neste turno.');
  if(source.effectUsedTurn===duel.core.turn||session.positionReceipts[sourceUid]===duel.core.turn)
   throw new Error('O efeito de mudança de posição já foi usado neste turno.');
  const before=inventorySnapshot(duel),handsBefore=handSnapshot(duel),working=structuredClone(duel);
  const monster=findMonster(working,team,sourceUid);
  if(!monster)throw new Error('A fonte deixou o campo.');
  turnMonsterFaceDown(monster);
  monster.changed=working.core.turn;
  monster.effectUsedTurn=working.core.turn;
  session.duel=working;
  session.positionReceipts[sourceUid]=working.core.turn;
  assertSameInventory(before,session.duel);
  assertHandsUnchanged(handsBefore,session.duel);
  assertSwarmFlipRules(session.duel);assertTagDuel(session.duel);
  return {status:'set' as const,sourceUid,team,turn:working.core.turn,state:structuredClone(session.duel)};
 }
 return {createSession,prepareFlipSummonEffect,resolveFlipSummonEffect,changeToFaceDownDefense};
}

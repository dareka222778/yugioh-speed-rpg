import type {CardRef,Monster} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {RULES_PROFILE,rulesFor} from './rulesProfile';
import {assertDuelRandom,randomIndex} from './duelRandom';
import {getDuelCard} from './effectRegistry';
import {canAffectMonster,monsterEffectsNegated,syncContinuous} from './continuousEffects';
import {sendMonsterToGrave} from './monsterExit';
import {discardBackrow,cleanEquips} from './classicEffects';
import {bindTarget,synchronizeCardLifetimes,type TargetBinding} from './cardLifetime';

export const BARREL_DRAGON_ID='21466326';
export const BLOWBACK_DRAGON_ID='25551951';
export type CoinTossEffect='barrel-dragon'|'blowback-dragon';
export type CoinTossLookup=(id:string)=>{kind:'monster';effect:CoinTossEffect}|undefined;
type Team=0|1;
type Seat=0|1|2|3;
type Coin='heads'|'tails';
type CoinPlan={activationId:string;effect:CoinTossEffect;sourceUid:string;sourceId:string;sourceOwnerSeat:Seat;controllerTeam:Team;actorSeat:Seat;turn:number;sourceBinding:TargetBinding};
export type CoinTossResult={activationId:string;effect:CoinTossEffect;negation:'none'|'activation'|'effect';rolls:Coin[];heads:number;success:boolean;awaitingTarget:boolean;targetOptions:string[];destroyed:boolean;destroyedUid:string|null};
type PendingCoin={plan:CoinPlan;result?:CoinTossResult};
export type CoinTossSession={duel:TagDuel;pending:Record<string,PendingCoin>;resolved:Record<string,CoinTossResult>};
const defaultLookup:CoinTossLookup=(id)=>{
 if(id===BARREL_DRAGON_ID)return {kind:'monster',effect:'barrel-dragon'};
 if(id===BLOWBACK_DRAGON_ID)return {kind:'monster',effect:'blowback-dragon'};
 return undefined;
};
function physicalSeat(uid:string):Seat|null{
 const match=/^m([0-3]):/.exec(uid);return match?Number(match[1]) as Seat:null;
}
function assertActivationId(value:string):void{
 if(typeof value!=='string'||value.length<1||value.length>128||!/^[-a-zA-Z0-9:_]+$/.test(value))throw new Error('Identificador de ativação inválido.');
}
function assertClassic(duel:TagDuel):void{
 if(!duel||duel.mode!=='tag-classic')throw new Error('O adapter exige TagDuel clássico.');
 assertTagDuel(duel);
 if(!duel.core.teamRotation||duel.core.players.length!==2||duel.members.length!==4||duel.active.length!==2)throw new Error('Estrutura física TagDuel incompleta.');
}
export function assertCoinTossRules(duel:TagDuel):void{
 assertClassic(duel);
 const rules=rulesFor(duel.core);
 if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
  throw new Error('O adapter exige Deck 20–30, mão 6 na End Phase, zonas 3+3 e Extra Deck 5.');
 }
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
 // A mão pode exceder seis durante o turno; o descarte é resolvido na End Phase.
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
function findMonster(duel:TagDuel,uid:string):{team:Team;monster:Monster}|undefined{
 for(const team of [0,1] as const){const monster=duel.core.players[team].monsters.find(card=>card.uid===uid);if(monster)return {team,monster};}
 return undefined;
}
function targetOptions(duel:TagDuel,plan:CoinPlan):string[]{
 const core=duel.core;
 if(plan.effect==='barrel-dragon'){
  return core.players[1-plan.controllerTeam].monsters.filter(monster=>canAffectMonster(core,monster.uid,'monster')).map(monster=>monster.uid);
 }
 const monsters=core.players.flatMap(player=>player.monsters.filter(monster=>canAffectMonster(core,monster.uid,'monster')).map(monster=>monster.uid));
 const backrow=core.players.flatMap(player=>player.backrow.map(card=>card.uid));
 const fields=core.players.flatMap(player=>player.field?[player.field.uid]:[]);
 return [...new Set([...monsters,...backrow,...fields])];
}
function destroyFieldCard(duel:TagDuel,targetUid:string):void{
 const found=findMonster(duel,targetUid);
 if(found){
  if(!canAffectMonster(duel.core,targetUid,'monster'))throw new Error('O monstro está protegido contra este efeito.');
  if(!sendMonsterToGrave(duel.core,targetUid,false,'destroy'))throw new Error('O monstro deixou o campo antes da destruição.');
 }else{
  const exists=duel.core.players.some(player=>player.backrow.some(card=>card.uid===targetUid)||player.field?.uid===targetUid);
  if(!exists)throw new Error('O alvo não está mais no campo.');
  discardBackrow(duel.core,targetUid);
 }
 cleanEquips(duel.core);synchronizeCardLifetimes(duel.core);syncContinuous(duel.core);
}
function assertSession(session:CoinTossSession):void{
 if(!session||!session.duel||!session.pending||!session.resolved||typeof session.pending!=='object'||typeof session.resolved!=='object')throw new Error('Sessão de moeda inválida.');
 assertCoinTossRules(session.duel);assertDuelRandom(session.duel.core.random);
}
export function createCoinTossAdapter(lookup:CoinTossLookup=defaultLookup){
 if(typeof lookup!=='function')throw new Error('Consulta de cartas inválida.');
 function createSession(duel:TagDuel):CoinTossSession{
  assertCoinTossRules(duel);assertDuelRandom(duel.core.random);
  return {duel:structuredClone(duel),pending:{},resolved:{}};
 }
 function prepareActivation(session:CoinTossSession,actorSeat:number,sourceUid:string,activationId:string):CoinPlan{
  assertSession(session);assertActivationId(activationId);
  if(!Number.isInteger(actorSeat)||actorSeat<0||actorSeat>3)throw new Error('Assento físico inválido.');
  if(Object.hasOwn(session.pending,activationId)||Object.hasOwn(session.resolved,activationId))throw new Error('Ativação duplicada.');
  const working=structuredClone(session.duel),found=findMonster(working,sourceUid);
  if(!found)throw new Error('O Dragão não está em uma Monster Zone.');
  const ownerSeat=physicalSeat(sourceUid);
  if(ownerSeat===null)throw new Error('UID físico inválido.');
  const {team,monster}=found,info=lookup(monster.id);
  if(!info||info.kind!=='monster'||!['barrel-dragon','blowback-dragon'].includes(info.effect))throw new Error('A carta não pertence à família de três moedas.');
  if(!monster.faceUp)throw new Error('O efeito exige o monstro face-up.');
  if(working.core.phase!=='main'||working.core.current!==team||working.cursor!==actorSeat||working.active[team]!==actorSeat)throw new Error('Efeito de Ignição exige a Fase Principal e o assento ativo da equipe.');
  if(monsterEffectsNegated(working.core,sourceUid))throw new Error('Os efeitos do monstro estão negados.');
  if(monster.effectUsedTurn===working.core.turn)throw new Error('Este monstro já usou o efeito neste turno.');
  const binding=bindTarget(working.core,sourceUid);
  if(!binding||binding.zone!=='monsters')throw new Error('Não foi possível vincular o monstro à Monster Zone.');
  monster.effectUsedTurn=working.core.turn;
  const plan:CoinPlan={activationId,effect:info.effect,sourceUid,sourceId:monster.id,sourceOwnerSeat:ownerSeat,controllerTeam:team,actorSeat:actorSeat as Seat,turn:working.core.turn,sourceBinding:binding};
  session.duel=working;session.pending[activationId]={plan};return structuredClone(plan);
 }
 function resolveCoinToss(session:CoinTossSession,activationId:string,negation:'none'|'activation'|'effect'='none'):CoinTossResult{
  assertSession(session);assertActivationId(activationId);
  const cached=session.resolved[activationId];if(cached)return structuredClone(cached);
  const pending=session.pending[activationId];if(!pending)throw new Error('Ativação de três moedas não preparada.');
  if(pending.result)return structuredClone(pending.result);
  const working=structuredClone(session.duel),plan=pending.plan;
  if(working.core.turn!==plan.turn)throw new Error('A ativação ficou obsoleta após a mudança de turno.');
  const before=inventorySnapshot(working);
  const source=findMonster(working,plan.sourceUid);
  if(negation==='activation'&&source?.monster.effectUsedTurn===plan.turn)delete source.monster.effectUsedTurn;
  const rolls:('heads'|'tails')[]=[];
  if(negation==='none'){
   assertDuelRandom(working.core.random);
   for(let i=0;i<3;i++)rolls.push(randomIndex(working.core.random,2)===0?'heads':'tails');
  }
  const heads=rolls.filter(coin=>coin==='heads').length,success=negation==='none'&&heads>=2;
  const options=success?targetOptions(working,plan):[];
  const result:CoinTossResult={activationId,effect:plan.effect,negation,rolls,heads,success,
   awaitingTarget:success&&options.length>0,targetOptions:options,destroyed:false,destroyedUid:null};
  assertCoinTossRules(working);assertSameInventory(before,working);assertTagDuel(working);
  session.duel=working;
  if(result.awaitingTarget)session.pending[activationId]={plan,result};
  else{session.resolved[activationId]=result;delete session.pending[activationId];}
  return structuredClone(result);
 }
 function selectTarget(session:CoinTossSession,activationId:string,targetUid:string):CoinTossResult{
  assertSession(session);assertActivationId(activationId);
  const cached=session.resolved[activationId];
  if(cached){if(cached.destroyedUid===targetUid)return structuredClone(cached);throw new Error('A ativação já foi concluída com outro resultado.');}
  const pending=session.pending[activationId];
  if(!pending?.result?.awaitingTarget)throw new Error('A ativação não aguarda escolha de alvo.');
  const working=structuredClone(session.duel),plan=pending.plan;
  if(!targetOptions(working,plan).includes(targetUid))throw new Error('O alvo deixou de ser válido; atualize as opções.');
  const before=inventorySnapshot(working);
  destroyFieldCard(working,targetUid);
  assertCoinTossRules(working);assertSameInventory(before,working);assertTagDuel(working);
  const result:CoinTossResult={...pending.result,awaitingTarget:false,destroyed:true,destroyedUid:targetUid};
  session.duel=working;session.resolved[activationId]=result;delete session.pending[activationId];
  return structuredClone(result);
 }
 return {createSession,prepareActivation,resolveCoinToss,selectTarget};
}

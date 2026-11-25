import type {DuelState} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {rulesFor} from './rulesProfile';
import {
  cardActivationAllowed,
  continuousTrapActivationsBlocked,
  continuousTrapsNegated,
} from './continuousEffects';
import {getActivationModel} from './effectModels';
import {getEffect} from './effectRegistry';
import {synchronizeCardLifetimes} from './cardLifetime';

export const CEASEFIRE_ID='36468556';
type Team=0|1;
type Seat=0|1|2|3;
type CardKind='monster'|'spell'|'trap';
type SpellTrap=NonNullable<DuelState['players'][number]['field']>;
export type CeasefireCardInfo={
  kind:CardKind;
  monsterType?:'normal'|'effect'|'fusion'|'ritual';
  effectMonster?:boolean;
  name?:string;
};
export type CeasefireLookup=(id:string)=>CeasefireCardInfo|undefined;
export type CeasefireAction={kind:'trap';card:string;target:string};
type Activation={
  activationId:string;
  sourceUid:string;
  sourceId:string;
  sourceOwnerSeat:Seat;
  controllerTeam:Team;
  controllerSeat:Seat;
  turn:number;
};
export type CeasefireSession={
  duel:TagDuel;
  pending:Record<string,Activation>;
  resolved:string[];
};
export type CeasefireResolution={
  activationId:string;
  cardId:string;
  sourceEffectNegated:boolean;
  flippedUids:string[];
  flipEffectsActivated:false;
  effectMonsterCount:number;
  damage:number;
  opponentLPBefore:number;
  opponentLPAfter:number;
  sourceSentToGrave:boolean;
  duelEndedByLP:boolean;
};

function isTeam(value:unknown):value is Team{return value===0||value===1;}
function physicalSeat(uid:string):Seat|null{
  const match=/^m([0-3]):/.exec(uid);
  return match?Number(match[1]) as Seat:null;
}
function inventorySnapshot(duel:TagDuel):Map<string,string>{
  const result=new Map<string,string>();
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    if(result.has(card.uid))throw new Error('UID físico duplicado: '+card.uid);
    if(physicalSeat(card.uid)===null)throw new Error('UID sem proprietário físico m0–m3.');
    result.set(card.uid,card.id);
  }
  return result;
}
function assertSameInventory(before:Map<string,string>,duel:TagDuel):void{
  const after=inventorySnapshot(duel);
  if(after.size!==before.size)throw new Error('A operação alterou a quantidade de cartas físicas.');
  for(const [uid,id] of before)if(after.get(uid)!==id)throw new Error('A operação alterou a identidade física: '+uid);
}
export function assertPhysicalExtraDeckCounts(extraCounts:readonly number[],maximum=5):void{
  if(!Array.isArray(extraCounts)||extraCounts.length!==4||!Number.isSafeInteger(maximum)||maximum<0||
    extraCounts.some(count=>!Number.isSafeInteger(count)||count<0)){
    throw new Error('Contagem do Deck Adicional inválida.');
  }
  if(extraCounts.some(count=>count>maximum))throw new Error('Deck Adicional físico excede cinco cartas.');
}
/** Enforces the owner's format; hand overflow is checked only in End Phase. */
export function assertCeasefireRules(duel:TagDuel):void{
  assertTagDuel(duel);
  if(duel.mode!=='tag-classic')throw new Error('Ceasefire exige TagDuel clássico.');
  const rules=rulesFor(duel.core);
  if(rules.mainDeckMin!==20||rules.mainDeckMax!==30||rules.handLimit!==6||rules.handCheck!=='end'||
    rules.monsterZones!==3||rules.spellTrapZones!==3||rules.extraDeckMax!==5){
    throw new Error('Perfil de regras incompatível com o proprietário.');
  }
  const extraUids=new Set<string>();
  const extra=[0,0,0,0],main=[0,0,0,0];
  for(const player of duel.core.players)for(const card of player.extra??[])extraUids.add(card.uid);
  for(const [seat,held] of Object.entries(duel.reserves)){
    if(!/^[0-3]$/.test(seat))throw new Error('Assento físico de reserva inválido.');
    for(const card of held.extra??[])extraUids.add(card.uid);
  }
  for(const card of tagInventory(duel).filter(card=>card.entityKind!=='token')){
    const seat=physicalSeat(card.uid);
    if(seat===null)throw new Error('UID sem proprietário físico m0–m3.');
    if(extraUids.has(card.uid))extra[seat]++;
    else main[seat]++;
  }
  for(let seat=0;seat<4;seat++){
    if(main[seat]<rules.mainDeckMin||main[seat]>rules.mainDeckMax){
      throw new Error('Deck principal físico fora do limite 20–30 no assento '+seat+'.');
    }
  }
  assertPhysicalExtraDeckCounts(extra,rules.extraDeckMax);
  for(const player of duel.core.players){
    if(player.monsters.length>rules.monsterZones)throw new Error('Equipe excedeu as três Monster Zones.');
    if(player.backrow.length>rules.spellTrapZones)throw new Error('Equipe excedeu as três Spell/Trap Zones.');
    // The Field Zone is independent of the three shared Spell/Trap Zones.
  }
}
function isEffectMonster(id:string,lookup:CeasefireLookup):boolean{
  const info=lookup(id);
  return info?.kind==='monster'&&(info.effectMonster===true||info.monsterType==='effect');
}
function hasCeasefireCondition(core:DuelState,lookup:CeasefireLookup):boolean{
  return core.players.some(player=>player.monsters.some(monster=>
    !monster.faceUp&&monster.position==='def'||isEffectMonster(monster.id,lookup)
  ));
}
function responseWindowAvailable(core:DuelState):boolean{
  if(core.phase!=='response'||core.turnEnding||core.damageStep||
    core.chain.length===0&&core.pending.kind==='none')return false;
  const last=core.chain.at(-1);
  if(last){
    const effect=getEffect(last.id);
    if(effect&&getActivationModel(effect)?.speed===3)return false;
  }
  return true;
}
function sourceCard(duel:TagDuel,team:Team,uid:string,cardId:string){
  return duel.core.players[team].backrow.find(card=>card.uid===uid&&card.id===cardId);
}
function moveSourceToOwnerGrave(core:DuelState,controller:Team,uid:string):boolean{
  const index=core.players[controller].backrow.findIndex(card=>card.uid===uid);
  if(index<0)return false;
  const [source]=core.players[controller].backrow.splice(index,1);
  const ownerSeat=physicalSeat(uid);
  if(ownerSeat===null)throw new Error('Armadilha sem proprietário físico.');
  core.players[ownerSeat%2].grave.push({uid:source.uid,id:source.id});
  synchronizeCardLifetimes(core);
  return true;
}
/** No target is selected: the action reveals only the Set Trap UID. */
export function ceasefireActions(
  duel:TagDuel,
  lookup:CeasefireLookup,
  options:{cardId?:string}={}
):CeasefireAction[]{
  assertCeasefireRules(duel);
  const core=duel.core,team=core.priority;
  if(!isTeam(team)||!responseWindowAvailable(core)||continuousTrapActivationsBlocked(core)||
    !cardActivationAllowed(core,team,'trap')||!hasCeasefireCondition(core,lookup))return [];
  const cardId=options.cardId??CEASEFIRE_ID;
  return core.players[team].backrow
    .filter(card=>card.id===cardId&&!card.faceUp&&Number.isSafeInteger(card.setTurn)&&card.setTurn<core.turn)
    .map(card=>({kind:'trap',card:card.uid,target:''}));
}
export function createCeasefireSession(duel:TagDuel):CeasefireSession{
  assertCeasefireRules(duel);
  return {duel:structuredClone(duel),pending:{},resolved:[]};
}
export function activateCeasefire(
  input:CeasefireSession,
  sourceUid:string,
  activationId:string,
  lookup:CeasefireLookup,
  options:{cardId?:string}={}
):CeasefireSession{
  if(typeof activationId!=='string'||!activationId.trim()||activationId.length>128||
    input.pending[activationId]||input.resolved.includes(activationId)){
    throw new Error('ID de ativação ausente ou duplicado.');
  }
  assertCeasefireRules(input.duel);
  const team=input.duel.core.priority;
  if(!isTeam(team)||!ceasefireActions(input.duel,lookup,options).some(action=>action.card===sourceUid)){
    throw new Error('Ceasefire não está legal na janela de resposta atual.');
  }
  const cardId=options.cardId??CEASEFIRE_ID;
  const source=sourceCard(input.duel,team,sourceUid,cardId);
  const ownerSeat=physicalSeat(sourceUid);
  if(!source||ownerSeat===null||source.faceUp||!Number.isSafeInteger(source.setTurn)||source.setTurn>=input.duel.core.turn){
    throw new Error('A Armadilha não está Set e liberada para ativação.');
  }
  const before=inventorySnapshot(input.duel),next=structuredClone(input);
  const nextSource=sourceCard(next.duel,team,sourceUid,cardId);
  if(!nextSource)throw new Error('A Armadilha saiu do campo antes da ativação.');
  nextSource.faceUp=true;
  next.duel.core.chain.push({actor:team,card:sourceUid,id:cardId,target:''});
  next.duel.core.priority=1-team;
  next.duel.core.passes=0;
  next.pending[activationId]={
    activationId,sourceUid,sourceId:cardId,sourceOwnerSeat:ownerSeat,
    controllerTeam:team,controllerSeat:next.duel.active[team] as Seat,
    turn:next.duel.core.turn
  };
  assertSameInventory(before,next.duel);
  assertCeasefireRules(next.duel);
  return next;
}
export function resolveCeasefire(
  input:CeasefireSession,
  activationId:string,
  lookup:CeasefireLookup,
  options:{sourceActivationNegated?:boolean;cardId?:string}={}
):{session:CeasefireSession;result:CeasefireResolution}{
  const activation=input.pending[activationId];
  if(!activation||input.resolved.includes(activationId))throw new Error('Ativação de Ceasefire ausente ou já resolvida.');
  assertCeasefireRules(input.duel);
  const before=inventorySnapshot(input.duel),next=structuredClone(input),core=next.duel.core;
  const ownIndex=core.chain.findIndex(link=>link.actor===activation.controllerTeam&&
    link.card===activation.sourceUid&&link.id===activation.sourceId);
  if(ownIndex!==core.chain.length-1)throw new Error('Ceasefire só pode resolver no topo da corrente.');
  const own=core.chain.pop();
  if(!own)throw new Error('Link de Ceasefire ausente.');
  const sourceEffectNegated=options.sourceActivationNegated===true||own.negated===true||continuousTrapsNegated(core);
  const flippedUids:string[]=[];
  let effectMonsterCount=0,damage=0,opponentLPBefore=core.players[1-activation.controllerTeam].lp;
  let opponentLPAfter=opponentLPBefore,duelEndedByLP=false;
  if(!sourceEffectNegated){
    for(const player of core.players)for(const monster of player.monsters){
      if(!monster.faceUp&&monster.position==='def'){
        monster.faceUp=true;
        flippedUids.push(monster.uid);
      }
    }
    effectMonsterCount=core.players.flatMap(player=>player.monsters)
      .filter(monster=>isEffectMonster(monster.id,lookup)).length;
    damage=effectMonsterCount*500;
    const opponent=core.players[1-activation.controllerTeam];
    opponentLPBefore=opponent.lp;
    opponentLPAfter=Math.max(0,opponentLPBefore-damage);
    opponent.lp=opponentLPAfter;
    if(damage>0&&opponentLPAfter===0){
      core.winner=core.players[activation.controllerTeam].id;
      core.reason='pontos de vida';
      core.phase='finished';
      duelEndedByLP=true;
    }
  }
  const sourceSentToGrave=moveSourceToOwnerGrave(core,activation.controllerTeam,activation.sourceUid);
  delete next.pending[activationId];
  next.resolved.push(activationId);
  next.resolved=next.resolved.slice(-256);
  synchronizeCardLifetimes(core);
  assertSameInventory(before,next.duel);
  assertCeasefireRules(next.duel);
  return {session:next,result:{
    activationId,cardId:activation.sourceId,sourceEffectNegated,
    flippedUids,flipEffectsActivated:false,effectMonsterCount,damage,
    opponentLPBefore,opponentLPAfter,sourceSentToGrave,duelEndedByLP
  }};
}

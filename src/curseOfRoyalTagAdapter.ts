import type {DuelState} from './duelEngine';
import type {TagDuel} from './tagDuel';
import {assertTagDuel,tagInventory} from './tagDuel';
import {rulesFor} from './rulesProfile';
import {
  cardActivationAllowed,
  continuousTrapActivationsBlocked,
  continuousTrapsNegated,
} from './continuousEffects';
import {
  bindTarget,
  synchronizeCardLifetimes,
  targetBindingValid,
  type TargetBinding,
} from './cardLifetime';

export const CURSE_OF_ROYAL_ID='02926176';
type Team=0|1;
type Seat=0|1|2|3;
type Backrow=NonNullable<DuelState['players'][number]['field']>;
type CardKind='spell'|'trap'|'monster';

export type CurseOfRoyalCardInfo={
  kind:CardKind;
  name?:string;
  destroysExactlyOneSpellTrap?:boolean;
};
export type CurseOfRoyalLookup=(id:string)=>CurseOfRoyalCardInfo|undefined;
export type CurseOfRoyalAction={kind:'trap';card:string;target:''};
type ResponseRef={kind:'pending'|'chain';actor:Team;card:string;id:string};
type Activation={
  activationId:string;
  sourceUid:string;
  sourceId:string;
  sourceOwnerSeat:Seat;
  controllerTeam:Team;
  controllerSeat:Seat;
  turn:number;
  response:ResponseRef;
  targetBinding:TargetBinding;
};
export type CurseOfRoyalSession={
  duel:TagDuel;
  pending:Record<string,Activation>;
  resolved:string[];
};
export type CurseOfRoyalResolution={
  activationId:string;
  cardId:string;
  sourceEffectNegated:boolean;
  targetActivationNegated:boolean;
  targetDestroyed:boolean;
  sourceSentToGrave:boolean;
};

function isTeam(value:unknown):value is Team{return value===0||value===1;}
function physicalSeat(uid:string):Seat|null{
  const match=/^m([0-3]):/.exec(uid);
  return match?Number(match[1]) as Seat:null;
}
function findSpellTrap(core:DuelState,uid:string):{team:Team;zone:'backrow'|'field';card:Backrow}|null{
  for(const team of [0,1] as const){
    const backrow=core.players[team].backrow.find(card=>card.uid===uid);
    if(backrow)return {team,zone:'backrow',card:backrow};
    const field=core.players[team].field;
    if(field?.uid===uid)return {team,zone:'field',card:field};
  }
  return null;
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
/** Enforces the owner's format without discarding a hand before End Phase. */
export function assertCurseOfRoyalRules(duel:TagDuel):void{
  assertTagDuel(duel);
  if(duel.mode!=='tag-classic')throw new Error('Curse of Royal exige TagDuel clássico.');
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
function responseFor(team:Team,core:DuelState,lookup:CurseOfRoyalLookup):ResponseRef|undefined{
  const last=core.chain.at(-1);
  if(last){
    if(last.negated||!isTeam(last.actor)||last.actor===team)return;
    const info=lookup(last.id);
    if(!info||(info.kind!=='spell'&&info.kind!=='trap')||info.destroysExactlyOneSpellTrap!==true)return;
    const location=findSpellTrap(core,last.card);
    if(!location||location.team!==last.actor||location.card.id!==last.id||!location.card.faceUp)return;
    return {kind:'chain',actor:last.actor,card:last.card,id:last.id};
  }
  const pending=core.pending;
  if(pending.kind!=='spell'&&pending.kind!=='field')return;
  if(!isTeam(pending.actor)||pending.actor===team||core.pendingNegated)return;
  const location=findSpellTrap(core,pending.card);
  if(!location||location.team!==pending.actor||!location.card.faceUp)return;
  const id=pending.kind==='spell'?pending.id:location.card.id;
  if(location.card.id!==id)return;
  const info=lookup(id);
  if(!info||(info.kind!=='spell'&&info.kind!=='trap')||info.destroysExactlyOneSpellTrap!==true)return;
  return {kind:'pending',actor:pending.actor,card:pending.card,id};
}
function targetIsCurrent(core:DuelState,response:ResponseRef):boolean{
  if(response.kind==='pending'){
    const pending=core.pending;
    if(core.chain.length!==0||core.pendingNegated)return false;
    if(pending.kind==='spell')return pending.actor===response.actor&&pending.card===response.card&&pending.id===response.id;
    if(pending.kind==='field')return pending.actor===response.actor&&pending.card===response.card;
    return false;
  }
  const target=core.chain.at(-1);
  return !!target&&!target.negated&&target.actor===response.actor&&target.card===response.card&&target.id===response.id;
}
function moveToOwnerGrave(core:DuelState,controller:Team,uid:string):boolean{
  const location=findSpellTrap(core,uid);
  if(!location||location.team!==controller)return false;
  const ownerSeat=physicalSeat(uid);
  if(ownerSeat===null)return false;
  if(location.zone==='backrow'){
    core.players[location.team].backrow=core.players[location.team].backrow.filter(card=>card.uid!==uid);
  }else{
    core.players[location.team].field=null;
  }
  core.players[ownerSeat%2].grave.push({
    uid:location.card.uid,
    id:location.card.id,
    ...(location.card.properlySummoned?{properlySummoned:true}:{})
  });
  synchronizeCardLifetimes(core);
  return true;
}
function sourceCard(duel:TagDuel,team:Team,uid:string,cardId:string){
  return duel.core.players[team].backrow.find(card=>card.uid===uid&&card.id===cardId);
}

/** Lists only the Counter Trap UID; the activated card identity stays server-side. */
export function curseOfRoyalActions(
  duel:TagDuel,
  lookup:CurseOfRoyalLookup,
  options:{cardId?:string}={}
):CurseOfRoyalAction[]{
  assertCurseOfRoyalRules(duel);
  const core=duel.core,team=core.priority;
  if(core.phase!=='response'||!isTeam(team)||core.turnEnding||
    continuousTrapActivationsBlocked(core)||!cardActivationAllowed(core,team,'trap'))return [];
  const response=responseFor(team,core,lookup);
  if(!response)return [];
  const cardId=options.cardId??CURSE_OF_ROYAL_ID;
  return core.players[team].backrow
    .filter(card=>card.id===cardId&&!card.faceUp&&Number.isSafeInteger(card.setTurn)&&card.setTurn<core.turn)
    .map(card=>({kind:'trap',card:card.uid,target:''}));
}
export function createCurseOfRoyalSession(duel:TagDuel):CurseOfRoyalSession{
  assertCurseOfRoyalRules(duel);
  return {duel:structuredClone(duel),pending:{},resolved:[]};
}
export function activateCurseOfRoyal(
  input:CurseOfRoyalSession,
  sourceUid:string,
  activationId:string,
  lookup:CurseOfRoyalLookup,
  options:{cardId?:string}={}
):CurseOfRoyalSession{
  if(typeof activationId!=='string'||!activationId.trim()||activationId.length>128||
    input.pending[activationId]||input.resolved.includes(activationId)){
    throw new Error('ID de ativação ausente ou duplicado.');
  }
  assertCurseOfRoyalRules(input.duel);
  const team=input.duel.core.priority;
  if(!isTeam(team)||!curseOfRoyalActions(input.duel,lookup,options).some(action=>action.card===sourceUid)){
    throw new Error('Curse of Royal não está legal na janela de resposta atual.');
  }
  const cardId=options.cardId??CURSE_OF_ROYAL_ID;
  const source=sourceCard(input.duel,team,sourceUid,cardId);
  const ownerSeat=physicalSeat(sourceUid);
  if(!source||ownerSeat===null||source.faceUp||!Number.isSafeInteger(source.setTurn)||source.setTurn>=input.duel.core.turn){
    throw new Error('A Armadilha não está Set e liberada para ativação.');
  }
  const response=responseFor(team,input.duel.core,lookup);
  if(!response)throw new Error('A ativação-alvo deixou de ser válida.');
  synchronizeCardLifetimes(input.duel.core);
  const targetBinding=bindTarget(input.duel.core,response.card);
  if(!targetBinding||(targetBinding.zone!=='backrow'&&targetBinding.zone!=='field')){
    throw new Error('A carta ativada não está em uma Zona de Magias/Armadilhas.');
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
    turn:next.duel.core.turn,response,targetBinding
  };
  assertSameInventory(before,next.duel);
  assertCurseOfRoyalRules(next.duel);
  return next;
}
export function resolveCurseOfRoyal(
  input:CurseOfRoyalSession,
  activationId:string,
  options:{sourceActivationNegated?:boolean;cardId?:string}={}
):{session:CurseOfRoyalSession;result:CurseOfRoyalResolution}{
  const activation=input.pending[activationId];
  if(!activation||input.resolved.includes(activationId))throw new Error('Ativação de Curse of Royal ausente ou já resolvida.');
  assertCurseOfRoyalRules(input.duel);
  const before=inventorySnapshot(input.duel),next=structuredClone(input),core=next.duel.core;
  const ownIndex=core.chain.findIndex(link=>link.actor===activation.controllerTeam&&
    link.card===activation.sourceUid&&link.id===activation.sourceId);
  if(ownIndex!==core.chain.length-1)throw new Error('Curse of Royal só pode resolver no topo da corrente.');
  const own=core.chain.pop();
  if(!own)throw new Error('Link de Curse of Royal ausente.');
  const sourceEffectNegated=options.sourceActivationNegated===true||own.negated===true||continuousTrapsNegated(core);
  let targetActivationNegated=false,targetDestroyed=false;
  if(!sourceEffectNegated&&targetIsCurrent(core,activation.response)&&targetBindingValid(core,activation.targetBinding)){
    if(activation.response.kind==='pending')core.pendingNegated=true;
    else{
      const target=core.chain.at(-1);
      if(target&&!target.negated&&target.actor===activation.response.actor&&
        target.card===activation.response.card&&target.id===activation.response.id)target.negated=true;
      else throw new Error('O link-alvo mudou antes da resolução.');
    }
    targetActivationNegated=true;
    targetDestroyed=moveToOwnerGrave(core,activation.response.actor,activation.response.card);
  }
  const sourceSentToGrave=moveToOwnerGrave(core,activation.controllerTeam,activation.sourceUid);
  delete next.pending[activationId];
  next.resolved.push(activationId);
  next.resolved=next.resolved.slice(-256);
  synchronizeCardLifetimes(core);
  assertSameInventory(before,next.duel);
  assertCurseOfRoyalRules(next.duel);
  return {session:next,result:{
    activationId,cardId:activation.sourceId,sourceEffectNegated,
    targetActivationNegated,targetDestroyed,sourceSentToGrave
  }};
}

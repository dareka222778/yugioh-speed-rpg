import type {DuelState,Monster} from './duelEngine';
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
import {cleanEquips} from './classicEffects';
import {removeToken} from './tokens';

export const HORN_OF_HEAVEN_ID='98069388';
export const TRAP_JAMMER_ID='19252988';
export type CounterTrapEffect='horn-of-heaven'|'trap-jammer';
type Team=0|1;
type Seat=0|1|2|3;
type CardKind='monster'|'spell'|'trap';
type SpellTrap=NonNullable<DuelState['players'][number]['field']>;
export type CounterTrapCardInfo={kind:CardKind;name?:string};
export type CounterTrapLookup=(id:string)=>CounterTrapCardInfo|undefined;
export type CounterTrapAction={
  kind:'trap';
  card:string;
  target:'';
  effect:CounterTrapEffect;
  cost?:string;
};
type ResponseRef={
  kind:'pending'|'chain';
  targetKind:'activation'|'summon';
  actor:Team;
  card:string;
  id:string;
};
type Activation={
  activationId:string;
  effect:CounterTrapEffect;
  sourceUid:string;
  sourceId:string;
  sourceOwnerSeat:Seat;
  controllerTeam:Team;
  controllerSeat:Seat;
  turn:number;
  response:ResponseRef;
  targetBinding:TargetBinding;
  costUid?:string;
};
export type CounterTrapSession={
  duel:TagDuel;
  pending:Record<string,Activation>;
  resolved:string[];
};
export type CounterTrapResolution={
  activationId:string;
  effect:CounterTrapEffect;
  cardId:string;
  costUid?:string;
  costPaid:boolean;
  targetKind:'activation'|'summon';
  sourceEffectNegated:boolean;
  targetActivationNegated:boolean;
  summonNegated:boolean;
  targetDestroyed:boolean;
  sourceSentToGrave:boolean;
};

function isTeam(value:unknown):value is Team{return value===0||value===1;}
function physicalSeat(uid:string):Seat|null{
  const match=/^m([0-3]):/.exec(uid);
  return match?Number(match[1]) as Seat:null;
}
function findSpellTrap(core:DuelState,uid:string):{team:Team;zone:'backrow'|'field';card:SpellTrap}|null{
  for(const team of [0,1] as const){
    const backrow=core.players[team].backrow.find(card=>card.uid===uid);
    if(backrow)return {team,zone:'backrow',card:backrow};
    const field=core.players[team].field;
    if(field?.uid===uid)return {team,zone:'field',card:field};
  }
  return null;
}
function findMonster(core:DuelState,team:Team,uid:string):Monster|undefined{
  return core.players[team].monsters.find(monster=>monster.uid===uid);
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
export function assertCounterTrapRules(duel:TagDuel):void{
  assertTagDuel(duel);
  if(duel.mode!=='tag-classic')throw new Error('Counter Trap exige TagDuel clássico.');
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
function isBattleResponse(core:DuelState):boolean{
  return core.phase==='battle'||core.resume==='battle'&&
    (core.phase==='response'||core.phase==='choice');
}
function responseFor(
  effect:CounterTrapEffect,
  team:Team,
  core:DuelState,
  lookup:CounterTrapLookup
):ResponseRef|undefined{
  if(effect==='trap-jammer'){
    if(!isBattleResponse(core))return;
    const last=core.chain.at(-1);
    if(!last||last.negated||!isTeam(last.actor)||last.actor===team)return;
    const info=lookup(last.id);
    if(info?.kind!=='trap')return;
    const location=findSpellTrap(core,last.card);
    if(!location||location.team!==last.actor||location.card.id!==last.id||!location.card.faceUp)return;
    return {kind:'chain',targetKind:'activation',actor:last.actor,card:last.card,id:last.id};
  }
  const pending=core.pending;
  if(pending.kind!=='summon'&&pending.kind!=='flip'&&pending.kind!=='specialSummon')return;
  if(!isTeam(pending.actor)||core.pendingNegated)return;
  const monster=findMonster(core,pending.actor,pending.card);
  if(!monster||!monster.faceUp||pending.id!==undefined&&pending.id!==monster.id)return;
  const info=lookup(monster.id);
  if(info?.kind!=='monster')return;
  return {kind:'pending',targetKind:'summon',actor:pending.actor,card:pending.card,id:monster.id};
}
function targetIsCurrent(core:DuelState,response:ResponseRef):boolean{
  if(response.kind==='pending'){
    if(core.chain.length!==0||core.pendingNegated)return false;
    const pending=core.pending;
    if(response.targetKind==='summon'){
      if(pending.kind!=='summon'&&pending.kind!=='flip'&&pending.kind!=='specialSummon')return false;
      return pending.actor===response.actor&&pending.card===response.card&&
        (pending.id===undefined||pending.id===response.id);
    }
    if(pending.kind==='spell')return pending.actor===response.actor&&pending.card===response.card&&pending.id===response.id;
    if(pending.kind==='field'){
      const location=findSpellTrap(core,response.card);
      return pending.actor===response.actor&&pending.card===response.card&&location?.card.id===response.id;
    }
    return false;
  }
  const target=core.chain.at(-1);
  return !!target&&!target.negated&&target.actor===response.actor&&
    target.card===response.card&&target.id===response.id;
}
function moveSpellTrapToOwnerGrave(core:DuelState,controller:Team,uid:string):boolean{
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
    uid:location.card.uid,id:location.card.id,
    ...(location.card.properlySummoned?{properlySummoned:true}:{})
  });
  synchronizeCardLifetimes(core);
  return true;
}
function moveMonsterToOwnerGrave(core:DuelState,controller:Team,uid:string):boolean{
  const monster=findMonster(core,controller,uid);
  if(!monster)return false;
  if(monster.entityKind==='token'){
    const removed=removeToken(core,uid,'destroy');
    if(removed)cleanEquips(core);
    synchronizeCardLifetimes(core);
    return removed;
  }
  const ownerSeat=physicalSeat(uid);
  if(ownerSeat===null)return false;
  core.players[controller].monsters=core.players[controller].monsters.filter(card=>card.uid!==uid);
  core.players[ownerSeat%2].grave.push({
    uid:monster.uid,id:monster.id,
    ...(monster.properlySummoned?{properlySummoned:true}:{})
  });
  cleanEquips(core);
  synchronizeCardLifetimes(core);
  return true;
}
function sourceCard(duel:TagDuel,team:Team,uid:string,cardId:string){
  return duel.core.players[team].backrow.find(card=>card.uid===uid&&card.id===cardId);
}
function sourceIdFor(effect:CounterTrapEffect,override?:string):string{
  return override??(effect==='horn-of-heaven'?HORN_OF_HEAVEN_ID:TRAP_JAMMER_ID);
}
/** Lists legal responses without exposing the target's private or server-side identity. */
export function counterTrapActions(
  duel:TagDuel,
  lookup:CounterTrapLookup,
  options:{effect:CounterTrapEffect;cardId?:string}
):CounterTrapAction[]{
  assertCounterTrapRules(duel);
  const core=duel.core,team=core.priority;
  if(core.phase!=='response'||!isTeam(team)||core.turnEnding||
    continuousTrapActivationsBlocked(core)||!cardActivationAllowed(core,team,'trap'))return [];
  const response=responseFor(options.effect,team,core,lookup);
  if(!response)return [];
  const cardId=sourceIdFor(options.effect,options.cardId);
  const sources=core.players[team].backrow.filter(card=>
    card.id===cardId&&!card.faceUp&&Number.isSafeInteger(card.setTurn)&&card.setTurn<core.turn
  );
  if(options.effect==='horn-of-heaven'){
    const costs=core.players[team].monsters
      .filter(monster=>monster.uid!==response.card)
      .map(monster=>monster.uid);
    return sources.flatMap(source=>costs.map(cost=>({
      kind:'trap' as const,card:source.uid,target:'' as const,effect:options.effect,cost
    })));
  }
  return sources.map(source=>({kind:'trap' as const,card:source.uid,target:'' as const,effect:options.effect}));
}
export function createCounterTrapSession(duel:TagDuel):CounterTrapSession{
  assertCounterTrapRules(duel);
  return {duel:structuredClone(duel),pending:{},resolved:[]};
}
export function activateCounterTrap(
  input:CounterTrapSession,
  sourceUid:string,
  activationId:string,
  lookup:CounterTrapLookup,
  options:{effect:CounterTrapEffect;cardId?:string;costUid?:string}
):CounterTrapSession{
  if(typeof activationId!=='string'||!activationId.trim()||activationId.length>128||
    input.pending[activationId]||input.resolved.includes(activationId)){
    throw new Error('ID de ativação ausente ou duplicado.');
  }
  assertCounterTrapRules(input.duel);
  const team=input.duel.core.priority;
  const legal=counterTrapActions(input.duel,lookup,{effect:options.effect,cardId:options.cardId});
  if(!isTeam(team)||!legal.some(action=>action.card===sourceUid&&action.cost===options.costUid)){
    throw new Error('A Counter Trap não está legal na janela de resposta atual ou o custo é inválido.');
  }
  const cardId=sourceIdFor(options.effect,options.cardId);
  const source=sourceCard(input.duel,team,sourceUid,cardId);
  const ownerSeat=physicalSeat(sourceUid);
  if(!source||ownerSeat===null||source.faceUp||!Number.isSafeInteger(source.setTurn)||source.setTurn>=input.duel.core.turn){
    throw new Error('A Armadilha não está Set e liberada para ativação.');
  }
  const response=responseFor(options.effect,team,input.duel.core,lookup);
  if(!response)throw new Error('A janela de resposta deixou de ser válida.');
  if(options.effect==='horn-of-heaven'&&(!options.costUid||options.costUid===response.card||
    !findMonster(input.duel.core,team,options.costUid))){
    throw new Error('Horn of Heaven exige tributar um monstro da própria equipe.');
  }
  synchronizeCardLifetimes(input.duel.core);
  const targetBinding=bindTarget(input.duel.core,response.card);
  if(!targetBinding||
    response.targetKind==='summon'&&targetBinding.zone!=='monsters'||
    response.targetKind==='activation'&&targetBinding.zone!=='backrow'&&targetBinding.zone!=='field'){
    throw new Error('O objeto da janela de resposta não está na zona esperada.');
  }
  const before=inventorySnapshot(input.duel),next=structuredClone(input);
  if(options.effect==='horn-of-heaven'){
    if(!options.costUid||!moveMonsterToOwnerGrave(next.duel.core,team,options.costUid)){
      throw new Error('O monstro oferecido como Tributo saiu do campo.');
    }
  }
  const nextSource=sourceCard(next.duel,team,sourceUid,cardId);
  if(!nextSource)throw new Error('A Armadilha saiu do campo antes da ativação.');
  nextSource.faceUp=true;
  next.duel.core.chain.push({actor:team,card:sourceUid,id:cardId,target:''});
  next.duel.core.priority=1-team;
  next.duel.core.passes=0;
  next.pending[activationId]={
    activationId,effect:options.effect,sourceUid,sourceId:cardId,sourceOwnerSeat:ownerSeat,
    controllerTeam:team,controllerSeat:next.duel.active[team] as Seat,
    turn:next.duel.core.turn,response,targetBinding,
    ...(options.costUid?{costUid:options.costUid}:{})
  };
  assertSameInventory(before,next.duel);
  assertCounterTrapRules(next.duel);
  return next;
}
export function resolveCounterTrap(
  input:CounterTrapSession,
  activationId:string,
  options:{sourceActivationNegated?:boolean}={}
):{session:CounterTrapSession;result:CounterTrapResolution}{
  const activation=input.pending[activationId];
  if(!activation||input.resolved.includes(activationId))throw new Error('Ativação de Counter Trap ausente ou já resolvida.');
  assertCounterTrapRules(input.duel);
  const before=inventorySnapshot(input.duel),next=structuredClone(input),core=next.duel.core;
  const ownIndex=core.chain.findIndex(link=>link.actor===activation.controllerTeam&&
    link.card===activation.sourceUid&&link.id===activation.sourceId);
  if(ownIndex!==core.chain.length-1)throw new Error('Counter Trap só pode resolver no topo da corrente.');
  const own=core.chain.pop();
  if(!own)throw new Error('Link da Counter Trap ausente.');
  const sourceEffectNegated=options.sourceActivationNegated===true||own.negated===true||continuousTrapsNegated(core);
  let targetActivationNegated=false,summonNegated=false,targetDestroyed=false;
  if(!sourceEffectNegated&&targetIsCurrent(core,activation.response)&&targetBindingValid(core,activation.targetBinding)){
    if(activation.response.targetKind==='summon'){
      core.pendingNegated=true;
      summonNegated=true;
      targetDestroyed=moveMonsterToOwnerGrave(core,activation.response.actor,activation.response.card);
    }else{
      if(activation.response.kind==='pending')core.pendingNegated=true;
      else{
        const target=core.chain.at(-1);
        if(target&&!target.negated&&target.actor===activation.response.actor&&
          target.card===activation.response.card&&target.id===activation.response.id)target.negated=true;
        else throw new Error('O link-alvo mudou antes da resolução.');
      }
      targetActivationNegated=true;
      targetDestroyed=moveSpellTrapToOwnerGrave(core,activation.response.actor,activation.response.card);
    }
  }
  const sourceSentToGrave=moveSpellTrapToOwnerGrave(core,activation.controllerTeam,activation.sourceUid);
  delete next.pending[activationId];
  next.resolved.push(activationId);
  next.resolved=next.resolved.slice(-256);
  synchronizeCardLifetimes(core);
  assertSameInventory(before,next.duel);
  assertCounterTrapRules(next.duel);
  return {session:next,result:{
    activationId,effect:activation.effect,cardId:activation.sourceId,
    ...(activation.costUid?{costUid:activation.costUid}:{}),
    costPaid:activation.effect==='horn-of-heaven',
    targetKind:activation.response.targetKind,sourceEffectNegated,
    targetActivationNegated,summonNegated,targetDestroyed,sourceSentToGrave
  }};
}

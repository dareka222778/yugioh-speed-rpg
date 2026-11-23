import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import {synchronizeCardLifetimes,type TargetBinding,targetBindingValid} from './cardLifetime';
import {tagInventory,type TagDuel} from './tagDuel';

export const THE_SHALLOW_GRAVE_ID='43434803';
type Team=0|1;
type Core=TagDuel['core'];
type Monster=Core['players'][number]['monsters'][number];
type Lookup=(id:string)=>Pick<Card,'kind'|'monsterType'>|undefined;
type TargetBindings=[TargetBinding,TargetBinding];

type PendingActivation={
  sourceUid:string;
  controllerSeat:number;
  controllerTeam:Team;
  opponentSeat:number;
  turn:number;
  targets:[string,string];
  targetBindings:TargetBindings;
};

export type TheShallowGraveMemory={pending:Record<string,PendingActivation>;resolved:Record<string,true>};
export type TheShallowGraveState=TagDuel&{shallowGrave?:TheShallowGraveMemory};
export type TheShallowGraveActivationPlan={
  kind:'the-shallow-grave-activation';sourceUid:string;controllerSeat:number;controllerTeam:Team;
  opponentSeat:number;turn:number;activationId:string;targets:[string,string];targetBindings:TargetBindings;
};
export type TheShallowGraveResolutionPlan={
  kind:'the-shallow-grave-resolution';sourceUid:string;controllerSeat:number;controllerTeam:Team;
  opponentSeat:number;turn:number;activationId:string;targets:[string,string];targetBindings:TargetBindings;
};

const cardLookup:Lookup=id=>getPlayableCard(id);
function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=128&&!/\s/.test(value);
}
function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw Error('UID The Shallow Grave sem proprietário físico válido.');
  return Number(match[1]);
}
function allPhysicalCards(state:TheShallowGraveState){
  return [...tagInventory(state),...Object.values(state.reserves).flatMap(held=>[...held.deck,...held.hand,...(held.extra??[])])];
}
function assertState(state:TheShallowGraveState):void{
  if(!state||state.version!==1||state.mode!=='tag-classic'||!state.core||
    !Array.isArray(state.core.players)||state.core.players.length!==2||
    !Array.isArray(state.members)||state.members.length!==4||
    !Array.isArray(state.active)||state.active.length!==2||!state.reserves||
    state.active.some((seat,team)=>!Number.isInteger(seat)||seat<0||seat>3||seat%2!==team)||
    !state.core.teamRotation||!Number.isSafeInteger(state.core.turn)||state.core.turn<1||
    !Number.isSafeInteger(state.cursor)||state.cursor<0||state.cursor>3||
    state.core.current!==state.cursor%2||state.active[state.core.current]!==state.cursor||
    state.core.teamRotation.cursor!==state.cursor||
    JSON.stringify(state.active)!==JSON.stringify(state.core.teamRotation.active)||
    JSON.stringify(state.reserves)!==JSON.stringify(state.core.teamRotation.reserves)||
    state.members.some((member,index)=>!member.id||!member.name||member.team!==index%2))
    throw Error('Estado TagDuel clássico/rotação inválido para The Shallow Grave.');
  const expectedReserves=[0,1,2,3].filter(seat=>!state.active.includes(seat));
  const reserveKeys=Object.keys(state.reserves).map(Number).sort((a,b)=>a-b);
  if(reserveKeys.length!==2||reserveKeys.some((seat,index)=>seat!==expectedReserves[index]))
    throw Error('Reservas físicas TagDuel inválidas para The Shallow Grave.');
  for(const [team,player] of state.core.players.entries()){
    if(player.id!=='tag-team-'+team||!Array.isArray(player.deck)||!Array.isArray(player.hand)||
      !Array.isArray(player.monsters)||player.monsters.length>3||
      !Array.isArray(player.backrow)||player.backrow.length>3||
      !Array.isArray(player.grave)||!Array.isArray(player.banished)||
      !Array.isArray(player.extra??[])||(player.extra??[]).length>5||
      state.active[team]%2!==team)
      throw Error('Zonas 3+3, Extra Deck ou representante ativo inválidos para The Shallow Grave.');
    const prefix='m'+state.active[team]+':';
    for(const card of [...player.deck,...player.hand,...(player.extra??[])])
      if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))
        throw Error('UID de Deck/mão/Extra deve pertencer ao representante físico ativo.');
  }
  for(const [seat,held] of Object.entries(state.reserves)){
    if(!held||!Array.isArray(held.deck)||!Array.isArray(held.hand)||
      !Array.isArray(held.extra??[])||(held.extra??[]).length>5)
      throw Error('Deck/mão/Extra da reserva física inválidos.');
    const prefix='m'+seat+':';
    for(const card of [...held.deck,...held.hand,...(held.extra??[])])
      if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))
        throw Error('UID de zona privada da reserva pertence a outro proprietário físico.');
  }
  const cards=allPhysicalCards(state);
  const uids=cards.map(card=>card.uid);
  if(cards.some(card=>typeof card.uid!=='string'||!/^m[0-3]:/.test(card.uid)||
    typeof card.id!=='string'||!card.id)||new Set(uids).size!==uids.length)
    throw Error('Inventário físico inválido ou UID duplicado no TagDuel.');
  const memory=state.shallowGrave;
  if(memory!==undefined&&(!memory||typeof memory!=='object'||
    !memory.pending||typeof memory.pending!=='object'||!memory.resolved||typeof memory.resolved!=='object'||
    Object.entries(memory.pending).some(([id,value])=>!validActivationId(id)||!value||
      typeof value.sourceUid!=='string'||!Number.isInteger(value.controllerSeat)||
      value.controllerSeat<0||value.controllerSeat>3||
      (value.controllerTeam!==0&&value.controllerTeam!==1)||
      !Number.isInteger(value.opponentSeat)||value.opponentSeat<0||value.opponentSeat>3||
      !Number.isSafeInteger(value.turn)||!Array.isArray(value.targets)||value.targets.length!==2||
      !Array.isArray(value.targetBindings)||value.targetBindings.length!==2||
      value.targetBindings.some((binding,index)=>!binding||binding.uid!==value.targets[index]||
        binding.zone!=='grave'||!Number.isSafeInteger(binding.epoch)||binding.epoch<0))||
    Object.entries(memory.resolved).some(([id,value])=>!validActivationId(id)||value!==true)))
    throw Error('Memória de ativações The Shallow Grave inválida.');
}
function assertOpenMain(state:TheShallowGraveState,team:Team):void{
  if(state.core.phase!=='main'||state.core.current!==team||
    state.core.pending?.kind!=='none'||!Array.isArray(state.core.chain)||
    state.core.chain.length>0||state.core.choice||state.core.handFlow)
    throw Error('The Shallow Grave só pode ser ativada na Main Phase sem decisão ou corrente pendente.');
}
function sourceContext(state:TheShallowGraveState,uid:string,lookup:Lookup):{
  controllerSeat:number;controllerTeam:Team;opponentSeat:number
}{
  assertState(state);
  if(typeof uid!=='string'||!uid)throw Error('UID da fonte The Shallow Grave ausente.');
  const controllerTeam=state.core.current as Team;
  const controllerSeat=state.active[controllerTeam];
  const ownerSeat=physicalSeat(uid);
  if(ownerSeat!==controllerSeat||state.members[ownerSeat]?.team!==controllerTeam)
    throw Error('The Shallow Grave deve ser ativada pelo representante físico ativo.');
  const matches=state.core.players[controllerTeam].hand.filter(card=>card.uid===uid);
  if(matches.length!==1||matches[0].id!==THE_SHALLOW_GRAVE_ID)
    throw Error('The Shallow Grave deve estar uma única vez na mão do representante ativo.');
  const metadata=lookup(matches[0].id);
  if(!metadata||metadata.kind!=='spell')throw Error('Definição de The Shallow Grave não admitida.');
  assertOpenMain(state,controllerTeam);
  return {controllerSeat,controllerTeam,opponentSeat:state.active[1-controllerTeam]};
}
function isReviveEligible(state:TheShallowGraveState,team:Team,uid:string,lookup:Lookup):boolean{
  let ownerSeat:number;
  try{ownerSeat=physicalSeat(uid);}catch{return false;}
  if(ownerSeat%2!==team||state.members[ownerSeat]?.team!==team)return false;
  const matches=state.core.players[team].grave.filter(card=>card.uid===uid);
  if(matches.length!==1||matches[0].entityKind==='token')return false;
  const metadata=lookup(matches[0].id);
  if(!metadata||metadata.kind!=='monster')return false;
  if((metadata.monsterType==='fusion'||metadata.monsterType==='ritual')&&!matches[0].properlySummoned)return false;
  return true;
}
function inventorySnapshot(state:TheShallowGraveState):string{
  const cards=allPhysicalCards(state);
  const uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)throw Error('Inventário físico duplicado antes da resolução The Shallow Grave.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}
function assertConserved(before:string,after:TheShallowGraveState):void{
  if(inventorySnapshot(after)!==before)throw Error('The Shallow Grave alterou ou perdeu uma identidade física do inventário.');
}
function bindingFor(state:TheShallowGraveState,uid:string):TargetBinding{
  const core=structuredClone(state.core);
  synchronizeCardLifetimes(core);
  const binding=core.cardLifetimes?.[uid];
  if(!binding||binding.zone!=='grave')throw Error('Alvo The Shallow Grave deve permanecer no Cemitério de sua própria equipe.');
  return {uid,zone:'grave',epoch:binding.epoch};
}
function pendingActivation(state:TheShallowGraveState,activationId:string):PendingActivation{
  if(!validActivationId(activationId))throw Error('activationId The Shallow Grave inválido.');
  const pending=state.shallowGrave?.pending?.[activationId];
  if(!pending)throw Error('Ativação The Shallow Grave ausente, já resolvida ou obsoleta.');
  if(state.core.turn!==pending.turn||state.core.current!==pending.controllerTeam||
    state.active[pending.controllerTeam]!==pending.controllerSeat||
    state.active[1-pending.controllerTeam]!==pending.opponentSeat||
    pending.controllerTeam!==pending.controllerSeat%2)
    throw Error('Contexto de equipe/turno da ativação The Shallow Grave mudou.');
  return pending;
}

/** Lists legal targets for one team; both teams must have a legal target to activate the Spell. */
export function getTheShallowGraveCandidates(state:TheShallowGraveState,team:Team,lookup:Lookup=cardLookup):string[]{
  assertState(state);
  if(team!==0&&team!==1)throw Error('Equipe inválida na seleção The Shallow Grave.');
  if(state.core.players[team].monsters.length>=3)return [];
  return state.core.players[team].grave.filter(card=>isReviveEligible(state,team,card.uid,lookup)).map(card=>card.uid);
}

/** Both teams choose their own target at activation; the chosen UIDs are bound to their GY epochs. */
export function planTheShallowGraveActivation(
  state:TheShallowGraveState,sourceUid:string,activationId:string,targets:[string,string],lookup:Lookup=cardLookup
):TheShallowGraveActivationPlan{
  assertState(state);
  const source=sourceContext(state,sourceUid,lookup);
  if(!validActivationId(activationId)||state.shallowGrave?.pending?.[activationId]||state.shallowGrave?.resolved?.[activationId])
    throw Error('activationId The Shallow Grave inválido ou já utilizado.');
  if(!Array.isArray(targets)||targets.length!==2||targets.some(uid=>typeof uid!=='string'||!uid)||targets[0]===targets[1])
    throw Error('The Shallow Grave exige um alvo físico distinto por equipe.');
  const normalized:[string,string]=[targets[0],targets[1]];
  for(const team of [0,1] as const){
    const candidates=getTheShallowGraveCandidates(state,team,lookup);
    if(candidates.length===0)throw Error('Cada equipe precisa de monstro elegível no Cemitério e Zona de Monstro livre.');
    if(!candidates.includes(normalized[team]))throw Error('Cada equipe deve escolher um monstro do próprio Cemitério.');
  }
  const targetBindings:TargetBindings=[bindingFor(state,normalized[0]),bindingFor(state,normalized[1])];
  return {kind:'the-shallow-grave-activation',sourceUid,controllerSeat:source.controllerSeat,
    controllerTeam:source.controllerTeam,opponentSeat:source.opponentSeat,turn:state.core.turn,
    activationId,targets:normalized,targetBindings};
}

/** Persists the two activation-time targets; the adapter does not move the Spell source. */
export function registerTheShallowGraveActivation(
  input:TheShallowGraveState,plan:TheShallowGraveActivationPlan,lookup:Lookup=cardLookup
):TheShallowGraveState{
  assertState(input);
  if(!plan||plan.kind!=='the-shallow-grave-activation'||!validActivationId(plan.activationId)||
    plan.turn!==input.core.turn||!Array.isArray(plan.targets)||plan.targets.length!==2||
    !Array.isArray(plan.targetBindings)||plan.targetBindings.length!==2||
    plan.targets.some((uid,index)=>plan.targetBindings[index]?.uid!==uid||plan.targetBindings[index]?.zone!=='grave'))
    throw Error('Plano de ativação The Shallow Grave inválido ou obsoleto.');
  const source=sourceContext(input,plan.sourceUid,lookup);
  if(source.controllerSeat!==plan.controllerSeat||source.controllerTeam!==plan.controllerTeam||
    source.opponentSeat!==plan.opponentSeat||input.shallowGrave?.pending?.[plan.activationId]||
    input.shallowGrave?.resolved?.[plan.activationId])
    throw Error('Contexto ou activationId The Shallow Grave mudou antes do registro.');
  for(const team of [0,1] as const){
    if(!isReviveEligible(input,team,plan.targets[team],lookup)||!targetBindingValid(structuredClone(input.core),plan.targetBindings[team]))
      throw Error('Alvo The Shallow Grave mudou antes do registro.');
  }
  const before=inventorySnapshot(input);
  const next=structuredClone(input) as TheShallowGraveState;
  const pending={...(next.shallowGrave?.pending??{})};
  pending[plan.activationId]={sourceUid:plan.sourceUid,controllerSeat:plan.controllerSeat,
    controllerTeam:plan.controllerTeam,opponentSeat:plan.opponentSeat,turn:plan.turn,
    targets:[...plan.targets] as [string,string],targetBindings:structuredClone(plan.targetBindings)};
  next.shallowGrave={pending,resolved:{...(next.shallowGrave?.resolved??{})}};
  synchronizeCardLifetimes(next.core);
  assertState(next);assertConserved(before,next);
  return next;
}

export function planTheShallowGraveResolution(state:TheShallowGraveState,activationId:string):TheShallowGraveResolutionPlan{
  assertState(state);
  const pending=pendingActivation(state,activationId);
  return {kind:'the-shallow-grave-resolution',sourceUid:pending.sourceUid,
    controllerSeat:pending.controllerSeat,controllerTeam:pending.controllerTeam,
    opponentSeat:pending.opponentSeat,turn:pending.turn,activationId,
    targets:[...pending.targets] as [string,string],targetBindings:structuredClone(pending.targetBindings)};
}

/** Resolves each targeted monster independently; a stale target does not cancel the other team's summon. */
export function resolveTheShallowGraveResolution(
  input:TheShallowGraveState,plan:TheShallowGraveResolutionPlan,effectNegated=false,lookup:Lookup=cardLookup
):{
  status:'both'|'partial'|'no-summons'|'negated';
  state:TheShallowGraveState;
  summoned:Array<{team:Team;uid:string;ownerSeat:number;position:'def';faceUp:false}>;
}{
  assertState(input);
  if(!plan||plan.kind!=='the-shallow-grave-resolution')throw Error('Plano de resolução The Shallow Grave inválido.');
  const pending=pendingActivation(input,plan.activationId);
  if(plan.sourceUid!==pending.sourceUid||plan.controllerSeat!==pending.controllerSeat||
    plan.controllerTeam!==pending.controllerTeam||plan.opponentSeat!==pending.opponentSeat||
    plan.turn!==pending.turn||JSON.stringify(plan.targets)!==JSON.stringify(pending.targets)||
    JSON.stringify(plan.targetBindings)!==JSON.stringify(pending.targetBindings))
    throw Error('Plano de alvos The Shallow Grave não corresponde à ativação pendente.');
  const before=inventorySnapshot(input);
  const next=structuredClone(input) as TheShallowGraveState;
  const pendingMap={...(next.shallowGrave?.pending??{})};
  delete pendingMap[plan.activationId];
  next.shallowGrave={pending:pendingMap,resolved:{...(next.shallowGrave?.resolved??{}),[plan.activationId]:true as const}};
  if(effectNegated){
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'negated',state:next,summoned:[]};
  }
  const summoned:Array<{team:Team;uid:string;ownerSeat:number;position:'def';faceUp:false}>=[];
  for(const team of [0,1] as const){
    const uid=pending.targets[team],binding=pending.targetBindings[team];
    if(!targetBindingValid(next.core,binding)||!isReviveEligible(next,team,uid,lookup)||
      next.core.players[team].monsters.length>=3)continue;
    const grave=next.core.players[team].grave,index=grave.findIndex(card=>card.uid===uid);
    if(index<0)continue;
    const [ref]=grave.splice(index,1),ownerSeat=physicalSeat(ref.uid);
    const revived:Monster={...ref,owner:ownerSeat,faceUp:false,position:'def',
      entered:pending.turn,changed:pending.turn,attacked:0,atkBoost:0,defBoost:0};
    next.core.players[team].monsters.push(revived);
    summoned.push({team,uid:revived.uid,ownerSeat,position:'def',faceUp:false});
  }
  synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
  return {status:summoned.length===2?'both':summoned.length===1?'partial':'no-summons',state:next,summoned};
}

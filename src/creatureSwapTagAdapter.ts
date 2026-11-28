import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import {synchronizeCardLifetimes} from './cardLifetime';
import {tagInventory,type TagDuel} from './tagDuel';
import type {Backrow,Monster} from './duelEngine';

export const CREATURE_SWAP_ID='31036355';
type Team=0|1;
type Core=TagDuel['core'];
type Lookup=(id:string)=>Pick<Card,'kind'|'monsterType'>|undefined;
type PendingActivation={sourceUid:string;sourceOwnerSeat:number;controllerSeat:number;controllerTeam:Team;turn:number};
export type CreatureSwapMemory={pending:Record<string,PendingActivation>;resolved:Record<string,true>};
export type CreatureSwapState=TagDuel&{creatureSwap?:CreatureSwapMemory};
export type CreatureSwapActivationPlan={
  kind:'creature-swap-activation';sourceUid:string;sourceOwnerSeat:number;controllerSeat:number;
  controllerTeam:Team;turn:number;activationId:string
};
export type CreatureSwapResolutionPlan=Omit<CreatureSwapActivationPlan,'kind'>&{kind:'creature-swap-resolution'};
export type CreatureSwapChoices={team0Uid:string;team1Uid:string};
const cardLookup:Lookup=id=>getPlayableCard(id);

function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=128&&!/\\s/.test(value);
}
function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw Error('UID Creature Swap sem proprietário físico válido.');
  return Number(match[1]);
}
function assertState(state:CreatureSwapState):void{
  if(!state||state.version!==1||state.mode!=='tag-classic'||!state.core||
    !Array.isArray(state.core.players)||state.core.players.length!==2||
    !Array.isArray(state.members)||state.members.length!==4||
    !Array.isArray(state.active)||state.active.length!==2||!state.reserves||
    state.active.some((seat,team)=>!Number.isInteger(seat)||seat<0||seat>3||seat%2!==team)||
    !Number.isSafeInteger(state.cursor)||state.cursor<0||state.cursor>3||
    !Number.isSafeInteger(state.core.turn)||state.core.turn<1||
    state.core.current!==state.cursor%2||state.active[state.core.current]!==state.cursor||
    !state.core.teamRotation||state.core.teamRotation.cursor!==state.cursor||
    JSON.stringify(state.active)!==JSON.stringify(state.core.teamRotation.active)||
    JSON.stringify(state.reserves)!==JSON.stringify(state.core.teamRotation.reserves)||
    state.members.some((member,index)=>!member.id||!member.name||member.team!==index%2))
    throw Error('Estado TagDuel clássico/rotação inválido para Creature Swap.');
  const expected=[0,1,2,3].filter(seat=>!state.active.includes(seat)),keys=Object.keys(state.reserves).map(Number).sort((a,b)=>a-b);
  if(keys.length!==2||keys.some((seat,index)=>seat!==expected[index]))
    throw Error('Reservas físicas TagDuel inválidas para Creature Swap.');
  for(const [team,player] of state.core.players.entries()){
    if(player.id!=='tag-team-'+team||!Number.isSafeInteger(player.lp)||player.lp<0||
      !Array.isArray(player.deck)||!Array.isArray(player.hand)||!Array.isArray(player.monsters)||
      player.monsters.length>3||!Array.isArray(player.backrow)||player.backrow.length>3||
      !Array.isArray(player.grave)||!Array.isArray(player.banished??[])||
      !Array.isArray(player.extra??[])||(player.extra??[]).length>5||
      state.active[team]%2!==team)
      throw Error('LP, zonas 3+3 ou Extra Deck inválidos para Creature Swap.');
    const prefix='m'+state.active[team]+':';
    for(const card of [...player.deck,...player.hand,...(player.extra??[])])
      if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))
        throw Error('UID de Deck/mão/Extra não pertence ao representante físico ativo.');
    for(const card of [...player.monsters,...player.backrow,...player.grave,...(player.banished??[]),...(player.field?[player.field]:[])])
      physicalSeat(card.uid);
  }
  for(const [seat,held] of Object.entries(state.reserves)){
    if(!held||!Array.isArray(held.deck)||!Array.isArray(held.hand)||
      !Array.isArray(held.extra??[])||(held.extra??[]).length>5)
      throw Error('Deck/mão/Extra da reserva física inválidos para Creature Swap.');
    const prefix='m'+seat+':';
    for(const card of [...held.deck,...held.hand,...(held.extra??[])])
      if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))
        throw Error('UID de zona privada da reserva pertence a outro proprietário físico.');
  }
  const cards=tagInventory(state),uids=cards.map(card=>card.uid);
  if(cards.some(card=>typeof card.uid!=='string'||!/^m[0-3]:/.test(card.uid)||typeof card.id!=='string'||!card.id)||
    new Set(uids).size!==uids.length)
    throw Error('Inventário físico inválido ou UID duplicado no TagDuel.');
  if(state.creatureSwap!==undefined){
    const memory=state.creatureSwap;
    if(!memory||!memory.pending||typeof memory.pending!=='object'||!memory.resolved||typeof memory.resolved!=='object'||
      Object.entries(memory.pending).some(([id,p])=>!validActivationId(id)||!p||
        typeof p.sourceUid!=='string'||!Number.isInteger(p.sourceOwnerSeat)||p.sourceOwnerSeat<0||p.sourceOwnerSeat>3||
        p.controllerSeat!==p.sourceOwnerSeat||(p.controllerTeam!==0&&p.controllerTeam!==1)||
        p.controllerSeat%2!==p.controllerTeam||!Number.isSafeInteger(p.turn)||p.turn<1)||
      Object.entries(memory.resolved).some(([id,value])=>!validActivationId(id)||value!==true))
      throw Error('Memória de ativação Creature Swap inválida.');
  }
}
function assertOpenMain(state:CreatureSwapState):void{
  if(state.core.phase!=='main'||state.core.pending.kind!=='none'||state.core.chain.length>0||
    state.core.choice||state.core.handFlow||state.core.turnEnding||state.core.damageStep)
    throw Error('Creature Swap só pode ser ativado na Main Phase sem corrente ou decisão pendente.');
}
function sourceContext(state:CreatureSwapState,sourceUid:string,lookup:Lookup):{
  sourceOwnerSeat:number;controllerSeat:number;controllerTeam:Team
}{
  assertState(state);
  if(typeof sourceUid!=='string'||!sourceUid)throw Error('UID da fonte Creature Swap ausente.');
  const controllerTeam=state.core.current as Team,controllerSeat=state.active[controllerTeam],sourceOwnerSeat=physicalSeat(sourceUid);
  if(sourceOwnerSeat!==controllerSeat||state.members[sourceOwnerSeat]?.team!==controllerTeam)
    throw Error('Creature Swap deve ser ativado pelo representante físico ativo.');
  const matches=state.core.players[controllerTeam].hand.filter(card=>card.uid===sourceUid);
  if(matches.length!==1||matches[0].id!==CREATURE_SWAP_ID||lookup(matches[0].id)?.kind!=='spell')
    throw Error('Creature Swap deve estar uma única vez na mão do representante ativo.');
  assertOpenMain(state);
  return {sourceOwnerSeat,controllerSeat,controllerTeam};
}
function inventorySnapshot(state:CreatureSwapState):string{
  const cards=tagInventory(state),uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)throw Error('Inventário físico duplicado antes da resolução Creature Swap.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}
function assertConserved(before:string,after:CreatureSwapState):void{
  if(inventorySnapshot(after)!==before)throw Error('Creature Swap alterou ou perdeu identidade física do inventário.');
}
function pendingActivation(state:CreatureSwapState,activationId:string):PendingActivation{
  if(!validActivationId(activationId))throw Error('activationId Creature Swap inválido.');
  const pending=state.creatureSwap?.pending?.[activationId];
  if(!pending)throw Error('Ativação Creature Swap ausente, resolvida ou obsoleta.');
  if(state.core.turn!==pending.turn||state.core.current!==pending.controllerTeam||
    state.cursor!==pending.controllerSeat||state.active[pending.controllerTeam]!==pending.controllerSeat)
    throw Error('Contexto de equipe/turno da ativação Creature Swap mudou.');
  return pending;
}
function moveSpellToOwnerGrave(state:CreatureSwapState,controllerTeam:Team,sourceUid:string):boolean{
  const backrow=state.core.players[controllerTeam].backrow,index=backrow.findIndex(card=>card.uid===sourceUid);
  if(index<0)return false;
  const [spell]=backrow.splice(index,1),ownerTeam=(physicalSeat(spell.uid)%2) as Team;
  state.core.players[ownerTeam].grave.push(spell);
  return true;
}

/** Returns only monsters controlled by the requested team; face-down monsters remain eligible. */
export function getCreatureSwapCandidates(state:CreatureSwapState,team:Team):string[]{
  assertState(state);
  if(team!==0&&team!==1)throw Error('Equipe Creature Swap inválida.');
  return state.core.players[team].monsters.map(monster=>monster.uid);
}
export function planCreatureSwapActivation(
  state:CreatureSwapState,sourceUid:string,activationId:string,lookup:Lookup=cardLookup
):CreatureSwapActivationPlan{
  assertState(state);
  if(!validActivationId(activationId)||state.creatureSwap?.pending?.[activationId]||state.creatureSwap?.resolved?.[activationId])
    throw Error('activationId Creature Swap inválido ou já utilizado.');
  const source=sourceContext(state,sourceUid,lookup);
  if(getCreatureSwapCandidates(state,0).length===0||getCreatureSwapCandidates(state,1).length===0)
    throw Error('Creature Swap exige ao menos um monstro controlado por cada equipe.');
  if(state.core.players[source.controllerTeam].backrow.length>=3)
    throw Error('Creature Swap exige uma Spell/Trap Zone livre para ativação.');
  return {kind:'creature-swap-activation',sourceUid,sourceOwnerSeat:source.sourceOwnerSeat,
    controllerSeat:source.controllerSeat,controllerTeam:source.controllerTeam,turn:state.core.turn,activationId};
}
export function registerCreatureSwapActivation(
  input:CreatureSwapState,plan:CreatureSwapActivationPlan,lookup:Lookup=cardLookup
):CreatureSwapState{
  assertState(input);
  if(!plan||plan.kind!=='creature-swap-activation'||!validActivationId(plan.activationId)||plan.turn!==input.core.turn)
    throw Error('Plano de ativação Creature Swap inválido ou obsoleto.');
  const source=sourceContext(input,plan.sourceUid,lookup);
  if(source.sourceOwnerSeat!==plan.sourceOwnerSeat||source.controllerSeat!==plan.controllerSeat||
    source.controllerTeam!==plan.controllerTeam||input.creatureSwap?.pending?.[plan.activationId]||
    input.creatureSwap?.resolved?.[plan.activationId]||
    getCreatureSwapCandidates(input,0).length===0||getCreatureSwapCandidates(input,1).length===0||
    input.core.players[plan.controllerTeam].backrow.length>=3)
    throw Error('Contexto, zonas ou activationId Creature Swap mudou antes do registro.');
  const before=inventorySnapshot(input),next=structuredClone(input) as CreatureSwapState;
  const hand=next.core.players[plan.controllerTeam].hand,index=hand.findIndex(card=>card.uid===plan.sourceUid);
  if(index<0)throw Error('Creature Swap deixou a mão antes do registro.');
  const [sourceCard]=hand.splice(index,1),spell:Backrow={...sourceCard,setTurn:plan.turn,faceUp:true};
  next.core.players[plan.controllerTeam].backrow.push(spell);
  const pending={...(next.creatureSwap?.pending??{})};
  pending[plan.activationId]={sourceUid:plan.sourceUid,sourceOwnerSeat:plan.sourceOwnerSeat,
    controllerSeat:plan.controllerSeat,controllerTeam:plan.controllerTeam,turn:plan.turn};
  next.creatureSwap={pending,resolved:{...(next.creatureSwap?.resolved??{})}};
  synchronizeCardLifetimes(next.core);
  assertState(next);assertConserved(before,next);
  return next;
}
export function planCreatureSwapResolution(
  state:CreatureSwapState,activationId:string
):CreatureSwapResolutionPlan{
  assertState(state);
  const pending=pendingActivation(state,activationId);
  return {...pending,kind:'creature-swap-resolution',activationId};
}
export function resolveCreatureSwapResolution(
  input:CreatureSwapState,plan:CreatureSwapResolutionPlan,choices?:CreatureSwapChoices,effectNegated=false
):{
  status:'swapped'|'negated'|'no-monsters'|'source-missing';
  state:CreatureSwapState;
  swapped?:{team0Uid:string;team1Uid:string}
}{
  assertState(input);
  if(!plan||plan.kind!=='creature-swap-resolution')throw Error('Plano de resolução Creature Swap inválido.');
  const pending=pendingActivation(input,plan.activationId);
  if(plan.sourceUid!==pending.sourceUid||plan.sourceOwnerSeat!==pending.sourceOwnerSeat||
    plan.controllerSeat!==pending.controllerSeat||plan.controllerTeam!==pending.controllerTeam||plan.turn!==pending.turn)
    throw Error('Plano Creature Swap não corresponde à ativação pendente.');
  const before=inventorySnapshot(input),sourceExists=input.core.players[pending.controllerTeam].backrow.some(card=>card.uid===pending.sourceUid);
  const next=structuredClone(input) as CreatureSwapState,pendingMap={...(next.creatureSwap?.pending??{})};
  delete pendingMap[plan.activationId];
  next.creatureSwap={pending:pendingMap,resolved:{...(next.creatureSwap?.resolved??{}),[plan.activationId]:true as const}};
  if(!sourceExists){
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'source-missing',state:next};
  }
  if(effectNegated){
    moveSpellToOwnerGrave(next,pending.controllerTeam,pending.sourceUid);
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'negated',state:next};
  }
  const team0=input.core.players[0].monsters,team1=input.core.players[1].monsters;
  if(team0.length===0||team1.length===0){
    moveSpellToOwnerGrave(next,pending.controllerTeam,pending.sourceUid);
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'no-monsters',state:next};
  }
  if(!choices||typeof choices.team0Uid!=='string'||typeof choices.team1Uid!=='string'||
    !team0.some(monster=>monster.uid===choices.team0Uid)||!team1.some(monster=>monster.uid===choices.team1Uid)||
    choices.team0Uid===choices.team1Uid)
    throw Error('Cada equipe deve escolher exatamente um monstro que controla na resolução Creature Swap.');
  const nextTeam0=next.core.players[0].monsters,nextTeam1=next.core.players[1].monsters;
  const index0=nextTeam0.findIndex(monster=>monster.uid===choices.team0Uid),index1=nextTeam1.findIndex(monster=>monster.uid===choices.team1Uid);
  if(index0<0||index1<0)throw Error('Monstro escolhido deixou o campo antes da resolução Creature Swap.');
  const [monster0]=nextTeam0.splice(index0,1),[monster1]=nextTeam1.splice(index1,1);
  const lock=(monster:Monster):Monster=>({...monster,owner:physicalSeat(monster.uid),
    positionLockedThrough:Math.max(monster.positionLockedThrough??0,pending.turn)});
  nextTeam0.push(lock(monster1));
  nextTeam1.push(lock(monster0));
  moveSpellToOwnerGrave(next,pending.controllerTeam,pending.sourceUid);
  synchronizeCardLifetimes(next.core);
  assertState(next);assertConserved(before,next);
  return {status:'swapped',state:next,swapped:{team0Uid:choices.team0Uid,team1Uid:choices.team1Uid}};
}

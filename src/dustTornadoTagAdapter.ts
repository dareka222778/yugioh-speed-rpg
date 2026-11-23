import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import {bindTarget,synchronizeCardLifetimes,targetBindingValid,type TargetBinding} from './cardLifetime';
import {tagInventory,type TagDuel} from './tagDuel';
import type {Backrow} from './duelEngine';

export const DUST_TORNADO_ID='60082869';
type Team=0|1;
type Lookup=(id:string)=>Pick<Card,'kind'|'monsterType'>|undefined;
type PendingActivation={
  sourceUid:string;sourceOwnerSeat:number;controllerSeat:number;controllerTeam:Team;
  targetUid:string;targetOwnerSeat:number;targetBinding:TargetBinding;turn:number
};
export type DustTornadoMemory={pending:Record<string,PendingActivation>;resolved:Record<string,true>};
export type DustTornadoState=TagDuel&{dustTornado?:DustTornadoMemory};
export type DustTornadoActivationPlan=PendingActivation&{kind:'dust-tornado-activation';activationId:string};
export type DustTornadoResolutionPlan=PendingActivation&{kind:'dust-tornado-resolution';activationId:string};
const cardLookup:Lookup=id=>getPlayableCard(id);
function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=128&&!/\\s/.test(value);
}
function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw Error('UID Dust Tornado sem proprietário físico válido.');
  return Number(match[1]);
}
function isSpellTrap(kind:unknown):boolean{return kind==='spell'||kind==='trap';}
function assertState(state:DustTornadoState):void{
  if(!state||state.version!==1||state.mode!=='tag-classic'||!state.core||
    !Array.isArray(state.core.players)||state.core.players.length!==2||
    !Array.isArray(state.members)||state.members.length!==4||
    !Array.isArray(state.active)||state.active.length!==2||!state.reserves||
    state.active.some((seat,team)=>!Number.isInteger(seat)||seat<0||seat>3||seat%2!==team)||
    !Number.isSafeInteger(state.cursor)||state.cursor<0||state.cursor>3||
    !Number.isSafeInteger(state.core.turn)||state.core.turn<1||
    state.core.current!==state.cursor%2||state.active[state.core.current]!==state.cursor||
    !Number.isInteger(state.core.priority)||(state.core.priority!==0&&state.core.priority!==1)||
    !state.core.teamRotation||state.core.teamRotation.cursor!==state.cursor||
    JSON.stringify(state.active)!==JSON.stringify(state.core.teamRotation.active)||
    JSON.stringify(state.reserves)!==JSON.stringify(state.core.teamRotation.reserves)||
    state.members.some((member,index)=>!member.id||!member.name||member.team!==index%2))
    throw Error('Estado TagDuel clássico/rotação inválido para Dust Tornado.');
  const expected=[0,1,2,3].filter(seat=>!state.active.includes(seat)),keys=Object.keys(state.reserves).map(Number).sort((a,b)=>a-b);
  if(keys.length!==2||keys.some((seat,index)=>seat!==expected[index]))
    throw Error('Reservas físicas TagDuel inválidas para Dust Tornado.');
  for(const [team,player] of state.core.players.entries()){
    if(player.id!=='tag-team-'+team||!Number.isSafeInteger(player.lp)||player.lp<0||
      !Array.isArray(player.deck)||!Array.isArray(player.hand)||!Array.isArray(player.monsters)||
      player.monsters.length>3||!Array.isArray(player.backrow)||player.backrow.length>3||
      !Array.isArray(player.grave)||!Array.isArray(player.banished??[])||
      !Array.isArray(player.extra??[])||(player.extra??[]).length>5||state.active[team]%2!==team)
      throw Error('LP, zonas 3+3 ou Extra Deck inválidos para Dust Tornado.');
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
      throw Error('Deck/mão/Extra da reserva física inválidos para Dust Tornado.');
    const prefix='m'+seat+':';
    for(const card of [...held.deck,...held.hand,...(held.extra??[])])
      if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))
        throw Error('UID de zona privada da reserva pertence a outro proprietário físico.');
  }
  const cards=tagInventory(state),uids=cards.map(card=>card.uid);
  if(cards.some(card=>typeof card.uid!=='string'||!/^m[0-3]:/.test(card.uid)||typeof card.id!=='string'||!card.id)||
    new Set(uids).size!==uids.length)
    throw Error('Inventário físico inválido ou UID duplicado no TagDuel.');
  if(state.dustTornado!==undefined){
    const memory=state.dustTornado;
    if(!memory||!memory.pending||typeof memory.pending!=='object'||!memory.resolved||typeof memory.resolved!=='object'||
      Object.entries(memory.pending).some(([id,p])=>!validActivationId(id)||!p||
        typeof p.sourceUid!=='string'||!Number.isInteger(p.sourceOwnerSeat)||p.sourceOwnerSeat<0||p.sourceOwnerSeat>3||
        !Number.isInteger(p.controllerSeat)||p.controllerSeat<0||p.controllerSeat>3||
        (p.controllerTeam!==0&&p.controllerTeam!==1)||p.controllerSeat%2!==p.controllerTeam||
        typeof p.targetUid!=='string'||p.targetBinding?.uid!==p.targetUid||
        (p.targetBinding.zone!=='backrow'&&p.targetBinding.zone!=='field')||
        !Number.isInteger(p.targetOwnerSeat)||p.targetOwnerSeat<0||p.targetOwnerSeat>3||
        !Number.isSafeInteger(p.turn)||p.turn<1)||
      Object.entries(memory.resolved).some(([id,value])=>!validActivationId(id)||value!==true))
      throw Error('Memória de ativação Dust Tornado inválida.');
  }
}
function inventorySnapshot(state:DustTornadoState):string{
  const cards=tagInventory(state),uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)throw Error('Inventário físico duplicado antes da resolução Dust Tornado.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}
function assertConserved(before:string,after:DustTornadoState):void{
  if(inventorySnapshot(after)!==before)throw Error('Dust Tornado alterou ou perdeu identidade física do inventário.');
}
function sourceContext(state:DustTornadoState,sourceUid:string,lookup:Lookup):{
  sourceOwnerSeat:number;controllerSeat:number;controllerTeam:Team
}{
  assertState(state);
  if(typeof sourceUid!=='string'||!sourceUid)throw Error('UID da fonte Dust Tornado ausente.');
  const matches=([0,1] as const).flatMap(team=>state.core.players[team].backrow
    .filter(card=>card.uid===sourceUid).map(card=>({team,card})));
  if(matches.length!==1)throw Error('Dust Tornado deve estar uma única vez no backrow compartilhado.');
  const match=matches[0];if(!match)throw Error('Fonte Dust Tornado não encontrada.');
  const team=match.team as Team,sourceOwnerSeat=physicalSeat(sourceUid),controllerSeat=state.active[team];
  if(match.card.id!==DUST_TORNADO_ID||lookup(match.card.id)?.kind!=='trap'||
    match.card.faceUp!==false||match.card.setTurn>=state.core.turn||
    state.members[sourceOwnerSeat]?.team!==team)
    throw Error('Dust Tornado precisa estar Set, pertencer à equipe e ter sido baixada em turno anterior.');
  const ownPriority=state.core.current===team&&state.core.priority===team&&
    (state.core.phase==='main'||state.core.phase==='battle')&&state.core.chain.length===0&&
    state.core.pending.kind==='none'&&!state.core.choice&&!state.core.handFlow;
  const chainResponse=state.core.phase==='response'&&state.core.chain.length>0&&state.core.priority===team;
  if(!ownPriority&&!chainResponse)
    throw Error('Dust Tornado exige prioridade própria ou janela de resposta válida.');
  return {sourceOwnerSeat,controllerSeat,controllerTeam:team};
}
function targetCard(state:DustTornadoState,team:Team,uid:string,lookup:Lookup):{
  zone:'backrow'|'field';card:Backrow
}|undefined{
  const opponent=(1-team) as Team,player=state.core.players[opponent];
  const backrow=player.backrow.find(card=>card.uid===uid);
  if(backrow&&isSpellTrap(lookup(backrow.id)?.kind))return {zone:'backrow',card:backrow};
  if(player.field?.uid===uid&&isSpellTrap(lookup(player.field.id)?.kind))return {zone:'field',card:player.field};
  return;
}
function pendingActivation(state:DustTornadoState,id:string):PendingActivation{
  if(!validActivationId(id))throw Error('activationId Dust Tornado inválido.');
  const pending=state.dustTornado?.pending?.[id];
  if(!pending)throw Error('Ativação Dust Tornado ausente, resolvida ou obsoleta.');
  if(state.core.turn!==pending.turn||state.active[pending.controllerTeam]!==pending.controllerSeat)
    throw Error('Contexto de turno/representante da ativação Dust Tornado mudou.');
  return pending;
}
function moveToOwnerGrave(state:DustTornadoState,team:Team,uid:string,zone:'backrow'|'field'):boolean{
  const player=state.core.players[team];
  let card:Backrow|undefined;
  if(zone==='backrow'){
    const index=player.backrow.findIndex(item=>item.uid===uid);
    if(index<0)return false;const removed=player.backrow.splice(index,1)[0];if(!removed)return false;card=removed;
  }else{
    if(player.field?.uid!==uid)return false;card=player.field;player.field=null;
  }
  if(!card)return false;
  const ownerTeam=(physicalSeat(card.uid)%2) as Team;
  state.core.players[ownerTeam].grave.push(card);
  return true;
}
function moveSourceToOwnerGrave(state:DustTornadoState,controllerTeam:Team,sourceUid:string):boolean{
  const backrow=state.core.players[controllerTeam].backrow,index=backrow.findIndex(card=>card.uid===sourceUid);
  if(index<0)return false;
  const spell=backrow.splice(index,1)[0];if(!spell)return false;
  const ownerTeam=(physicalSeat(spell.uid)%2) as Team;
  state.core.players[ownerTeam].grave.push(spell);
  return true;
}
/** Returns only UIDs, never card identities, for the private target picker. */
export function getDustTornadoTargetCandidates(
  state:DustTornadoState,team:Team,lookup:Lookup=cardLookup
):string[]{
  assertState(state);
  if(team!==0&&team!==1)throw Error('Equipe Dust Tornado inválida.');
  const opponent=state.core.players[1-team];
  return [...opponent.backrow.filter(card=>isSpellTrap(lookup(card.id)?.kind)).map(card=>card.uid),
    ...(opponent.field&&isSpellTrap(lookup(opponent.field.id)?.kind)?[opponent.field.uid]:[])];
}
export function planDustTornadoActivation(
  state:DustTornadoState,sourceUid:string,activationId:string,targetUid:string,lookup:Lookup=cardLookup
):DustTornadoActivationPlan{
  assertState(state);
  if(!validActivationId(activationId)||state.dustTornado?.pending?.[activationId]||state.dustTornado?.resolved?.[activationId])
    throw Error('activationId Dust Tornado inválido ou já utilizado.');
  const source=sourceContext(state,sourceUid,lookup),target=targetCard(state,source.controllerTeam,targetUid,lookup);
  if(!target)throw Error('Dust Tornado exige alvo Spell/Trap no backrow ou Field Zone adversária.');
  const targetBinding=bindTarget(structuredClone(state.core),targetUid);
  if(!targetBinding||targetBinding.zone!==target.zone)
    throw Error('Alvo Dust Tornado sem vínculo físico válido.');
  return {kind:'dust-tornado-activation',sourceUid,sourceOwnerSeat:source.sourceOwnerSeat,
    controllerSeat:source.controllerSeat,controllerTeam:source.controllerTeam,targetUid,
    targetOwnerSeat:physicalSeat(targetUid),targetBinding,turn:state.core.turn,activationId};
}
export function registerDustTornadoActivation(
  input:DustTornadoState,plan:DustTornadoActivationPlan,lookup:Lookup=cardLookup
):DustTornadoState{
  assertState(input);
  if(!plan||plan.kind!=='dust-tornado-activation'||!validActivationId(plan.activationId)||
    plan.turn!==input.core.turn||plan.targetBinding?.uid!==plan.targetUid)
    throw Error('Plano de ativação Dust Tornado inválido ou obsoleto.');
  const source=sourceContext(input,plan.sourceUid,lookup),target=targetCard(input,plan.controllerTeam,plan.targetUid,lookup);
  if(source.sourceOwnerSeat!==plan.sourceOwnerSeat||source.controllerSeat!==plan.controllerSeat||
    source.controllerTeam!==plan.controllerTeam||!target||target.zone!==plan.targetBinding.zone||
    !targetBindingValid(structuredClone(input.core),plan.targetBinding)||
    input.dustTornado?.pending?.[plan.activationId]||input.dustTornado?.resolved?.[plan.activationId])
    throw Error('Contexto, alvo ou activationId Dust Tornado mudou antes do registro.');
  const before=inventorySnapshot(input),next=structuredClone(input) as DustTornadoState;
  const sourceCard=next.core.players[plan.controllerTeam].backrow.find(card=>card.uid===plan.sourceUid);
  if(!sourceCard||sourceCard.faceUp!==false||sourceCard.setTurn>=plan.turn)
    throw Error('Dust Tornado deixou o backrow antes do registro.');
  sourceCard.faceUp=true;
  const pending={...(next.dustTornado?.pending??{})};
  pending[plan.activationId]={sourceUid:plan.sourceUid,sourceOwnerSeat:plan.sourceOwnerSeat,
    controllerSeat:plan.controllerSeat,controllerTeam:plan.controllerTeam,targetUid:plan.targetUid,
    targetOwnerSeat:plan.targetOwnerSeat,targetBinding:structuredClone(plan.targetBinding),turn:plan.turn};
  next.dustTornado={pending,resolved:{...(next.dustTornado?.resolved??{})}};
  synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
  return next;
}
export function planDustTornadoResolution(
  state:DustTornadoState,activationId:string
):DustTornadoResolutionPlan{
  assertState(state);const pending=pendingActivation(state,activationId);
  return {...pending,kind:'dust-tornado-resolution',activationId};
}
export function resolveDustTornadoResolution(
  input:DustTornadoState,plan:DustTornadoResolutionPlan,effectNegated=false,
  destroyPrevented=false,setUid?:string,lookup:Lookup=cardLookup
):{
  status:'destroyed'|'destroyed-and-set'|'negated'|'target-invalid'|'destruction-prevented'|'source-missing';
  state:DustTornadoState
}{
  assertState(input);
  if(!plan||plan.kind!=='dust-tornado-resolution')throw Error('Plano de resolução Dust Tornado inválido.');
  const pending=pendingActivation(input,plan.activationId);
  const resolution:PendingActivation={sourceUid:plan.sourceUid,sourceOwnerSeat:plan.sourceOwnerSeat,
    controllerSeat:plan.controllerSeat,controllerTeam:plan.controllerTeam,targetUid:plan.targetUid,
    targetOwnerSeat:plan.targetOwnerSeat,targetBinding:plan.targetBinding,turn:plan.turn};
  if(JSON.stringify(resolution)!==JSON.stringify(pending))
    throw Error('Plano Dust Tornado não corresponde à ativação pendente.');
  const before=inventorySnapshot(input),sourceExists=input.core.players[pending.controllerTeam].backrow.some(card=>card.uid===pending.sourceUid);
  const next=structuredClone(input) as DustTornadoState,pendingMap={...(next.dustTornado?.pending??{})};
  delete pendingMap[plan.activationId];
  next.dustTornado={pending:pendingMap,resolved:{...(next.dustTornado?.resolved??{}),[plan.activationId]:true as const}};
  if(!sourceExists){
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'source-missing',state:next};
  }
  if(effectNegated){
    moveSourceToOwnerGrave(next,pending.controllerTeam,pending.sourceUid);
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'negated',state:next};
  }
  const target=targetCard(next,pending.controllerTeam,pending.targetUid,lookup);
  if(!target||target.zone!==pending.targetBinding.zone||!targetBindingValid(next.core,pending.targetBinding)){
    moveSourceToOwnerGrave(next,pending.controllerTeam,pending.sourceUid);
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'target-invalid',state:next};
  }
  if(destroyPrevented){
    moveSourceToOwnerGrave(next,pending.controllerTeam,pending.sourceUid);
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'destruction-prevented',state:next};
  }
  let setCard:Backrow|undefined;
  if(setUid!==undefined){
    const hand=next.core.players[pending.controllerTeam].hand;
    const candidate=hand.find(card=>card.uid===setUid);
    if(!candidate||!isSpellTrap(lookup(candidate.id)?.kind))
      throw Error('Dust Tornado só pode Setar uma Spell/Trap da mão do representante ativo.');
    if(next.core.players[pending.controllerTeam].backrow.length-1>=3)
      throw Error('Nenhuma Spell/Trap Zone fica livre após resolver Dust Tornado.');
    setCard={...candidate,setTurn:pending.turn,faceUp:false};
  }
  const opponent=(1-pending.controllerTeam) as Team;
  if(!moveToOwnerGrave(next,opponent,pending.targetUid,pending.targetBinding.zone)){
    moveSourceToOwnerGrave(next,pending.controllerTeam,pending.sourceUid);
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'target-invalid',state:next};
  }
  moveSourceToOwnerGrave(next,pending.controllerTeam,pending.sourceUid);
  if(setUid!==undefined&&setCard){
    const hand=next.core.players[pending.controllerTeam].hand,index=hand.findIndex(card=>card.uid===setUid);
    if(index<0)throw Error('Carta escolhida para Set deixou a mão durante a resolução Dust Tornado.');
    hand.splice(index,1);next.core.players[pending.controllerTeam].backrow.push(setCard);
  }
  synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
  return {status:setUid?'destroyed-and-set':'destroyed',state:next};
}

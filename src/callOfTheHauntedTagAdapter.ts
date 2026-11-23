import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import {synchronizeCardLifetimes,type TargetBinding,targetBindingValid} from './cardLifetime';
import {tagInventory,type TagDuel} from './tagDuel';
import type {Backrow} from './duelEngine';

export const CALL_OF_THE_HAUNTED_ID='97077563';
type Team=0|1;
type Core=TagDuel['core'];
type Monster=Core['players'][number]['monsters'][number];
type PhysicalCard=Core['players'][number]['grave'][number];
type Lookup=(id:string)=>Pick<Card,'kind'|'monsterType'>|undefined;
type PendingActivation={
  sourceUid:string;trapOwnerSeat:number;controllerSeat:number;controllerTeam:Team;
  opponentSeat:number;targetUid:string;targetOwnerSeat:number;targetBinding:TargetBinding;turn:number
};
type EquippedLink={
  targetUid:string;targetOwnerSeat:number;trapOwnerSeat:number;controllerTeam:Team;turn:number
};
export type CallOfTheHauntedMemory={
  pending:Record<string,PendingActivation>;resolved:Record<string,true>;equipped:Record<string,EquippedLink>
};
export type CallOfTheHauntedState=TagDuel&{callOfTheHaunted?:CallOfTheHauntedMemory};
export type CallOfTheHauntedActivationPlan=PendingActivation&{kind:'call-of-the-haunted-activation';activationId:string};
export type CallOfTheHauntedResolutionPlan=PendingActivation&{kind:'call-of-the-haunted-resolution';activationId:string};
const cardLookup:Lookup=id=>getPlayableCard(id);

function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=128&&!/\\s/.test(value);
}
function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw Error('UID Call of the Haunted sem proprietário físico válido.');
  return Number(match[1]);
}
function assertState(state:CallOfTheHauntedState):void{
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
    throw Error('Estado TagDuel clássico/rotação inválido para Call of the Haunted.');
  const expected=[0,1,2,3].filter(seat=>!state.active.includes(seat)),keys=Object.keys(state.reserves).map(Number).sort((a,b)=>a-b);
  if(keys.length!==2||keys.some((seat,index)=>seat!==expected[index]))
    throw Error('Reservas físicas TagDuel inválidas para Call of the Haunted.');
  for(const [team,player] of state.core.players.entries()){
    if(player.id!=='tag-team-'+team||!Number.isSafeInteger(player.lp)||player.lp<0||
      !Array.isArray(player.deck)||!Array.isArray(player.hand)||!Array.isArray(player.monsters)||
      player.monsters.length>3||!Array.isArray(player.backrow)||player.backrow.length>3||
      !Array.isArray(player.grave)||!Array.isArray(player.banished??[])||
      !Array.isArray(player.extra??[])||(player.extra??[]).length>5||state.active[team]%2!==team)
      throw Error('LP, zonas 3+3 ou Extra Deck inválidos para Call of the Haunted.');
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
      throw Error('Deck/mão/Extra da reserva física inválidos.');
    const prefix='m'+seat+':';
    for(const card of [...held.deck,...held.hand,...(held.extra??[])])
      if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))
        throw Error('UID de zona privada da reserva pertence a outro proprietário físico.');
  }
  const cards=tagInventory(state),uids=cards.map(card=>card.uid);
  if(cards.some(card=>typeof card.uid!=='string'||!/^m[0-3]:/.test(card.uid)||typeof card.id!=='string'||!card.id)||
    new Set(uids).size!==uids.length)
    throw Error('Inventário físico inválido ou UID duplicado no TagDuel.');
  if(state.callOfTheHaunted!==undefined){
    const memory=state.callOfTheHaunted;
    if(!memory||!memory.pending||typeof memory.pending!=='object'||!memory.resolved||typeof memory.resolved!=='object'||
      !memory.equipped||typeof memory.equipped!=='object'||
      Object.entries(memory.pending).some(([id,p])=>!validActivationId(id)||!p||
        typeof p.sourceUid!=='string'||!Number.isInteger(p.trapOwnerSeat)||p.trapOwnerSeat<0||p.trapOwnerSeat>3||
        !Number.isInteger(p.controllerSeat)||p.controllerSeat<0||p.controllerSeat>3||
        (p.controllerTeam!==0&&p.controllerTeam!==1)||p.controllerSeat%2!==p.controllerTeam||
        !Number.isInteger(p.opponentSeat)||p.opponentSeat<0||p.opponentSeat>3||
        typeof p.targetUid!=='string'||!Number.isInteger(p.targetOwnerSeat)||p.targetOwnerSeat<0||p.targetOwnerSeat>3||
        p.targetBinding?.uid!==p.targetUid||p.targetBinding.zone!=='grave'||!Number.isSafeInteger(p.targetBinding.epoch)||
        !Number.isSafeInteger(p.turn)||p.turn<1)||
      Object.entries(memory.resolved).some(([id,value])=>!validActivationId(id)||value!==true)||
      Object.entries(memory.equipped).some(([uid,link])=>!uid||!link||typeof link.targetUid!=='string'||
        !Number.isInteger(link.targetOwnerSeat)||link.targetOwnerSeat<0||link.targetOwnerSeat>3||
        !Number.isInteger(link.trapOwnerSeat)||link.trapOwnerSeat<0||link.trapOwnerSeat>3||
        (link.controllerTeam!==0&&link.controllerTeam!==1)||!Number.isSafeInteger(link.turn)))
      throw Error('Memória de ativações/vínculos Call of the Haunted inválida.');
    for(const [sourceUid,link] of Object.entries(memory.equipped)){
      const trap=state.core.players[link.controllerTeam].backrow.find(card=>card.uid===sourceUid);
      const target=state.core.players.flatMap(player=>player.monsters).find(card=>card.uid===link.targetUid);
      if(!trap||trap.id!==CALL_OF_THE_HAUNTED_ID||trap.equippedTo!==link.targetUid||!target)
        throw Error('Vínculo Call of the Haunted/equippedTo não corresponde ao campo persistido.');
    }
  }
}
function inventorySnapshot(state:CallOfTheHauntedState):string{
  const cards=tagInventory(state),uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)throw Error('Inventário físico duplicado antes da resolução Call of the Haunted.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}
function assertConserved(before:string,after:CallOfTheHauntedState):void{
  if(inventorySnapshot(after)!==before)throw Error('Call of the Haunted alterou ou perdeu identidade física do inventário.');
}
function isReviveEligible(state:CallOfTheHauntedState,team:Team,uid:string,lookup:Lookup):boolean{
  let ownerSeat:number;
  try{ownerSeat=physicalSeat(uid);}catch{return false;}
  if(ownerSeat%2!==team||state.members[ownerSeat]?.team!==team)return false;
  const matches=state.core.players[team].grave.filter(card=>card.uid===uid),target=matches[0];
  if(matches.length!==1||!target||target.entityKind==='token')return false;
  const metadata=lookup(target.id);
  if(!metadata||metadata.kind!=='monster')return false;
  if((metadata.monsterType==='fusion'||metadata.monsterType==='ritual')&&!target.properlySummoned)return false;
  return true;
}
function bindingFor(state:CallOfTheHauntedState,uid:string):TargetBinding{
  const core=structuredClone(state.core);synchronizeCardLifetimes(core);
  const binding=core.cardLifetimes?.[uid];
  if(!binding||binding.zone!=='grave')throw Error('Alvo Call of the Haunted deve permanecer no GY da equipe.');
  return {uid,zone:'grave',epoch:binding.epoch};
}
function sourceContext(state:CallOfTheHauntedState,sourceUid:string,lookup:Lookup):{
  trapOwnerSeat:number;controllerSeat:number;controllerTeam:Team;opponentSeat:number
}{
  assertState(state);
  if(typeof sourceUid!=='string'||!sourceUid)throw Error('UID da fonte Call of the Haunted ausente.');
  const matches=([0,1] as const).flatMap(team=>state.core.players[team].backrow
    .filter(card=>card.uid===sourceUid).map(card=>({team,card})));
  if(matches.length!==1)throw Error('Call of the Haunted deve estar uma única vez no backrow.');
  const match=matches[0];if(!match)throw Error('Fonte Call of the Haunted não encontrada.');
  const team=match.team as Team,trapOwnerSeat=physicalSeat(sourceUid),controllerSeat=state.active[team];
  if(match.card.id!==CALL_OF_THE_HAUNTED_ID||lookup(match.card.id)?.kind!=='trap'||
    match.card.faceUp!==false||match.card.setTurn>=state.core.turn||
    state.members[trapOwnerSeat]?.team!==team)
    throw Error('Call of the Haunted precisa estar Set em turno anterior e pertencer à equipe.');
  const ownPriority=state.core.current===team&&state.core.priority===team&&
    (state.core.phase==='main'||state.core.phase==='battle')&&state.core.chain.length===0&&
    state.core.pending.kind==='none'&&!state.core.choice&&!state.core.handFlow;
  const chainResponse=state.core.phase==='response'&&state.core.chain.length>0&&state.core.priority===team;
  if(!ownPriority&&!chainResponse)throw Error('Call of the Haunted exige prioridade própria ou janela de resposta válida.');
  return {trapOwnerSeat,controllerSeat,controllerTeam:team,opponentSeat:state.active[1-team]};
}
function pendingActivation(state:CallOfTheHauntedState,id:string):PendingActivation{
  if(!validActivationId(id))throw Error('activationId Call of the Haunted inválido.');
  const pending=state.callOfTheHaunted?.pending?.[id];
  if(!pending)throw Error('Ativação Call of the Haunted ausente, resolvida ou obsoleta.');
  if(state.core.turn!==pending.turn||state.active[pending.controllerTeam]!==pending.controllerSeat||
    state.active[1-pending.controllerTeam]!==pending.opponentSeat)
    throw Error('Contexto de turno/representantes Call of the Haunted mudou.');
  return pending;
}
function moveTrapToOwnerGrave(state:CallOfTheHauntedState,controllerTeam:Team,sourceUid:string):boolean{
  const backrow=state.core.players[controllerTeam].backrow,index=backrow.findIndex(card=>card.uid===sourceUid);
  if(index<0)return false;
  const trap=backrow.splice(index,1)[0];if(!trap)return false;
  const ownerTeam=(physicalSeat(trap.uid)%2) as Team;state.core.players[ownerTeam].grave.push(trap);
  return true;
}
function sendToOwnerHand(state:CallOfTheHauntedState,card:PhysicalCard,ownerSeat:number):void{
  const ownerTeam=(ownerSeat%2) as Team;
  if(state.active[ownerTeam]===ownerSeat)state.core.players[ownerTeam].hand.push(card);
  else{
    const reserve=state.reserves[ownerSeat];if(!reserve)throw Error('Reserva física Call of the Haunted não existe.');
    reserve.hand.push(card);
    const rotation=state.core.teamRotation as NonNullable<Core['teamRotation']>;
    rotation.reserves=state.reserves as unknown as NonNullable<Core['teamRotation']>['reserves'];
  }
}
function sendToOwnerBanished(state:CallOfTheHauntedState,card:PhysicalCard,ownerSeat:number):void{
  state.core.players[ownerSeat%2].banished.push(card);
}
function sendToOwnerGrave(state:CallOfTheHauntedState,card:PhysicalCard,ownerSeat:number):void{
  state.core.players[ownerSeat%2].grave.push(card);
}
function clearLink(state:CallOfTheHauntedState,sourceUid:string):void{
  const equipped={...(state.callOfTheHaunted?.equipped??{})};delete equipped[sourceUid];
  state.callOfTheHaunted={pending:{...(state.callOfTheHaunted?.pending??{})},
    resolved:{...(state.callOfTheHaunted?.resolved??{})},equipped};
}
export function getCallOfTheHauntedCandidates(
  state:CallOfTheHauntedState,team:Team,lookup:Lookup=cardLookup
):string[]{
  assertState(state);
  if(team!==0&&team!==1)throw Error('Equipe Call of the Haunted inválida.');
  if(state.core.players[team].monsters.length>=3)return [];
  return state.core.players[team].grave.filter(card=>isReviveEligible(state,team,card.uid,lookup)).map(card=>card.uid);
}
export function planCallOfTheHauntedActivation(
  state:CallOfTheHauntedState,sourceUid:string,activationId:string,targetUid:string,lookup:Lookup=cardLookup
):CallOfTheHauntedActivationPlan{
  assertState(state);
  if(!validActivationId(activationId)||state.callOfTheHaunted?.pending?.[activationId]||state.callOfTheHaunted?.resolved?.[activationId])
    throw Error('activationId Call of the Haunted inválido ou já utilizado.');
  const source=sourceContext(state,sourceUid,lookup);
  if(state.core.players[source.controllerTeam].monsters.length>=3||
    !getCallOfTheHauntedCandidates(state,source.controllerTeam,lookup).includes(targetUid))
    throw Error('Call of the Haunted exige monstro elegível no GY e Monster Zone livre.');
  return {kind:'call-of-the-haunted-activation',sourceUid,trapOwnerSeat:source.trapOwnerSeat,
    controllerSeat:source.controllerSeat,controllerTeam:source.controllerTeam,opponentSeat:source.opponentSeat,
    targetUid,targetOwnerSeat:physicalSeat(targetUid),targetBinding:bindingFor(state,targetUid),
    turn:state.core.turn,activationId};
}
export function registerCallOfTheHauntedActivation(
  input:CallOfTheHauntedState,plan:CallOfTheHauntedActivationPlan,lookup:Lookup=cardLookup
):CallOfTheHauntedState{
  assertState(input);
  if(!plan||plan.kind!=='call-of-the-haunted-activation'||!validActivationId(plan.activationId)||
    plan.turn!==input.core.turn||plan.targetBinding?.uid!==plan.targetUid||plan.targetBinding.zone!=='grave')
    throw Error('Plano de ativação Call of the Haunted inválido ou obsoleto.');
  const source=sourceContext(input,plan.sourceUid,lookup);
  if(source.trapOwnerSeat!==plan.trapOwnerSeat||source.controllerSeat!==plan.controllerSeat||
    source.controllerTeam!==plan.controllerTeam||source.opponentSeat!==plan.opponentSeat||
    input.callOfTheHaunted?.pending?.[plan.activationId]||input.callOfTheHaunted?.resolved?.[plan.activationId]||
    input.core.players[plan.controllerTeam].monsters.length>=3||
    !isReviveEligible(input,plan.controllerTeam,plan.targetUid,lookup)||
    !targetBindingValid(structuredClone(input.core),plan.targetBinding))
    throw Error('Contexto, alvo, zona ou activationId Call of the Haunted mudou antes do registro.');
  const before=inventorySnapshot(input),next=structuredClone(input) as CallOfTheHauntedState;
  const trap=next.core.players[plan.controllerTeam].backrow.find(card=>card.uid===plan.sourceUid);
  if(!trap||trap.faceUp!==false||trap.setTurn>=plan.turn)throw Error('Call of the Haunted deixou o backrow antes do registro.');
  trap.faceUp=true;
  const pending={...(next.callOfTheHaunted?.pending??{})};
  pending[plan.activationId]={sourceUid:plan.sourceUid,trapOwnerSeat:plan.trapOwnerSeat,
    controllerSeat:plan.controllerSeat,controllerTeam:plan.controllerTeam,opponentSeat:plan.opponentSeat,
    targetUid:plan.targetUid,targetOwnerSeat:plan.targetOwnerSeat,targetBinding:structuredClone(plan.targetBinding),turn:plan.turn};
  next.callOfTheHaunted={pending,resolved:{...(next.callOfTheHaunted?.resolved??{})},equipped:{...(next.callOfTheHaunted?.equipped??{})}};
  synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
  return next;
}
export function planCallOfTheHauntedResolution(
  state:CallOfTheHauntedState,activationId:string
):CallOfTheHauntedResolutionPlan{
  assertState(state);const pending=pendingActivation(state,activationId);
  return {...pending,kind:'call-of-the-haunted-resolution',activationId};
}
export function resolveCallOfTheHauntedResolution(
  input:CallOfTheHauntedState,plan:CallOfTheHauntedResolutionPlan,effectNegated=false,lookup:Lookup=cardLookup
):{
  status:'summoned'|'negated'|'target-invalid'|'no-space'|'source-missing';
  state:CallOfTheHauntedState;
  summoned?:{team:Team;uid:string;ownerSeat:number;position:'atk';faceUp:true}
}{
  assertState(input);
  if(!plan||plan.kind!=='call-of-the-haunted-resolution')throw Error('Plano de resolução Call of the Haunted inválido.');
  const pending=pendingActivation(input,plan.activationId);
  const resolution:PendingActivation={sourceUid:plan.sourceUid,trapOwnerSeat:plan.trapOwnerSeat,
    controllerSeat:plan.controllerSeat,controllerTeam:plan.controllerTeam,opponentSeat:plan.opponentSeat,
    targetUid:plan.targetUid,targetOwnerSeat:plan.targetOwnerSeat,targetBinding:plan.targetBinding,turn:plan.turn};
  if(JSON.stringify(resolution)!==JSON.stringify(pending))throw Error('Plano Call of the Haunted não corresponde à ativação pendente.');
  const before=inventorySnapshot(input),next=structuredClone(input) as CallOfTheHauntedState;
  const pendingMap={...(next.callOfTheHaunted?.pending??{})};delete pendingMap[plan.activationId];
  next.callOfTheHaunted={pending:pendingMap,resolved:{...(next.callOfTheHaunted?.resolved??{}),[plan.activationId]:true as const},
    equipped:{...(next.callOfTheHaunted?.equipped??{})}};
  const sourceExists=next.core.players[pending.controllerTeam].backrow.some(card=>card.uid===pending.sourceUid);
  if(!sourceExists){
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'source-missing',state:next};
  }
  if(effectNegated||!targetBindingValid(next.core,pending.targetBinding)||
    !isReviveEligible(next,pending.controllerTeam,pending.targetUid,lookup)){
    moveTrapToOwnerGrave(next,pending.controllerTeam,pending.sourceUid);
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:effectNegated?'negated':'target-invalid',state:next};
  }
  if(next.core.players[pending.controllerTeam].monsters.length>=3){
    moveTrapToOwnerGrave(next,pending.controllerTeam,pending.sourceUid);
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'no-space',state:next};
  }
  const grave=next.core.players[pending.controllerTeam].grave,index=grave.findIndex(card=>card.uid===pending.targetUid);
  if(index<0){
    moveTrapToOwnerGrave(next,pending.controllerTeam,pending.sourceUid);
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'target-invalid',state:next};
  }
  const target=grave.splice(index,1)[0];if(!target)throw Error('Alvo Call of the Haunted desapareceu do GY.');
  const ownerSeat=physicalSeat(target.uid),revived:Monster={...target,owner:ownerSeat,faceUp:true,position:'atk',
    entered:pending.turn,changed:pending.turn,attacked:0,atkBoost:0,defBoost:0};
  next.core.players[pending.controllerTeam].monsters.push(revived);
  const trap=next.core.players[pending.controllerTeam].backrow.find(card=>card.uid===pending.sourceUid);
  if(!trap)throw Error('Call of the Haunted desapareceu antes de gravar equippedTo.');
  trap.equippedTo=revived.uid;
  next.callOfTheHaunted.equipped[pending.sourceUid]={targetUid:revived.uid,targetOwnerSeat:ownerSeat,
    trapOwnerSeat:pending.trapOwnerSeat,controllerTeam:pending.controllerTeam,turn:pending.turn};
  synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
  return {status:'summoned',state:next,summoned:{team:pending.controllerTeam,uid:revived.uid,ownerSeat,position:'atk',faceUp:true}};
}
/** When Call of the Haunted leaves the field, its linked monster is destroyed regardless of destination. */
export function removeCallOfTheHaunted(
  input:CallOfTheHauntedState,sourceUid:string,destination:'grave'|'banished'|'hand'='grave'
):{state:CallOfTheHauntedState;monsterDestroyed:boolean}{
  assertState(input);
  const link=input.callOfTheHaunted?.equipped?.[sourceUid];
  if(!link)throw Error('Vínculo Call of the Haunted ausente ou já removido.');
  const before=inventorySnapshot(input),next=structuredClone(input) as CallOfTheHauntedState;
  const backrow=next.core.players[link.controllerTeam].backrow,index=backrow.findIndex(card=>card.uid===sourceUid);
  if(index<0)throw Error('Call of the Haunted não está no backrow.');
  const trap=backrow.splice(index,1)[0];if(!trap)throw Error('Call of the Haunted desapareceu do backrow.');
  const trapOwnerSeat=physicalSeat(trap.uid);
  if(destination==='grave')sendToOwnerGrave(next,trap,trapOwnerSeat);
  else if(destination==='banished')sendToOwnerBanished(next,trap,trapOwnerSeat);
  else sendToOwnerHand(next,trap,trapOwnerSeat);
  let monsterDestroyed=false;
  for(const team of [0,1] as const){
    const monsters=next.core.players[team].monsters,targetIndex=monsters.findIndex(card=>card.uid===link.targetUid);
    if(targetIndex>=0){
      const target=monsters.splice(targetIndex,1)[0];if(target)sendToOwnerGrave(next,target,physicalSeat(target.uid));
      monsterDestroyed=true;break;
    }
  }
  clearLink(next,sourceUid);synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
  return {state:next,monsterDestroyed};
}
/** When the linked monster leaves field by destruction, bounce or banish, the Continuous Trap goes to GY. */
export function onCallOfTheHauntedMonsterLeavesField(
  input:CallOfTheHauntedState,targetUid:string,destination:'grave'|'banished'|'hand'='grave'
):CallOfTheHauntedState{
  assertState(input);
  const entry=Object.entries(input.callOfTheHaunted?.equipped??{}).find(([,link])=>link.targetUid===targetUid);
  if(!entry)throw Error('Nenhum Call of the Haunted está vinculado ao monstro informado.');
  const [sourceUid,link]=entry,before=inventorySnapshot(input),next=structuredClone(input) as CallOfTheHauntedState;
  let moved:Monster|undefined;
  for(const team of [0,1] as const){
    const monsters=next.core.players[team].monsters,index=monsters.findIndex(card=>card.uid===targetUid);
    if(index>=0){moved=monsters.splice(index,1)[0];break;}
  }
  if(!moved)throw Error('Monstro vinculado não está no campo.');
  const ownerSeat=physicalSeat(moved.uid);
  if(destination==='grave')sendToOwnerGrave(next,moved,ownerSeat);
  else if(destination==='banished')sendToOwnerBanished(next,moved,ownerSeat);
  else sendToOwnerHand(next,moved,ownerSeat);
  if(!moveTrapToOwnerGrave(next,link.controllerTeam,sourceUid))
    throw Error('Call of the Haunted não está no backrow quando o monstro sai do campo.');
  clearLink(next,sourceUid);synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
  return next;
}

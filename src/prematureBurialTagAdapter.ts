import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import {synchronizeCardLifetimes,type TargetBinding,targetBindingValid} from './cardLifetime';
import {tagInventory,type TagDuel} from './tagDuel';
import type {Backrow} from './duelEngine';

export const PREMATURE_BURIAL_ID='70828912';
const LP_COST=800;

type Team=0|1;
type Core=TagDuel['core'];
type Monster=Core['players'][number]['monsters'][number];
type Lookup=(id:string)=>Pick<Card,'kind'|'monsterType'>|undefined;

type PendingActivation={
  sourceUid:string;
  equipOwnerSeat:number;
  controllerSeat:number;
  controllerTeam:Team;
  opponentSeat:number;
  targetUid:string;
  targetOwnerSeat:number;
  targetBinding:TargetBinding;
  turn:number;
  lpPaid:800;
};
type EquippedLink={
  targetUid:string;
  targetOwnerSeat:number;
  equipOwnerSeat:number;
  controllerTeam:Team;
  turn:number;
};
export type PrematureBurialMemory={
  pending:Record<string,PendingActivation>;
  resolved:Record<string,true>;
  equipped:Record<string,EquippedLink>;
};
export type PrematureBurialState=TagDuel&{prematureBurial?:PrematureBurialMemory};
export type PrematureBurialActivationPlan={
  kind:'premature-burial-activation';
  sourceUid:string;
  equipOwnerSeat:number;
  controllerSeat:number;
  controllerTeam:Team;
  opponentSeat:number;
  targetUid:string;
  targetOwnerSeat:number;
  targetBinding:TargetBinding;
  turn:number;
  activationId:string;
  lpCost:800;
};
export type PrematureBurialResolutionPlan=Omit<PrematureBurialActivationPlan,'kind'>&{kind:'premature-burial-resolution'};

const cardLookup:Lookup=id=>getPlayableCard(id);

function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=128&&!/\s/.test(value);
}
function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw Error('UID Premature Burial sem proprietário físico válido.');
  return Number(match[1]);
}
function assertState(state:PrematureBurialState):void{
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
    throw Error('Estado TagDuel clássico/rotação inválido para Premature Burial.');
  const expectedReserves=[0,1,2,3].filter(seat=>!state.active.includes(seat));
  const reserveKeys=Object.keys(state.reserves).map(Number).sort((a,b)=>a-b);
  if(reserveKeys.length!==2||reserveKeys.some((seat,index)=>seat!==expectedReserves[index]))
    throw Error('Reservas físicas TagDuel inválidas para Premature Burial.');
  for(const [team,player] of state.core.players.entries()){
    if(player.id!=='tag-team-'+team||!Number.isSafeInteger(player.lp)||player.lp<0||
      !Array.isArray(player.deck)||!Array.isArray(player.hand)||
      !Array.isArray(player.monsters)||player.monsters.length>3||
      !Array.isArray(player.backrow)||player.backrow.length>3||
      !Array.isArray(player.grave)||!Array.isArray(player.banished)||
      !Array.isArray(player.extra??[])||(player.extra??[]).length>5||
      state.active[team]%2!==team)
      throw Error('LP, zonas 3+3, Extra Deck ou representante ativo inválidos para Premature Burial.');
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
  const cards=tagInventory(state);
  const uids=cards.map(card=>card.uid);
  if(cards.some(card=>typeof card.uid!=='string'||!/^m[0-3]:/.test(card.uid)||
    typeof card.id!=='string'||!card.id)||new Set(uids).size!==uids.length)
    throw Error('Inventário físico inválido ou UID duplicado no TagDuel.');
  const memory=state.prematureBurial;
  if(memory!==undefined&&(!memory||typeof memory!=='object'||
    !memory.pending||typeof memory.pending!=='object'||
    !memory.resolved||typeof memory.resolved!=='object'||
    !memory.equipped||typeof memory.equipped!=='object'||
    Object.entries(memory.pending).some(([id,value])=>!validActivationId(id)||!value||
      typeof value.sourceUid!=='string'||!Number.isInteger(value.equipOwnerSeat)||
      value.equipOwnerSeat<0||value.equipOwnerSeat>3||
      !Number.isInteger(value.controllerSeat)||value.controllerSeat<0||value.controllerSeat>3||
      (value.controllerTeam!==0&&value.controllerTeam!==1)||
      !Number.isInteger(value.opponentSeat)||value.opponentSeat<0||value.opponentSeat>3||
      typeof value.targetUid!=='string'||!Number.isInteger(value.targetOwnerSeat)||
      value.targetOwnerSeat<0||value.targetOwnerSeat>3||!Number.isSafeInteger(value.turn)||
      value.lpPaid!==LP_COST||!value.targetBinding||value.targetBinding.uid!==value.targetUid||
      value.targetBinding.zone!=='grave'||!Number.isSafeInteger(value.targetBinding.epoch))||
    Object.entries(memory.resolved).some(([id,value])=>!validActivationId(id)||value!==true)||
    Object.entries(memory.equipped).some(([uid,value])=>!uid||!value||
      typeof value.targetUid!=='string'||!Number.isInteger(value.targetOwnerSeat)||
      value.targetOwnerSeat<0||value.targetOwnerSeat>3||
      !Number.isInteger(value.equipOwnerSeat)||value.equipOwnerSeat<0||value.equipOwnerSeat>3||
      (value.controllerTeam!==0&&value.controllerTeam!==1)||!Number.isSafeInteger(value.turn))))
    throw Error('Memória de ativações/equipamentos Premature Burial inválida.');
  for(const [equipUid,link] of Object.entries(memory?.equipped??{})){
    const equip=state.core.players[link.controllerTeam].backrow.find(card=>card.uid===equipUid);
    const target=state.core.players.flatMap(player=>player.monsters).find(card=>card.uid===link.targetUid);
    if(!equip||equip.id!==PREMATURE_BURIAL_ID||equip.equippedTo!==link.targetUid||!target)
      throw Error('Vínculo Premature Burial/equippedTo não corresponde ao campo persistido.');
  }
}

function assertOpenMain(state:PrematureBurialState,team:Team):void{
  if(state.core.phase!=='main'||state.core.current!==team||
    state.core.pending?.kind!=='none'||!Array.isArray(state.core.chain)||
    state.core.chain.length>0||state.core.choice||state.core.handFlow)
    throw Error('Premature Burial só pode ser ativado na Main Phase sem decisão ou corrente pendente.');
}
function sourceContext(state:PrematureBurialState,uid:string,lookup:Lookup):{
  equipOwnerSeat:number;controllerSeat:number;controllerTeam:Team;opponentSeat:number
}{
  assertState(state);
  if(typeof uid!=='string'||!uid)throw Error('UID da fonte Premature Burial ausente.');
  const controllerTeam=state.core.current as Team;
  const controllerSeat=state.active[controllerTeam];
  const equipOwnerSeat=physicalSeat(uid);
  if(equipOwnerSeat!==controllerSeat||state.members[equipOwnerSeat]?.team!==controllerTeam)
    throw Error('Premature Burial deve ser ativado pelo representante físico ativo.');
  const matches=state.core.players[controllerTeam].hand.filter(card=>card.uid===uid);
  if(matches.length!==1||matches[0].id!==PREMATURE_BURIAL_ID)
    throw Error('Premature Burial deve estar uma única vez na mão do representante ativo.');
  const metadata=lookup(matches[0].id);
  if(!metadata||metadata.kind!=='spell')
    throw Error('Definição de Premature Burial não admitida.');
  assertOpenMain(state,controllerTeam);
  return {equipOwnerSeat,controllerSeat,controllerTeam,opponentSeat:state.active[1-controllerTeam]};
}
function isReviveEligible(state:PrematureBurialState,team:Team,uid:string,lookup:Lookup):boolean{
  let ownerSeat:number;
  try{ownerSeat=physicalSeat(uid);}catch{return false;}
  if(ownerSeat%2!==team||state.members[ownerSeat]?.team!==team)return false;
  const matches=state.core.players[team].grave.filter(card=>card.uid===uid);
  if(matches.length!==1||matches[0].entityKind==='token')return false;
  const metadata=lookup(matches[0].id);
  if(!metadata||metadata.kind!=='monster')return false;
  if((metadata.monsterType==='fusion'||metadata.monsterType==='ritual')&&!matches[0].properlySummoned)
    return false;
  return true;
}
function bindingFor(state:PrematureBurialState,uid:string):TargetBinding{
  const core=structuredClone(state.core);
  synchronizeCardLifetimes(core);
  const binding=core.cardLifetimes?.[uid];
  if(!binding||binding.zone!=='grave')
    throw Error('Alvo Premature Burial deve permanecer no Cemitério de sua própria equipe.');
  return {uid,zone:'grave',epoch:binding.epoch};
}
function inventorySnapshot(state:PrematureBurialState):string{
  const cards=tagInventory(state),uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)
    throw Error('Inventário físico duplicado antes da resolução Premature Burial.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}
function assertConserved(before:string,after:PrematureBurialState):void{
  if(inventorySnapshot(after)!==before)
    throw Error('Premature Burial alterou ou perdeu uma identidade física do inventário.');
}
function pendingActivation(state:PrematureBurialState,activationId:string):PendingActivation{
  if(!validActivationId(activationId))throw Error('activationId Premature Burial inválido.');
  const pending=state.prematureBurial?.pending?.[activationId];
  if(!pending)throw Error('Ativação Premature Burial ausente, já resolvida ou obsoleta.');
  if(state.core.turn!==pending.turn||state.core.current!==pending.controllerTeam||
    state.active[pending.controllerTeam]!==pending.controllerSeat||
    state.active[1-pending.controllerTeam]!==pending.opponentSeat||
    pending.controllerTeam!==pending.controllerSeat%2)
    throw Error('Contexto de equipe/turno da ativação Premature Burial mudou.');
  return pending;
}
function removeEquipToGrave(state:PrematureBurialState,team:Team,equipUid:string):boolean{
  const backrow=state.core.players[team].backrow;
  const index=backrow.findIndex(card=>card.uid===equipUid);
  if(index<0)return false;
  const [equip]=backrow.splice(index,1);
  state.core.players[team].grave.push(equip);
  return true;
}

/** Lists legal targets from one team's shared Graveyard; both Monster and S/T capacity matter. */
export function getPrematureBurialCandidates(
  state:PrematureBurialState,team:Team,lookup:Lookup=cardLookup
):string[]{
  assertState(state);
  if(team!==0&&team!==1)throw Error('Equipe inválida na seleção Premature Burial.');
  const player=state.core.players[team];
  if(player.monsters.length>=3||player.backrow.length>=3||player.lp<LP_COST)return [];
  return player.grave.filter(card=>isReviveEligible(state,team,card.uid,lookup)).map(card=>card.uid);
}

/** Pays 800 LP at activation and binds one physical monster from the team's own Graveyard. */
export function planPrematureBurialActivation(
  state:PrematureBurialState,sourceUid:string,activationId:string,targetUid:string,lookup:Lookup=cardLookup
):PrematureBurialActivationPlan{
  assertState(state);
  const source=sourceContext(state,sourceUid,lookup);
  if(!validActivationId(activationId)||state.prematureBurial?.pending?.[activationId]||
    state.prematureBurial?.resolved?.[activationId])
    throw Error('activationId Premature Burial inválido ou já utilizado.');
  if(state.core.players[source.controllerTeam].lp<LP_COST)
    throw Error('LP insuficiente para pagar 800 LP de Premature Burial.');
  const candidates=getPrematureBurialCandidates(state,source.controllerTeam,lookup);
  if(candidates.length===0)
    throw Error('Premature Burial exige alvo elegível, Monster Zone e Spell/Trap Zone livres e 800 LP.');
  if(!candidates.includes(targetUid))
    throw Error('Premature Burial deve escolher um monstro do próprio Cemitério.');
  const targetOwnerSeat=physicalSeat(targetUid);
  return {
    kind:'premature-burial-activation',sourceUid,equipOwnerSeat:source.equipOwnerSeat,
    controllerSeat:source.controllerSeat,controllerTeam:source.controllerTeam,
    opponentSeat:source.opponentSeat,targetUid,targetOwnerSeat,targetBinding:bindingFor(state,targetUid),
    turn:state.core.turn,activationId,lpCost:LP_COST
  };
}

/** Registers the face-up Equip Spell in the backrow and pays the LP cost immediately. */
export function registerPrematureBurialActivation(
  input:PrematureBurialState,plan:PrematureBurialActivationPlan,lookup:Lookup=cardLookup
):PrematureBurialState{
  assertState(input);
  if(!plan||plan.kind!=='premature-burial-activation'||!validActivationId(plan.activationId)||
    plan.turn!==input.core.turn||plan.lpCost!==LP_COST||
    plan.targetBinding?.uid!==plan.targetUid||plan.targetBinding.zone!=='grave')
    throw Error('Plano de ativação Premature Burial inválido ou obsoleto.');
  const source=sourceContext(input,plan.sourceUid,lookup);
  if(source.equipOwnerSeat!==plan.equipOwnerSeat||source.controllerSeat!==plan.controllerSeat||
    source.controllerTeam!==plan.controllerTeam||source.opponentSeat!==plan.opponentSeat||
    input.prematureBurial?.pending?.[plan.activationId]||input.prematureBurial?.resolved?.[plan.activationId])
    throw Error('Contexto ou activationId Premature Burial mudou antes do registro.');
  const player=input.core.players[plan.controllerTeam];
  if(player.lp<LP_COST||player.monsters.length>=3||player.backrow.length>=3||
    !isReviveEligible(input,plan.controllerTeam,plan.targetUid,lookup)||
    !targetBindingValid(structuredClone(input.core),plan.targetBinding))
    throw Error('LP, alvo ou capacidade de zona mudou antes do registro Premature Burial.');
  const before=inventorySnapshot(input);
  const next=structuredClone(input) as PrematureBurialState;
  const hand=next.core.players[plan.controllerTeam].hand;
  const sourceIndex=hand.findIndex(card=>card.uid===plan.sourceUid);
  if(sourceIndex<0)throw Error('Premature Burial deixou a mão antes do registro.');
  const [sourceCard]=hand.splice(sourceIndex,1);
  const equip:Backrow={...sourceCard,setTurn:plan.turn,faceUp:true};
  next.core.players[plan.controllerTeam].backrow.push(equip);
  next.core.players[plan.controllerTeam].lp-=LP_COST;
  const pending={...(next.prematureBurial?.pending??{})};
  pending[plan.activationId]={
    sourceUid:plan.sourceUid,equipOwnerSeat:plan.equipOwnerSeat,
    controllerSeat:plan.controllerSeat,controllerTeam:plan.controllerTeam,
    opponentSeat:plan.opponentSeat,targetUid:plan.targetUid,targetOwnerSeat:plan.targetOwnerSeat,
    targetBinding:structuredClone(plan.targetBinding),turn:plan.turn,lpPaid:LP_COST
  };
  next.prematureBurial={
    pending,resolved:{...(next.prematureBurial?.resolved??{})},
    equipped:{...(next.prematureBurial?.equipped??{})}
  };
  synchronizeCardLifetimes(next.core);
  assertState(next);assertConserved(before,next);
  return next;
}

export function planPrematureBurialResolution(
  state:PrematureBurialState,activationId:string
):PrematureBurialResolutionPlan{
  assertState(state);
  const pending=pendingActivation(state,activationId);
  return {
    kind:'premature-burial-resolution',sourceUid:pending.sourceUid,
    equipOwnerSeat:pending.equipOwnerSeat,controllerSeat:pending.controllerSeat,
    controllerTeam:pending.controllerTeam,opponentSeat:pending.opponentSeat,
    targetUid:pending.targetUid,targetOwnerSeat:pending.targetOwnerSeat,
    targetBinding:structuredClone(pending.targetBinding),turn:pending.turn,
    activationId,lpCost:LP_COST
  };
}

/** Resolves the summon; negation/invalid target never refunds the activation cost. */
export function resolvePrematureBurialResolution(
  input:PrematureBurialState,plan:PrematureBurialResolutionPlan,effectNegated=false,lookup:Lookup=cardLookup
):{
  status:'equipped'|'negated'|'target-invalid'|'no-space'|'source-missing';
  state:PrematureBurialState;
  summoned?:{team:Team;uid:string;ownerSeat:number;position:'atk';faceUp:true};
}{
  assertState(input);
  if(!plan||plan.kind!=='premature-burial-resolution')
    throw Error('Plano de resolução Premature Burial inválido.');
  const pending=pendingActivation(input,plan.activationId);
  if(plan.sourceUid!==pending.sourceUid||plan.equipOwnerSeat!==pending.equipOwnerSeat||
    plan.controllerSeat!==pending.controllerSeat||plan.controllerTeam!==pending.controllerTeam||
    plan.opponentSeat!==pending.opponentSeat||plan.targetUid!==pending.targetUid||
    plan.targetOwnerSeat!==pending.targetOwnerSeat||plan.turn!==pending.turn||
    plan.lpCost!==LP_COST||JSON.stringify(plan.targetBinding)!==JSON.stringify(pending.targetBinding))
    throw Error('Plano Premature Burial não corresponde à ativação pendente.');
  const before=inventorySnapshot(input);
  const next=structuredClone(input) as PrematureBurialState;
  const pendingMap={...(next.prematureBurial?.pending??{})};
  delete pendingMap[plan.activationId];
  next.prematureBurial={
    pending:pendingMap,
    resolved:{...(next.prematureBurial?.resolved??{}),[plan.activationId]:true as const},
    equipped:{...(next.prematureBurial?.equipped??{})}
  };
  const backrow=next.core.players[pending.controllerTeam].backrow;
  const equipIndex=backrow.findIndex(card=>card.uid===pending.sourceUid);
  if(effectNegated){
    removeEquipToGrave(next,pending.controllerTeam,pending.sourceUid);
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'negated',state:next};
  }
  if(equipIndex<0){
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'source-missing',state:next};
  }
  if(!targetBindingValid(next.core,pending.targetBinding)||
    !isReviveEligible(next,pending.controllerTeam,pending.targetUid,lookup)){
    removeEquipToGrave(next,pending.controllerTeam,pending.sourceUid);
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'target-invalid',state:next};
  }
  if(next.core.players[pending.controllerTeam].monsters.length>=3){
    removeEquipToGrave(next,pending.controllerTeam,pending.sourceUid);
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'no-space',state:next};
  }
  const grave=next.core.players[pending.controllerTeam].grave;
  const targetIndex=grave.findIndex(card=>card.uid===pending.targetUid);
  if(targetIndex<0){
    removeEquipToGrave(next,pending.controllerTeam,pending.sourceUid);
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'target-invalid',state:next};
  }
  const [ref]=grave.splice(targetIndex,1),ownerSeat=physicalSeat(ref.uid);
  const revived:Monster={
    ...ref,owner:ownerSeat,faceUp:true,position:'atk',
    entered:pending.turn,changed:pending.turn,attacked:0,atkBoost:0,defBoost:0
  };
  next.core.players[pending.controllerTeam].monsters.push(revived);
  const equippedCard=next.core.players[pending.controllerTeam].backrow.find(card=>card.uid===pending.sourceUid);
  if(!equippedCard)throw Error('Premature Burial desapareceu antes de registrar o vínculo Equip.');
  equippedCard.equippedTo=revived.uid;
  next.prematureBurial.equipped[pending.sourceUid]={
    targetUid:revived.uid,targetOwnerSeat:ownerSeat,equipOwnerSeat:pending.equipOwnerSeat,
    controllerTeam:pending.controllerTeam,turn:pending.turn
  };
  synchronizeCardLifetimes(next.core);
  assertState(next);assertConserved(before,next);
  return {status:'equipped',state:next,summoned:{team:pending.controllerTeam,uid:revived.uid,ownerSeat,position:'atk',faceUp:true}};
}

/** Destroying Premature Burial also destroys its currently equipped monster, wherever control moved. */
export function destroyPrematureBurial(
  input:PrematureBurialState,equipUid:string
):{state:PrematureBurialState;monsterDestroyed:boolean}{
  assertState(input);
  const link=input.prematureBurial?.equipped?.[equipUid];
  if(!link)throw Error('Vínculo Premature Burial ausente ou já removido.');
  const before=inventorySnapshot(input),next=structuredClone(input) as PrematureBurialState;
  if(!removeEquipToGrave(next,link.controllerTeam,equipUid))
    throw Error('Premature Burial não está mais na Zona de Magias/Armadilhas.');
  let monsterDestroyed=false;
  for(const team of [0,1] as const){
    const monsters=next.core.players[team].monsters;
    const index=monsters.findIndex(card=>card.uid===link.targetUid);
    if(index>=0){
      const [monster]=monsters.splice(index,1);
      next.core.players[team].grave.push(monster);
      monsterDestroyed=true;
      break;
    }
  }
  const equipped={...(next.prematureBurial?.equipped??{})};
  delete equipped[equipUid];
  next.prematureBurial={pending:{...(next.prematureBurial?.pending??{})},
    resolved:{...(next.prematureBurial?.resolved??{})},equipped};
  synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
  return {state:next,monsterDestroyed};
}

/** Leaving the field without destruction removes the Equip link but does not destroy the monster. */
export function removePrematureBurialWithoutDestruction(
  input:PrematureBurialState,equipUid:string,destination:'grave'|'banished'
):PrematureBurialState{
  assertState(input);
  const link=input.prematureBurial?.equipped?.[equipUid];
  if(!link)throw Error('Vínculo Premature Burial ausente ou já removido.');
  const before=inventorySnapshot(input),next=structuredClone(input) as PrematureBurialState;
  const backrow=next.core.players[link.controllerTeam].backrow,index=backrow.findIndex(card=>card.uid===equipUid);
  if(index<0)throw Error('Premature Burial não está no backrow.');
  const [equip]=backrow.splice(index,1);
  const destinationZone=destination==='grave'?next.core.players[link.controllerTeam].grave:next.core.players[link.controllerTeam].banished;
  if(!destinationZone)throw Error('Zona de destino Premature Burial ausente.');
  destinationZone.push(equip);
  const equipped={...(next.prematureBurial?.equipped??{})};delete equipped[equipUid];
  next.prematureBurial={pending:{...(next.prematureBurial?.pending??{})},
    resolved:{...(next.prematureBurial?.resolved??{})},equipped};
  synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
  return next;
}

/** Returns the Equip Spell to its original physical owner's hand without destroying the monster. */
export function returnPrematureBurialToOwnerHand(
  input:PrematureBurialState,equipUid:string
):PrematureBurialState{
  assertState(input);
  const link=input.prematureBurial?.equipped?.[equipUid];
  if(!link)throw Error('Vínculo Premature Burial ausente ou já removido.');
  const before=inventorySnapshot(input),next=structuredClone(input) as PrematureBurialState;
  const backrow=next.core.players[link.controllerTeam].backrow,index=backrow.findIndex(card=>card.uid===equipUid);
  if(index<0)throw Error('Premature Burial não está no backrow.');
  const [equip]=backrow.splice(index,1);
  const ownerTeam=link.equipOwnerSeat%2;
  if(next.active[ownerTeam]===link.equipOwnerSeat){
    next.core.players[ownerTeam].hand.push(equip);
  }else{
    const reserve=next.reserves[link.equipOwnerSeat];
    if(!reserve)throw Error('Reserva física do dono de Premature Burial não existe.');
    reserve.hand.push(equip);
    next.core.teamRotation.reserves=next.reserves;
  }
  const equipped={...(next.prematureBurial?.equipped??{})};delete equipped[equipUid];
  next.prematureBurial={pending:{...(next.prematureBurial?.pending??{})},
    resolved:{...(next.prematureBurial?.resolved??{})},equipped};
  synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
  return next;
}

/** When the equipped monster leaves the field, the Equip Spell is sent to the GY by the equip rule. */
export function onPrematureBurialMonsterLeavesField(
  input:PrematureBurialState,targetUid:string,destination:'grave'|'banished'='grave'
):PrematureBurialState{
  assertState(input);
  const linkEntry=Object.entries(input.prematureBurial?.equipped??{}).find(([,link])=>link.targetUid===targetUid);
  if(!linkEntry)throw Error('Nenhum Premature Burial está equipado ao monstro informado.');
  const [equipUid,link]=linkEntry;
  const before=inventorySnapshot(input),next=structuredClone(input) as PrematureBurialState;
  let moved=false;
  for(const team of [0,1] as const){
    const monsters=next.core.players[team].monsters,index=monsters.findIndex(card=>card.uid===targetUid);
    if(index>=0){
      const [monster]=monsters.splice(index,1);
      const destinationZone=destination==='grave'?next.core.players[team].grave:next.core.players[team].banished;
      if(!destinationZone)throw Error('Zona de destino do monstro equipado ausente.');
      destinationZone.push(monster);
      moved=true;
      break;
    }
  }
  if(!moved)throw Error('Monstro equipado não está no campo.');
  if(!removeEquipToGrave(next,link.controllerTeam,equipUid))
    throw Error('Equip Spell não está no backrow ao sair o monstro.');
  const equipped={...(next.prematureBurial?.equipped??{})};delete equipped[equipUid];
  next.prematureBurial={pending:{...(next.prematureBurial?.pending??{})},
    resolved:{...(next.prematureBurial?.resolved??{})},equipped};
  synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
  return next;
}

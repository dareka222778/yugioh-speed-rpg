import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import {synchronizeCardLifetimes,type TargetBinding,targetBindingValid} from './cardLifetime';
import {tagInventory,type TagDuel} from './tagDuel';
import type {Backrow} from './duelEngine';

export const SNATCH_STEAL_ID='45986603';
type Team=0|1;
type Core=TagDuel['core'];
type Monster=Core['players'][number]['monsters'][number];
type Lookup=(id:string)=>Pick<Card,'kind'|'monsterType'>|undefined;
type PendingActivation={
  sourceUid:string;equipOwnerSeat:number;controllerSeat:number;controllerTeam:Team;opponentSeat:number;
  targetUid:string;targetOwnerSeat:number;originalControllerTeam:Team;targetBinding:TargetBinding;turn:number;
};
type EquippedLink={
  targetUid:string;targetOwnerSeat:number;equipOwnerSeat:number;controllerTeam:Team;
  originalControllerTeam:Team;turn:number;sequence:number;lastStandbyTurn?:number;
};
export type SnatchStealMemory={
  pending:Record<string,PendingActivation>;resolved:Record<string,true>;
  equipped:Record<string,EquippedLink>;nextSequence:number;
};
export type SnatchStealState=TagDuel&{snatchSteal?:SnatchStealMemory};
export type SnatchStealActivationPlan={
  kind:'snatch-steal-activation';sourceUid:string;equipOwnerSeat:number;controllerSeat:number;
  controllerTeam:Team;opponentSeat:number;targetUid:string;targetOwnerSeat:number;
  originalControllerTeam:Team;targetBinding:TargetBinding;turn:number;activationId:string;
};
export type SnatchStealResolutionPlan=Omit<SnatchStealActivationPlan,'kind'>&{kind:'snatch-steal-resolution'};
const cardLookup:Lookup=id=>getPlayableCard(id);
function validActivationId(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.length<=128&&!/\s/.test(value);}
function physicalSeat(uid:string):number{const match=/^m([0-3]):/.exec(uid);if(!match)throw Error('UID Snatch Steal sem proprietário físico válido.');return Number(match[1]);}
function assertState(state:SnatchStealState):void{
  if(!state||state.version!==1||state.mode!=='tag-classic'||!state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||
    !Array.isArray(state.members)||state.members.length!==4||!Array.isArray(state.active)||state.active.length!==2||!state.reserves||
    state.active.some((seat,team)=>!Number.isInteger(seat)||seat<0||seat>3||seat%2!==team)||!state.core.teamRotation||
    !Number.isSafeInteger(state.core.turn)||state.core.turn<1||!Number.isSafeInteger(state.cursor)||state.cursor<0||state.cursor>3||
    state.core.current!==state.cursor%2||state.active[state.core.current]!==state.cursor||state.core.teamRotation.cursor!==state.cursor||
    JSON.stringify(state.active)!==JSON.stringify(state.core.teamRotation.active)||JSON.stringify(state.reserves)!==JSON.stringify(state.core.teamRotation.reserves)||
    state.members.some((member,index)=>!member.id||!member.name||member.team!==index%2))
    throw Error('Estado TagDuel clássico/rotação inválido para Snatch Steal.');
  const expected=[0,1,2,3].filter(seat=>!state.active.includes(seat)),keys=Object.keys(state.reserves).map(Number).sort((a,b)=>a-b);
  if(keys.length!==2||keys.some((seat,index)=>seat!==expected[index]))throw Error('Reservas físicas TagDuel inválidas para Snatch Steal.');
  for(const [team,player] of state.core.players.entries()){
    if(player.id!=='tag-team-'+team||!Number.isSafeInteger(player.lp)||player.lp<0||!Array.isArray(player.deck)||!Array.isArray(player.hand)||
      !Array.isArray(player.monsters)||player.monsters.length>3||!Array.isArray(player.backrow)||player.backrow.length>3||
      !Array.isArray(player.grave)||!Array.isArray(player.banished)||!Array.isArray(player.extra??[])||(player.extra??[]).length>5||
      state.active[team]%2!==team)throw Error('LP, zonas 3+3, Extra Deck ou representante ativo inválidos para Snatch Steal.');
    const prefix='m'+state.active[team]+':';
    for(const card of [...player.deck,...player.hand,...(player.extra??[])])if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))
      throw Error('UID de Deck/mão/Extra deve pertencer ao representante físico ativo.');
  }
  for(const [seat,held] of Object.entries(state.reserves)){
    if(!held||!Array.isArray(held.deck)||!Array.isArray(held.hand)||!Array.isArray(held.extra??[])||(held.extra??[]).length>5)
      throw Error('Deck/mão/Extra da reserva física inválidos.');
    const prefix='m'+seat+':';for(const card of [...held.deck,...held.hand,...(held.extra??[])])
      if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))throw Error('UID de zona privada da reserva pertence a outro proprietário físico.');
  }
  const cards=tagInventory(state),uids=cards.map(card=>card.uid);
  if(cards.some(card=>typeof card.uid!=='string'||!/^m[0-3]:/.test(card.uid)||typeof card.id!=='string'||!card.id)||new Set(uids).size!==uids.length)
    throw Error('Inventário físico inválido ou UID duplicado no TagDuel.');
  const memory=state.snatchSteal;
  if(memory!==undefined&&(!memory||typeof memory!=='object'||!memory.pending||typeof memory.pending!=='object'||!memory.resolved||
    typeof memory.resolved!=='object'||!memory.equipped||typeof memory.equipped!=='object'||!Number.isSafeInteger(memory.nextSequence)||memory.nextSequence<1||
    Object.entries(memory.pending).some(([id,v])=>!validActivationId(id)||!v||typeof v.sourceUid!=='string'||
      !Number.isInteger(v.equipOwnerSeat)||v.equipOwnerSeat<0||v.equipOwnerSeat>3||!Number.isInteger(v.controllerSeat)||v.controllerSeat<0||v.controllerSeat>3||
      (v.controllerTeam!==0&&v.controllerTeam!==1)||v.controllerSeat!==v.equipOwnerSeat||v.controllerSeat%2!==v.controllerTeam||
      !Number.isInteger(v.opponentSeat)||v.opponentSeat<0||v.opponentSeat>3||v.opponentSeat%2!==1-v.controllerTeam||
      v.originalControllerTeam!==1-v.controllerTeam||!Number.isInteger(v.targetOwnerSeat)||v.targetOwnerSeat<0||v.targetOwnerSeat>3||
      !v.targetUid.startsWith('m'+v.targetOwnerSeat+':')||!v.sourceUid.startsWith('m'+v.equipOwnerSeat+':')||
      !Number.isSafeInteger(v.turn)||!v.targetBinding||v.targetBinding.uid!==v.targetUid||v.targetBinding.zone!=='monster'||!Number.isSafeInteger(v.targetBinding.epoch)))||
    Object.entries(memory.resolved).some(([id,v])=>!validActivationId(id)||v!==true)||
    Object.entries(memory.equipped).some(([uid,v])=>!uid||!v||typeof v.targetUid!=='string'||!Number.isInteger(v.targetOwnerSeat)||
      v.targetOwnerSeat<0||v.targetOwnerSeat>3||!v.targetUid.startsWith('m'+v.targetOwnerSeat+':')||
      !Number.isInteger(v.equipOwnerSeat)||v.equipOwnerSeat<0||v.equipOwnerSeat>3||!uid.startsWith('m'+v.equipOwnerSeat+':')||
      (v.controllerTeam!==0&&v.controllerTeam!==1)||v.equipOwnerSeat%2!==v.controllerTeam||v.originalControllerTeam!==1-v.controllerTeam||
      !Number.isSafeInteger(v.turn)||!Number.isSafeInteger(v.sequence)||v.sequence<1||
      (v.lastStandbyTurn!==undefined&&(!Number.isSafeInteger(v.lastStandbyTurn)||v.lastStandbyTurn<1))))
    throw Error('Memória de ativações/equipamentos Snatch Steal inválida.');
  const links=Object.values(memory?.equipped??{});
  if(links.some(link=>link.sequence>=(memory?.nextSequence??1))||new Set(links.map(link=>link.sequence)).size!==links.length)
    throw Error('Sequência de vínculos Snatch Steal inválida.');
  for(const [equipUid,link] of Object.entries(memory?.equipped??{})){
    const equip=state.core.players[link.controllerTeam].backrow.find(card=>card.uid===equipUid);
    const target=state.core.players.flatMap(player=>player.monsters).find(card=>card.uid===link.targetUid);
    if(!equip||equip.id!==SNATCH_STEAL_ID||equip.equippedTo!==link.targetUid||!target)
      throw Error('Vínculo Snatch Steal/equippedTo não corresponde ao campo persistido.');
  }
}
function assertOpenMain(state:SnatchStealState,team:Team):void{
  if(state.core.phase!=='main'||state.core.current!==team||state.core.pending?.kind!=='none'||!Array.isArray(state.core.chain)||
    state.core.chain.length>0||state.core.choice||state.core.handFlow)
    throw Error('Snatch Steal só pode ser ativado na Main Phase sem decisão ou corrente pendente.');
}
function sourceContext(state:SnatchStealState,uid:string,lookup:Lookup):{equipOwnerSeat:number;controllerSeat:number;controllerTeam:Team;opponentSeat:number}{
  assertState(state);if(typeof uid!=='string'||!uid)throw Error('UID da fonte Snatch Steal ausente.');
  const controllerTeam=state.core.current as Team,controllerSeat=state.active[controllerTeam],equipOwnerSeat=physicalSeat(uid);
  if(equipOwnerSeat!==controllerSeat||state.members[equipOwnerSeat]?.team!==controllerTeam)
    throw Error('Snatch Steal deve ser ativado pelo representante físico ativo.');
  const matches=state.core.players[controllerTeam].hand.filter(card=>card.uid===uid);
  if(matches.length!==1||matches[0].id!==SNATCH_STEAL_ID)throw Error('Snatch Steal deve estar uma única vez na mão do representante ativo.');
  const metadata=lookup(matches[0].id);if(!metadata||metadata.kind!=='spell')throw Error('Definição de Snatch Steal não admitida.');
  assertOpenMain(state,controllerTeam);return {equipOwnerSeat,controllerSeat,controllerTeam,opponentSeat:state.active[1-controllerTeam]};
}
function isOpponentMonster(state:SnatchStealState,controllerTeam:Team,uid:string,lookup:Lookup):boolean{
  let ownerSeat:number;try{ownerSeat=physicalSeat(uid);}catch{return false;}if(!state.members[ownerSeat])return false;
  const opponentTeam=(1-controllerTeam) as Team,matches=state.core.players[opponentTeam].monsters.filter(card=>card.uid===uid);
  if(matches.length!==1||matches[0].faceUp!==true)return false;
  const metadata=lookup(matches[0].id);return !!metadata&&metadata.kind==='monster';
}
function bindingFor(state:SnatchStealState,uid:string):TargetBinding{
  const core=structuredClone(state.core);synchronizeCardLifetimes(core);const binding=core.cardLifetimes?.[uid];
  if(!binding||binding.zone!=='monster')throw Error('Alvo Snatch Steal deve permanecer face-up no campo adversário.');
  return {uid,zone:'monster',epoch:binding.epoch};
}
function inventorySnapshot(state:SnatchStealState):string{
  const cards=tagInventory(state),uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)throw Error('Inventário físico duplicado antes da resolução Snatch Steal.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}
function assertConserved(before:string,after:SnatchStealState):void{if(inventorySnapshot(after)!==before)throw Error('Snatch Steal alterou ou perdeu identidade física do inventário.');}
function pendingActivation(state:SnatchStealState,id:string):PendingActivation{
  if(!validActivationId(id))throw Error('activationId Snatch Steal inválido.');
  const pending=state.snatchSteal?.pending?.[id];if(!pending)throw Error('Ativação Snatch Steal ausente, resolvida ou obsoleta.');
  if(state.core.turn!==pending.turn||state.core.current!==pending.controllerTeam||state.active[pending.controllerTeam]!==pending.controllerSeat||
    state.active[1-pending.controllerTeam]!==pending.opponentSeat)throw Error('Contexto de equipe/turno da ativação Snatch Steal mudou.');
  return pending;
}
function removeEquipToGrave(state:SnatchStealState,team:Team,equipUid:string):boolean{
  const backrow=state.core.players[team].backrow,index=backrow.findIndex(card=>card.uid===equipUid);if(index<0)return false;
  const [equip]=backrow.splice(index,1);state.core.players[physicalSeat(equip.uid)%2].grave.push(equip);return true;
}
export function getSnatchStealCandidates(state:SnatchStealState,controllerTeam:Team,lookup:Lookup=cardLookup):string[]{
  assertState(state);if(controllerTeam!==0&&controllerTeam!==1)throw Error('Equipe inválida na seleção Snatch Steal.');
  const player=state.core.players[controllerTeam],opponent=state.core.players[1-controllerTeam];
  if(player.monsters.length>=3||player.backrow.length>=3)return [];
  return opponent.monsters.filter(card=>card.faceUp===true&&lookup(card.id)?.kind==='monster').map(card=>card.uid);
}
export function planSnatchStealActivation(state:SnatchStealState,sourceUid:string,activationId:string,targetUid:string,lookup:Lookup=cardLookup):SnatchStealActivationPlan{
  assertState(state);if(!validActivationId(activationId)||state.snatchSteal?.pending?.[activationId]||state.snatchSteal?.resolved?.[activationId])
    throw Error('activationId Snatch Steal inválido ou já utilizado.');
  const source=sourceContext(state,sourceUid,lookup),candidates=getSnatchStealCandidates(state,source.controllerTeam,lookup);
  if(candidates.length===0)throw Error('Snatch Steal exige monstro face-up adversário e zonas 3+3 disponíveis.');
  if(!candidates.includes(targetUid))throw Error('Snatch Steal só pode equipar a monstro face-up controlado pela equipe adversária.');
  return {kind:'snatch-steal-activation',sourceUid,equipOwnerSeat:source.equipOwnerSeat,controllerSeat:source.controllerSeat,
    controllerTeam:source.controllerTeam,opponentSeat:source.opponentSeat,targetUid,targetOwnerSeat:physicalSeat(targetUid),
    originalControllerTeam:(1-source.controllerTeam) as Team,targetBinding:bindingFor(state,targetUid),turn:state.core.turn,activationId};
}
export function registerSnatchStealActivation(input:SnatchStealState,plan:SnatchStealActivationPlan,lookup:Lookup=cardLookup):SnatchStealState{
  assertState(input);
  if(!plan||plan.kind!=='snatch-steal-activation'||!validActivationId(plan.activationId)||plan.turn!==input.core.turn||
    plan.targetBinding?.uid!==plan.targetUid||plan.targetBinding.zone!=='monster'||plan.originalControllerTeam!==1-plan.controllerTeam)
    throw Error('Plano de ativação Snatch Steal inválido ou obsoleto.');
  const source=sourceContext(input,plan.sourceUid,lookup);
  if(source.equipOwnerSeat!==plan.equipOwnerSeat||source.controllerSeat!==plan.controllerSeat||source.controllerTeam!==plan.controllerTeam||
    source.opponentSeat!==plan.opponentSeat||input.snatchSteal?.pending?.[plan.activationId]||input.snatchSteal?.resolved?.[plan.activationId])
    throw Error('Contexto ou activationId Snatch Steal mudou antes do registro.');
  const player=input.core.players[plan.controllerTeam];
  if(player.monsters.length>=3||player.backrow.length>=3||!isOpponentMonster(input,plan.controllerTeam,plan.targetUid,lookup)||
    !targetBindingValid(structuredClone(input.core),plan.targetBinding))throw Error('Alvo ou capacidade de zona mudou antes do registro Snatch Steal.');
  const before=inventorySnapshot(input),next=structuredClone(input) as SnatchStealState;
  const hand=next.core.players[plan.controllerTeam].hand,index=hand.findIndex(card=>card.uid===plan.sourceUid);
  if(index<0)throw Error('Snatch Steal deixou a mão antes do registro.');
  const [sourceCard]=hand.splice(index,1),equip:Backrow={...sourceCard,setTurn:plan.turn,faceUp:true};
  next.core.players[plan.controllerTeam].backrow.push(equip);
  const pending={...(next.snatchSteal?.pending??{})};
  pending[plan.activationId]={sourceUid:plan.sourceUid,equipOwnerSeat:plan.equipOwnerSeat,controllerSeat:plan.controllerSeat,
    controllerTeam:plan.controllerTeam,opponentSeat:plan.opponentSeat,targetUid:plan.targetUid,targetOwnerSeat:plan.targetOwnerSeat,
    originalControllerTeam:plan.originalControllerTeam,targetBinding:structuredClone(plan.targetBinding),turn:plan.turn};
  next.snatchSteal={pending,resolved:{...(next.snatchSteal?.resolved??{})},equipped:{...(next.snatchSteal?.equipped??{})},
    nextSequence:next.snatchSteal?.nextSequence??1};
  synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);return next;
}
export function planSnatchStealResolution(state:SnatchStealState,activationId:string):SnatchStealResolutionPlan{
  assertState(state);const pending=pendingActivation(state,activationId);return {...pending,kind:'snatch-steal-resolution',activationId};
}
export function resolveSnatchStealResolution(input:SnatchStealState,plan:SnatchStealResolutionPlan,effectNegated=false,lookup:Lookup=cardLookup):
{status:'equipped'|'negated'|'target-invalid'|'no-space-destroyed'|'source-missing';state:SnatchStealState}{
  assertState(input);if(!plan||plan.kind!=='snatch-steal-resolution')throw Error('Plano de resolução Snatch Steal inválido.');
  const pending=pendingActivation(input,plan.activationId);
  if(plan.sourceUid!==pending.sourceUid||plan.equipOwnerSeat!==pending.equipOwnerSeat||plan.controllerSeat!==pending.controllerSeat||
    plan.controllerTeam!==pending.controllerTeam||plan.opponentSeat!==pending.opponentSeat||plan.targetUid!==pending.targetUid||
    plan.targetOwnerSeat!==pending.targetOwnerSeat||plan.originalControllerTeam!==pending.originalControllerTeam||plan.turn!==pending.turn||
    JSON.stringify(plan.targetBinding)!==JSON.stringify(pending.targetBinding))throw Error('Plano Snatch Steal não corresponde à ativação pendente.');
  const before=inventorySnapshot(input),next=structuredClone(input) as SnatchStealState;
  const pendingMap={...(next.snatchSteal?.pending??{})};delete pendingMap[plan.activationId];
  next.snatchSteal={pending:pendingMap,resolved:{...(next.snatchSteal?.resolved??{}),[plan.activationId]:true as const},
    equipped:{...(next.snatchSteal?.equipped??{})},nextSequence:next.snatchSteal?.nextSequence??1};
  const backrow=next.core.players[pending.controllerTeam].backrow,equipIndex=backrow.findIndex(card=>card.uid===pending.sourceUid);
  if(effectNegated){removeEquipToGrave(next,pending.controllerTeam,pending.sourceUid);synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);return {status:'negated',state:next};}
  if(equipIndex<0){synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);return {status:'source-missing',state:next};}
  if(!targetBindingValid(next.core,pending.targetBinding)||!isOpponentMonster(next,pending.controllerTeam,pending.targetUid,lookup)){
    removeEquipToGrave(next,pending.controllerTeam,pending.sourceUid);synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);return {status:'target-invalid',state:next};
  }
  const opponent=next.core.players[pending.originalControllerTeam],targetIndex=opponent.monsters.findIndex(card=>card.uid===pending.targetUid);
  if(targetIndex<0){removeEquipToGrave(next,pending.controllerTeam,pending.sourceUid);synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);return {status:'target-invalid',state:next};}
  if(next.core.players[pending.controllerTeam].monsters.length>=3){
    removeEquipToGrave(next,pending.controllerTeam,pending.sourceUid);
    const destroyed=onSnatchStealMonsterLeavesField(next,pending.targetUid,'grave');
    assertConserved(before,destroyed);return {status:'no-space-destroyed',state:destroyed};
  }
  const [target]=opponent.monsters.splice(targetIndex,1),controlled:Monster={...target,owner:physicalSeat(target.uid)};
  next.core.players[pending.controllerTeam].monsters.push(controlled);
  const equip=next.core.players[pending.controllerTeam].backrow.find(card=>card.uid===pending.sourceUid);
  if(!equip)throw Error('Snatch Steal desapareceu antes de registrar vínculo Equip.');
  equip.equippedTo=target.uid;
  const sequence=next.snatchSteal.nextSequence;
  next.snatchSteal.equipped[pending.sourceUid]={targetUid:target.uid,targetOwnerSeat:physicalSeat(target.uid),equipOwnerSeat:pending.equipOwnerSeat,
    controllerTeam:pending.controllerTeam,originalControllerTeam:pending.originalControllerTeam,turn:pending.turn,sequence};
  next.snatchSteal.nextSequence=sequence+1;
  synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);return {status:'equipped',state:next};
}
function detachAndReturn(input:SnatchStealState,equipUid:string,destination:'grave'|'banished'|'hand'):
{state:SnatchStealState;monsterReturned:boolean;monsterDestroyed:boolean}{
  assertState(input);const link=input.snatchSteal?.equipped?.[equipUid];if(!link)throw Error('Vínculo Snatch Steal ausente ou já removido.');
  const before=inventorySnapshot(input),next=structuredClone(input) as SnatchStealState;
  const backrow=next.core.players[link.controllerTeam].backrow,index=backrow.findIndex(card=>card.uid===equipUid);
  if(index<0)throw Error('Snatch Steal não está no backrow.');
  const [equip]=backrow.splice(index,1),equipOwnerTeam=physicalSeat(equip.uid)%2;
  if(destination==='hand'){
    if(next.active[equipOwnerTeam]===link.equipOwnerSeat)next.core.players[equipOwnerTeam].hand.push(equip);
    else{const reserve=next.reserves[link.equipOwnerSeat];if(!reserve)throw Error('Reserva física do dono de Snatch Steal não existe.');
      reserve.hand.push(equip);(next.core.teamRotation as NonNullable<Core['teamRotation']>).reserves=next.reserves as unknown as NonNullable<Core['teamRotation']>['reserves'];}
  }else{const zone=destination==='grave'?next.core.players[equipOwnerTeam].grave:next.core.players[equipOwnerTeam].banished;
    if(!zone)throw Error('Zona de destino de Snatch Steal ausente.');zone.push(equip);}
  const equipped={...(next.snatchSteal?.equipped??{})};delete equipped[equipUid];
  let monsterReturned=false,monsterDestroyed=false,currentTeam:Team|undefined;
  for(const team of [0,1] as const)if(next.core.players[team].monsters.some(card=>card.uid===link.targetUid)){currentTeam=team;break;}
  if(currentTeam!==undefined){
    const target=next.core.players[currentTeam].monsters.find(card=>card.uid===link.targetUid)!;
    if(target.faceUp===false){
      for(const [otherUid,other] of Object.entries(equipped).filter(([,item])=>item.targetUid===link.targetUid)){
        const owner=other.equipOwnerSeat%2,zone=next.core.players[other.controllerTeam].backrow,otherIndex=zone.findIndex(card=>card.uid===otherUid);
        if(otherIndex>=0){const [otherEquip]=zone.splice(otherIndex,1);next.core.players[owner].grave.push(otherEquip);}delete equipped[otherUid];
      }monsterReturned=true;
    }else{
      const remaining=Object.values(equipped).filter(item=>item.targetUid===link.targetUid).sort((a,b)=>b.sequence-a.sequence);
      const desiredTeam=remaining[0]?.controllerTeam??link.originalControllerTeam;
      if(currentTeam!==desiredTeam){
        if(next.core.players[desiredTeam].monsters.length>=3){
          const list=next.core.players[currentTeam].monsters,at=list.findIndex(card=>card.uid===link.targetUid),[destroyed]=list.splice(at,1);
          next.core.players[physicalSeat(destroyed.uid)%2].grave.push(destroyed);monsterDestroyed=true;
          for(const [otherUid,other] of Object.entries(equipped).filter(([,item])=>item.targetUid===link.targetUid)){
            const owner=other.equipOwnerSeat%2,zone=next.core.players[other.controllerTeam].backrow,otherIndex=zone.findIndex(card=>card.uid===otherUid);
            if(otherIndex>=0){const [otherEquip]=zone.splice(otherIndex,1);next.core.players[owner].grave.push(otherEquip);}delete equipped[otherUid];
          }
        }else{
          const list=next.core.players[currentTeam].monsters,at=list.findIndex(card=>card.uid===link.targetUid),[returned]=list.splice(at,1);
          next.core.players[desiredTeam].monsters.push(returned);monsterReturned=true;
        }
      }else monsterReturned=true;
    }
  }
  next.snatchSteal={pending:{...(next.snatchSteal?.pending??{})},resolved:{...(next.snatchSteal?.resolved??{})},equipped,
    nextSequence:next.snatchSteal?.nextSequence??1};
  synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);return {state:next,monsterReturned,monsterDestroyed};
}
export function destroySnatchSteal(input:SnatchStealState,equipUid:string):{state:SnatchStealState;monsterReturned:boolean;monsterDestroyed:boolean}{return detachAndReturn(input,equipUid,'grave');}
export function leaveSnatchSteal(input:SnatchStealState,equipUid:string,destination:'grave'|'banished'|'hand'):SnatchStealState{return detachAndReturn(input,equipUid,destination).state;}
export function returnSnatchStealToOwnerHand(input:SnatchStealState,equipUid:string):SnatchStealState{return leaveSnatchSteal(input,equipUid,'hand');}
export function banishSnatchSteal(input:SnatchStealState,equipUid:string):SnatchStealState{return leaveSnatchSteal(input,equipUid,'banished');}
export function onSnatchStealMonsterLeavesField(input:SnatchStealState,targetUid:string,destination:'grave'|'banished'='grave'):SnatchStealState{
  assertState(input);const before=inventorySnapshot(input),next=structuredClone(input) as SnatchStealState;let moved=false;
  for(const team of [0,1] as const){const list=next.core.players[team].monsters,index=list.findIndex(card=>card.uid===targetUid);
    if(index>=0){const [target]=list.splice(index,1),ownerTeam=physicalSeat(target.uid)%2,zone=destination==='grave'?next.core.players[ownerTeam].grave:next.core.players[ownerTeam].banished;
      if(!zone)throw Error('Zona de destino do monstro Snatch Steal ausente.');zone.push(target);moved=true;break;}}
  if(!moved)throw Error('Monstro Snatch Steal não está no campo.');
  const equipped={...(next.snatchSteal?.equipped??{})};
  for(const [equipUid,link] of Object.entries(equipped).filter(([,link])=>link.targetUid===targetUid)){
    const owner=link.equipOwnerSeat%2,backrow=next.core.players[link.controllerTeam].backrow,index=backrow.findIndex(card=>card.uid===equipUid);
    if(index>=0){const [equip]=backrow.splice(index,1);next.core.players[owner].grave.push(equip);}delete equipped[equipUid];}
  next.snatchSteal={pending:{...(next.snatchSteal?.pending??{})},resolved:{...(next.snatchSteal?.resolved??{})},equipped,
    nextSequence:next.snatchSteal?.nextSequence??1};
  synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);return next;
}
export function onSnatchStealMonsterFlippedFaceDown(input:SnatchStealState,targetUid:string):SnatchStealState{
  assertState(input);const before=inventorySnapshot(input),next=structuredClone(input) as SnatchStealState;
  const target=next.core.players.flatMap(player=>player.monsters).find(card=>card.uid===targetUid);
  if(!target||target.faceUp!==false)throw Error('Alvo Snatch Steal não está face-down.');
  const equipped={...(next.snatchSteal?.equipped??{})};
  for(const [equipUid,link] of Object.entries(equipped).filter(([,link])=>link.targetUid===targetUid)){
    const owner=link.equipOwnerSeat%2,backrow=next.core.players[link.controllerTeam].backrow,index=backrow.findIndex(card=>card.uid===equipUid);
    if(index>=0){const [equip]=backrow.splice(index,1);next.core.players[owner].grave.push(equip);}delete equipped[equipUid];}
  next.snatchSteal={pending:{...(next.snatchSteal?.pending??{})},resolved:{...(next.snatchSteal?.resolved??{})},equipped,
    nextSequence:next.snatchSteal?.nextSequence??1};
  synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);return next;
}
export function reassertSnatchStealControl(input:SnatchStealState,targetUid:string):SnatchStealState{
  assertState(input);const links=Object.values(input.snatchSteal?.equipped??{}).filter(item=>item.targetUid===targetUid).sort((a,b)=>b.sequence-a.sequence);
  const link=links[0];if(!link)return input;
  const currentTeam=([0,1] as const).find(team=>input.core.players[team].monsters.some(card=>card.uid===targetUid));
  if(currentTeam===undefined)throw Error('Alvo Snatch Steal não está no campo.');
  const target=input.core.players[currentTeam].monsters.find(card=>card.uid===targetUid)!;
  if(target.faceUp===false)return onSnatchStealMonsterFlippedFaceDown(input,targetUid);
  if(currentTeam===link.controllerTeam)return input;
  if(input.core.players[link.controllerTeam].monsters.length>=3)return onSnatchStealMonsterLeavesField(input,targetUid,'grave');
  const before=inventorySnapshot(input),next=structuredClone(input) as SnatchStealState;
  const list=next.core.players[currentTeam].monsters,index=list.findIndex(card=>card.uid===targetUid),[controlled]=list.splice(index,1);
  next.core.players[link.controllerTeam].monsters.push(controlled);synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);return next;
}
export function resolveSnatchStealStandbyPhase(input:SnatchStealState):{state:SnatchStealState;applied:number;lpGained:number}{
  assertState(input);if(input.core.phase!=='standby')return {state:input,applied:0,lpGained:0};
  const activeTeam=input.core.current as Team,controllerTeam=(1-activeTeam) as Team;
  const due=Object.entries(input.snatchSteal?.equipped??{}).filter(([,link])=>link.controllerTeam===controllerTeam&&link.lastStandbyTurn!==input.core.turn);
  if(due.length===0)return {state:input,applied:0,lpGained:0};
  const before=inventorySnapshot(input),next=structuredClone(input) as SnatchStealState;
  for(const [equipUid] of due){next.snatchSteal!.equipped[equipUid].lastStandbyTurn=next.core.turn;next.core.players[activeTeam].lp+=1000;}
  synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);return {state:next,applied:due.length,lpGained:due.length*1000};
}

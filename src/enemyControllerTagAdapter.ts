import type {Card} from './cardCatalog';
import {getPlayableCard} from './effectRegistry';
import {bindTarget,synchronizeCardLifetimes,targetBindingValid,type TargetBinding} from './cardLifetime';
import {tagInventory,type TagDuel} from './tagDuel';
import type {Backrow,Monster} from './duelEngine';

export const ENEMY_CONTROLLER_ID='98045062';
type Team=0|1;
type Mode='change-position'|'take-control';
type SourceZone='hand'|'backrow';
type Window='own-priority'|'chain-response';
type Core=TagDuel['core'];
type Lookup=(id:string)=>Pick<Card,'kind'|'monsterType'>|undefined;
type PendingActivation={
  sourceUid:string;sourceOwnerSeat:number;controllerSeat:number;controllerTeam:Team;
  sourceZone:SourceZone;window:Window;mode:Mode;targetUid:string;targetOwnerSeat:number;
  targetBinding:TargetBinding;tributeUid?:string;tributeOwnerSeat?:number;turn:number
};
export type EnemyControllerMemory={pending:Record<string,PendingActivation>;resolved:Record<string,true>};
export type EnemyControllerState=TagDuel&{enemyController?:EnemyControllerMemory};
export type EnemyControllerActivationPlan=PendingActivation&{kind:'enemy-controller-activation';activationId:string};
export type EnemyControllerResolutionPlan=Omit<EnemyControllerActivationPlan,'kind'>&{kind:'enemy-controller-resolution';activationId:string};
const cardLookup:Lookup=id=>getPlayableCard(id);

function validActivationId(value:unknown):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=128&&!/\\s/.test(value);
}
function physicalSeat(uid:string):number{
  const match=/^m([0-3]):/.exec(uid);
  if(!match)throw Error('UID Enemy Controller sem proprietário físico válido.');
  return Number(match[1]);
}
function assertState(state:EnemyControllerState):void{
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
    throw Error('Estado TagDuel clássico/rotação inválido para Enemy Controller.');
  const expected=[0,1,2,3].filter(seat=>!state.active.includes(seat)),keys=Object.keys(state.reserves).map(Number).sort((a,b)=>a-b);
  if(keys.length!==2||keys.some((seat,index)=>seat!==expected[index]))
    throw Error('Reservas físicas TagDuel inválidas para Enemy Controller.');
  for(const [team,player] of state.core.players.entries()){
    if(player.id!=='tag-team-'+team||!Number.isSafeInteger(player.lp)||player.lp<0||
      !Array.isArray(player.deck)||!Array.isArray(player.hand)||!Array.isArray(player.monsters)||
      player.monsters.length>3||!Array.isArray(player.backrow)||player.backrow.length>3||
      !Array.isArray(player.grave)||!Array.isArray(player.banished??[])||
      !Array.isArray(player.extra??[])||(player.extra??[]).length>5||
      state.active[team]%2!==team)
      throw Error('LP, zonas 3+3 ou Extra Deck inválidos para Enemy Controller.');
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
      throw Error('Deck/mão/Extra da reserva física inválidos para Enemy Controller.');
    const prefix='m'+seat+':';
    for(const card of [...held.deck,...held.hand,...(held.extra??[])])
      if(typeof card.uid!=='string'||!card.uid.startsWith(prefix))
        throw Error('UID de zona privada da reserva pertence a outro proprietário físico.');
  }
  const cards=tagInventory(state),uids=cards.map(card=>card.uid);
  if(cards.some(card=>typeof card.uid!=='string'||!/^m[0-3]:/.test(card.uid)||typeof card.id!=='string'||!card.id)||
    new Set(uids).size!==uids.length)
    throw Error('Inventário físico inválido ou UID duplicado no TagDuel.');
  if(state.enemyController!==undefined){
    const memory=state.enemyController;
    if(!memory||!memory.pending||typeof memory.pending!=='object'||!memory.resolved||typeof memory.resolved!=='object'||
      Object.entries(memory.pending).some(([id,p])=>!validActivationId(id)||!p||
        typeof p.sourceUid!=='string'||!Number.isInteger(p.sourceOwnerSeat)||p.sourceOwnerSeat<0||p.sourceOwnerSeat>3||
        !Number.isInteger(p.controllerSeat)||p.controllerSeat<0||p.controllerSeat>3||
        (p.controllerTeam!==0&&p.controllerTeam!==1)||p.controllerSeat%2!==p.controllerTeam||
        (p.sourceZone!=='hand'&&p.sourceZone!=='backrow')||
        (p.window!=='own-priority'&&p.window!=='chain-response')||
        (p.mode!=='change-position'&&p.mode!=='take-control')||
        typeof p.targetUid!=='string'||p.targetBinding?.uid!==p.targetUid||p.targetBinding.zone!=='monsters'||
        !Number.isInteger(p.targetOwnerSeat)||p.targetOwnerSeat<0||p.targetOwnerSeat>3||
        !Number.isSafeInteger(p.turn)||p.turn<1||
        (p.mode==='take-control'&&(!p.tributeUid||!Number.isInteger(p.tributeOwnerSeat)))||
        (p.mode==='change-position'&&(p.tributeUid!==undefined||p.tributeOwnerSeat!==undefined)))||
      Object.entries(memory.resolved).some(([id,value])=>!validActivationId(id)||value!==true))
      throw Error('Memória de ativação Enemy Controller inválida.');
  }
}
function inventorySnapshot(state:EnemyControllerState):string{
  const cards=tagInventory(state),uids=cards.map(card=>card.uid);
  if(new Set(uids).size!==uids.length)throw Error('Inventário físico duplicado antes da resolução Enemy Controller.');
  return cards.map(card=>card.uid+'='+card.id).sort().join('|');
}
function assertConserved(before:string,after:EnemyControllerState):void{
  if(inventorySnapshot(after)!==before)throw Error('Enemy Controller alterou ou perdeu identidade física do inventário.');
}
function assertOwnPriority(state:EnemyControllerState,team:Team):void{
  if(state.core.current!==team||state.core.priority!==team||(state.core.phase!=='main'&&state.core.phase!=='battle')||
    state.core.chain.length>0||state.core.pending.kind!=='none'||state.core.choice||
    state.core.handFlow||state.core.turnEnding||state.core.damageStep)
    throw Error('Enemy Controller da mão exige prioridade própria na Main/Battle Phase sem corrente pendente.');
}
function sourceContext(state:EnemyControllerState,sourceUid:string,lookup:Lookup):{
  sourceOwnerSeat:number;controllerSeat:number;controllerTeam:Team;sourceZone:SourceZone;window:Window
}{
  assertState(state);
  if(typeof sourceUid!=='string'||!sourceUid)throw Error('UID da fonte Enemy Controller ausente.');
  const sourceOwnerSeat=physicalSeat(sourceUid),controllerSeatFor=(team:Team)=>state.active[team];
  const handMatches=([0,1] as const).flatMap(team=>state.core.players[team].hand
    .filter(card=>card.uid===sourceUid).map(card=>({team,card})));
  const backrowMatches=([0,1] as const).flatMap(team=>state.core.players[team].backrow
    .filter(card=>card.uid===sourceUid).map(card=>({team,card})));
  if(handMatches.length+backrowMatches.length!==1)throw Error('Enemy Controller deve estar uma única vez na mão ou no backrow.');
  const hand=handMatches[0];
  if(hand){
    const team=hand.team as Team,seat=controllerSeatFor(team);
    if(hand.card.id!==ENEMY_CONTROLLER_ID||lookup(hand.card.id)?.kind!=='spell'||
      sourceOwnerSeat!==seat||state.cursor!==seat||state.members[sourceOwnerSeat]?.team!==team)
      throw Error('Enemy Controller da mão pertence ao representante físico ativo da equipe.');
    assertOwnPriority(state,team);
    if(state.core.players[team].backrow.length>=3)
      throw Error('Enemy Controller da mão exige uma Spell/Trap Zone livre.');
    return {sourceOwnerSeat,controllerSeat:seat,controllerTeam:team,sourceZone:'hand',window:'own-priority'};
  }
  const set=backrowMatches[0];
  if(!set)throw Error('Fonte Enemy Controller não está disponível.');
  const team=set.team as Team,seat=controllerSeatFor(team);
  if(set.card.id!==ENEMY_CONTROLLER_ID||lookup(set.card.id)?.kind!=='spell'||
    set.card.faceUp!==false||set.card.setTurn>=state.core.turn)
    throw Error('Enemy Controller setado deve estar face-down desde um turno anterior.');
  let controllerTeam:Team,window:Window;
  if(state.core.phase==='response'&&state.core.chain.length>0&&state.core.priority===team){
    controllerTeam=team;window='chain-response';
  }else if(state.core.current===team&&state.core.priority===team&&(state.core.phase==='main'||state.core.phase==='battle')&&
    state.core.chain.length===0&&state.core.pending.kind==='none'&&!state.core.choice&&!state.core.handFlow){
    controllerTeam=team;window='own-priority';
  }else throw Error('Enemy Controller setado exige prioridade própria ou janela de resposta válida.');
  if(state.members[sourceOwnerSeat]?.team!==team)
    throw Error('Carta setada não pertence fisicamente a um membro da equipe controladora.');
  return {sourceOwnerSeat,controllerSeat:seat,controllerTeam,sourceZone:'backrow',window};
}
function isFaceUpOpponentMonster(state:EnemyControllerState,team:Team,uid:string,lookup:Lookup):Monster|undefined{
  const opponent=(1-team) as Team,match=state.core.players[opponent].monsters.find(card=>card.uid===uid);
  if(!match||match.faceUp!==true||lookup(match.id)?.kind!=='monster')return;
  return match;
}
function isTributeCandidate(state:EnemyControllerState,team:Team,uid:string,lookup:Lookup):Monster|undefined{
  const match=state.core.players[team].monsters.find(card=>card.uid===uid);
  if(!match||match.entityKind==='token'||lookup(match.id)?.kind!=='monster')return;
  return match;
}
function pendingActivation(state:EnemyControllerState,id:string):PendingActivation{
  if(!validActivationId(id))throw Error('activationId Enemy Controller inválido.');
  const pending=state.enemyController?.pending?.[id];
  if(!pending)throw Error('Ativação Enemy Controller ausente, resolvida ou obsoleta.');
  if(state.core.turn!==pending.turn||state.active[pending.controllerTeam]!==pending.controllerSeat)
    throw Error('Contexto de turno/representante da ativação Enemy Controller mudou.');
  return pending;
}
function moveSpellToOwnerGrave(state:EnemyControllerState,controllerTeam:Team,sourceUid:string):boolean{
  const backrow=state.core.players[controllerTeam].backrow,index=backrow.findIndex(card=>card.uid===sourceUid);
  if(index<0)return false;
  const [spell]=backrow.splice(index,1),ownerTeam=(physicalSeat(spell.uid)%2) as Team;
  state.core.players[ownerTeam].grave.push(spell);
  return true;
}
function tributeToOwnerGrave(state:EnemyControllerState,team:Team,tributeUid:string):boolean{
  const monsters=state.core.players[team].monsters,index=monsters.findIndex(card=>card.uid===tributeUid);
  if(index<0)return false;
  const [monster]=monsters.splice(index,1),ownerTeam=(physicalSeat(monster.uid)%2) as Team;
  state.core.players[ownerTeam].grave.push(monster);
  return true;
}
function removeSourceAndFinalize(next:EnemyControllerState,pending:PendingActivation):void{
  moveSpellToOwnerGrave(next,pending.controllerTeam,pending.sourceUid);
  synchronizeCardLifetimes(next.core);
  assertState(next);
}

/** Only face-up monsters controlled by the opposing team are valid targets. */
export function getEnemyControllerTargetCandidates(
  state:EnemyControllerState,team:Team,lookup:Lookup=cardLookup
):string[]{
  assertState(state);
  return state.core.players[1-team].monsters.filter(monster=>monster.faceUp===true&&lookup(monster.id)?.kind==='monster')
    .map(monster=>monster.uid);
}
/** Tokens are intentionally excluded from tribute candidates until token-ledger lifecycle is integrated. */
export function getEnemyControllerTributeCandidates(
  state:EnemyControllerState,team:Team,lookup:Lookup=cardLookup
):string[]{
  assertState(state);
  return state.core.players[team].monsters.filter(monster=>monster.entityKind!=='token'&&lookup(monster.id)?.kind==='monster')
    .map(monster=>monster.uid);
}
export function planEnemyControllerActivation(
  state:EnemyControllerState,sourceUid:string,activationId:string,mode:Mode,targetUid:string,
  tributeUid?:string,lookup:Lookup=cardLookup
):EnemyControllerActivationPlan{
  assertState(state);
  if(!validActivationId(activationId)||state.enemyController?.pending?.[activationId]||state.enemyController?.resolved?.[activationId])
    throw Error('activationId Enemy Controller inválido ou já utilizado.');
  if(mode!=='change-position'&&mode!=='take-control')throw Error('Modo Enemy Controller inválido.');
  const source=sourceContext(state,sourceUid,lookup),target=isFaceUpOpponentMonster(state,source.controllerTeam,targetUid,lookup);
  if(!target)throw Error('Enemy Controller exige alvo face-up controlado pela equipe adversária.');
  const targetBinding=bindTarget(structuredClone(state.core),targetUid);
  if(!targetBinding||targetBinding.zone!=='monsters')throw Error('Alvo Enemy Controller sem vínculo físico de campo.');
  if(mode==='change-position'&&tributeUid!==undefined)throw Error('Modo de mudança de posição não paga Tributo.');
  let tributeOwnerSeat:number|undefined;
  if(mode==='take-control'){
    if(typeof tributeUid!=='string')throw Error('Modo de controle exige Tributo de um monstro próprio.');
    const tribute=isTributeCandidate(state,source.controllerTeam,tributeUid,lookup);
    if(!tribute)throw Error('Tributo Enemy Controller deve ser monstro não-token controlado pela equipe.');
    tributeOwnerSeat=physicalSeat(tribute.uid);
    if(target.returnTo!==undefined||target.returnTurn!==undefined)
      throw Error('Alvo já possui retorno temporário de controle não suportado pelo adaptador.');
  }
  return {kind:'enemy-controller-activation',sourceUid,sourceOwnerSeat:source.sourceOwnerSeat,
    controllerSeat:source.controllerSeat,controllerTeam:source.controllerTeam,sourceZone:source.sourceZone,
    window:source.window,mode,targetUid,targetOwnerSeat:physicalSeat(targetUid),targetBinding,
    ...(tributeUid?{tributeUid,tributeOwnerSeat}:{}),turn:state.core.turn,activationId};
}
export function registerEnemyControllerActivation(
  input:EnemyControllerState,plan:EnemyControllerActivationPlan,lookup:Lookup=cardLookup
):EnemyControllerState{
  assertState(input);
  if(!plan||plan.kind!=='enemy-controller-activation'||!validActivationId(plan.activationId)||
    plan.turn!==input.core.turn||plan.targetBinding?.uid!==plan.targetUid||plan.targetBinding.zone!=='monsters')
    throw Error('Plano de ativação Enemy Controller inválido ou obsoleto.');
  const source=sourceContext(input,plan.sourceUid,lookup);
  if(source.sourceOwnerSeat!==plan.sourceOwnerSeat||source.controllerSeat!==plan.controllerSeat||
    source.controllerTeam!==plan.controllerTeam||source.sourceZone!==plan.sourceZone||source.window!==plan.window||
    input.enemyController?.pending?.[plan.activationId]||input.enemyController?.resolved?.[plan.activationId]||
    !targetBindingValid(structuredClone(input.core),plan.targetBinding)||!isFaceUpOpponentMonster(input,plan.controllerTeam,plan.targetUid,lookup))
    throw Error('Contexto, alvo ou activationId Enemy Controller mudou antes do registro.');
  if(plan.mode==='take-control'&&(!plan.tributeUid||
    !isTributeCandidate(input,plan.controllerTeam,plan.tributeUid,lookup)||
    physicalSeat(plan.tributeUid)!==plan.tributeOwnerSeat||
    (()=>{const currentTarget=isFaceUpOpponentMonster(input,plan.controllerTeam,plan.targetUid,lookup);return !currentTarget||currentTarget.returnTo!==undefined||currentTarget.returnTurn!==undefined;})()))
    throw Error('Tributo Enemy Controller mudou antes do registro.');
  if(plan.mode==='change-position'&&plan.tributeUid!==undefined)
    throw Error('Modo de posição não pode pagar Tributo.');
  const before=inventorySnapshot(input),next=structuredClone(input) as EnemyControllerState;
  const player=next.core.players[plan.controllerTeam];
  if(plan.sourceZone==='hand'){
    const index=player.hand.findIndex(card=>card.uid===plan.sourceUid);
    if(index<0||player.backrow.length>=3)throw Error('Fonte Enemy Controller deixou a mão ou zona ficou cheia.');
    const [spell]=player.hand.splice(index,1);
    const set:Backrow={...spell,setTurn:plan.turn,faceUp:true};
    player.backrow.push(set);
  }else{
    const sourceCard=player.backrow.find(card=>card.uid===plan.sourceUid);
    if(!sourceCard||sourceCard.faceUp!==false||sourceCard.setTurn>=plan.turn)
      throw Error('Enemy Controller setado não está disponível para ativação.');
    sourceCard.faceUp=true;
  }
  if(plan.mode==='take-control'&&plan.tributeUid&&!tributeToOwnerGrave(next,plan.controllerTeam,plan.tributeUid))
    throw Error('Tributo Enemy Controller deixou o campo antes do pagamento.');
  const pending={...(next.enemyController?.pending??{})};
  const activation:PendingActivation={sourceUid:plan.sourceUid,sourceOwnerSeat:plan.sourceOwnerSeat,
    controllerSeat:plan.controllerSeat,controllerTeam:plan.controllerTeam,sourceZone:plan.sourceZone,
    window:plan.window,mode:plan.mode,targetUid:plan.targetUid,targetOwnerSeat:plan.targetOwnerSeat,
    targetBinding:structuredClone(plan.targetBinding),...(plan.tributeUid?{tributeUid:plan.tributeUid,tributeOwnerSeat:plan.tributeOwnerSeat}:{}),turn:plan.turn};
  pending[plan.activationId]=activation;
  next.enemyController={pending,resolved:{...(next.enemyController?.resolved??{})}};
  synchronizeCardLifetimes(next.core);
  assertState(next);assertConserved(before,next);
  return next;
}
export function planEnemyControllerResolution(
  state:EnemyControllerState,activationId:string
):EnemyControllerResolutionPlan{
  assertState(state);
  const pending=pendingActivation(state,activationId);
  return {...pending,kind:'enemy-controller-resolution',activationId};
}
export function resolveEnemyControllerResolution(
  input:EnemyControllerState,plan:EnemyControllerResolutionPlan,effectNegated=false,lookup:Lookup=cardLookup
):{
  status:'position-changed'|'control-changed'|'negated'|'target-invalid'|'target-locked'|'no-space'|'source-missing';
  state:EnemyControllerState
}{
  assertState(input);
  if(!plan||plan.kind!=='enemy-controller-resolution')throw Error('Plano de resolução Enemy Controller inválido.');
  const pending=pendingActivation(input,plan.activationId);
  const resolution:PendingActivation={sourceUid:plan.sourceUid,sourceOwnerSeat:plan.sourceOwnerSeat,
    controllerSeat:plan.controllerSeat,controllerTeam:plan.controllerTeam,sourceZone:plan.sourceZone,
    window:plan.window,mode:plan.mode,targetUid:plan.targetUid,targetOwnerSeat:plan.targetOwnerSeat,
    targetBinding:plan.targetBinding,...(plan.tributeUid?{tributeUid:plan.tributeUid,tributeOwnerSeat:plan.tributeOwnerSeat}:{}),turn:plan.turn};
  if(JSON.stringify(resolution)!==JSON.stringify(pending))
    throw Error('Plano Enemy Controller não corresponde à ativação pendente.');
  const before=inventorySnapshot(input),sourceExists=input.core.players[pending.controllerTeam].backrow.some(card=>card.uid===pending.sourceUid);
  const next=structuredClone(input) as EnemyControllerState,pendingMap={...(next.enemyController?.pending??{})};
  delete pendingMap[plan.activationId];
  next.enemyController={pending:pendingMap,resolved:{...(next.enemyController?.resolved??{}),[plan.activationId]:true as const}};
  if(!sourceExists){
    synchronizeCardLifetimes(next.core);assertState(next);assertConserved(before,next);
    return {status:'source-missing',state:next};
  }
  if(effectNegated){
    removeSourceAndFinalize(next,pending);assertConserved(before,next);
    return {status:'negated',state:next};
  }
  const opponent=(1-pending.controllerTeam) as Team;
  const target=isFaceUpOpponentMonster(next,pending.controllerTeam,pending.targetUid,lookup);
  if(!target||!targetBindingValid(next.core,pending.targetBinding)){
    removeSourceAndFinalize(next,pending);assertConserved(before,next);
    return {status:'target-invalid',state:next};
  }
  const targetIndex=next.core.players[opponent].monsters.findIndex(card=>card.uid===pending.targetUid);
  if(targetIndex<0){
    removeSourceAndFinalize(next,pending);assertConserved(before,next);
    return {status:'target-invalid',state:next};
  }
  if(pending.mode==='change-position'){
    if((target.positionLockedThrough??0)>=pending.turn){
      removeSourceAndFinalize(next,pending);assertConserved(before,next);
      return {status:'target-locked',state:next};
    }
    const current=next.core.players[opponent].monsters[targetIndex];
    current.position=current.position==='atk'?'def':'atk';
    current.changed=pending.turn;
    removeSourceAndFinalize(next,pending);assertConserved(before,next);
    return {status:'position-changed',state:next};
  }
  if(target.returnTo!==undefined||target.returnTurn!==undefined){
    removeSourceAndFinalize(next,pending);assertConserved(before,next);
    return {status:'target-invalid',state:next};
  }
  if(next.core.players[pending.controllerTeam].monsters.length>=3){
    removeSourceAndFinalize(next,pending);assertConserved(before,next);
    return {status:'no-space',state:next};
  }
  const [controlled]=next.core.players[opponent].monsters.splice(targetIndex,1);
  const moved:Monster={...controlled,owner:physicalSeat(controlled.uid),returnTo:opponent,returnTurn:pending.turn};
  next.core.players[pending.controllerTeam].monsters.push(moved);
  removeSourceAndFinalize(next,pending);assertConserved(before,next);
  return {status:'control-changed',state:next};
}

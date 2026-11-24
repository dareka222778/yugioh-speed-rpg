import type {TagDuel} from './tagDuel';

export const DARK_SNAKE_SYNDROME_ID='47233801';
export const WAVE_MOTION_CANNON_ID='38992735';

export type StandbyBurnTeam=0|1;
export type StandbyBurnCardId=typeof DARK_SNAKE_SYNDROME_ID|typeof WAVE_MOTION_CANNON_ID;
export type StandbyBurnSource=Readonly<{
  uid:string;
  activationId:string;
  cardId:StandbyBurnCardId;
  controllerTeam:StandbyBurnTeam;
  activationTurn:number;
  passedStandbyPhases:number;
  lastStandbyTurn:number|null;
}>;
export type StandbyBurnLedger=Readonly<{
  version:1;
  processedPhaseIds:readonly string[];
  processedActionIds:readonly string[];
  sources:readonly StandbyBurnSource[];
}>;
export type StandbyBurnActivationEvent=Readonly<{
  sourceUid:string;
  activationId:string;
  cardId:StandbyBurnCardId;
  controllerMemberId:string;
  turn:number;
}>;
export type StandbyBurnPhaseEvent=Readonly<{
  phaseId:string;
  phase:'standby';
  activeMemberId:string;
  turn:number;
  currentLPByTeam:readonly [number,number];
  negatedSourceUids?:readonly string[];
}>;
export type StandbyBurnPlan=Readonly<{
  phaseId:string;
  sourceUid:string;
  activationId:string;
  controllerTeam:StandbyBurnTeam;
  targetTeam:StandbyBurnTeam;
  amount:number;
  standbyIndex:number;
  reason:'dark-snake-syndrome';
}>;
export type StandbyBurnPhaseResolution=Readonly<{
  status:'triggered'|'advanced-while-negated'|'counted'|'unchanged'|'duplicate';
  ledger:StandbyBurnLedger;
  plans:readonly StandbyBurnPlan[];
  countedSources:number;
}>;
export type WaveMotionEvent=Readonly<{
  actionId:string;
  activeMemberId:string;
  sourceUid:string;
  activationId:string;
  turn:number;
  phase:'main';
  currentLPByTeam:readonly [number,number];
  effectNegated:boolean;
}>;
export type WaveMotionPlan=Readonly<{
  actionId:string;
  sourceUid:string;
  activationId:string;
  controllerTeam:StandbyBurnTeam;
  targetTeam:StandbyBurnTeam;
  passedStandbyPhases:number;
  amount:number;
  sendToGraveAsCost:true;
  damageApplied:boolean;
  effectNegated:boolean;
  timing:'main-phase';
}>;
export type WaveMotionResolution=Readonly<{
  status:'resolved'|'negated-after-cost'|'duplicate';
  ledger:StandbyBurnLedger;
  plan:WaveMotionPlan|null;
}>;

function assertTeam(value:unknown):asserts value is StandbyBurnTeam{
  if(value!==0&&value!==1)throw new Error('Equipe 2v2 inválida para efeitos de Standby.');
}
function assertNonEmpty(value:unknown,label:string):asserts value is string{
  if(typeof value!=='string'||!value.trim())throw new Error(label+' inválido.');
}
function assertCardId(value:unknown,label:string):asserts value is StandbyBurnCardId{
  if(value!==DARK_SNAKE_SYNDROME_ID&&value!==WAVE_MOTION_CANNON_ID)throw new Error(label+' não pertence à família de dano de Standby.');
}
function assertPhysicalUid(value:unknown):asserts value is string{
  if(typeof value!=='string'||!/^m[0-3]:.+$/.test(value))throw new Error('UID físico da carta de Standby inválido.');
}
function assertLedger(ledger:StandbyBurnLedger):void{
  if(!ledger||ledger.version!==1||!Array.isArray(ledger.processedPhaseIds)||
    !Array.isArray(ledger.processedActionIds)||!Array.isArray(ledger.sources)||
    ledger.processedPhaseIds.length>8192||ledger.processedActionIds.length>8192||
    ledger.processedPhaseIds.some(id=>typeof id!=='string'||!id.trim())||
    ledger.processedActionIds.some(id=>typeof id!=='string'||!id.trim())||
    new Set(ledger.processedPhaseIds).size!==ledger.processedPhaseIds.length||
    new Set(ledger.processedActionIds).size!==ledger.processedActionIds.length||
    ledger.sources.length>64){
    throw new Error('Ledger de efeitos de Standby inválido.');
  }
  const uids=new Set<string>(),activationIds=new Set<string>();
  for(const source of ledger.sources){
    if(!source||typeof source!=='object')throw new Error('Fonte de Standby inválida.');
    assertPhysicalUid(source.uid);assertNonEmpty(source.activationId,'ID de ativação');assertCardId(source.cardId,'Identidade da fonte');
    assertTeam(source.controllerTeam);
    if(!Number.isSafeInteger(source.activationTurn)||source.activationTurn<1||
      !Number.isSafeInteger(source.passedStandbyPhases)||source.passedStandbyPhases<0||
      source.lastStandbyTurn!==null&&(!Number.isSafeInteger(source.lastStandbyTurn)||source.lastStandbyTurn<source.activationTurn)||
      uids.has(source.uid)||activationIds.has(source.activationId)){
      throw new Error('Contador ou identidade de fonte de Standby inválido.');
    }
    uids.add(source.uid);activationIds.add(source.activationId);
  }
}
function assertClassicTag(state:TagDuel):void{
  const rotation=state?.core?.teamRotation;
  if(!state||state.version!==1||state.mode!=='tag-classic'||
    !Array.isArray(state.members)||state.members.length!==4||
    !Array.isArray(state.active)||state.active.length!==2||
    !Number.isInteger(state.cursor)||state.cursor<0||state.cursor>3||
    !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||
    !rotation||!Array.isArray(rotation.active)||rotation.active.length!==2||!state.reserves){
    throw new Error('Efeito de Standby exige um duelo 2v2 clássico válido.');
  }
  if(new Set(state.members.map(member=>member.id)).size!==4||
    state.members.some((member,index)=>!member.id||member.team!==index%2)||
    state.active.some((seat,team)=>!Number.isInteger(seat)||seat<0||seat>3||seat%2!==team)||
    state.active[state.cursor%2]!==state.cursor){
    throw new Error('Assentos físicos inválidos para efeito de Standby.');
  }
  if(rotation.cursor!==state.cursor||
    rotation.active[0]!==state.active[0]||rotation.active[1]!==state.active[1]||
    JSON.stringify(rotation.reserves)!==JSON.stringify(state.reserves)||
    state.core.players.some((player,team)=>player.id!=='tag-team-'+team||
      !Number.isSafeInteger(player.lp)||player.lp<0||!Array.isArray(player.backrow))||
    state.core.current!==state.cursor%2||!Number.isSafeInteger(state.core.turn)||state.core.turn<1){
    throw new Error('Rotação, LP ou campo compartilhado inconsistente para efeito de Standby.');
  }
}
function assertActiveMember(state:TagDuel,memberId:string):{seat:number;team:StandbyBurnTeam}{
  assertNonEmpty(memberId,'Participante ativo');
  const seat=state.members.findIndex(member=>member.id===memberId);
  if(seat<0)throw new Error('Participante de Standby não encontrado.');
  const team=state.members[seat].team;
  assertTeam(team);
  if(state.core.current!==team||state.cursor!==seat||state.active[team]!==seat){
    throw new Error('Efeito de Standby exige o participante físico ativo.');
  }
  return {seat,team};
}
function assertLP(state:TagDuel,values:readonly [number,number]):void{
  if(!Array.isArray(values)||values.length!==2||
    values.some(value=>!Number.isSafeInteger(value)||value<0)||
    state.core.players[0].lp!==values[0]||state.core.players[1].lp!==values[1]){
    throw new Error('Snapshot de LP obsoleto para efeito de Standby.');
  }
}
function sourceLocations(state:TagDuel,uid:string):{team:StandbyBurnTeam;card:TagDuel['core']['players'][number]['backrow'][number]}[]{
  const result:{team:StandbyBurnTeam;card:TagDuel['core']['players'][number]['backrow'][number]}[]=[];
  for(const team of [0,1] as const){
    for(const card of state.core.players[team].backrow)if(card.uid===uid)result.push({team,card});
  }
  return result;
}
function requireSource(state:TagDuel,uid:string,cardId:StandbyBurnCardId):{team:StandbyBurnTeam;card:TagDuel['core']['players'][number]['backrow'][number]}{
  const matches=sourceLocations(state,uid);
  if(matches.length!==1||matches[0].card.id!==cardId||matches[0].card.faceUp!==true){
    throw new Error('Fonte contínua de Standby ausente, duplicada ou não está face-up.');
  }
  return matches[0];
}
function assertPhaseEvent(event:StandbyBurnPhaseEvent):void{
  assertNonEmpty(event?.phaseId,'ID da Standby Phase');assertNonEmpty(event.activeMemberId,'Participante da Standby Phase');
  if(event.phase!=='standby'||!Number.isSafeInteger(event.turn)||event.turn<1||
    !Array.isArray(event.currentLPByTeam)||event.currentLPByTeam.length!==2||
    event.currentLPByTeam.some(value=>!Number.isSafeInteger(value)||value<0)){
    throw new Error('Evento de Standby inválido.');
  }
  const negated=event.negatedSourceUids??[];
  if(!Array.isArray(negated)||negated.some(uid=>typeof uid!=='string'||!uid.trim())||new Set(negated).size!==negated.length){
    throw new Error('Lista de fontes negadas na Standby Phase inválida.');
  }
}
function assertWaveEvent(event:WaveMotionEvent):void{
  assertNonEmpty(event?.actionId,'ID da ação Wave-Motion Cannon');
  assertNonEmpty(event.activeMemberId,'Participante da ação Wave-Motion Cannon');
  assertPhysicalUid(event.sourceUid);assertNonEmpty(event.activationId,'ID de ativação Wave-Motion Cannon');
  if(event.phase!=='main'||!Number.isSafeInteger(event.turn)||event.turn<1||
    typeof event.effectNegated!=='boolean'||!Array.isArray(event.currentLPByTeam)||
    event.currentLPByTeam.length!==2||event.currentLPByTeam.some(value=>!Number.isSafeInteger(value)||value<0)){
    throw new Error('Evento de ativação Wave-Motion Cannon inválido.');
  }
}

/** A continuous Spell is registered only after its face-up activation has resolved. */
export function registerStandbyBurnSource(
  state:TagDuel,
  ledger:StandbyBurnLedger,
  event:StandbyBurnActivationEvent
):{status:'registered'|'duplicate';ledger:StandbyBurnLedger}{
  assertLedger(ledger);assertClassicTag(state);
  assertPhysicalUid(event?.sourceUid);assertNonEmpty(event.activationId,'ID de ativação');assertCardId(event.cardId,'Identidade da carta');
  assertNonEmpty(event.controllerMemberId,'Participante que ativou a carta');
  if(!Number.isSafeInteger(event.turn)||event.turn<1||event.turn!==state.core.turn||state.core.phase!=='main'){
    throw new Error('Ativação contínua fora da Main Phase ou com turno obsoleto.');
  }
  const {team}=assertActiveMember(state,event.controllerMemberId);
  const location=requireSource(state,event.sourceUid,event.cardId);
  if(location.team!==team)throw new Error('A carta contínua não pertence ao campo da equipe ativa.');
  const existing=ledger.sources.find(source=>source.uid===event.sourceUid);
  if(existing?.activationId===event.activationId){
    if(existing.cardId!==event.cardId||existing.controllerTeam!==team)throw new Error('ID de ativação reutilizado com identidade divergente.');
    return {status:'duplicate',ledger};
  }
  if(ledger.sources.some(source=>source.activationId===event.activationId&&source.uid!==event.sourceUid)){
    throw new Error('ID de ativação de Standby reutilizado por outra carta.');
  }
  const nextSources=ledger.sources.filter(source=>source.uid!==event.sourceUid);
  nextSources.push({
    uid:event.sourceUid,activationId:event.activationId,cardId:event.cardId,
    controllerTeam:team,activationTurn:event.turn,passedStandbyPhases:0,lastStandbyTurn:null
  });
  return {status:'registered',ledger:{...ledger,sources:nextSources}};
}

/**
 * Called once at the real Standby Phase boundary. Dark Snake Syndrome counts
 * even while its face-up effect is negated; the ruling still advances its
 * future damage. Wave-Motion Cannon only accumulates the passed-phase count.
 */
export function resolveStandbyBurnPhase(
  state:TagDuel,
  ledger:StandbyBurnLedger,
  event:StandbyBurnPhaseEvent
):StandbyBurnPhaseResolution{
  assertLedger(ledger);assertPhaseEvent(event);assertClassicTag(state);
  if(event.turn!==state.core.turn)throw new Error('Standby Phase pertence a outro turno.');
  const {team}=assertActiveMember(state,event.activeMemberId);
  assertLP(state,event.currentLPByTeam);
  if(ledger.processedPhaseIds.includes(event.phaseId)){
    return {status:'duplicate',ledger,plans:[],countedSources:0};
  }
  const negated=new Set(event.negatedSourceUids??[]);
  const nextSources:StandbyBurnSource[]=[];
  const plans:StandbyBurnPlan[]=[];
  let countedSources=0,negatedSources=0;
  for(const source of ledger.sources){
    const matches=sourceLocations(state,source.uid);
    if(matches.length>1)throw new Error('UID duplicado no campo compartilhado durante Standby.');
    if(matches.length===0||matches[0].card.faceUp!==true)continue;
    const location=matches[0];
    if(location.card.id!==source.cardId||location.team!==source.controllerTeam){
      throw new Error('Identidade ou controle da fonte mudou sem novo registro de ativação.');
    }
    if(source.controllerTeam!==team||event.turn<=source.activationTurn){
      nextSources.push(source);continue;
    }
    if(source.lastStandbyTurn!==null&&event.turn<=source.lastStandbyTurn){
      throw new Error('A mesma fonte já avançou nesta Standby Phase ou em turno posterior.');
    }
    const nextCount=source.passedStandbyPhases+1;
    if(!Number.isSafeInteger(nextCount))throw new Error('Contador de Standby excedeu o limite seguro.');
    if(source.cardId===DARK_SNAKE_SYNDROME_ID){
      const amount=200*2**source.passedStandbyPhases;
      if(!Number.isSafeInteger(amount))throw new Error('Dano de Dark Snake Syndrome excedeu o limite seguro.');
      if(negated.has(source.uid))negatedSources++;
      else{
        for(const targetTeam of [0,1] as const){
          plans.push({
            phaseId:event.phaseId,sourceUid:source.uid,activationId:source.activationId,
            controllerTeam:source.controllerTeam,targetTeam,amount,standbyIndex:nextCount,
            reason:'dark-snake-syndrome'
          });
        }
      }
    }
    nextSources.push({...source,passedStandbyPhases:nextCount,lastStandbyTurn:event.turn});
    countedSources++;
  }
  const nextLedger:StandbyBurnLedger={
    version:1,
    processedPhaseIds:[...ledger.processedPhaseIds,event.phaseId],
    processedActionIds:[...ledger.processedActionIds],
    sources:nextSources
  };
  assertLedger(nextLedger);
  return {
    status:plans.length?'triggered':negatedSources?'advanced-while-negated':countedSources?'counted':'unchanged',
    ledger:nextLedger,plans,countedSources
  };
}

/**
 * Wave-Motion Cannon sends itself to the GY as cost, then deals 1000 for each
 * controller Standby Phase that passed after activation. If the effect is
 * negated, the cost remains paid but no damage is planned.
 */
export function resolveWaveMotionCannon(
  state:TagDuel,
  ledger:StandbyBurnLedger,
  event:WaveMotionEvent
):WaveMotionResolution{
  assertLedger(ledger);assertWaveEvent(event);
  if(ledger.processedActionIds.includes(event.actionId)){
    return {status:'duplicate',ledger,plan:null};
  }
  assertClassicTag(state);
  if(event.turn!==state.core.turn||state.core.phase!=='main')throw new Error('Wave-Motion Cannon exige a Main Phase atual.');
  const {team}=assertActiveMember(state,event.activeMemberId);
  assertLP(state,event.currentLPByTeam);
  const source=ledger.sources.find(entry=>entry.uid===event.sourceUid);
  if(!source||source.cardId!==WAVE_MOTION_CANNON_ID||source.activationId!==event.activationId){
    throw new Error('Wave-Motion Cannon não possui registro de ativação correspondente.');
  }
  const location=requireSource(state,event.sourceUid,WAVE_MOTION_CANNON_ID);
  if(location.team!==team||source.controllerTeam!==team||event.turn<source.activationTurn){
    throw new Error('Wave-Motion Cannon não pertence ao participante/equipe ativa.');
  }
  const amount=event.effectNegated?0:1000*source.passedStandbyPhases;
  if(!Number.isSafeInteger(amount))throw new Error('Dano de Wave-Motion Cannon excedeu o limite seguro.');
  const plan:WaveMotionPlan={
    actionId:event.actionId,sourceUid:source.uid,activationId:source.activationId,
    controllerTeam:team,targetTeam:team===0?1:0,
    passedStandbyPhases:source.passedStandbyPhases,amount,
    sendToGraveAsCost:true,damageApplied:!event.effectNegated&&amount>0,
    effectNegated:event.effectNegated,timing:'main-phase'
  };
  const nextLedger:StandbyBurnLedger={
    version:1,
    processedPhaseIds:[...ledger.processedPhaseIds],
    processedActionIds:[...ledger.processedActionIds,event.actionId],
    sources:ledger.sources.filter(entry=>entry.uid!==source.uid)
  };
  assertLedger(nextLedger);
  return {status:event.effectNegated?'negated-after-cost':'resolved',ledger:nextLedger,plan};
}

export function createStandbyBurnLedger():StandbyBurnLedger{
  return {version:1,processedPhaseIds:[],processedActionIds:[],sources:[]};
}

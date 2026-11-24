import type {TagDuel} from './tagDuel';
import {getPlayableCard} from './effectRegistry';

export const NUTRIENT_Z_ID='29389368';
export const EMERGENCY_PROVISIONS_ID='53046408';
export type RecoveryTeam=0|1;
export type RecoverySourceZone='hand'|'set';
export type RecoveryPhase='main'|'battle'|'response';
export type RecoveryLedger=Readonly<{version:1;processedActionIds:readonly string[]}>;
export type RecoveryBaseEvent=Readonly<{
  actionId:string;activeMemberId:string;sourceUid:string;sourceZone:RecoverySourceZone;
  turn:number;phase:RecoveryPhase;currentLPByTeam:readonly [number,number];effectNegated:boolean;
}>;
export type NutrientZEvent=Readonly<{
  actionId:string;activeMemberId:string;sourceUid:string;turn:number;
  window:'damage-calculation';defendingTeam:RecoveryTeam;incomingBattleDamage:number;
  currentLPByTeam:readonly [number,number];effectNegated:boolean;
}>;
export type NutrientZPlan=Readonly<{
  actionId:string;sourceUid:string;controllerTeam:RecoveryTeam;targetTeam:RecoveryTeam;
  amount:number;incomingBattleDamage:number;gainApplied:boolean;replacementEligible:true;
  beforeBattleDamage:true;sourceLeavesField:true;effectNegated:boolean;timing:'damage-calculation';
}>;
export type NutrientZResolution=Readonly<{
  status:'resolved'|'negated'|'duplicate';ledger:RecoveryLedger;plan:NutrientZPlan|null;
}>;
export type EmergencyCost=Readonly<{uid:string;id:string;zone:'backrow'|'field';kind:'spell'|'trap'}>;
export type EmergencyProvisionsEvent=RecoveryBaseEvent&Readonly<{costUids:readonly string[]}>;
export type EmergencyProvisionsPlan=Readonly<{
  actionId:string;sourceUid:string;sourceZone:RecoverySourceZone;controllerTeam:RecoveryTeam;
  targetTeam:RecoveryTeam;costs:readonly EmergencyCost[];costPaid:true;costType:'send-other-spells-traps-to-grave';
  baseAmount:number;amount:number;gainApplied:boolean;replacementEligible:true;
  sourceLeavesField:true;effectNegated:boolean;timing:RecoveryPhase;
}>;
export type EmergencyProvisionsResolution=Readonly<{
  status:'resolved'|'negated-after-cost'|'duplicate';ledger:RecoveryLedger;plan:EmergencyProvisionsPlan|null;
}>;

function assertTeam(value:unknown):asserts value is RecoveryTeam{
  if(value!==0&&value!==1)throw new Error('Equipe TagDuel inválida para recuperação de LP.');
}
function assertText(value:unknown,label:string):asserts value is string{
  if(typeof value!=='string'||!value.trim())throw new Error(label+' inválido.');
}
function assertUid(value:unknown):asserts value is string{
  if(typeof value!=='string'||!/^m[0-3]:.+$/.test(value))throw new Error('UID físico inválido para recuperação de LP.');
}
function assertLedger(ledger:RecoveryLedger):void{
  if(!ledger||ledger.version!==1||!Array.isArray(ledger.processedActionIds)||
    ledger.processedActionIds.length>8192||
    ledger.processedActionIds.some(id=>typeof id!=='string'||!id.trim())||
    new Set(ledger.processedActionIds).size!==ledger.processedActionIds.length){
    throw new Error('Ledger de recuperação de LP inválido.');
  }
}
function assertTagState(state:TagDuel):void{
  const rotation=state?.core?.teamRotation;
  if(!state||state.version!==1||state.mode!=='tag-classic'||!Array.isArray(state.members)||state.members.length!==4||
    !Array.isArray(state.active)||state.active.length!==2||!Number.isInteger(state.cursor)||state.cursor<0||state.cursor>3||
    !state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||!rotation||
    !Array.isArray(rotation.active)||rotation.active.length!==2||!state.reserves){
    throw new Error('Recuperação de LP exige um TagDuel 2v2 clássico válido.');
  }
  if(new Set(state.members.map(member=>member.id)).size!==4||
    state.members.some((member,index)=>!member.id||member.team!==index%2)||
    state.active.some((seat,team)=>!Number.isInteger(seat)||seat<0||seat>3||seat%2!==team)||
    state.active[state.cursor%2]!==state.cursor||
    rotation.cursor!==state.cursor||rotation.active[0]!==state.active[0]||rotation.active[1]!==state.active[1]||
    JSON.stringify(rotation.reserves)!==JSON.stringify(state.reserves)||
    state.core.players.some((player,team)=>player.id!=='tag-team-'+team||!Number.isSafeInteger(player.lp)||player.lp<0||
      !Array.isArray(player.hand)||!Array.isArray(player.backrow))||
    state.core.current!==state.cursor%2||!Number.isSafeInteger(state.core.turn)||state.core.turn<1){
    throw new Error('Rotação, mãos privadas, LP ou zonas compartilhadas inconsistentes.');
  }
}
function decisionMember(state:TagDuel,memberId:string):{team:RecoveryTeam;seat:number}{
  assertText(memberId,'Participante com prioridade');
  const rawTeam=state.core.phase==='response'?state.core.priority:state.core.current;
  assertTeam(rawTeam);
  const seat=state.active[rawTeam];
  if(state.members[seat]?.id!==memberId)throw new Error('Participante não possui prioridade no TagDuel.');
  return {team:rawTeam,seat};
}
function assertLP(state:TagDuel,values:readonly [number,number]):void{
  if(!Array.isArray(values)||values.length!==2||values.some(v=>!Number.isSafeInteger(v)||v<0)||
    state.core.players[0].lp!==values[0]||state.core.players[1].lp!==values[1]){
    throw new Error('Snapshot de LP obsoleto para recuperação.');
  }
}
function assertBaseEvent(event:RecoveryBaseEvent):void{
  assertText(event?.actionId,'ID da ação');assertText(event.activeMemberId,'Participante');
  assertUid(event.sourceUid);
  if(event.sourceZone!=='hand'&&event.sourceZone!=='set')throw new Error('Zona da carta de recuperação inválida.');
  if(!Number.isSafeInteger(event.turn)||event.turn<1||
    !['main','battle','response'].includes(event.phase)||typeof event.effectNegated!=='boolean'||
    !Array.isArray(event.currentLPByTeam)||event.currentLPByTeam.length!==2||
    event.currentLPByTeam.some(v=>!Number.isSafeInteger(v)||v<0)){
    throw new Error('Evento de recuperação de LP inválido.');
  }
}
function findHandSource(state:TagDuel,uid:string,id:string):{team:RecoveryTeam;seat:number}{
  assertUid(uid);
  const matches:{team:RecoveryTeam;seat:number;cardId:string}[]=[];
  for(const team of [0,1] as const){
    const seat=state.active[team];
    for(const card of state.core.players[team].hand)if(card.uid===uid)matches.push({team,seat,cardId:card.id});
  }
  for(const [seatKey,reserve] of Object.entries(state.reserves)){
    const seat=Number(seatKey);
    if(!Number.isInteger(seat)||seat<0||seat>3)continue;
    for(const card of reserve.hand)if(card.uid===uid)matches.push({team:(seat%2) as RecoveryTeam,seat,cardId:card.id});
  }
  const physicalSeat=Number(uid.slice(1,2));
  if(matches.length!==1||matches[0].cardId!==id||matches[0].seat!==physicalSeat){
    throw new Error('Carta de recuperação não está em uma única mão privada válida.');
  }
  return {team:matches[0].team,seat:matches[0].seat};
}
function findSetSource(
  state:TagDuel,uid:string,id:string,turn:number,allowSameTurn:boolean
):{team:RecoveryTeam;setTurn:number}{
  const matches:{team:RecoveryTeam;card:TagDuel['core']['players'][number]['backrow'][number]}[]=[];
  for(const team of [0,1] as const)for(const card of state.core.players[team].backrow)if(card.uid===uid)matches.push({team,card});
  if(matches.length!==1||matches[0].card.id!==id||matches[0].card.faceUp!==false||
    !Number.isSafeInteger(matches[0].card.setTurn)||
    (allowSameTurn?matches[0].card.setTurn>turn:matches[0].card.setTurn>=turn)){
    throw new Error('Carta de recuperação não está setada em zona válida ou ainda não pode ser ativada.');
  }
  return {team:matches[0].team,setTurn:matches[0].card.setTurn};
}
function assertSourceCardId(id:string,expected:string):void{
  if(id!==expected)throw new Error('Passcode da carta de recuperação divergente.');
}
function spellTrapKind(id:string):'spell'|'trap'{
  const card=getPlayableCard(id);
  if(!card||(card.kind!=='spell'&&card.kind!=='trap')){
    throw new Error('Custo contém carta que não é Magia/Armadilha certificada.');
  }
  return card.kind;
}
function locateCost(state:TagDuel,team:RecoveryTeam,uid:string):EmergencyCost{
  assertUid(uid);
  const player=state.core.players[team];
  const backrow=player.backrow.filter(card=>card.uid===uid);
  const field=player.field&&player.field.uid===uid?[player.field]:[];
  if(backrow.length+field.length!==1)throw new Error('Custo de Provisões de Emergência ausente, duplicado ou fora do controle da equipe.');
  const card=backrow[0]??field[0];
  if(!card)throw new Error('Custo de recuperação ausente.');
  const metadata=getPlayableCard(card.id);
  const kind=spellTrapKind(card.id);
  if(field.length&&metadata?.field!==true){
    throw new Error('Zona de Campo exige uma Magia de Campo certificada.');
  }
  return {uid,id:card.id,zone:field.length?'field':'backrow',kind};
}
function consumeAction(ledger:RecoveryLedger,actionId:string):RecoveryLedger{
  const next={version:1 as const,processedActionIds:[...ledger.processedActionIds,actionId]};
  assertLedger(next);
  return next;
}

/** Nutrient Z gains 4000 LP during Damage Calculation before the pending battle damage. */
export function resolveNutrientZ(
  state:TagDuel,ledger:RecoveryLedger,event:NutrientZEvent
):NutrientZResolution{
  assertLedger(ledger);assertTagState(state);
  assertText(event?.actionId,'ID da ação Nutrient Z');assertText(event.activeMemberId,'Participante defensor');
  assertUid(event.sourceUid);assertTeam(event.defendingTeam);
  if(event.window!=='damage-calculation'||!Number.isSafeInteger(event.turn)||event.turn!==state.core.turn||
    !Number.isSafeInteger(event.incomingBattleDamage)||event.incomingBattleDamage<2000||
    typeof event.effectNegated!=='boolean'){
    throw new Error('Nutrient Z exige dano de batalha iminente de pelo menos 2000 durante o cálculo de dano.');
  }
  if(ledger.processedActionIds.includes(event.actionId))return {status:'duplicate',ledger,plan:null};
  if(state.core.phase!=='response'||state.core.current===event.defendingTeam){
    throw new Error('Nutrient Z só responde ao cálculo de dano recebido pela equipe defensora.');
  }
  const decision=decisionMember(state,event.activeMemberId);
  if(decision.team!==event.defendingTeam||state.core.priority!==event.defendingTeam){
    throw new Error('Nutrient Z exige prioridade da equipe que receberá o dano.');
  }
  assertLP(state,event.currentLPByTeam);
  const location=findSetSource(state,event.sourceUid,NUTRIENT_Z_ID,event.turn,false);
  if(location.team!==event.defendingTeam)throw new Error('Nutrient Z setada não pertence à equipe que receberá o dano.');
  const plan:NutrientZPlan={
    actionId:event.actionId,sourceUid:event.sourceUid,controllerTeam:event.defendingTeam,
    targetTeam:event.defendingTeam,amount:event.effectNegated?0:4000,
    incomingBattleDamage:event.incomingBattleDamage,gainApplied:!event.effectNegated,
    replacementEligible:true,beforeBattleDamage:true,sourceLeavesField:true,
    effectNegated:event.effectNegated,timing:'damage-calculation'
  };
  return {status:event.effectNegated?'negated':'resolved',ledger:consumeAction(ledger,event.actionId),plan};
}

/**
 * Emergency Provisions pays by sending any number of other controlled S/T cards
 * to the GY. Costs remain paid if the activated effect is negated.
 */
export function resolveEmergencyProvisions(
  state:TagDuel,ledger:RecoveryLedger,event:EmergencyProvisionsEvent
):EmergencyProvisionsResolution{
  assertLedger(ledger);assertBaseEvent(event);assertTagState(state);
  if(ledger.processedActionIds.includes(event.actionId))return {status:'duplicate',ledger,plan:null};
  if(event.turn!==state.core.turn||event.phase!==state.core.phase){
    throw new Error('Emergency Provisions recebeu uma janela/turno obsoleto.');
  }
  const decision=decisionMember(state,event.activeMemberId);
  assertLP(state,event.currentLPByTeam);
  let controllerTeam:RecoveryTeam;
  if(event.sourceZone==='hand'){
    const handSource=findHandSource(state,event.sourceUid,EMERGENCY_PROVISIONS_ID);
    if(state.core.current!==handSource.team)throw new Error('Quick-Play Spell da mão não pode ser ativada no turno adversário.');
    if(decision.team!==handSource.team||decision.seat!==handSource.seat){
      throw new Error('Quick-Play Spell exige a mão privada do participante com prioridade.');
    }
    controllerTeam=handSource.team;
  }else{
    const location=findSetSource(state,event.sourceUid,EMERGENCY_PROVISIONS_ID,event.turn,false);
    controllerTeam=location.team;
    if(controllerTeam!==decision.team)throw new Error('Quick-Play Spell setada não pertence à equipe com prioridade.');
  }
  if(!Array.isArray(event.costUids)||event.costUids.some(uid=>typeof uid!=='string'||!uid.trim())||
    new Set(event.costUids).size!==event.costUids.length||event.costUids.includes(event.sourceUid)){
    throw new Error('Lista de custos de Emergency Provisions inválida.');
  }
  const costs=event.costUids.map(uid=>locateCost(state,controllerTeam,uid));
  const baseAmount=1000*costs.length;
  if(!Number.isSafeInteger(baseAmount))throw new Error('Recuperação de LP excedeu o limite seguro.');
  const plan:EmergencyProvisionsPlan={
    actionId:event.actionId,sourceUid:event.sourceUid,sourceZone:event.sourceZone,
    controllerTeam,targetTeam:controllerTeam,costs,costPaid:true,
    costType:'send-other-spells-traps-to-grave',baseAmount,
    amount:event.effectNegated?0:baseAmount,gainApplied:!event.effectNegated&&baseAmount>0,
    replacementEligible:true,sourceLeavesField:true,effectNegated:event.effectNegated,timing:event.phase
  };
  return {
    status:event.effectNegated?'negated-after-cost':'resolved',
    ledger:consumeAction(ledger,event.actionId),plan
  };
}

export function createRecoveryLedger():RecoveryLedger{
  return {version:1,processedActionIds:[]};
}

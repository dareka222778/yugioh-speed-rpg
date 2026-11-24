import type {TagDuel} from './tagDuel';

export const ATTACK_AND_RECEIVE_ID='63689843';
export type AttackReceiveTeam=0|1;
export type DamageReceiptEvent=Readonly<{
  eventId:string;
  damagedTeam:AttackReceiveTeam;
  lpBefore:number;
  lpAfter:number;
  damage:number;
  cause:'battle'|'effect'|'other';
  resolved:true;
}>;
export type AttackReceiveLedger=Readonly<{version:1;processedActivations:readonly string[]}>;
export type AttackReceiveDamagePacket=Readonly<{
  sourceUid:string;
  damageEventId:string;
  amount:number;
  targetTeam:AttackReceiveTeam;
  priorCopiesInGraveyard:number;
}>;
export type AttackReceiveResult=Readonly<{
  status:'resolved'|'negated'|'duplicate';
  ledger:AttackReceiveLedger;
  packet:AttackReceiveDamagePacket|null;
}>;

function assertClassicTag(state:TagDuel):void{
  if(!state||state.mode!=='tag-classic'||!state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||!state.core.teamRotation||!Array.isArray(state.members)||state.members.length!==4){
    throw new Error('Attack and Receive exige um duelo 2v2 clássico válido.');
  }
}
function assertTeam(value:unknown):asserts value is AttackReceiveTeam{
  if(value!==0&&value!==1)throw new Error('Equipe 2v2 inválida.');
}
function assertUid(value:unknown):asserts value is string{
  if(typeof value!=='string'||!value.trim())throw new Error('UID de Attack and Receive inválido.');
}
function assertLedger(ledger:AttackReceiveLedger):void{
  if(!ledger||ledger.version!==1||!Array.isArray(ledger.processedActivations)||ledger.processedActivations.some(key=>typeof key!=='string'||!key)||new Set(ledger.processedActivations).size!==ledger.processedActivations.length){
    throw new Error('Ledger de Attack and Receive inválido.');
  }
}
export function createAttackReceiveLedger():AttackReceiveLedger{return {version:1,processedActivations:[]};}

/**
 * Resolves one activated copy after a real LP-damage event. The current Trap is
 * still in the backrow during resolution, so only earlier copies in the team's
 * shared Graveyard count toward the additional 300 damage.
 */
export function resolveAttackAndReceive(
  state:TagDuel,
  ledger:AttackReceiveLedger,
  team:AttackReceiveTeam,
  sourceUid:string,
  event:DamageReceiptEvent,
  negation:{activation?:boolean;effect?:boolean}={}
):AttackReceiveResult{
  assertClassicTag(state);assertLedger(ledger);assertTeam(team);assertUid(sourceUid);
  assertUid(event?.eventId);
  if(!event||event.resolved!==true||!['battle','effect','other'].includes(event.cause)||!Number.isSafeInteger(event.lpBefore)||!Number.isSafeInteger(event.lpAfter)||!Number.isSafeInteger(event.damage)||event.lpBefore<0||event.lpAfter<0||event.damage<=0||event.lpBefore-event.lpAfter!==event.damage){
    throw new Error('Attack and Receive exige dano real de LP já resolvido.');
  }
  if(event.damagedTeam!==team)throw new Error('Attack and Receive só pode responder ao dano recebido pela própria equipe.');
  if(state.core.players[team].lp!==event.lpAfter)throw new Error('Evento de dano de Attack and Receive está obsoleto ou diverge do LP atual.');
  if(state.core.phase==='finished')throw new Error('Duelo encerrado antes da ativação de Attack and Receive.');
  if(negation.activation===true&&negation.effect===true)throw new Error('Ativação e efeito não podem ser negados simultaneamente neste snapshot.');
  const sources=state.core.players[team].backrow.filter(card=>card.uid===sourceUid&&card.id===ATTACK_AND_RECEIVE_ID&&card.faceUp===true);
  if(sources.length!==1)throw new Error('Attack and Receive precisa estar face-up na Zona de Magias/Armadilhas da equipe.');
  const activationKey=event.eventId+':'+sourceUid;
  if(ledger.processedActivations.includes(activationKey))return {status:'duplicate',ledger,packet:null};
  const grave=state.core.players[team].grave.filter(card=>card.id===ATTACK_AND_RECEIVE_ID);
  const graveUids=grave.map(card=>card.uid);
  if(graveUids.some(uid=>typeof uid!=='string'||!uid)||new Set(graveUids).size!==graveUids.length)throw new Error('Cemitério compartilhado contém cópias de Attack and Receive com UID duplicado.');
  const next:AttackReceiveLedger={version:1,processedActivations:[...ledger.processedActivations,activationKey]};
  if(negation.activation===true||negation.effect===true)return {status:'negated',ledger:next,packet:null};
  const priorCopies=grave.length;
  const amount=700+300*priorCopies;
  if(!Number.isSafeInteger(amount))throw new Error('Dano de Attack and Receive fora do intervalo seguro.');
  return {status:'resolved',ledger:next,packet:{sourceUid,damageEventId:event.eventId,amount,targetTeam:(1-team) as AttackReceiveTeam,priorCopiesInGraveyard:priorCopies}};
}

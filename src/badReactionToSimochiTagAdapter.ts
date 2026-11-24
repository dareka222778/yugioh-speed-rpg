import type {TagDuel} from './tagDuel';

export const BAD_REACTION_TO_SIMOCHI_ID='40633297';
export type SimochiTeam=0|1;
export type LpGainEvent=Readonly<{
  eventId:string;
  targetTeam:SimochiTeam;
  currentLP:number;
  proposedGain:number;
  cause:'effect'|'battle'|'cost'|'other';
  resolved:boolean;
  effectNegated:boolean;
  negatedSourceUids?:readonly string[];
}>;
export type SimochiLedger=Readonly<{version:1;processedEventIds:readonly string[]}>;
export type SimochiReplacement=Readonly<{
  eventId:string;
  outcome:'gain'|'damage'|'none';
  targetTeam:SimochiTeam;
  amount:number;
  sourceUids:readonly string[];
}>;
export type SimochiResolution=Readonly<{
  status:'converted'|'unchanged'|'not-applicable'|'no-gain'|'duplicate';
  ledger:SimochiLedger;
  replacement:SimochiReplacement|null;
}>;

function assertClassicTag(state:TagDuel):void{
  if(!state||state.mode!=='tag-classic'||!state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||!state.core.teamRotation||!Array.isArray(state.members)||state.members.length!==4){
    throw new Error('Bad Reaction to Simochi exige um duelo 2v2 clássico válido.');
  }
}
function assertTeam(value:unknown):asserts value is SimochiTeam{
  if(value!==0&&value!==1)throw new Error('Equipe 2v2 inválida.');
}
function assertUid(value:unknown):asserts value is string{
  if(typeof value!=='string'||!value.trim())throw new Error('ID do evento de LP inválido.');
}
function assertLedger(ledger:SimochiLedger):void{
  if(!ledger||ledger.version!==1||!Array.isArray(ledger.processedEventIds)||ledger.processedEventIds.some(id=>typeof id!=='string'||!id)||new Set(ledger.processedEventIds).size!==ledger.processedEventIds.length){
    throw new Error('Ledger de Bad Reaction to Simochi inválido.');
  }
}
export function createSimochiLedger():SimochiLedger{return {version:1,processedEventIds:[]};}

/**
 * Replaces a resolved LP-gain effect for one team when the opposing team
 * controls at least one face-up Bad Reaction to Simochi. Copies are not
 * cumulative: one or more active copies convert the gain exactly once.
 * The adapter returns a replacement plan and never mutates LP itself.
 */
export function resolveSimochiLpGain(
  state:TagDuel,
  ledger:SimochiLedger,
  event:LpGainEvent
):SimochiResolution{
  assertClassicTag(state);assertLedger(ledger);
  assertUid(event?.eventId);assertTeam(event.targetTeam);
  if(!event||!Number.isSafeInteger(event.currentLP)||event.currentLP<=0||!Number.isSafeInteger(event.proposedGain)||event.proposedGain<0||typeof event.resolved!=='boolean'||typeof event.effectNegated!=='boolean'||!['effect','battle','cost','other'].includes(event.cause)||!Array.isArray(event.negatedSourceUids??[])){
    throw new Error('Evento de ganho de LP inválido para Bad Reaction to Simochi.');
  }
  if(state.core.players[event.targetTeam].lp!==event.currentLP)throw new Error('Snapshot de LP obsoleto para Bad Reaction to Simochi.');
  if(ledger.processedEventIds.includes(event.eventId))return {status:'duplicate',ledger,replacement:null};
  const next:SimochiLedger={version:1,processedEventIds:[...ledger.processedEventIds,event.eventId]};
  if(event.cause!=='effect')return {status:'not-applicable',ledger:next,replacement:null};
  if(!event.resolved||event.effectNegated||event.proposedGain===0)return {status:'no-gain',ledger:next,replacement:null};
  const controllerTeam=(1-event.targetTeam) as SimochiTeam;
  const active=state.core.players[controllerTeam].backrow.filter(card=>card.id===BAD_REACTION_TO_SIMOCHI_ID&&card.faceUp===true);
  const sourceUids=active.map(card=>card.uid);
  if(sourceUids.some(uid=>typeof uid!=='string'||!uid)||new Set(sourceUids).size!==sourceUids.length)throw new Error('UID duplicado ou ausente de Bad Reaction to Simochi.');
  const negated=new Set(event.negatedSourceUids??[]);
  const effective=sourceUids.filter(uid=>!negated.has(uid));
  if(!effective.length)return {
    status:'unchanged',ledger:next,
    replacement:{eventId:event.eventId,outcome:'gain',targetTeam:event.targetTeam,amount:event.proposedGain,sourceUids:[]}
  };
  return {
    status:'converted',ledger:next,
    replacement:{eventId:event.eventId,outcome:'damage',targetTeam:event.targetTeam,amount:event.proposedGain,sourceUids:effective}
  };
}

import type {TagDuel} from './tagDuel';

export const BACKFIRE_ID='82705573';
export const BALLOON_LIZARD_ID='39892082';
export type TagTeam=0|1;

export type BackfireDestroyedMonster=Readonly<{
  uid:string;
  id:string;
  controllerTeam:TagTeam;
  attribute:string;
  wasFaceUp:boolean;
  from:'monster-zone';
  destination:'grave'|'banished'|'other';
}>;
export type BackfireEvent=Readonly<{
  eventId:string;
  cause:'battle'|'effect'|'other';
  destroyed:readonly BackfireDestroyedMonster[];
  negatedSourceUids?:readonly string[];
}>;
export type BackfireLedger=Readonly<{version:1;processedEventIds:readonly string[]}>;
export type BackfireDamagePacket=Readonly<{
  sourceUid:string;
  eventId:string;
  amount:500;
  targetTeam:TagTeam;
  destroyedUids:readonly string[];
}>;
export type BackfireResolution=Readonly<{ledger:BackfireLedger;packets:readonly BackfireDamagePacket[]}>;

export type BalloonLizardLedger=Readonly<{
  version:1;
  counters:Readonly<Record<string,Readonly<{count:number;lastStandbyTurn:number}>>>;
  processedDestructionEventIds:readonly string[];
}>;
export type BalloonStandbyEvent=Readonly<{
  kind:'standby';
  phase:'standby';
  turn:number;
  team:TagTeam;
  sourceUid:string;
}>;
export type BalloonStandbyResult=Readonly<{
  status:'counter-added'|'duplicate'|'not-present'|'face-down';
  ledger:BalloonLizardLedger;
  counters:number;
}>;
export type BalloonDestroyedEvent=Readonly<{
  eventId:string;
  sourceUid:string;
  destroyedCardId:string;
  destroyed:true;
  destination:'grave'|'banished'|'other';
  destroyerUid:string;
  destroyerTeam:TagTeam;
  effectNegatedAtResolution:boolean;
}>;
export type BalloonDestructionResult=Readonly<{
  status:'resolved'|'negated'|'duplicate';
  sourceUid:string;
  destroyerUid:string;
  targetTeam:TagTeam;
  counters:number;
  damage:number;
  ledger:BalloonLizardLedger;
}>;

function assertClassicTag(state:TagDuel):void{
  if(!state||state.mode!=='tag-classic'||!state.core||!Array.isArray(state.core.players)||state.core.players.length!==2||!state.core.teamRotation||!Array.isArray(state.members)||state.members.length!==4){
    throw new Error('Efeito exige um duelo 2v2 clássico válido.');
  }
}
function assertTeam(value:unknown):asserts value is TagTeam{
  if(value!==0&&value!==1)throw new Error('Equipe 2v2 inválida.');
}
function assertUid(value:unknown,label:string):asserts value is string{
  if(typeof value!=='string'||!value.trim())throw new Error(label+' inválido.');
}
function assertBackfireLedger(ledger:BackfireLedger):void{
  if(!ledger||ledger.version!==1||!Array.isArray(ledger.processedEventIds)||ledger.processedEventIds.some(id=>typeof id!=='string'||!id)||new Set(ledger.processedEventIds).size!==ledger.processedEventIds.length){
    throw new Error('Ledger de Backfire inválido.');
  }
}
function assertBalloonLedger(ledger:BalloonLizardLedger):void{
  if(!ledger||ledger.version!==1||!ledger.counters||typeof ledger.counters!=='object'||Array.isArray(ledger.counters)||!Array.isArray(ledger.processedDestructionEventIds)||ledger.processedDestructionEventIds.some(id=>typeof id!=='string'||!id)||new Set(ledger.processedDestructionEventIds).size!==ledger.processedDestructionEventIds.length){
    throw new Error('Ledger de Balloon Lizard inválido.');
  }
  for(const [uid,entry] of Object.entries(ledger.counters)){
    assertUid(uid,'UID de Balloon Lizard');
    if(!entry||!Number.isSafeInteger(entry.count)||entry.count<0||!Number.isSafeInteger(entry.lastStandbyTurn)||entry.lastStandbyTurn<1){
      throw new Error('Contadores de Balloon Lizard inválidos.');
    }
  }
}
export function createBackfireLedger():BackfireLedger{return {version:1,processedEventIds:[]};}
export function createBalloonLizardLedger():BalloonLizardLedger{return {version:1,counters:{},processedDestructionEventIds:[]};}

/**
 * Resolve one destruction event for one team. Several FIRE monsters destroyed
 * together still make one 500-damage trigger per face-up Backfire copy.
 * Battle and effect destruction are both accepted; the destroyed snapshot must
 * prove that the monster was face-up and actually sent to the GY.
 */
export function resolveBackfireEvent(
  state:TagDuel,
  ledger:BackfireLedger,
  team:TagTeam,
  event:BackfireEvent
):BackfireResolution{
  assertClassicTag(state);assertTeam(team);assertBackfireLedger(ledger);
  assertUid(event?.eventId,'ID do evento');
  if(!event||!['battle','effect','other'].includes(event.cause)||!Array.isArray(event.destroyed)||!Array.isArray(event.negatedSourceUids??[])){
    throw new Error('Evento de destruição de Backfire inválido.');
  }
  const destroyedUids=event.destroyed.map(row=>row?.uid);
  if(destroyedUids.some(uid=>typeof uid!=='string'||!uid)||new Set(destroyedUids).size!==destroyedUids.length){
    throw new Error('Evento de Backfire contém UIDs ausentes ou duplicados.');
  }
  for(const row of event.destroyed){
    assertTeam(row.controllerTeam);
    if(typeof row.id!=='string'||!row.id||typeof row.attribute!=='string'||typeof row.wasFaceUp!=='boolean'||row.from!=='monster-zone'||!['grave','banished','other'].includes(row.destination)){
      throw new Error('Snapshot de monstro destruído inválido para Backfire.');
    }
  }
  if(ledger.processedEventIds.includes(event.eventId))return {ledger,packets:[]};
  const qualifying=event.destroyed.filter(row=>row.controllerTeam===team&&row.wasFaceUp&&row.attribute==='FIRE'&&row.from==='monster-zone'&&row.destination==='grave');
  const negated=new Set(event.negatedSourceUids??[]);
  const sources=state.core.players[team].backrow.filter(card=>card.id===BACKFIRE_ID&&card.faceUp===true);
  const sourceUids=sources.map(card=>card.uid);
  if(new Set(sourceUids).size!==sourceUids.length)throw new Error('UID duplicado de Backfire no campo.');
  const packets:BackfireDamagePacket[]=qualifying.length?sources.filter(card=>!negated.has(card.uid)).map(card=>({
    sourceUid:card.uid,eventId:event.eventId,amount:500,targetTeam:(1-team) as TagTeam,destroyedUids:qualifying.map(row=>row.uid)
  })):[];
  return {ledger:{version:1,processedEventIds:[...ledger.processedEventIds,event.eventId]},packets};
}

export function recordBalloonLizardStandby(
  state:TagDuel,
  ledger:BalloonLizardLedger,
  event:BalloonStandbyEvent
):BalloonStandbyResult{
  assertClassicTag(state);assertBalloonLedger(ledger);
  if(!event||event.kind!=='standby'||event.phase!=='standby'||!Number.isSafeInteger(event.turn)||event.turn<1){
    throw new Error('Evento de Standby de Balloon Lizard inválido.');
  }
  assertTeam(event.team);assertUid(event.sourceUid,'UID de Balloon Lizard');
  if(event.turn!==state.core.turn||event.team!==state.core.current)throw new Error('Standby de Balloon Lizard obsoleto ou fora da equipe ativa.');
  const matches=state.core.players[event.team].monsters.filter(monster=>monster.uid===event.sourceUid&&monster.id===BALLOON_LIZARD_ID);
  if(matches.length>1)throw new Error('Balloon Lizard duplicado na Zona de Monstros.');
  if(!matches.length)return {status:'not-present',ledger,counters:ledger.counters[event.sourceUid]?.count??0};
  if(matches[0].faceUp!==true)return {status:'face-down',ledger,counters:ledger.counters[event.sourceUid]?.count??0};
  const previous=ledger.counters[event.sourceUid];
  if(previous&&event.turn<previous.lastStandbyTurn)throw new Error('Standby de Balloon Lizard fora de ordem.');
  if(previous?.lastStandbyTurn===event.turn)return {status:'duplicate',ledger,counters:previous.count};
  const count=(previous?.count??0)+1;
  const next:BalloonLizardLedger={...ledger,counters:{...ledger.counters,[event.sourceUid]:{count,lastStandbyTurn:event.turn}}};
  return {status:'counter-added',ledger:next,counters:count};
}

/** Counters disappear as soon as the physical card leaves either Monster Zone. */
export function reconcileBalloonLizardLedger(state:TagDuel,ledger:BalloonLizardLedger):BalloonLizardLedger{
  assertClassicTag(state);assertBalloonLedger(ledger);
  const onField=new Set(state.core.players.flatMap(player=>player.monsters.filter(monster=>monster.id===BALLOON_LIZARD_ID).map(monster=>monster.uid)));
  const counters=Object.fromEntries(Object.entries(ledger.counters).filter(([uid])=>onField.has(uid)));
  if(Object.keys(counters).length===Object.keys(ledger.counters).length)return ledger;
  return {...ledger,counters};
}

function uidExistsAnywhere(state:TagDuel,uid:string):boolean{
  for(const player of state.core.players){
    const zones=[player.deck,player.hand,player.monsters,player.backrow,player.grave,player.extra??[],player.banished??[]];
    if(zones.some(zone=>zone.some(card=>card.uid===uid))||player.field?.uid===uid)return true;
  }
  for(const reserve of Object.values(state.reserves??{})){
    if([reserve.deck,reserve.hand,reserve.extra??[]].some(zone=>zone.some(card=>card.uid===uid)))return true;
  }
  return false;
}
function fieldController(state:TagDuel,uid:string):TagTeam|undefined{
  const teams:TagTeam[]=[];
  state.core.players.forEach((player,index)=>{
    if(player.monsters.some(card=>card.uid===uid)||player.backrow.some(card=>card.uid===uid)||player.field?.uid===uid)teams.push(index as TagTeam);
  });
  if(teams.length>1)throw new Error('Carta destruidora aparece em mais de uma zona de campo.');
  return teams[0];
}

/**
 * Produces the Balloon Lizard damage packet. The destroying card's controller
 * is snapshotted by the event at destruction time; if that card remains on the
 * shared field, its current team is cross-checked against the snapshot.
 */
export function resolveBalloonLizardDestruction(
  state:TagDuel,
  ledger:BalloonLizardLedger,
  event:BalloonDestroyedEvent
):BalloonDestructionResult{
  assertClassicTag(state);assertBalloonLedger(ledger);
  assertUid(event?.eventId,'ID do evento');assertUid(event?.sourceUid,'UID de Balloon Lizard');
  assertUid(event?.destroyerUid,'UID da carta destruidora');assertTeam(event.destroyerTeam);
  if(!event||event.destroyed!==true||event.destroyedCardId!==BALLOON_LIZARD_ID||!['grave','banished','other'].includes(event.destination)||typeof event.effectNegatedAtResolution!=='boolean'){
    throw new Error('Evento de destruição de Balloon Lizard inválido.');
  }
  if(event.sourceUid===event.destroyerUid)throw new Error('Balloon Lizard não pode destruir a si própria.');
  if(state.core.players.some(player=>player.monsters.some(monster=>monster.uid===event.sourceUid))){
    throw new Error('Balloon Lizard ainda está no campo; evento de destruição obsoleto.');
  }
  if(!uidExistsAnywhere(state,event.destroyerUid))throw new Error('Carta destruidora não encontrada no inventário do duelo.');
  const currentController=fieldController(state,event.destroyerUid);
  if(currentController!==undefined&&currentController!==event.destroyerTeam)throw new Error('Equipe da carta destruidora diverge do snapshot do evento.');
  if(ledger.processedDestructionEventIds.includes(event.eventId)){
    return {status:'duplicate',sourceUid:event.sourceUid,destroyerUid:event.destroyerUid,targetTeam:event.destroyerTeam,counters:0,damage:0,ledger};
  }
  const counters=ledger.counters[event.sourceUid]?.count??0;
  const damage=event.effectNegatedAtResolution?0:counters*400;
  const nextCounters={...ledger.counters};delete nextCounters[event.sourceUid];
  const next:BalloonLizardLedger={...ledger,counters:nextCounters,processedDestructionEventIds:[...ledger.processedDestructionEventIds,event.eventId]};
  return {status:event.effectNegatedAtResolution?'negated':'resolved',sourceUid:event.sourceUid,destroyerUid:event.destroyerUid,targetTeam:event.destroyerTeam,counters,damage,ledger:next};
}

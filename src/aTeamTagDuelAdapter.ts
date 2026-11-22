import type {TagDuel} from './tagDuel';
import {
 A_TEAM_TRAP_DISPOSAL_UNIT_ID,
 prepareATeamTrapDisposal,
 resolveATeamTrapDisposal,
 type DuelSeat,
 type TrapDisposalSource,
 type TrapActivationSnapshot,
 type TrapDisposalEvaluation,
 type TrapDisposalOffer,
 type TrapDisposalResolution,
} from './aTeamTrapDisposal';

export type TagCardKind='monster'|'spell'|'trap';
export type TagActivationSpeed=1|2|3;
export type TagCardKindLookup=(id:string)=>TagCardKind|undefined;
export type TagActivationSpeedLookup=(id:string)=>TagActivationSpeed;

function physicalSeat(uid:string):DuelSeat{
 const match=/^m([0-3]):/.exec(uid);
 if(!match)throw new TypeError('UID não contém o assento físico de origem.');
 return Number(match[1]) as DuelSeat;
}

function assertActiveSeat(s:TagDuel,team:0|1,activeSeat:number):void{
 if(s.active[team]!==activeSeat)throw new Error('O assento físico não é o representante ativo da equipe.');
}

function sourceSnapshot(s:TagDuel,team:0|1,sourceUid:string):TrapDisposalSource|undefined{
 const monsters=s.core.players[team].monsters;
 const zoneSlot=monsters.findIndex(card=>card.uid===sourceUid);
 if(zoneSlot<0)return undefined;
 if(zoneSlot>2)throw new Error('A-Team não está em uma das três Monster Zones compartilhadas.');
 const card=monsters[zoneSlot] as typeof monsters[number]&{effectNegatedAtResolution?:boolean;effectNegated?:boolean};
 return {
  uid:card.uid,
  cardId:card.id,
  physicalOwnerSeat:physicalSeat(card.uid),
  controllerSeat:s.active[team] as DuelSeat,
  location:'monster',
  zoneSlot:zoneSlot as 0|1|2,
  faceUp:card.faceUp===true,
  effectNegated:card.effectNegatedAtResolution===true||card.effectNegated===true,
 };
}

function activationSnapshot(
 s:TagDuel,
 getCardKind:TagCardKindLookup,
 getActivationSpeed:TagActivationSpeedLookup,
):TrapActivationSnapshot|undefined{
 const pending=s.core.pending;
 if(pending.kind!=='spell'||(pending.actor!==0&&pending.actor!==1))return undefined;
 const controllerTeam=pending.actor as 0|1;
 const player=s.core.players[controllerTeam];
 const location=player.backrow.some(card=>card.uid===pending.card)?'field':
  player.hand.some(card=>card.uid===pending.card)?'hand':undefined;
 if(!location)return undefined;
 return {
  uid:pending.card,
  activationId:[s.core.turn,s.core.chain.length,pending.card,pending.id].join(':'),
  cardId:pending.id,
  physicalOwnerSeat:physicalSeat(pending.card),
  controllerSeat:s.active[controllerTeam] as DuelSeat,
  kind:getCardKind(pending.id)??'spell',
  location,
  status:s.core.pendingNegated?'negated':'pending',
  chainWindowOpen:s.core.phase==='response',
  activationSpeed:getActivationSpeed(pending.id),
 };
}

/** Maps a TagDuel shared field and pending chain link into the typed M387 primitive. */
export function prepareATeamTagDuelResponse(
 s:TagDuel,team:0|1,activeSeat:number,sourceUid:string,
 getCardKind:TagCardKindLookup,getActivationSpeed:TagActivationSpeedLookup,
):TrapDisposalEvaluation{
 assertActiveSeat(s,team,activeSeat);
 const source=sourceSnapshot(s,team,sourceUid);
 if(!source)return {eligible:false,reason:'source-not-on-monster-zone'};
 const activation=activationSnapshot(s,getCardKind,getActivationSpeed);
 if(!activation)return {eligible:false,reason:'activation-not-pending'};
 return prepareATeamTrapDisposal(source,activation);
}

/**
 * Rebuilds source and activation snapshots at resolution time. No state is
 * mutated here; the central chain resolver must apply both Graveyard moves and
 * the negation as one atomic operation.
 */
export function resolveATeamTagDuelResponse(
 s:TagDuel,team:0|1,activeSeat:number,sourceUid:string,offer:TrapDisposalOffer,
 getCardKind:TagCardKindLookup,getActivationSpeed:TagActivationSpeedLookup,
):TrapDisposalResolution{
 assertActiveSeat(s,team,activeSeat);
 const source=sourceSnapshot(s,team,sourceUid);
 if(!source)return {resolved:false,reason:'source-not-on-monster-zone'};
 const activation=activationSnapshot(s,getCardKind,getActivationSpeed);
 if(!activation)return {resolved:false,reason:'activation-not-pending'};
 const existingGraveyardUids=s.core.players.flatMap(player=>player.grave.map(card=>card.uid));
 return resolveATeamTrapDisposal(source,activation,offer,existingGraveyardUids);
}

export {A_TEAM_TRAP_DISPOSAL_UNIT_ID};

export const A_TEAM_TRAP_DISPOSAL_UNIT_ID = '13026402' as const;

export type DuelSeat = 0 | 1 | 2 | 3;
export type DuelTeam = 'even' | 'odd';

export type TrapDisposalSource = Readonly<{
  uid: string;
  cardId: string;
  physicalOwnerSeat: DuelSeat;
  controllerSeat: DuelSeat;
  location: 'monster';
  zoneSlot: 0 | 1 | 2;
  faceUp: boolean;
  effectNegated?: boolean;
}>;

export type TrapActivationSnapshot = Readonly<{
  uid: string;
  activationId: string;
  cardId: string;
  physicalOwnerSeat: DuelSeat;
  controllerSeat: DuelSeat;
  kind: 'trap' | 'spell' | 'monster';
  location: 'field' | 'hand';
  status: 'pending' | 'resolved' | 'negated';
  chainWindowOpen: boolean;
  activationSpeed: 1 | 2 | 3;
}>;

export type TrapDisposalOffer = Readonly<{
  sourceUid: string;
  trapUid: string;
  activationId: string;
  sourceTeam: DuelTeam;
  targetTeam: DuelTeam;
  responseSpeed: 2;
  cost: 'tribute-source';
}>;

export type TrapDisposalReason =
  | 'wrong-source'
  | 'source-not-on-monster-zone'
  | 'source-face-down'
  | 'source-effect-negated'
  | 'invalid-source-slot'
  | 'not-a-trap-activation'
  | 'activation-not-pending'
  | 'response-window-closed'
  | 'counter-trap-speed'
  | 'same-team-activation'
  | 'duplicate-physical-uid'
  | 'stale-offer';

export type TrapDisposalEvaluation =
  | Readonly<{ eligible: true; offer: TrapDisposalOffer }>
  | Readonly<{ eligible: false; reason: TrapDisposalReason }>;

export type TrapDisposalResolution =
  | Readonly<{ resolved: false; reason: TrapDisposalReason }>
  | Readonly<{
      resolved: true;
      negatedActivationId: string;
      destroyedTrap: Readonly<{ uid: string; cardId: string; ownerSeat: DuelSeat }>;
      tributedSource: Readonly<{ uid: string; cardId: string; ownerSeat: DuelSeat }>;
      oncePerTurnLimit: false;
    }>;

function isSeat(value: unknown): value is DuelSeat {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

function requireText(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new TypeError(`Invalid ${field}.`);
  }
}

function requireSeat(value: unknown, field: string): asserts value is DuelSeat {
  if (!isSeat(value)) throw new TypeError(`Invalid ${field}.`);
}

export function teamOfSeat(seat: DuelSeat): DuelTeam {
  requireSeat(seat, 'seat');
  return seat % 2 === 0 ? 'even' : 'odd';
}

function validateSnapshots(source: TrapDisposalSource, activation: TrapActivationSnapshot): void {
  if (!source || typeof source !== 'object' || !activation || typeof activation !== 'object') {
    throw new TypeError('Invalid Trap Disposal snapshot.');
  }
  requireText(source.uid, 'source UID');
  requireText(source.cardId, 'source card ID');
  requireSeat(source.physicalOwnerSeat, 'source physical owner');
  requireSeat(source.controllerSeat, 'source controller');
  requireText(activation.uid, 'Trap UID');
  requireText(activation.activationId, 'activation ID');
  requireText(activation.cardId, 'Trap card ID');
  requireSeat(activation.physicalOwnerSeat, 'Trap physical owner');
  requireSeat(activation.controllerSeat, 'Trap controller');
  if (source.uid === activation.uid) throw new TypeError('Source and Trap must have distinct physical UIDs.');
  if (source.zoneSlot !== 0 && source.zoneSlot !== 1 && source.zoneSlot !== 2) {
    throw new TypeError('Invalid shared Monster Zone slot.');
  }
  if (source.location !== 'monster') throw new TypeError('Invalid source location.');
  if (!['trap', 'spell', 'monster'].includes(activation.kind)) throw new TypeError('Invalid activation kind.');
  if (!['field', 'hand'].includes(activation.location)) throw new TypeError('Invalid activation location.');
  if (!['pending', 'resolved', 'negated'].includes(activation.status)) throw new TypeError('Invalid activation status.');
  if (typeof activation.chainWindowOpen !== 'boolean') throw new TypeError('Invalid chain window.');
  if (activation.activationSpeed !== 1 && activation.activationSpeed !== 2 && activation.activationSpeed !== 3) {
    throw new TypeError('Invalid activation speed.');
  }
}

/**
 * Offers A-Team: Trap Disposal Unit only while an opponent's Trap activation is
 * pending in an open response window. The source must be face-up and controlled
 * by the responding team; its physical owner may be either teammate or an
 * opponent whose monster is currently controlled by this team.
 */
export function prepareATeamTrapDisposal(
  source: TrapDisposalSource,
  activation: TrapActivationSnapshot,
): TrapDisposalEvaluation {
  validateSnapshots(source, activation);
  if (source.cardId !== A_TEAM_TRAP_DISPOSAL_UNIT_ID) return { eligible: false, reason: 'wrong-source' };
  if (source.location !== 'monster') return { eligible: false, reason: 'source-not-on-monster-zone' };
  if (!source.faceUp) return { eligible: false, reason: 'source-face-down' };
  if (source.effectNegated) return { eligible: false, reason: 'source-effect-negated' };
  if (activation.kind !== 'trap') return { eligible: false, reason: 'not-a-trap-activation' };
  if (activation.status !== 'pending') return { eligible: false, reason: 'activation-not-pending' };
  if (!activation.chainWindowOpen) return { eligible: false, reason: 'response-window-closed' };
  // A-Team is a Spell Speed 2 monster effect and cannot answer a Counter Trap.
  if (activation.activationSpeed === 3) return { eligible: false, reason: 'counter-trap-speed' };

  const sourceTeam = teamOfSeat(source.controllerSeat);
  const targetTeam = teamOfSeat(activation.controllerSeat);
  if (sourceTeam === targetTeam) return { eligible: false, reason: 'same-team-activation' };

  return {
    eligible: true,
    offer: {
      sourceUid: source.uid,
      trapUid: activation.uid,
      activationId: activation.activationId,
      sourceTeam,
      targetTeam,
      responseSpeed: 2,
      cost: 'tribute-source',
    },
  };
}

/**
 * Produces an atomic, non-mutating resolution plan. The caller must apply the
 * two Graveyard moves and negate/destroy the Trap as one chain-resolution step.
 * Physical ownership is preserved independently of current control.
 */
export function resolveATeamTrapDisposal(
  source: TrapDisposalSource,
  activation: TrapActivationSnapshot,
  offer: TrapDisposalOffer,
  existingGraveyardUids: readonly string[] = [],
): TrapDisposalResolution {
  const current = prepareATeamTrapDisposal(source, activation);
  if (!current.eligible) return { resolved: false, reason: current.reason };
  if (
    offer.sourceUid !== current.offer.sourceUid ||
    offer.trapUid !== current.offer.trapUid ||
    offer.activationId !== current.offer.activationId ||
    offer.sourceTeam !== current.offer.sourceTeam ||
    offer.targetTeam !== current.offer.targetTeam ||
    offer.responseSpeed !== 2 ||
    offer.cost !== 'tribute-source'
  ) {
    return { resolved: false, reason: 'stale-offer' };
  }
  if (!Array.isArray(existingGraveyardUids) || existingGraveyardUids.some(uid => typeof uid !== 'string' || uid.length === 0)) {
    throw new TypeError('Invalid shared Graveyard UID list.');
  }
  const occupied = new Set(existingGraveyardUids);
  if (occupied.size !== existingGraveyardUids.length || occupied.has(source.uid) || occupied.has(activation.uid)) {
    return { resolved: false, reason: 'duplicate-physical-uid' };
  }

  return {
    resolved: true,
    negatedActivationId: activation.activationId,
    destroyedTrap: {
      uid: activation.uid,
      cardId: activation.cardId,
      ownerSeat: activation.physicalOwnerSeat,
    },
    tributedSource: {
      uid: source.uid,
      cardId: source.cardId,
      ownerSeat: source.physicalOwnerSeat,
    },
    oncePerTurnLimit: false,
  };
}

export const ARCHFIEND_OF_GILFER_ID = '50287060' as const;

export type GilferSeat = 0 | 1 | 2 | 3;
export type GilferTeam = 'even' | 'odd';

export type GilferSourceSnapshot = Readonly<{
  uid: string;
  cardId: string;
  physicalOwnerSeat: GilferSeat;
  location: 'graveyard' | 'hand' | 'deck' | 'monster';
  sentToGyWasLastEvent: boolean;
  effectNegated: boolean;
}>;

export type GilferTargetSnapshot = Readonly<{
  uid: string;
  cardId: string;
  physicalOwnerSeat: GilferSeat;
  controllerSeat: GilferSeat;
  location: 'monster' | 'graveyard' | 'deck';
  zoneSlot: number;
  faceUp: boolean;
  canBeEquipped: boolean;
}>;

export type GilferContext = Readonly<{
  source: GilferSourceSnapshot;
  target: GilferTargetSnapshot;
  triggerControllerSeat: GilferSeat;
  activationId: string;
  teamSpellTrapZonesUsed: number;
  existingEquipUids: readonly string[];
}>;

export type GilferOffer = Readonly<{
  sourceUid: string;
  targetUid: string;
  activationId: string;
  triggerControllerSeat: GilferSeat;
  sourceTeam: GilferTeam;
  targetTeam: GilferTeam;
  responseSpeed: 1;
  cost: 'none';
}>;

export type GilferReason =
  | 'wrong-source'
  | 'source-not-in-graveyard'
  | 'optional-when-timing-missed'
  | 'source-effect-negated'
  | 'trigger-controller-outside-owner-team'
  | 'target-not-on-monster-field'
  | 'target-not-face-up'
  | 'target-cannot-be-equipped'
  | 'invalid-shared-zone-slot'
  | 'same-physical-uid'
  | 'no-team-spell-trap-zone'
  | 'duplicate-physical-uid'
  | 'stale-offer';

export type GilferEvaluation =
  | Readonly<{ eligible: true; offer: GilferOffer }>
  | Readonly<{ eligible: false; reason: GilferReason }>;

export type GilferResolution =
  | Readonly<{ resolved: false; reason: GilferReason }>
  | Readonly<{
      resolved: true;
      equip: Readonly<{
        uid: string;
        cardId: typeof ARCHFIEND_OF_GILFER_ID;
        physicalOwnerSeat: GilferSeat;
        controllerSeat: GilferSeat;
        controllerTeam: GilferTeam;
        destination: 'shared-spell-trap-zone';
        targetUid: string;
        targetControllerSeatAtResolution: GilferSeat;
        atkReduction: 500;
        modifierLifetime: 'while-equipped';
      }>;
      oncePerTurnLimit: false;
    }>;

function isSeat(value: unknown): value is GilferSeat {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

function requireText(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new TypeError(`Invalid ${field}.`);
  }
}

export function teamOfGilferSeat(seat: GilferSeat): GilferTeam {
  if (!isSeat(seat)) throw new TypeError('Invalid duel seat.');
  return seat % 2 === 0 ? 'even' : 'odd';
}

function validateContext(context: GilferContext): void {
  if (!context || typeof context !== 'object' || !context.source || !context.target) {
    throw new TypeError('Invalid Archfiend of Gilfer context.');
  }
  requireText(context.source.uid, 'source UID');
  requireText(context.source.cardId, 'source card ID');
  requireText(context.target.uid, 'target UID');
  requireText(context.target.cardId, 'target card ID');
  requireText(context.activationId, 'activation ID');
  if (!isSeat(context.source.physicalOwnerSeat) ||
      !isSeat(context.target.physicalOwnerSeat) ||
      !isSeat(context.target.controllerSeat) ||
      !isSeat(context.triggerControllerSeat)) {
    throw new TypeError('Invalid physical owner or controller seat.');
  }
  if (typeof context.source.sentToGyWasLastEvent !== 'boolean' ||
      typeof context.source.effectNegated !== 'boolean' ||
      typeof context.target.faceUp !== 'boolean' ||
      typeof context.target.canBeEquipped !== 'boolean') {
    throw new TypeError('Invalid Archfiend of Gilfer snapshot flags.');
  }
  if (!Number.isInteger(context.target.zoneSlot) || context.target.zoneSlot < 0 || context.target.zoneSlot > 2) {
    throw new TypeError('Invalid shared Monster Zone slot.');
  }
  if (!Number.isInteger(context.teamSpellTrapZonesUsed) ||
      context.teamSpellTrapZonesUsed < 0 ||
      context.teamSpellTrapZonesUsed > 3) {
    throw new TypeError('Invalid shared Spell/Trap Zone count.');
  }
  if (!Array.isArray(context.existingEquipUids) ||
      context.existingEquipUids.some(uid => typeof uid !== 'string' || uid.length === 0)) {
    throw new TypeError('Invalid shared Equip UID list.');
  }
}

/**
 * Archfiend of Gilfer is an optional "When ... sent to the GY" trigger.
 * In a shared 2v2 field, any face-up monster on either team may be targeted.
 * The Equip Card remains controlled by the team that activated the GY trigger;
 * its physical owner is never replaced by the target's owner/controller.
 */
export function prepareArchfiendGilferEquip(context: GilferContext): GilferEvaluation {
  validateContext(context);
  const { source, target, triggerControllerSeat } = context;

  if (source.cardId !== ARCHFIEND_OF_GILFER_ID) return { eligible: false, reason: 'wrong-source' };
  if (source.location !== 'graveyard') return { eligible: false, reason: 'source-not-in-graveyard' };
  if (!source.sentToGyWasLastEvent) return { eligible: false, reason: 'optional-when-timing-missed' };
  if (source.effectNegated) return { eligible: false, reason: 'source-effect-negated' };

  const sourceTeam = teamOfGilferSeat(source.physicalOwnerSeat);
  if (teamOfGilferSeat(triggerControllerSeat) !== sourceTeam) {
    return { eligible: false, reason: 'trigger-controller-outside-owner-team' };
  }
  if (target.uid === source.uid) return { eligible: false, reason: 'same-physical-uid' };
  if (target.location !== 'monster') return { eligible: false, reason: 'target-not-on-monster-field' };
  if (!target.faceUp) return { eligible: false, reason: 'target-not-face-up' };
  if (!target.canBeEquipped) return { eligible: false, reason: 'target-cannot-be-equipped' };
  if (context.teamSpellTrapZonesUsed >= 3) return { eligible: false, reason: 'no-team-spell-trap-zone' };

  const equipUids = new Set(context.existingEquipUids);
  if (equipUids.size !== context.existingEquipUids.length ||
      equipUids.has(source.uid) ||
      equipUids.has(target.uid)) {
    return { eligible: false, reason: 'duplicate-physical-uid' };
  }

  return {
    eligible: true,
    offer: {
      sourceUid: source.uid,
      targetUid: target.uid,
      activationId: context.activationId,
      triggerControllerSeat,
      sourceTeam,
      targetTeam: teamOfGilferSeat(target.controllerSeat),
      responseSpeed: 1,
      cost: 'none',
    },
  };
}

/**
 * Returns a non-mutating Equip Card placement plan. The caller performs the
 * actual Graveyard-to-backrow move atomically and preserves both physical UIDs.
 * The target may be controlled by the other team; the Equip Card controller is
 * still the trigger controller, and its 500 ATK reduction lasts only while attached.
 */
export function resolveArchfiendGilferEquip(
  context: GilferContext,
  offer: GilferOffer,
): GilferResolution {
  const current = prepareArchfiendGilferEquip(context);
  if (!current.eligible) return { resolved: false, reason: current.reason };

  if (!offer ||
      offer.sourceUid !== current.offer.sourceUid ||
      offer.targetUid !== current.offer.targetUid ||
      offer.activationId !== current.offer.activationId ||
      offer.triggerControllerSeat !== current.offer.triggerControllerSeat ||
      offer.sourceTeam !== current.offer.sourceTeam ||
      offer.targetTeam !== current.offer.targetTeam ||
      offer.responseSpeed !== 1 ||
      offer.cost !== 'none') {
    return { resolved: false, reason: 'stale-offer' };
  }

  return {
    resolved: true,
    equip: {
      uid: context.source.uid,
      cardId: ARCHFIEND_OF_GILFER_ID,
      physicalOwnerSeat: context.source.physicalOwnerSeat,
      controllerSeat: context.triggerControllerSeat,
      controllerTeam: current.offer.sourceTeam,
      destination: 'shared-spell-trap-zone',
      targetUid: context.target.uid,
      targetControllerSeatAtResolution: context.target.controllerSeat,
      atkReduction: 500,
      modifierLifetime: 'while-equipped',
    },
    oncePerTurnLimit: false,
  };
}

/** One attached Gilfer applies -500 ATK; detaching it removes that contribution. */
export function archfiendGilferAtkDelta(attachedGilferCount: number): number {
  if (!Number.isSafeInteger(attachedGilferCount) || attachedGilferCount < 0) {
    throw new TypeError('Invalid attached Archfiend of Gilfer count.');
  }
  return -500 * attachedGilferCount;
}

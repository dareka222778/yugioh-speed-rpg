export const ARCHLORD_ZERATO_ID = '18378582' as const;
export const WARRIOR_OF_ZERA_ID = '66073051' as const;
export const SANCTUARY_IN_THE_SKY_ID = '56433456' as const;

export type ZeratoSeat = 0 | 1 | 2 | 3;
export type ZeratoTeam = 'even' | 'odd';

export type ZeratoMonsterSnapshot = Readonly<{
  uid: string;
  cardId: string;
  physicalOwnerSeat: ZeratoSeat;
  controllerSeat: ZeratoSeat;
  location: 'monster';
  zoneSlot: number;
  faceUp: boolean;
  canBeDestroyedByCardEffect?: boolean;
}>;

export type ZeratoFieldSpellSnapshot = Readonly<{
  uid: string;
  cardId: string;
  physicalOwnerSeat: ZeratoSeat;
  controllerSeat: ZeratoSeat;
  location: 'field';
  faceUp: boolean;
}>;

export type ZeratoHandCardSnapshot = Readonly<{
  uid: string;
  cardId: string;
  physicalOwnerSeat: ZeratoSeat;
  location: 'hand';
  cardType: 'monster' | 'spell' | 'trap';
  attribute: string;
}>;

export type ZeratoSummonContext = Readonly<{
  activeSeat: ZeratoSeat;
  source: Readonly<{
    uid: string;
    cardId: string;
    physicalOwnerSeat: ZeratoSeat;
    location: 'hand' | 'deck' | 'graveyard' | 'banished' | 'monster';
  }>;
  warrior: ZeratoMonsterSnapshot;
  sanctuary: ZeratoFieldSpellSnapshot;
  teamMonsterZones: readonly ZeratoMonsterSnapshot[];
}>;

export type ZeratoSummonReason =
  | 'wrong-source'
  | 'not-in-active-physical-hand'
  | 'normal-summon-prohibited'
  | 'not-the-required-warrior'
  | 'warrior-not-face-up'
  | 'warrior-not-controlled-by-team'
  | 'sanctuary-not-face-up-on-team-field'
  | 'warrior-not-in-shared-monster-zones'
  | 'invalid-shared-monster-zone-state'
  | 'duplicate-physical-uid';

export type ZeratoSummonEvaluation =
  | Readonly<{
      eligible: true;
      plan: Readonly<{
        sourceUid: string;
        physicalOwnerSeat: ZeratoSeat;
        controllerSeat: ZeratoSeat;
        team: ZeratoTeam;
        tributeUid: string;
        tributePhysicalOwnerSeat: ZeratoSeat;
        tributeDestination: 'owner-team-shared-graveyard';
        destinationSlot: number;
        summonKind: 'special';
        procedure: 'tribute-face-up-warrior-of-zera';
        startsChain: false;
        normalSummonAllowed: false;
        otherSpecialSummonProceduresAllowed: false;
      }>;
    }>
  | Readonly<{ eligible: false; reason: ZeratoSummonReason }>;

export type ZeratoWipeSourceSnapshot = Readonly<{
  uid: string;
  cardId: string;
  physicalOwnerSeat: ZeratoSeat;
  controllerSeat: ZeratoSeat;
  location: 'monster';
  faceUp: boolean;
  effectNegated: boolean;
}>;

export type ZeratoWipeContext = Readonly<{
  activeSeat: ZeratoSeat;
  source: ZeratoWipeSourceSnapshot;
  hand: readonly ZeratoHandCardSnapshot[];
  selectedDiscardUid: string;
  activationId: string;
}>;

export type ZeratoWipeOffer = Readonly<{
  activationId: string;
  sourceUid: string;
  sourceTeam: ZeratoTeam;
  activeSeat: ZeratoSeat;
  discard: Readonly<{
    uid: string;
    cardId: string;
    physicalOwnerSeat: ZeratoSeat;
    destination: 'owner-team-shared-graveyard';
    cost: 'one-light-monster';
  }>;
  responseSpeed: 1;
  oncePerTurnLimit: false;
}>;

export type ZeratoWipeReason =
  | 'wrong-source'
  | 'source-not-face-up-on-team-field'
  | 'effect-negated'
  | 'no-light-monster-in-active-physical-hand'
  | 'discard-is-not-light-monster'
  | 'discard-belongs-to-partner'
  | 'duplicate-hand-uid'
  | 'invalid-opponent-shared-field'
  | 'stale-activation'
  | 'already-resolved'
  | 'effect-negated-in-chain';

export type ZeratoWipeEvaluation =
  | Readonly<{ eligible: true; offer: ZeratoWipeOffer }>
  | Readonly<{ eligible: false; reason: ZeratoWipeReason }>;

export type ZeratoWipeResolution =
  | Readonly<{ resolved: false; reason: ZeratoWipeReason }>
  | Readonly<{
      resolved: true;
      applied: false;
      reason: 'sanctuary-not-on-own-side' | 'effect-negated-in-chain';
      discardPaid: true;
      discardedUid: string;
      destroyed: readonly [];
      oncePerTurnLimit: false;
    }>
  | Readonly<{
      resolved: true;
      applied: true;
      discardPaid: true;
      discardedUid: string;
      destroyed: readonly Readonly<{
        uid: string;
        cardId: string;
        physicalOwnerSeat: ZeratoSeat;
        physicalOwnerTeam: ZeratoTeam;
        previousControllerSeat: ZeratoSeat;
        previousZoneSlot: number;
        wasFaceUp: boolean;
        destination: 'owner-team-shared-graveyard';
      }>[];
      protected: readonly string[];
      targeting: false;
      oncePerTurnLimit: false;
    }>;

function isSeat(value: unknown): value is ZeratoSeat {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

function requireText(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new TypeError(`Invalid ${field}.`);
  }
}

export function teamOfZeratoSeat(seat: ZeratoSeat): ZeratoTeam {
  if (!isSeat(seat)) throw new TypeError('Invalid duel seat.');
  return seat % 2 === 0 ? 'even' : 'odd';
}

function validateSummonContext(context: ZeratoSummonContext): void {
  if (!context || typeof context !== 'object' || !context.source ||
      !context.warrior || !context.sanctuary || !Array.isArray(context.teamMonsterZones)) {
    throw new TypeError('Invalid Archlord Zerato summon context.');
  }
  requireText(context.source.uid, 'Zerato source UID');
  requireText(context.source.cardId, 'Zerato source card ID');
  requireText(context.warrior.uid, 'Warrior of Zera UID');
  requireText(context.warrior.cardId, 'Warrior of Zera card ID');
  requireText(context.sanctuary.uid, 'Sanctuary UID');
  requireText(context.sanctuary.cardId, 'Sanctuary card ID');
  if (!isSeat(context.activeSeat) ||
      !isSeat(context.source.physicalOwnerSeat) ||
      !isSeat(context.warrior.physicalOwnerSeat) ||
      !isSeat(context.warrior.controllerSeat) ||
      !isSeat(context.sanctuary.physicalOwnerSeat) ||
      !isSeat(context.sanctuary.controllerSeat)) {
    throw new TypeError('Invalid Archlord Zerato seat.');
  }
}

export function prepareArchlordZeratoSummon(context: ZeratoSummonContext): ZeratoSummonEvaluation {
  validateSummonContext(context);
  const { activeSeat, source, warrior, sanctuary, teamMonsterZones } = context;
  const team = teamOfZeratoSeat(activeSeat);

  if (source.cardId !== ARCHLORD_ZERATO_ID) return { eligible: false, reason: 'wrong-source' };
  if (source.location !== 'hand' || source.physicalOwnerSeat !== activeSeat) {
    return { eligible: false, reason: 'not-in-active-physical-hand' };
  }
  if (warrior.cardId !== WARRIOR_OF_ZERA_ID) return { eligible: false, reason: 'not-the-required-warrior' };
  if (warrior.location !== 'monster' || !warrior.faceUp) {
    return { eligible: false, reason: 'warrior-not-face-up' };
  }
  if (teamOfZeratoSeat(warrior.controllerSeat) !== team) {
    return { eligible: false, reason: 'warrior-not-controlled-by-team' };
  }
  if (sanctuary.cardId !== SANCTUARY_IN_THE_SKY_ID ||
      sanctuary.location !== 'field' ||
      !sanctuary.faceUp ||
      teamOfZeratoSeat(sanctuary.controllerSeat) !== team) {
    return { eligible: false, reason: 'sanctuary-not-face-up-on-team-field' };
  }

  if (teamMonsterZones.length > 3) {
    return { eligible: false, reason: 'invalid-shared-monster-zone-state' };
  }
  const uids = new Set<string>();
  const slots = new Set<number>();
  for (const monster of teamMonsterZones) {
    if (!monster || typeof monster.uid !== 'string' || monster.uid.length === 0 ||
        typeof monster.cardId !== 'string' || monster.cardId.length === 0 ||
        !isSeat(monster.physicalOwnerSeat) || !isSeat(monster.controllerSeat) ||
        teamOfZeratoSeat(monster.controllerSeat) !== team ||
        monster.location !== 'monster' ||
        typeof monster.faceUp !== 'boolean' ||
        !Number.isInteger(monster.zoneSlot) ||
        monster.zoneSlot < 0 || monster.zoneSlot > 2 ||
        uids.has(monster.uid) || slots.has(monster.zoneSlot)) {
      return { eligible: false, reason: 'invalid-shared-monster-zone-state' };
    }
    uids.add(monster.uid);
    slots.add(monster.zoneSlot);
  }
  if (uids.has(source.uid)) return { eligible: false, reason: 'duplicate-physical-uid' };
  const actualWarrior = teamMonsterZones.find(monster => monster.uid === warrior.uid);
  if (!actualWarrior) return { eligible: false, reason: 'warrior-not-in-shared-monster-zones' };
  if (actualWarrior.cardId !== warrior.cardId ||
      actualWarrior.physicalOwnerSeat !== warrior.physicalOwnerSeat ||
      actualWarrior.controllerSeat !== warrior.controllerSeat ||
      actualWarrior.zoneSlot !== warrior.zoneSlot ||
      actualWarrior.faceUp !== warrior.faceUp ||
      actualWarrior.location !== warrior.location) {
    return { eligible: false, reason: 'invalid-shared-monster-zone-state' };
  }

  return {
    eligible: true,
    plan: {
      sourceUid: source.uid,
      physicalOwnerSeat: source.physicalOwnerSeat,
      controllerSeat: activeSeat,
      team,
      tributeUid: warrior.uid,
      tributePhysicalOwnerSeat: warrior.physicalOwnerSeat,
      tributeDestination: 'owner-team-shared-graveyard',
      destinationSlot: warrior.zoneSlot,
      summonKind: 'special',
      procedure: 'tribute-face-up-warrior-of-zera',
      startsChain: false,
      normalSummonAllowed: false,
      otherSpecialSummonProceduresAllowed: false,
    },
  };
}

function validateWipeContext(context: ZeratoWipeContext): void {
  if (!context || typeof context !== 'object' || !context.source || !Array.isArray(context.hand)) {
    throw new TypeError('Invalid Archlord Zerato wipe context.');
  }
  requireText(context.source.uid, 'Zerato source UID');
  requireText(context.source.cardId, 'Zerato source card ID');
  requireText(context.selectedDiscardUid, 'discard UID');
  requireText(context.activationId, 'activation ID');
  if (!isSeat(context.activeSeat) ||
      !isSeat(context.source.physicalOwnerSeat) ||
      !isSeat(context.source.controllerSeat)) {
    throw new TypeError('Invalid Archlord Zerato effect seat.');
  }
}

export function prepareArchlordZeratoWipe(context: ZeratoWipeContext): ZeratoWipeEvaluation {
  validateWipeContext(context);
  const { activeSeat, source } = context;
  const team = teamOfZeratoSeat(activeSeat);

  if (source.cardId !== ARCHLORD_ZERATO_ID) return { eligible: false, reason: 'wrong-source' };
  if (source.location !== 'monster' || !source.faceUp ||
      teamOfZeratoSeat(source.controllerSeat) !== team) {
    return { eligible: false, reason: 'source-not-face-up-on-team-field' };
  }
  if (source.effectNegated) return { eligible: false, reason: 'effect-negated' };

  const handUids = context.hand.map(card => card.uid);
  if (new Set(handUids).size !== handUids.length) {
    return { eligible: false, reason: 'duplicate-hand-uid' };
  }
  const discard = context.hand.find(card => card.uid === context.selectedDiscardUid);
  if (!discard) return { eligible: false, reason: 'no-light-monster-in-active-physical-hand' };
  if (discard.physicalOwnerSeat !== activeSeat) {
    return { eligible: false, reason: 'discard-belongs-to-partner' };
  }
  if (discard.location !== 'hand' || discard.cardType !== 'monster' || discard.attribute !== 'LIGHT') {
    return { eligible: false, reason: 'discard-is-not-light-monster' };
  }

  return {
    eligible: true,
    offer: {
      activationId: context.activationId,
      sourceUid: source.uid,
      sourceTeam: team,
      activeSeat,
      discard: {
        uid: discard.uid,
        cardId: discard.cardId,
        physicalOwnerSeat: discard.physicalOwnerSeat,
        destination: 'owner-team-shared-graveyard',
        cost: 'one-light-monster',
      },
      responseSpeed: 1,
      oncePerTurnLimit: false,
    },
  };
}

export function resolveArchlordZeratoWipe(
  offer: ZeratoWipeOffer,
  sanctuaryNow: ZeratoFieldSpellSnapshot | null,
  opponentMonstersNow: readonly ZeratoMonsterSnapshot[],
  options: Readonly<{
    activationNegated?: boolean;
    alreadyResolvedActivationIds?: readonly string[];
  }> = {},
): ZeratoWipeResolution {
  if (!offer || !offer.activationId || !offer.sourceUid || !offer.discard ||
      !offer.discard.uid || !offer.discard.cardId ||
      !isSeat(offer.activeSeat) ||
      offer.sourceTeam !== teamOfZeratoSeat(offer.activeSeat) ||
      offer.discard.cost !== 'one-light-monster' ||
      offer.discard.destination !== 'owner-team-shared-graveyard' ||
      !isSeat(offer.discard.physicalOwnerSeat) ||
      offer.discard.physicalOwnerSeat !== offer.activeSeat) {
    return { resolved: false, reason: 'stale-activation' };
  }
  if (options.alreadyResolvedActivationIds?.includes(offer.activationId)) {
    return { resolved: false, reason: 'already-resolved' };
  }
  if (options.activationNegated) {
    return {
      resolved: true,
      applied: false,
      reason: 'effect-negated-in-chain',
      discardPaid: true,
      discardedUid: offer.discard.uid,
      destroyed: [],
      oncePerTurnLimit: false,
    };
  }

  const sanctuaryIsLive = !!sanctuaryNow &&
    sanctuaryNow.cardId === SANCTUARY_IN_THE_SKY_ID &&
    sanctuaryNow.location === 'field' &&
    sanctuaryNow.faceUp &&
    isSeat(sanctuaryNow.controllerSeat) &&
    teamOfZeratoSeat(sanctuaryNow.controllerSeat) === offer.sourceTeam;
  if (!sanctuaryIsLive) {
    return {
      resolved: true,
      applied: false,
      reason: 'sanctuary-not-on-own-side',
      discardPaid: true,
      discardedUid: offer.discard.uid,
      destroyed: [],
      oncePerTurnLimit: false,
    };
  }

  if (!Array.isArray(opponentMonstersNow) || opponentMonstersNow.length > 3) {
    return { resolved: false, reason: 'invalid-opponent-shared-field' };
  }
  const seenUids = new Set<string>();
  const seenSlots = new Set<number>();
  for (const monster of opponentMonstersNow) {
    if (!monster || typeof monster.uid !== 'string' || monster.uid.length === 0 ||
        typeof monster.cardId !== 'string' || monster.cardId.length === 0 ||
        !isSeat(monster.physicalOwnerSeat) || !isSeat(monster.controllerSeat) ||
        teamOfZeratoSeat(monster.controllerSeat) === offer.sourceTeam ||
        monster.location !== 'monster' ||
        typeof monster.faceUp !== 'boolean' ||
        !Number.isInteger(monster.zoneSlot) ||
        monster.zoneSlot < 0 || monster.zoneSlot > 2 ||
        seenUids.has(monster.uid) || seenSlots.has(monster.zoneSlot)) {
      return { resolved: false, reason: 'invalid-opponent-shared-field' };
    }
    seenUids.add(monster.uid);
    seenSlots.add(monster.zoneSlot);
  }

  const destroyed = opponentMonstersNow
    .filter(monster => monster.canBeDestroyedByCardEffect !== false)
    .map(monster => ({
      uid: monster.uid,
      cardId: monster.cardId,
      physicalOwnerSeat: monster.physicalOwnerSeat,
      physicalOwnerTeam: teamOfZeratoSeat(monster.physicalOwnerSeat),
      previousControllerSeat: monster.controllerSeat,
      previousZoneSlot: monster.zoneSlot,
      wasFaceUp: monster.faceUp,
      destination: 'owner-team-shared-graveyard' as const,
    }));
  const protectedUids = opponentMonstersNow
    .filter(monster => monster.canBeDestroyedByCardEffect === false)
    .map(monster => monster.uid);

  return {
    resolved: true,
    applied: true,
    discardPaid: true,
    discardedUid: offer.discard.uid,
    destroyed,
    protected: protectedUids,
    targeting: false,
    oncePerTurnLimit: false,
  };
}

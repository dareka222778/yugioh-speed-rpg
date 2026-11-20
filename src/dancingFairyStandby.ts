export const DANCING_FAIRY_CARD_ID = "90925163" as const;
export const DANCING_FAIRY_STANDBY_GAIN = 1000 as const;

export type DuelTeam = 0 | 1;
export type PhysicalSeat = 0 | 1 | 2 | 3;
export type MonsterLocation = "monster" | "graveyard" | "hand" | "deck" | "banished" | "extraDeck";
export type BattlePosition = "attack" | "defense";

export interface DancingFairySnapshot {
  uid: string;
  cardId: string;
  physicalOwnerSeat: number;
  controllerTeam: DuelTeam;
  zone: MonsterLocation;
  faceUp: boolean;
  position: BattlePosition;
  effectNegated: boolean;
}

export interface DancingFairyStandbyInput {
  /** Stable identity for this team's current Standby Phase, not merely the turn number. */
  eventId: string;
  /** Team whose Standby Phase is currently resolving. */
  activeTeam: DuelTeam;
  teamLifePointsBefore: readonly [number, number];
  /** Current board snapshot at effect resolution; at most six monsters across the 3+3 field. */
  dancingFairies: readonly DancingFairySnapshot[];
  processedEventIds?: readonly string[];
}

export type DancingFairyStandbyReason = "resolved" | "duplicate-event" | "no-eligible-copy";

export interface DancingFairyTriggerSource {
  uid: string;
  physicalOwnerSeat: PhysicalSeat;
  controllerTeam: DuelTeam;
}

export interface DancingFairyStandbyResult {
  eventId: string;
  triggered: boolean;
  reason: DancingFairyStandbyReason;
  triggerCount: number;
  triggerSources: DancingFairyTriggerSource[];
  recipientTeam: DuelTeam | null;
  requestedGain: number;
  appliedGain: number;
  teamLifePointsAfter: [number, number];
}

function assertTeam(value: number, label: string): asserts value is DuelTeam {
  if (value !== 0 && value !== 1) throw new Error(label + " must be team 0 or 1.");
}

function assertSeat(value: number, label: string): asserts value is PhysicalSeat {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error(label + " must be a physical seat from 0 to 3.");
  }
}

function assertIdentifier(value: string, label: string): void {
  if (typeof value !== "string" || !/^[A-Za-z0-9:_-]{1,120}$/.test(value)) {
    throw new Error(label + " must be a non-empty stable identifier.");
  }
}

function copyTeamLifePoints(value: readonly [number, number]): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("teamLifePointsBefore must contain exactly two team totals.");
  }
  for (const [index, points] of value.entries()) {
    if (!Number.isSafeInteger(points) || points < 0) {
      throw new Error("team " + index + " Life Points must be a non-negative safe integer.");
    }
  }
  return [value[0], value[1]];
}

function validateSnapshot(snapshot: DancingFairySnapshot): void {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Dancing Fairy snapshot is required.");
  }
  assertIdentifier(snapshot.uid, "Dancing Fairy UID");
  if (snapshot.cardId !== DANCING_FAIRY_CARD_ID) {
    throw new Error("snapshot cardId must identify Dancing Fairy (" + DANCING_FAIRY_CARD_ID + ").");
  }
  assertSeat(snapshot.physicalOwnerSeat, "physicalOwnerSeat");
  assertTeam(snapshot.controllerTeam, "controllerTeam");
  if (!["monster", "graveyard", "hand", "deck", "banished", "extraDeck"].includes(snapshot.zone)) {
    throw new Error("invalid Dancing Fairy zone.");
  }
  if (snapshot.position !== "attack" && snapshot.position !== "defense") {
    throw new Error("Dancing Fairy position must be attack or defense.");
  }
  if (typeof snapshot.faceUp !== "boolean" || typeof snapshot.effectNegated !== "boolean") {
    throw new Error("Dancing Fairy visibility and negation flags must be boolean.");
  }
}

/**
 * Resolve Dancing Fairy's 1000 LP gain for one team's Standby Phase.
 * Eligibility is checked against the current resolution snapshot: the physical
 * card must still be face-up in Defense Position in a Monster Zone, controlled
 * by the active team, and not negated. Physical owner and current controller
 * are deliberately separate so a partner-owned card still benefits its team.
 *
 * The caller supplies processedEventIds to make retries idempotent. Different
 * Standby Phase event IDs remain independently eligible; there is no once-per-
 * turn restriction beyond one resolution per copy in a given phase event.
 */
export function resolveDancingFairyStandbyGain(
  input: DancingFairyStandbyInput,
): DancingFairyStandbyResult {
  if (!input || typeof input !== "object") throw new Error("Dancing Fairy Standby input is required.");
  assertIdentifier(input.eventId, "eventId");
  assertTeam(input.activeTeam, "activeTeam");
  const teamLifePoints = copyTeamLifePoints(input.teamLifePointsBefore);

  if (!Array.isArray(input.dancingFairies) || input.dancingFairies.length > 6) {
    throw new Error("dancingFairies must be an array containing at most six field snapshots.");
  }

  const seenUids = new Set<string>();
  const eligible: DancingFairySnapshot[] = [];
  for (const snapshot of input.dancingFairies) {
    validateSnapshot(snapshot);
    if (seenUids.has(snapshot.uid)) throw new Error("duplicate physical UID in Dancing Fairy snapshots.");
    seenUids.add(snapshot.uid);
    if (
      snapshot.zone === "monster"
      && snapshot.faceUp
      && snapshot.position === "defense"
      && !snapshot.effectNegated
      && snapshot.controllerTeam === input.activeTeam
    ) {
      eligible.push(snapshot);
    }
  }

  const processed = input.processedEventIds;
  if (processed !== undefined) {
    if (!Array.isArray(processed)) throw new Error("processedEventIds must be an array.");
    const seenEvents = new Set<string>();
    for (const id of processed) {
      assertIdentifier(id, "processed event ID");
      if (seenEvents.has(id)) throw new Error("processedEventIds must not contain duplicates.");
      seenEvents.add(id);
    }
  }

  const base = {
    eventId: input.eventId,
    triggerSources: [] as DancingFairyTriggerSource[],
    recipientTeam: null as DuelTeam | null,
    requestedGain: 0,
    appliedGain: 0,
    teamLifePointsAfter: [teamLifePoints[0], teamLifePoints[1]] as [number, number],
  };

  if (processed?.includes(input.eventId)) {
    return { ...base, triggered: false, reason: "duplicate-event", triggerCount: 0 };
  }
  if (eligible.length === 0) {
    return { ...base, triggered: false, reason: "no-eligible-copy", triggerCount: 0 };
  }

  const requestedGain = eligible.length * DANCING_FAIRY_STANDBY_GAIN;
  const nextLifePoints = teamLifePoints[input.activeTeam] + requestedGain;
  if (!Number.isSafeInteger(requestedGain) || !Number.isSafeInteger(nextLifePoints)) {
    throw new Error("team Life Points would exceed the safe integer range.");
  }

  const teamLifePointsAfter: [number, number] = [teamLifePoints[0], teamLifePoints[1]];
  teamLifePointsAfter[input.activeTeam] = nextLifePoints;
  const triggerSources = eligible.map((snapshot) => ({
    uid: snapshot.uid,
    physicalOwnerSeat: snapshot.physicalOwnerSeat as PhysicalSeat,
    controllerTeam: snapshot.controllerTeam,
  }));

  return {
    eventId: input.eventId,
    triggered: true,
    reason: "resolved",
    triggerCount: eligible.length,
    triggerSources,
    recipientTeam: input.activeTeam,
    requestedGain,
    appliedGain: requestedGain,
    teamLifePointsAfter,
  };
}


export const DARKLORD_MARIE_CARD_ID = "57579381" as const;
export const DARKLORD_MARIE_STANDBY_GAIN = 200 as const;

export interface DarklordMarieSnapshot {
  uid: string;
  cardId: string;
  physicalOwnerSeat: number;
  ownerTeam: DuelTeam;
  zoneAtActivation: MonsterLocation;
  zoneAtResolution: MonsterLocation;
  effectNegated: boolean;
}

export interface DarklordMarieStandbyInput {
  eventId: string;
  activeTeam: DuelTeam;
  turnNumber: number;
  teamLifePointsBefore: readonly [number, number];
  /** Up to four 30-card Main Decks' copies can exist in the shared Graveyard. */
  darklordMaries: readonly DarklordMarieSnapshot[];
  processedEventIds?: readonly string[];
  /** Keys are turnNumber:physicalUid; each copy is once per turn, independently. */
  processedTurnCardKeys?: readonly string[];
}

export type DarklordMarieStandbyReason =
  | "resolved"
  | "duplicate-event"
  | "already-used-this-turn"
  | "no-eligible-copy";

export interface DarklordMarieTriggerSource {
  uid: string;
  physicalOwnerSeat: PhysicalSeat;
  ownerTeam: DuelTeam;
  turnCardKey: string;
}

export interface DarklordMarieStandbyResult {
  eventId: string;
  turnNumber: number;
  triggered: boolean;
  reason: DarklordMarieStandbyReason;
  triggerCount: number;
  triggerSources: DarklordMarieTriggerSource[];
  recipientTeam: DuelTeam | null;
  gainAmount: number;
  teamLifePointsAfter: [number, number];
  processedEventIds: string[];
  processedTurnCardKeys: string[];
}

function validateDarklordMarieSnapshot(snapshot: DarklordMarieSnapshot): void {
  if (!snapshot || typeof snapshot !== "object") throw new Error("Darklord Marie snapshot is required.");
  assertIdentifier(snapshot.uid, "Darklord Marie UID");
  if (snapshot.cardId !== DARKLORD_MARIE_CARD_ID) {
    throw new Error("snapshot cardId must identify Darklord Marie (" + DARKLORD_MARIE_CARD_ID + ").");
  }
  assertSeat(snapshot.physicalOwnerSeat, "physicalOwnerSeat");
  assertTeam(snapshot.ownerTeam, "ownerTeam");
  const zones: MonsterLocation[] = ["monster", "graveyard", "hand", "deck", "banished", "extraDeck"];
  if (!zones.includes(snapshot.zoneAtActivation)) throw new Error("invalid Darklord Marie activation zone.");
  if (!zones.includes(snapshot.zoneAtResolution)) throw new Error("invalid Darklord Marie resolution zone.");
  if (typeof snapshot.effectNegated !== "boolean") throw new Error("Darklord Marie negation flag must be boolean.");
}

/**
 * Darklord Marie must be in the Graveyard both when its Standby effect is
 * activated and when it resolves. Each physical copy is once per turn; one
 * copy already used does not suppress another copy in the shared Graveyard.
 */
export function resolveDarklordMarieStandbyGain(
  input: DarklordMarieStandbyInput,
): DarklordMarieStandbyResult {
  if (!input || typeof input !== "object") throw new Error("Darklord Marie Standby input is required.");
  assertIdentifier(input.eventId, "eventId");
  assertTeam(input.activeTeam, "activeTeam");
  if (!Number.isSafeInteger(input.turnNumber) || input.turnNumber < 1) {
    throw new Error("turnNumber must be a positive safe integer.");
  }
  const teamLifePoints = copyTeamLifePoints(input.teamLifePointsBefore);
  if (!Array.isArray(input.darklordMaries) || input.darklordMaries.length > 120) {
    throw new Error("darklordMaries must be an array containing at most 120 physical copies.");
  }

  const seenUids = new Set<string>();
  const eligible: DarklordMarieSnapshot[] = [];
  for (const snapshot of input.darklordMaries) {
    validateDarklordMarieSnapshot(snapshot);
    if (seenUids.has(snapshot.uid)) throw new Error("duplicate physical UID in Darklord Marie snapshots.");
    seenUids.add(snapshot.uid);
    if (
      snapshot.ownerTeam === input.activeTeam
      && snapshot.zoneAtActivation === "graveyard"
      && snapshot.zoneAtResolution === "graveyard"
      && !snapshot.effectNegated
    ) {
      eligible.push(snapshot);
    }
  }

  const eventIds = new Set<string>();
  if (input.processedEventIds !== undefined) {
    if (!Array.isArray(input.processedEventIds)) throw new Error("processedEventIds must be an array.");
    for (const id of input.processedEventIds) {
      assertIdentifier(id, "processed event ID");
      if (eventIds.has(id)) throw new Error("processedEventIds must not contain duplicates.");
      eventIds.add(id);
    }
  }

  const usedCardTurns = new Set<string>();
  if (input.processedTurnCardKeys !== undefined) {
    if (!Array.isArray(input.processedTurnCardKeys)) throw new Error("processedTurnCardKeys must be an array.");
    for (const key of input.processedTurnCardKeys) {
      assertIdentifier(key, "processed turn/card key");
      if (usedCardTurns.has(key)) throw new Error("processedTurnCardKeys must not contain duplicates.");
      usedCardTurns.add(key);
    }
  }

  const base = {
    eventId: input.eventId,
    turnNumber: input.turnNumber,
    triggerSources: [] as DarklordMarieTriggerSource[],
    recipientTeam: null as DuelTeam | null,
    gainAmount: 0,
    teamLifePointsAfter: [teamLifePoints[0], teamLifePoints[1]] as [number, number],
    processedEventIds: [...eventIds],
    processedTurnCardKeys: [...usedCardTurns],
  };

  if (eventIds.has(input.eventId)) {
    return { ...base, triggered: false, reason: "duplicate-event", triggerCount: 0 };
  }
  eventIds.add(input.eventId);
  const processedEventIds = [...eventIds];
  if (eligible.length === 0) {
    return { ...base, processedEventIds, triggered: false, reason: "no-eligible-copy", triggerCount: 0 };
  }

  const fresh = eligible.filter((snapshot) => !usedCardTurns.has(input.turnNumber + ":" + snapshot.uid));
  if (fresh.length === 0) {
    return { ...base, processedEventIds, triggered: false, reason: "already-used-this-turn", triggerCount: 0 };
  }

  const gainAmount = fresh.length * DARKLORD_MARIE_STANDBY_GAIN;
  const nextLifePoints = teamLifePoints[input.activeTeam] + gainAmount;
  if (!Number.isSafeInteger(gainAmount) || !Number.isSafeInteger(nextLifePoints)) {
    throw new Error("team Life Points would exceed the safe integer range.");
  }

  const teamLifePointsAfter: [number, number] = [teamLifePoints[0], teamLifePoints[1]];
  teamLifePointsAfter[input.activeTeam] = nextLifePoints;
  const triggerSources = fresh.map((snapshot) => {
    const turnCardKey = input.turnNumber + ":" + snapshot.uid;
    usedCardTurns.add(turnCardKey);
    return {
      uid: snapshot.uid,
      physicalOwnerSeat: snapshot.physicalOwnerSeat as PhysicalSeat,
      ownerTeam: snapshot.ownerTeam,
      turnCardKey,
    };
  });

  return {
    eventId: input.eventId,
    turnNumber: input.turnNumber,
    triggered: true,
    reason: "resolved",
    triggerCount: fresh.length,
    triggerSources,
    recipientTeam: input.activeTeam,
    gainAmount,
    teamLifePointsAfter,
    processedEventIds,
    processedTurnCardKeys: [...usedCardTurns],
  };
}

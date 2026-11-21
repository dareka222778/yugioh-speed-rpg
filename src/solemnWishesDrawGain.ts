export const SOLEMN_WISHES_CARD_ID = "35346968" as const;
export const SOLEMN_WISHES_GAIN_PER_DRAW_EVENT = 500 as const;

export type DuelTeam = 0 | 1;
export type PhysicalSeat = 0 | 1 | 2 | 3;
export type SpellTrapLocation = "backrow" | "graveyard" | "hand" | "deck" | "banished";

export interface SolemnWishesSnapshot {
  uid: string;
  cardId: string;
  physicalOwnerSeat: number;
  controllerTeam: DuelTeam;
  zone: SpellTrapLocation;
  faceUp: boolean;
  effectNegated: boolean;
}

export interface SolemnWishesDrawGainInput {
  /** Stable identity for one draw event; drawing multiple cards is still one event. */
  eventId: string;
  drawingTeam: DuelTeam;
  drawCount: number;
  teamLifePointsBefore: readonly [number, number];
  /** Current backrow snapshot when the draw-triggered effect resolves. */
  solemnWishes: readonly SolemnWishesSnapshot[];
  processedEventIds?: readonly string[];
}

export type SolemnWishesDrawGainReason =
  | "resolved"
  | "duplicate-event"
  | "no-draw"
  | "no-eligible-copy";

export interface SolemnWishesTriggerSource {
  uid: string;
  physicalOwnerSeat: PhysicalSeat;
  controllerTeam: DuelTeam;
}

export interface SolemnWishesDrawGainResult {
  eventId: string;
  triggered: boolean;
  reason: SolemnWishesDrawGainReason;
  triggerCount: number;
  triggerSources: SolemnWishesTriggerSource[];
  /** These fields intentionally match the LP-gain event contract consumed by Fire Princess. */
  gainingTeam: DuelTeam;
  opposingTeam: DuelTeam;
  lpGained: number;
  teamLifePointsAfterGain: [number, number];
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

function validateSnapshot(snapshot: SolemnWishesSnapshot): void {
  if (!snapshot || typeof snapshot !== "object") throw new Error("Solemn Wishes snapshot is required.");
  assertIdentifier(snapshot.uid, "Solemn Wishes UID");
  if (snapshot.cardId !== SOLEMN_WISHES_CARD_ID) {
    throw new Error("snapshot cardId must identify Solemn Wishes (" + SOLEMN_WISHES_CARD_ID + ").");
  }
  assertSeat(snapshot.physicalOwnerSeat, "physicalOwnerSeat");
  assertTeam(snapshot.controllerTeam, "controllerTeam");
  if (!["backrow", "graveyard", "hand", "deck", "banished"].includes(snapshot.zone)) {
    throw new Error("invalid Solemn Wishes zone.");
  }
  if (typeof snapshot.faceUp !== "boolean" || typeof snapshot.effectNegated !== "boolean") {
    throw new Error("Solemn Wishes visibility and negation flags must be boolean.");
  }
}

/**
 * Resolve one Solemn Wishes trigger for one draw event.
 * The printed text says "a card(s)": drawing two or more cards in one event
 * still grants 500 LP per eligible copy, not 500 per card drawn.
 *
 * Current controller team is kept separate from physical owner seat. The
 * current resolution snapshot ensures a Set, removed, or negated copy cannot
 * gain LP. Event IDs make retries idempotent and can be forwarded to the
 * Fire Princess LP-gain consumer without changing the event's identity.
 */
export function resolveSolemnWishesDrawGain(
  input: SolemnWishesDrawGainInput,
): SolemnWishesDrawGainResult {
  if (!input || typeof input !== "object") throw new Error("Solemn Wishes draw input is required.");
  assertIdentifier(input.eventId, "eventId");
  assertTeam(input.drawingTeam, "drawingTeam");
  if (!Number.isSafeInteger(input.drawCount) || input.drawCount < 0) {
    throw new Error("drawCount must be a non-negative safe integer.");
  }
  const teamLifePoints = copyTeamLifePoints(input.teamLifePointsBefore);

  if (!Array.isArray(input.solemnWishes) || input.solemnWishes.length > 6) {
    throw new Error("solemnWishes must be an array containing at most six backrow snapshots.");
  }

  const seenUids = new Set<string>();
  const eligible: SolemnWishesSnapshot[] = [];
  for (const snapshot of input.solemnWishes) {
    validateSnapshot(snapshot);
    if (seenUids.has(snapshot.uid)) throw new Error("duplicate physical UID in Solemn Wishes snapshots.");
    seenUids.add(snapshot.uid);
    if (
      snapshot.zone === "backrow"
      && snapshot.faceUp
      && !snapshot.effectNegated
      && snapshot.controllerTeam === input.drawingTeam
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

  const opposingTeam = (1 - input.drawingTeam) as DuelTeam;
  const baseResult = {
    eventId: input.eventId,
    triggerSources: [] as SolemnWishesTriggerSource[],
    gainingTeam: input.drawingTeam,
    opposingTeam,
    lpGained: 0,
    teamLifePointsAfterGain: [teamLifePoints[0], teamLifePoints[1]] as [number, number],
  };

  if (processed?.includes(input.eventId)) {
    return { ...baseResult, triggered: false, reason: "duplicate-event", triggerCount: 0 };
  }
  if (input.drawCount === 0) {
    return { ...baseResult, triggered: false, reason: "no-draw", triggerCount: 0 };
  }
  if (eligible.length === 0) {
    return { ...baseResult, triggered: false, reason: "no-eligible-copy", triggerCount: 0 };
  }

  const lpGained = eligible.length * SOLEMN_WISHES_GAIN_PER_DRAW_EVENT;
  const nextLifePoints = teamLifePoints[input.drawingTeam] + lpGained;
  if (!Number.isSafeInteger(lpGained) || !Number.isSafeInteger(nextLifePoints)) {
    throw new Error("team Life Points would exceed the safe integer range.");
  }

  const teamLifePointsAfterGain: [number, number] = [teamLifePoints[0], teamLifePoints[1]];
  teamLifePointsAfterGain[input.drawingTeam] = nextLifePoints;
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
    gainingTeam: input.drawingTeam,
    opposingTeam,
    lpGained,
    teamLifePointsAfterGain,
  };
}

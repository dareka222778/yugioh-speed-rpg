export const IMMORTAL_OF_THUNDER_CARD_ID = "84926738" as const;
export const IMMORTAL_OF_THUNDER_FLIP_GAIN = 3000 as const;
export const IMMORTAL_OF_THUNDER_FIELD_TO_GY_LOSS = 5000 as const;

export type DuelTeam = 0 | 1;
export type PhysicalSeat = 0 | 1 | 2 | 3;
export type FieldZone = "monster" | "backrow";

export interface ImmortalOfThunderFlipInput {
  eventId: string;
  cardId: string;
  uid: string;
  physicalOwnerSeat: number;
  controllerTeamAtActivation: DuelTeam;
  zoneAtFlip: FieldZone;
  wasFaceDown: boolean;
  becameFaceUp: boolean;
  effectNegated: boolean;
  teamLifePointsBefore: readonly [number, number];
  processedEventIds?: readonly string[];
}

export interface ImmortalOfThunderSentToGraveyardInput {
  eventId: string;
  cardId: string;
  uid: string;
  physicalOwnerSeat: number;
  controllerTeamAtSend: DuelTeam;
  sourceZone: FieldZone;
  destinationZone: "graveyard" | "hand" | "deck" | "banished";
  effectNegated: boolean;
  teamLifePointsBefore: readonly [number, number];
  processedEventIds?: readonly string[];
}

export type ImmortalOfThunderFlipReason =
  | "resolved"
  | "duplicate-event"
  | "not-flipped"
  | "negated";

export type ImmortalOfThunderSendReason =
  | "resolved"
  | "duplicate-event"
  | "not-sent-from-field-to-graveyard"
  | "negated";

export interface ImmortalOfThunderGainResult {
  eventId: string;
  triggered: boolean;
  reason: ImmortalOfThunderFlipReason;
  source: { uid: string; physicalOwnerSeat: PhysicalSeat; controllerTeam: DuelTeam };
  gainingTeam: DuelTeam;
  opposingTeam: DuelTeam;
  lpGained: number;
  teamLifePointsAfterGain: [number, number];
  processedEventIds: string[];
}

export interface ImmortalOfThunderLossResult {
  eventId: string;
  triggered: boolean;
  reason: ImmortalOfThunderSendReason;
  source: { uid: string; physicalOwnerSeat: PhysicalSeat; controllerTeam: DuelTeam };
  losingTeam: DuelTeam;
  opposingTeam: DuelTeam;
  lpLost: number;
  teamLifePointsAfterLoss: [number, number];
  processedEventIds: string[];
}

function assertTeam(value: number, label: string): asserts value is DuelTeam {
  if (value !== 0 && value !== 1) throw new Error(label + " must be team 0 or 1.");
}

function assertSeat(value: number): asserts value is PhysicalSeat {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error("physicalOwnerSeat must be a physical seat from 0 to 3.");
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

function copyProcessedEvents(value: readonly string[] | undefined): Set<string> {
  const result = new Set<string>();
  if (value === undefined) return result;
  if (!Array.isArray(value)) throw new Error("processedEventIds must be an array.");
  for (const id of value) {
    assertIdentifier(id, "processed event ID");
    if (result.has(id)) throw new Error("processedEventIds must not contain duplicates.");
    result.add(id);
  }
  return result;
}

function validateSource(cardId: string, uid: string, physicalOwnerSeat: number): void {
  if (cardId !== IMMORTAL_OF_THUNDER_CARD_ID) {
    throw new Error("source cardId must identify The Immortal of Thunder (" + IMMORTAL_OF_THUNDER_CARD_ID + ").");
  }
  assertIdentifier(uid, "The Immortal of Thunder UID");
  assertSeat(physicalOwnerSeat);
}

/**
 * Resolve the FLIP effect. The flip event is captured on the Monster Zone;
 * the effect can still resolve if the monster leaves the field afterwards.
 * Controller-at-activation and physical owner remain separate.
 */
export function resolveImmortalOfThunderFlipGain(
  input: ImmortalOfThunderFlipInput,
): ImmortalOfThunderGainResult {
  if (!input || typeof input !== "object") throw new Error("The Immortal of Thunder Flip input is required.");
  assertIdentifier(input.eventId, "eventId");
  validateSource(input.cardId, input.uid, input.physicalOwnerSeat);
  assertTeam(input.controllerTeamAtActivation, "controllerTeamAtActivation");
  if (input.zoneAtFlip !== "monster") throw new Error("Flip effect must originate in the Monster Zone.");
  if (typeof input.wasFaceDown !== "boolean" || typeof input.becameFaceUp !== "boolean" || typeof input.effectNegated !== "boolean") {
    throw new Error("flip and negation flags must be boolean.");
  }
  const teamLifePoints = copyTeamLifePoints(input.teamLifePointsBefore);
  const processed = copyProcessedEvents(input.processedEventIds);
  const opposingTeam = (1 - input.controllerTeamAtActivation) as DuelTeam;
  const base = {
    eventId: input.eventId,
    source: {
      uid: input.uid,
      physicalOwnerSeat: input.physicalOwnerSeat as PhysicalSeat,
      controllerTeam: input.controllerTeamAtActivation,
    },
    gainingTeam: input.controllerTeamAtActivation,
    opposingTeam,
    lpGained: 0,
    teamLifePointsAfterGain: [teamLifePoints[0], teamLifePoints[1]] as [number, number],
    processedEventIds: [...processed],
  };

  if (processed.has(input.eventId)) {
    return { ...base, triggered: false, reason: "duplicate-event" };
  }
  processed.add(input.eventId);
  const processedEventIds = [...processed];
  if (!input.wasFaceDown || !input.becameFaceUp) {
    return { ...base, processedEventIds, triggered: false, reason: "not-flipped" };
  }
  if (input.effectNegated) {
    return { ...base, processedEventIds, triggered: false, reason: "negated" };
  }

  const nextLifePoints = teamLifePoints[input.controllerTeamAtActivation] + IMMORTAL_OF_THUNDER_FLIP_GAIN;
  if (!Number.isSafeInteger(nextLifePoints)) throw new Error("team Life Points would exceed the safe integer range.");
  const teamLifePointsAfterGain: [number, number] = [teamLifePoints[0], teamLifePoints[1]];
  teamLifePointsAfterGain[input.controllerTeamAtActivation] = nextLifePoints;
  return {
    ...base,
    triggered: true,
    reason: "resolved",
    lpGained: IMMORTAL_OF_THUNDER_FLIP_GAIN,
    teamLifePointsAfterGain,
    processedEventIds,
  };
}

/**
 * Resolve the second printed effect whenever this monster is sent from the
 * field to the Graveyard, regardless of whether the cause was battle, an
 * effect, a cost, or another game rule. LP can become negative; the duel
 * engine decides the resulting loss condition and must not clamp it to zero.
 */
export function resolveImmortalOfThunderFieldToGraveyardLoss(
  input: ImmortalOfThunderSentToGraveyardInput,
): ImmortalOfThunderLossResult {
  if (!input || typeof input !== "object") throw new Error("The Immortal of Thunder send input is required.");
  assertIdentifier(input.eventId, "eventId");
  validateSource(input.cardId, input.uid, input.physicalOwnerSeat);
  assertTeam(input.controllerTeamAtSend, "controllerTeamAtSend");
  if (input.sourceZone !== "monster" && input.sourceZone !== "backrow") {
    throw new Error("sourceZone must be a field zone.");
  }
  if (!["graveyard", "hand", "deck", "banished"].includes(input.destinationZone)) {
    throw new Error("invalid destination zone.");
  }
  if (typeof input.effectNegated !== "boolean") throw new Error("effectNegated must be boolean.");
  const teamLifePoints = copyTeamLifePoints(input.teamLifePointsBefore);
  const processed = copyProcessedEvents(input.processedEventIds);
  const opposingTeam = (1 - input.controllerTeamAtSend) as DuelTeam;
  const base = {
    eventId: input.eventId,
    source: {
      uid: input.uid,
      physicalOwnerSeat: input.physicalOwnerSeat as PhysicalSeat,
      controllerTeam: input.controllerTeamAtSend,
    },
    losingTeam: input.controllerTeamAtSend,
    opposingTeam,
    lpLost: 0,
    teamLifePointsAfterLoss: [teamLifePoints[0], teamLifePoints[1]] as [number, number],
    processedEventIds: [...processed],
  };

  if (processed.has(input.eventId)) {
    return { ...base, triggered: false, reason: "duplicate-event" };
  }
  processed.add(input.eventId);
  const processedEventIds = [...processed];
  if (input.destinationZone !== "graveyard") {
    return { ...base, processedEventIds, triggered: false, reason: "not-sent-from-field-to-graveyard" };
  }
  if (input.effectNegated) {
    return { ...base, processedEventIds, triggered: false, reason: "negated" };
  }

  const nextLifePoints = teamLifePoints[input.controllerTeamAtSend] - IMMORTAL_OF_THUNDER_FIELD_TO_GY_LOSS;
  if (!Number.isSafeInteger(nextLifePoints)) throw new Error("team Life Points would exceed the safe integer range.");
  const teamLifePointsAfterLoss: [number, number] = [teamLifePoints[0], teamLifePoints[1]];
  teamLifePointsAfterLoss[input.controllerTeamAtSend] = nextLifePoints;
  return {
    ...base,
    triggered: true,
    reason: "resolved",
    lpLost: IMMORTAL_OF_THUNDER_FIELD_TO_GY_LOSS,
    teamLifePointsAfterLoss,
    processedEventIds,
  };
}

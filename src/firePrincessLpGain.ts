export const FIRE_PRINCESS_CARD_ID = "64752646" as const;

export type DuelTeam = 0 | 1;
export type PhysicalSeat = 0 | 1 | 2 | 3;
export type MonsterLocation = "monster" | "graveyard" | "hand" | "deck" | "banished" | "extraDeck";

export interface FirePrincessSnapshot {
  uid: string;
  cardId: string;
  physicalOwnerSeat: number;
  controllerTeam: DuelTeam;
  zone: MonsterLocation;
  faceUp: boolean;
  effectNegated: boolean;
}

export interface FirePrincessLpGainInput {
  eventId: string;
  gainingTeam: DuelTeam;
  opposingTeam: DuelTeam;
  lpGained: number;
  teamLifePointsAfterGain: readonly [number, number];
  firePrincesses: readonly FirePrincessSnapshot[];
  processedEventIds?: readonly string[];
}

export type FirePrincessTriggerReason =
  | "resolved"
  | "duplicate-event"
  | "no-lp-gain"
  | "no-eligible-fire-princess";

export interface FirePrincessTriggerSource {
  uid: string;
  physicalOwnerSeat: PhysicalSeat;
  controllerTeam: DuelTeam;
}

export interface FirePrincessLpGainResult {
  eventId: string;
  triggered: boolean;
  reason: FirePrincessTriggerReason;
  triggerCount: number;
  triggerSources: FirePrincessTriggerSource[];
  recipientTeam: DuelTeam | null;
  requestedDamage: number;
  appliedDamage: number;
  overkillDamage: number;
  teamLifePointsAfterDamage: [number, number];
}

function assertSeat(value: number, label: string): asserts value is PhysicalSeat {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error(label + " must be a physical seat from 0 to 3.");
  }
}

function assertTeam(value: number, label: string): asserts value is DuelTeam {
  if (value !== 0 && value !== 1) throw new Error(label + " must be team 0 or 1.");
}

function assertUid(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " is required.");
}

function copyTeamLifePoints(value: readonly [number, number]): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("teamLifePointsAfterGain must contain exactly two team totals.");
  }
  for (const [index, points] of value.entries()) {
    if (!Number.isSafeInteger(points) || points < 0) {
      throw new Error("team " + index + " Life Points must be a non-negative safe integer.");
    }
  }
  return [value[0], value[1]];
}

function validateSnapshot(snapshot: FirePrincessSnapshot): void {
  if (!snapshot || typeof snapshot !== "object") throw new Error("Fire Princess snapshot is required.");
  assertUid(snapshot.uid, "Fire Princess UID");
  if (typeof snapshot.cardId !== "string" || !snapshot.cardId.trim()) {
    throw new Error("Fire Princess snapshot cardId is required.");
  }
  assertSeat(snapshot.physicalOwnerSeat, "physicalOwnerSeat");
  assertTeam(snapshot.controllerTeam, "controllerTeam");
  if (!["monster", "graveyard", "hand", "deck", "banished", "extraDeck"].includes(snapshot.zone)) {
    throw new Error("invalid Fire Princess zone.");
  }
  if (typeof snapshot.faceUp !== "boolean" || typeof snapshot.effectNegated !== "boolean") {
    throw new Error("Fire Princess faceUp and effectNegated flags must be boolean.");
  }
}

/**
 * Resolve one already-applied Life Point gain event for all Fire Princess
 * copies controlled by the gaining team. Each eligible face-up, non-negated
 * copy inflicts exactly 500 damage once for this event, regardless of the
 * amount of LP gained. The opposing team's shared LP is reduced once per copy.
 *
 * The caller supplies eventId and processedEventIds so a retried duel action
 * cannot apply the same trigger twice. Distinct LP gain events have no
 * once-per-turn restriction. Physical owner seats are retained for audit but
 * never determine which team gains LP or receives damage.
 */
export function resolveFirePrincessLpGain(
  input: FirePrincessLpGainInput,
): FirePrincessLpGainResult {
  assertUid(input.eventId, "eventId");
  assertTeam(input.gainingTeam, "gainingTeam");
  assertTeam(input.opposingTeam, "opposingTeam");
  if (input.gainingTeam === input.opposingTeam) {
    throw new Error("gainingTeam and opposingTeam must differ.");
  }
  if (!Number.isSafeInteger(input.lpGained) || input.lpGained < 0) {
    throw new Error("lpGained must be a non-negative safe integer.");
  }
  if (!Array.isArray(input.firePrincesses)) throw new Error("firePrincesses must be an array.");

  const teamLifePoints = copyTeamLifePoints(input.teamLifePointsAfterGain);
  const processed = input.processedEventIds ?? [];
  if (!Array.isArray(processed)) throw new Error("processedEventIds must be an array.");
  for (const id of processed) assertUid(id, "processed event ID");

  const seen = new Set<string>();
  for (const snapshot of input.firePrincesses) {
    validateSnapshot(snapshot);
    if (seen.has(snapshot.uid)) throw new Error("duplicate physical UID in Fire Princess snapshots.");
    seen.add(snapshot.uid);
  }

  let reason: FirePrincessTriggerReason = "resolved";
  if (processed.includes(input.eventId)) reason = "duplicate-event";
  else if (input.lpGained === 0) reason = "no-lp-gain";

  const eligible = reason === "resolved"
    ? input.firePrincesses.filter(snapshot =>
      snapshot.cardId === FIRE_PRINCESS_CARD_ID
      && snapshot.controllerTeam === input.gainingTeam
      && snapshot.zone === "monster"
      && snapshot.faceUp
      && !snapshot.effectNegated)
    : [];

  if (reason === "resolved" && eligible.length === 0) {
    reason = "no-eligible-fire-princess";
  }

  const triggered = reason === "resolved";
  const triggerCount = triggered ? eligible.length : 0;
  const requestedDamage = triggerCount * 500;
  if (!Number.isSafeInteger(requestedDamage)) {
    throw new Error("Fire Princess damage total exceeds the safe integer range.");
  }

  const availableLP = teamLifePoints[input.opposingTeam];
  const appliedDamage = Math.min(requestedDamage, availableLP);
  const overkillDamage = requestedDamage - appliedDamage;
  if (triggered) teamLifePoints[input.opposingTeam] = availableLP - appliedDamage;

  return {
    eventId: input.eventId,
    triggered,
    reason,
    triggerCount,
    triggerSources: eligible.map(snapshot => ({
      uid: snapshot.uid,
      physicalOwnerSeat: snapshot.physicalOwnerSeat,
      controllerTeam: snapshot.controllerTeam,
    })),
    recipientTeam: triggered ? input.opposingTeam : null,
    requestedDamage,
    appliedDamage,
    overkillDamage,
    teamLifePointsAfterDamage: teamLifePoints,
  };
}

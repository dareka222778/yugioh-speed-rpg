export const ABSORBING_KID_FROM_THE_SKY_CARD_ID = "49771608" as const;

export type DuelTeam = 0 | 1;
export type PhysicalSeat = 0 | 1 | 2 | 3;
export type BattleRole = "attacker" | "defender";
export type BattleDestination =
  | "graveyard"
  | "banished"
  | "hand"
  | "deck"
  | "extraDeck"
  | "field";

export interface AbsorbingKidBattleGainInput {
  sourceCardId: string;
  sourceUid: string;
  sourcePhysicalOwnerSeat: number;
  sourceControllerTeam: DuelTeam;
  sourceFaceUpWhenDestroying: boolean;
  sourceBattleRole: BattleRole;
  destroyedMonsterUid: string;
  destroyedMonsterLevel: number;
  destroyerUid: string;
  destroyedByBattle: boolean;
  destination: BattleDestination;
  teamLifePoints: readonly [number, number];
}

export type AbsorbingKidTriggerReason =
  | "resolved"
  | "source-not-face-up"
  | "not-destroyed-by-battle"
  | "different-destroyer"
  | "not-sent-to-graveyard";

export interface AbsorbingKidBattleGainResult {
  triggered: boolean;
  reason: AbsorbingKidTriggerReason;
  gainAmount: number;
  recipientTeam: DuelTeam | null;
  teamLifePoints: [number, number];
  sourcePhysicalOwnerSeat: PhysicalSeat;
  sourceBattleRole: BattleRole;
  destroyedMonsterUid: string;
}

function assertSeat(value: number, label: string): asserts value is PhysicalSeat {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error(label + " must be a physical seat from 0 to 3.");
  }
}

function assertTeam(value: number, label: string): asserts value is DuelTeam {
  if (value !== 0 && value !== 1) {
    throw new Error(label + " must be team 0 or 1.");
  }
}

function assertUid(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(label + " is required.");
  }
}

function assertTeamLifePoints(value: readonly [number, number]): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("teamLifePoints must contain exactly two team totals.");
  }
  for (const [index, points] of value.entries()) {
    if (!Number.isSafeInteger(points) || points < 0) {
      throw new Error("team " + index + " Life Points must be a non-negative safe integer.");
    }
  }
  return [value[0], value[1]];
}

function assertDestination(value: string): asserts value is BattleDestination {
  if (!["graveyard", "banished", "hand", "deck", "extraDeck", "field"].includes(value)) {
    throw new Error("invalid battle destination.");
  }
}

/**
 * Resolve Absorbing Kid from the Sky after a battle-destruction event.
 *
 * The effect is eligible when this card was face-up at the point it destroyed
 * the opposing monster, the destruction was by battle, and the destroyed
 * monster was actually sent to the Graveyard. It can trigger while attacking
 * or defending; the source need not remain on the field after the battle.
 *
 * In a 2v2 duel, Life Points belong to the source's current controller team.
 * Physical ownership is retained for audit/UI purposes and never determines
 * which team's Life Points receive the recovery.
 *
 * There is no once-per-turn clause. The caller must invoke this once for each
 * distinct resolved battle event and must not replay the same event.
 */
export function resolveAbsorbingKidFromTheSkyBattleGain(
  input: AbsorbingKidBattleGainInput,
): AbsorbingKidBattleGainResult {
  if (input.sourceCardId !== ABSORBING_KID_FROM_THE_SKY_CARD_ID) {
    throw new Error("sourceCardId must identify Absorbing Kid from the Sky (49771608).");
  }
  assertUid(input.sourceUid, "sourceUid");
  assertUid(input.destroyedMonsterUid, "destroyedMonsterUid");
  assertUid(input.destroyerUid, "destroyerUid");
  if (input.sourceUid === input.destroyedMonsterUid) {
    throw new Error("source and destroyed monster must have different physical UIDs.");
  }

  assertSeat(input.sourcePhysicalOwnerSeat, "sourcePhysicalOwnerSeat");
  assertTeam(input.sourceControllerTeam, "sourceControllerTeam");
  if (typeof input.sourceFaceUpWhenDestroying !== "boolean") {
    throw new Error("sourceFaceUpWhenDestroying must be boolean.");
  }
  if (input.sourceBattleRole !== "attacker" && input.sourceBattleRole !== "defender") {
    throw new Error("sourceBattleRole must be attacker or defender.");
  }
  if (typeof input.destroyedByBattle !== "boolean") {
    throw new Error("destroyedByBattle must be boolean.");
  }
  if (!Number.isInteger(input.destroyedMonsterLevel)
    || input.destroyedMonsterLevel < 1
    || input.destroyedMonsterLevel > 12) {
    throw new Error("destroyedMonsterLevel must be an integer from 1 to 12.");
  }
  assertDestination(input.destination);

  const teamLifePoints = assertTeamLifePoints(input.teamLifePoints);
  let reason: AbsorbingKidTriggerReason = "resolved";
  if (!input.sourceFaceUpWhenDestroying) reason = "source-not-face-up";
  else if (!input.destroyedByBattle) reason = "not-destroyed-by-battle";
  else if (input.destroyerUid !== input.sourceUid) reason = "different-destroyer";
  else if (input.destination !== "graveyard") reason = "not-sent-to-graveyard";

  const triggered = reason === "resolved";
  const gainAmount = triggered ? input.destroyedMonsterLevel * 300 : 0;
  const recipientTeam = triggered ? input.sourceControllerTeam : null;

  if (recipientTeam !== null) {
    const next = teamLifePoints[recipientTeam] + gainAmount;
    if (!Number.isSafeInteger(next)) {
      throw new Error("team Life Points would exceed the safe integer range.");
    }
    teamLifePoints[recipientTeam] = next;
  }

  return {
    triggered,
    reason,
    gainAmount,
    recipientTeam,
    teamLifePoints,
    sourcePhysicalOwnerSeat: input.sourcePhysicalOwnerSeat,
    sourceBattleRole: input.sourceBattleRole,
    destroyedMonsterUid: input.destroyedMonsterUid,
  };
}

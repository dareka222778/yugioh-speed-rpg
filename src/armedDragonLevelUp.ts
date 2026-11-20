export type DuelSeat = 0 | 1 | 2 | 3;
export type DuelTeam = 0 | 1;
export type ArmedDragonPhase = "standby" | "main1" | "main2" | "end";
export type SummonSourceZone = "hand" | "deck";
export type SummonMethod = "normal" | "set" | "other-special" | "armed-dragon-lv5" | "level-up";

export const ARMED_DRAGON_IDS = {
  lv3: "00980973",
  lv5: "46384672",
  lv7: "73879377"
} as const;

export interface ArmedDragonFieldCard {
  uid: string;
  id: string;
  physicalOwnerSeat: DuelSeat;
  controllerTeam: DuelTeam;
  zone: "monster";
  faceUp: boolean;
  negated?: boolean;
  destroyedByBattleTurn?: number;
}

export interface ArmedDragonSummonCandidate {
  uid: string;
  id: string;
  physicalOwnerSeat: DuelSeat;
  zone: SummonSourceZone;
}

export interface ArmedDragonDiscardedMonster {
  uid: string;
  id: string;
  physicalOwnerSeat: DuelSeat;
  zone: "hand";
  kind: "monster";
  originalAtk: number;
}

export interface ArmedDragonOpponentMonster {
  uid: string;
  id: string;
  physicalOwnerSeat: DuelSeat;
  controllerTeam: DuelTeam;
  zone: "monster";
  faceUp: boolean;
  currentAtk: number;
}

export type RuleResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

export interface ArmedDragonLevelUpPlan {
  effectCardId: typeof ARMED_DRAGON_IDS.lv3 | typeof ARMED_DRAGON_IDS.lv5;
  effectPlayerSeat: DuelSeat;
  sourceCardUid: string;
  sourcePhysicalOwnerSeat: DuelSeat;
  sourceGraveyardTeam: DuelTeam;
  summonCardUid: string;
  summonCardId: typeof ARMED_DRAGON_IDS.lv5 | typeof ARMED_DRAGON_IDS.lv7;
  summonPhysicalOwnerSeat: DuelSeat;
  summonFrom: SummonSourceZone;
  summonControllerTeam: DuelTeam;
  phase: "standby" | "end";
}

export interface ArmedDragonDiscardPlan {
  effectCardId: typeof ARMED_DRAGON_IDS.lv5 | typeof ARMED_DRAGON_IDS.lv7;
  effectPlayerSeat: DuelSeat;
  controllerTeam: DuelTeam;
  sourceCardUid: string;
  sourcePhysicalOwnerSeat: DuelSeat;
  discardedMonsterUid: string;
  discardedMonsterId: string;
  discardedMonsterOriginalAtk: number;
  discardGraveyardTeam: DuelTeam;
  targeting: "single" | "all-current";
  selectedTargetUid?: string;
}

export interface ArmedDragonDestroyedCard {
  uid: string;
  physicalOwnerSeat: DuelSeat;
  graveyardTeam: DuelTeam;
}

export interface ArmedDragonDiscardResolution {
  costPaid: true;
  discardedMonsterUid: string;
  discardGraveyardTeam: DuelTeam;
  destroyed: ArmedDragonDestroyedCard[];
}

export function teamOfSeat(seat: number): DuelTeam | undefined {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) return undefined;
  return (seat % 2) as DuelTeam;
}

function resultError<T>(reason: string): RuleResult<T> {
  return { ok: false, reason };
}

function uniqueNonEmptyUids(cards: readonly { uid: string }[]): boolean {
  const seen = new Set<string>();
  for (const card of cards) {
    if (typeof card.uid !== "string" || card.uid.trim().length === 0 || seen.has(card.uid)) return false;
    seen.add(card.uid);
  }
  return true;
}

function validAtk(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 99999;
}

function isOpposingFaceUpMonster(
  monster: ArmedDragonOpponentMonster,
  controllerTeam: DuelTeam,
  threshold: number
): boolean {
  return monster.zone === "monster"
    && monster.controllerTeam !== controllerTeam
    && monster.faceUp === true
    && validAtk(monster.currentAtk)
    && monster.currentAtk <= threshold
    && teamOfSeat(monster.physicalOwnerSeat) !== undefined;
}

/**
 * Plans the classic LV3 -> LV5 or LV5 -> LV7 effect.
 * The caller supplies only the active effect player's private Hand/Deck candidates.
 * The source monster is sent to its physical owner's team GY; the summoned monster
 * comes from the resolving player's own Hand/Deck.
 */
export function planArmedDragonLevelUp(input: {
  sourceCard: ArmedDragonFieldCard;
  phase: ArmedDragonPhase;
  turn: number;
  effectPlayerSeat: DuelSeat;
  teamMonsterCount: number;
  summonCandidates: readonly ArmedDragonSummonCandidate[];
  selectedSummonUid: string;
}): RuleResult<ArmedDragonLevelUpPlan> {
  const { sourceCard, phase, turn, effectPlayerSeat, teamMonsterCount, summonCandidates, selectedSummonUid } = input;
  const effectTeam = teamOfSeat(effectPlayerSeat);
  if (effectTeam === undefined) return resultError("invalid-effect-player-seat");
  if (sourceCard.zone !== "monster" || sourceCard.faceUp !== true || sourceCard.negated === true) {
    return resultError("source-not-face-up-and-usable");
  }
  if (sourceCard.controllerTeam !== effectTeam) return resultError("source-not-controlled-by-effect-team");
  if (teamOfSeat(sourceCard.physicalOwnerSeat) === undefined) return resultError("invalid-source-physical-owner");
  if (!Number.isInteger(turn) || turn < 0) return resultError("invalid-turn");
  if (!Number.isInteger(teamMonsterCount) || teamMonsterCount < 1 || teamMonsterCount > 3) {
    return resultError("invalid-shared-monster-zone-count");
  }
  if (!uniqueNonEmptyUids([sourceCard, ...summonCandidates])) return resultError("duplicate-or-invalid-uid");

  let expectedSourceId: string;
  let expectedSummonId: typeof ARMED_DRAGON_IDS.lv5 | typeof ARMED_DRAGON_IDS.lv7;
  let expectedPhase: "standby" | "end";
  if (sourceCard.id === ARMED_DRAGON_IDS.lv3) {
    expectedSourceId = ARMED_DRAGON_IDS.lv3;
    expectedSummonId = ARMED_DRAGON_IDS.lv5;
    expectedPhase = "standby";
  } else if (sourceCard.id === ARMED_DRAGON_IDS.lv5) {
    expectedSourceId = ARMED_DRAGON_IDS.lv5;
    expectedSummonId = ARMED_DRAGON_IDS.lv7;
    expectedPhase = "end";
    if (sourceCard.destroyedByBattleTurn !== turn) return resultError("lv5-did-not-destroy-by-battle-this-turn");
  } else {
    return resultError("unsupported-level-up-source");
  }

  if (phase !== expectedPhase) return resultError("wrong-level-up-phase");
  if (sourceCard.id !== expectedSourceId) return resultError("wrong-level-up-source");
  const candidate = summonCandidates.find(item => item.uid === selectedSummonUid);
  if (!candidate) return resultError("selected-summon-not-available");
  if (candidate.id !== expectedSummonId) return resultError("wrong-next-level-card");
  if (candidate.physicalOwnerSeat !== effectPlayerSeat) return resultError("summon-card-not-in-effect-player-private-zones");
  if (candidate.zone !== "hand" && candidate.zone !== "deck") return resultError("invalid-summon-source-zone");

  return {
    ok: true,
    value: {
      effectCardId: sourceCard.id as typeof ARMED_DRAGON_IDS.lv3 | typeof ARMED_DRAGON_IDS.lv5,
      effectPlayerSeat,
      sourceCardUid: sourceCard.uid,
      sourcePhysicalOwnerSeat: sourceCard.physicalOwnerSeat,
      sourceGraveyardTeam: teamOfSeat(sourceCard.physicalOwnerSeat) as DuelTeam,
      summonCardUid: candidate.uid,
      summonCardId: expectedSummonId,
      summonPhysicalOwnerSeat: candidate.physicalOwnerSeat,
      summonFrom: candidate.zone,
      summonControllerTeam: effectTeam,
      phase: expectedPhase
    }
  };
}

/**
 * Plans the discard cost for LV5/LV7. LV5 targets one face-up opposing monster
 * after the discard; LV7 does not target and evaluates the opposing field at resolution.
 * No game object is mutated by this helper.
 */
export function prepareArmedDragonDiscardEffect(input: {
  sourceCard: ArmedDragonFieldCard;
  phase: ArmedDragonPhase;
  effectPlayerSeat: DuelSeat;
  discardedMonster: ArmedDragonDiscardedMonster;
  opposingMonstersAtActivation: readonly ArmedDragonOpponentMonster[];
  selectedTargetUid?: string;
}): RuleResult<ArmedDragonDiscardPlan> {
  const { sourceCard, phase, effectPlayerSeat, discardedMonster, opposingMonstersAtActivation, selectedTargetUid } = input;
  const effectTeam = teamOfSeat(effectPlayerSeat);
  if (effectTeam === undefined) return resultError("invalid-effect-player-seat");
  if (phase !== "main1" && phase !== "main2") return resultError("wrong-ignition-phase");
  if (sourceCard.id !== ARMED_DRAGON_IDS.lv5 && sourceCard.id !== ARMED_DRAGON_IDS.lv7) {
    return resultError("unsupported-discard-effect-source");
  }
  if (sourceCard.zone !== "monster" || sourceCard.faceUp !== true || sourceCard.negated === true) {
    return resultError("source-not-face-up-and-usable");
  }
  if (sourceCard.controllerTeam !== effectTeam) return resultError("source-not-controlled-by-effect-team");
  if (teamOfSeat(sourceCard.physicalOwnerSeat) === undefined) return resultError("invalid-source-physical-owner");
  if (discardedMonster.zone !== "hand" || discardedMonster.kind !== "monster") {
    return resultError("discard-cost-must-be-monster-in-hand");
  }
  if (discardedMonster.physicalOwnerSeat !== effectPlayerSeat) {
    return resultError("discard-cost-not-in-effect-player-private-hand");
  }
  if (!validAtk(discardedMonster.originalAtk)) return resultError("invalid-discarded-monster-atk");
  if (!uniqueNonEmptyUids([sourceCard, discardedMonster, ...opposingMonstersAtActivation])) {
    return resultError("duplicate-or-invalid-uid");
  }

  const isLv5 = sourceCard.id === ARMED_DRAGON_IDS.lv5;
  if (isLv5) {
    if (!selectedTargetUid) return resultError("lv5-requires-one-target");
    const target = opposingMonstersAtActivation.find(item => item.uid === selectedTargetUid);
    if (!target || !isOpposingFaceUpMonster(target, effectTeam, discardedMonster.originalAtk)) {
      return resultError("lv5-target-not-eligible");
    }
  } else if (selectedTargetUid !== undefined) {
    return resultError("lv7-effect-does-not-target");
  }

  return {
    ok: true,
    value: {
      effectCardId: sourceCard.id as typeof ARMED_DRAGON_IDS.lv5 | typeof ARMED_DRAGON_IDS.lv7,
      effectPlayerSeat,
      controllerTeam: effectTeam,
      sourceCardUid: sourceCard.uid,
      sourcePhysicalOwnerSeat: sourceCard.physicalOwnerSeat,
      discardedMonsterUid: discardedMonster.uid,
      discardedMonsterId: discardedMonster.id,
      discardedMonsterOriginalAtk: discardedMonster.originalAtk,
      discardGraveyardTeam: effectTeam,
      targeting: isLv5 ? "single" : "all-current",
      ...(isLv5 ? { selectedTargetUid } : {})
    }
  };
}

/**
 * Resolves against the live opposing field. LV5 revalidates its one targeted UID;
 * LV7 destroys every currently face-up opposing monster within the discarded ATK,
 * without target-locking. The discarded monster remains paid even if no target survives.
 */
export function resolveArmedDragonDiscardEffect(
  plan: ArmedDragonDiscardPlan,
  currentMonsters: readonly ArmedDragonOpponentMonster[]
): RuleResult<ArmedDragonDiscardResolution> {
  if (!uniqueNonEmptyUids(currentMonsters)) return resultError("duplicate-or-invalid-current-monster-uid");
  const destroyed: ArmedDragonDestroyedCard[] = [];
  if (plan.targeting === "single") {
    const target = currentMonsters.find(item => item.uid === plan.selectedTargetUid);
    if (target && isOpposingFaceUpMonster(target, plan.controllerTeam, plan.discardedMonsterOriginalAtk)) {
      destroyed.push({
        uid: target.uid,
        physicalOwnerSeat: target.physicalOwnerSeat,
        graveyardTeam: teamOfSeat(target.physicalOwnerSeat) as DuelTeam
      });
    }
  } else {
    for (const monster of currentMonsters) {
      if (isOpposingFaceUpMonster(monster, plan.controllerTeam, plan.discardedMonsterOriginalAtk)) {
        destroyed.push({
          uid: monster.uid,
          physicalOwnerSeat: monster.physicalOwnerSeat,
          graveyardTeam: teamOfSeat(monster.physicalOwnerSeat) as DuelTeam
        });
      }
    }
  }
  return {
    ok: true,
    value: {
      costPaid: true,
      discardedMonsterUid: plan.discardedMonsterUid,
      discardGraveyardTeam: plan.discardGraveyardTeam,
      destroyed
    }
  };
}

/** LV7 cannot be Normal Summoned/Set; Level Up! may bypass its LV5 summon condition from hand/Deck. */
export function canSummonArmedDragonLv7(method: SummonMethod, sourceZone: SummonSourceZone | "grave" | "banished"): boolean {
  if (sourceZone !== "hand" && sourceZone !== "deck") return false;
  return method === "armed-dragon-lv5" || method === "level-up";
}

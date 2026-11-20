export type DuelSeat = 0 | 1 | 2 | 3;
export type DuelTeam = 0 | 1;
export type HandCardKind = "monster" | "spell" | "trap";

export const AMAZONESS_CHAIN_MASTER_ID = "29654737";
export const AMAZONESS_CHAIN_MASTER_LP_COST = 1500;

export interface ChainMasterTriggerCard {
  uid: string;
  id: string;
  physicalOwnerSeat: DuelSeat;
  zone: "grave";
  sentToGyByBattle: boolean;
  destroyedByBattleTurn: number;
}

export interface PrivateHandCard {
  uid: string;
  id: string;
  physicalOwnerSeat: DuelSeat;
  holderSeat: DuelSeat;
  zone: "hand";
  kind: HandCardKind;
}

export type RuleResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

export interface AmazonessChainMasterPlan {
  active: boolean;
  effectPlayerSeat: DuelSeat;
  opponentSeat: DuelSeat;
  triggerCardUid: string;
  triggerPhysicalOwnerSeat: DuelSeat;
  teamLifePointsBefore: number;
  teamLifePointsAfter: number;
  costPaid: boolean;
}

export interface HandInspectionProjection {
  visible: boolean;
  viewerSeat: DuelSeat;
  opponentSeat: DuelSeat;
  cards: Array<Pick<PrivateHandCard, "uid" | "id" | "physicalOwnerSeat" | "kind">>;
}

export interface StolenHandCard {
  uid: string;
  id: string;
  kind: "monster";
  physicalOwnerSeat: DuelSeat;
  previousHolderSeat: DuelSeat;
  newHolderSeat: DuelSeat;
}

export interface AmazonessChainMasterResolution {
  costPaid: boolean;
  teamLifePointsAfter: number;
  transferred: StolenHandCard | null;
  noMonsterAvailableAtResolution: boolean;
}

export interface TransferProjection {
  visible: boolean;
  viewerSeat: DuelSeat;
  card?: Pick<StolenHandCard, "uid" | "id" | "physicalOwnerSeat" | "previousHolderSeat" | "newHolderSeat">;
}

export function teamOfSeat(seat: number): DuelTeam | undefined {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) return undefined;
  return (seat % 2) as DuelTeam;
}

function error<T>(reason: string): RuleResult<T> {
  return { ok: false, reason };
}

function validUids(cards: readonly { uid: string }[]): boolean {
  const seen = new Set<string>();
  for (const card of cards) {
    if (typeof card.uid !== "string" || card.uid.trim().length === 0 || seen.has(card.uid)) return false;
    seen.add(card.uid);
  }
  return true;
}

function validateOpponentHand(
  hand: readonly PrivateHandCard[],
  opponentSeat: DuelSeat
): string | undefined {
  if (!validUids(hand)) return "duplicate-or-invalid-hand-uid";
  for (const card of hand) {
    if (card.zone !== "hand" || card.holderSeat !== opponentSeat) return "hand-card-not-held-by-selected-opponent";
    if (teamOfSeat(card.physicalOwnerSeat) === undefined) return "invalid-hand-card-physical-owner";
    if (typeof card.id !== "string" || card.id.trim().length === 0) return "invalid-hand-card-id";
  }
  return undefined;
}

/**
 * Plans the optional 1500 LP trigger. The opponent seat is explicit: in 2v2
 * it is the seat that controlled the monster involved in the battle event.
 * Only the resolving seat receives the private hand inspection projection.
 */
export function planAmazonessChainMasterEffect(input: {
  sourceCard: ChainMasterTriggerCard;
  turn: number;
  effectPlayerSeat: DuelSeat;
  opponentSeat: DuelSeat;
  teamLifePoints: number;
  acceptEffect: boolean;
  opponentHandAtActivation: readonly PrivateHandCard[];
}): RuleResult<AmazonessChainMasterPlan> {
  const { sourceCard, turn, effectPlayerSeat, opponentSeat, teamLifePoints, acceptEffect, opponentHandAtActivation } = input;
  const effectTeam = teamOfSeat(effectPlayerSeat);
  const opponentTeam = teamOfSeat(opponentSeat);
  if (effectTeam === undefined || opponentTeam === undefined) return error("invalid-seat");
  if (effectTeam === opponentTeam) return error("selected-opponent-is-not-opposing-team");
  if (sourceCard.id !== AMAZONESS_CHAIN_MASTER_ID || sourceCard.zone !== "grave") {
    return error("source-card-not-amazoness-chain-master-in-grave");
  }
  if (teamOfSeat(sourceCard.physicalOwnerSeat) !== effectTeam) {
    return error("trigger-card-not-owned-by-effect-team");
  }
  if (!validUids([sourceCard])) return error("invalid-trigger-card-uid");
  if (sourceCard.sentToGyByBattle !== true || sourceCard.destroyedByBattleTurn !== turn) {
    return error("trigger-not-destroyed-by-battle-this-turn");
  }
  if (!Number.isInteger(turn) || turn < 0) return error("invalid-turn");
  if (!Number.isInteger(teamLifePoints) || teamLifePoints < 0 || teamLifePoints > 4000) {
    return error("invalid-team-life-points");
  }
  const handError = validateOpponentHand(opponentHandAtActivation, opponentSeat);
  if (handError) return error(handError);

  if (!acceptEffect) {
    return {
      ok: true,
      value: {
        active: false,
        effectPlayerSeat,
        opponentSeat,
        triggerCardUid: sourceCard.uid,
        triggerPhysicalOwnerSeat: sourceCard.physicalOwnerSeat,
        teamLifePointsBefore: teamLifePoints,
        teamLifePointsAfter: teamLifePoints,
        costPaid: false
      }
    };
  }
  if (teamLifePoints < AMAZONESS_CHAIN_MASTER_LP_COST) return error("insufficient-team-life-points");
  if (!opponentHandAtActivation.some(card => card.kind === "monster")) {
    return error("no-monster-in-opponent-hand-at-activation");
  }

  return {
    ok: true,
    value: {
      active: true,
      effectPlayerSeat,
      opponentSeat,
      triggerCardUid: sourceCard.uid,
      triggerPhysicalOwnerSeat: sourceCard.physicalOwnerSeat,
      teamLifePointsBefore: teamLifePoints,
      teamLifePointsAfter: teamLifePoints - AMAZONESS_CHAIN_MASTER_LP_COST,
      costPaid: true
    }
  };
}

/** The full opponent hand is returned only to the effect-resolving seat. */
export function projectAmazonessChainMasterInspection(
  plan: AmazonessChainMasterPlan,
  viewerSeat: DuelSeat,
  currentOpponentHand: readonly PrivateHandCard[]
): RuleResult<HandInspectionProjection> {
  if (!plan.active) return error("effect-was-declined");
  if (teamOfSeat(viewerSeat) === undefined) return error("invalid-viewer-seat");
  const handError = validateOpponentHand(currentOpponentHand, plan.opponentSeat);
  if (handError) return error(handError);
  if (viewerSeat !== plan.effectPlayerSeat) {
    return {
      ok: true,
      value: { visible: false, viewerSeat, opponentSeat: plan.opponentSeat, cards: [] }
    };
  }
  return {
    ok: true,
    value: {
      visible: true,
      viewerSeat,
      opponentSeat: plan.opponentSeat,
      cards: currentOpponentHand.map(({ uid, id, physicalOwnerSeat, kind }) => ({ uid, id, physicalOwnerSeat, kind }))
    }
  };
}

/**
 * Selects one monster after the private inspection. Physical ownership never changes:
 * only the holder/hand seat changes from the inspected opponent to the effect player.
 */
export function resolveAmazonessChainMasterEffect(
  plan: AmazonessChainMasterPlan,
  currentOpponentHand: readonly PrivateHandCard[],
  selectedMonsterUid: string
): RuleResult<AmazonessChainMasterResolution> {
  if (!plan.active || !plan.costPaid) return error("effect-not-activated");
  const handError = validateOpponentHand(currentOpponentHand, plan.opponentSeat);
  if (handError) return error(handError);
  const eligibleMonsters = currentOpponentHand.filter(card => card.kind === "monster");
  if (eligibleMonsters.length === 0) {
    return {
      ok: true,
      value: {
        costPaid: true,
        teamLifePointsAfter: plan.teamLifePointsAfter,
        transferred: null,
        noMonsterAvailableAtResolution: true
      }
    };
  }
  const selected = currentOpponentHand.find(card => card.uid === selectedMonsterUid);
  if (!selected) return error("selected-card-not-in-opponent-hand");
  if (selected.kind !== "monster") return error("selected-card-is-not-monster");
  return {
    ok: true,
    value: {
      costPaid: true,
      teamLifePointsAfter: plan.teamLifePointsAfter,
      transferred: {
        uid: selected.uid,
        id: selected.id,
        kind: "monster",
        physicalOwnerSeat: selected.physicalOwnerSeat,
        previousHolderSeat: plan.opponentSeat,
        newHolderSeat: plan.effectPlayerSeat
      },
      noMonsterAvailableAtResolution: false
    }
  };
}

/** The selected card is identifiable only to the two seats directly involved. */
export function projectAmazonessChainMasterTransfer(
  plan: AmazonessChainMasterPlan,
  transfer: StolenHandCard | null,
  viewerSeat: DuelSeat
): RuleResult<TransferProjection> {
  if (teamOfSeat(viewerSeat) === undefined) return error("invalid-viewer-seat");
  if (!plan.active || !transfer || (viewerSeat !== plan.effectPlayerSeat && viewerSeat !== plan.opponentSeat)) {
    return { ok: true, value: { visible: false, viewerSeat } };
  }
  return {
    ok: true,
    value: {
      visible: true,
      viewerSeat,
      card: {
        uid: transfer.uid,
        id: transfer.id,
        physicalOwnerSeat: transfer.physicalOwnerSeat,
        previousHolderSeat: transfer.previousHolderSeat,
        newHolderSeat: transfer.newHolderSeat
      }
    }
  };
}

export function amazonessChainMasterPublicSummary(): string {
  return "Amazoness Chain Master: efeito resolvido; identidades de cartas privadas não são exibidas publicamente.";
}

import type { TagDuel } from './tagDuel';
import { getPlayableCard } from './effectRegistry';
import {
  AMAZONESS_CHAIN_MASTER_ID,
  amazonessChainMasterPublicSummary,
  planAmazonessChainMasterEffect,
  projectAmazonessChainMasterInspection,
  projectAmazonessChainMasterTransfer,
  resolveAmazonessChainMasterEffect,
  teamOfSeat,
  type AmazonessChainMasterPlan,
  type AmazonessChainMasterResolution,
  type DuelSeat,
  type HandInspectionProjection,
  type PrivateHandCard,
  type RuleResult,
  type StolenHandCard,
  type TransferProjection,
} from './amazonessChainMaster';

export const AMAZONESS_CHAIN_MASTER_TAG_ID = AMAZONESS_CHAIN_MASTER_ID;
export type TagPhysicalSeat = DuelSeat;
export type TagDuelTeam = 0 | 1;

export interface TagBattleDestructionEvent {
  readonly kind: 'battle-destruction';
  readonly sourceUid: string;
  /** The active physical seat that controlled the opposing monster in this battle. */
  readonly opponentSeat: TagPhysicalSeat;
  readonly turn: number;
  readonly sentToGyByBattle: true;
}

export interface TagAmazonessChainMasterPlan {
  readonly turn: number;
  readonly team: TagDuelTeam;
  readonly effectPlayerSeat: TagPhysicalSeat;
  readonly opponentSeat: TagPhysicalSeat;
  readonly effect: AmazonessChainMasterPlan;
}

type HeldHand = { readonly hand: readonly { readonly uid: string; readonly id: string }[] };

function fail<T>(reason: string): RuleResult<T> {
  return { ok: false, reason };
}

function isSeat(value: number): value is TagPhysicalSeat {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

function physicalSeatFromUid(uid: string): TagPhysicalSeat | null {
  const match = /^m([0-3]):/.exec(uid);
  return match ? (Number(match[1]) as TagPhysicalSeat) : null;
}

function heldBySeat(game: TagDuel, seat: TagPhysicalSeat): HeldHand | undefined {
  const team = (seat % 2) as TagDuelTeam;
  if (game.active[team] === seat) return game.core.players[team];
  return game.reserves[String(seat)];
}

function readPhysicalHand(game: TagDuel, holderSeat: TagPhysicalSeat): RuleResult<PrivateHandCard[]> {
  const held = heldBySeat(game, holderSeat);
  if (!held || !Array.isArray(held.hand)) return fail('physical-hand-not-found');
  const seen = new Set<string>();
  const cards: PrivateHandCard[] = [];
  for (const card of held.hand) {
    if (typeof card.uid !== 'string' || !card.uid.trim() || seen.has(card.uid)) {
      return fail('duplicate-or-invalid-physical-hand-uid');
    }
    seen.add(card.uid);
    const physicalOwnerSeat = physicalSeatFromUid(card.uid);
    if (physicalOwnerSeat === null) return fail('hand-card-without-physical-owner');
    const definition = getPlayableCard(card.id);
    if (!definition) return fail('hand-card-not-in-certified-playable-catalog');
    const kind = definition.kind;
    if (kind !== 'monster' && kind !== 'spell' && kind !== 'trap') {
      return fail('unsupported-hand-card-kind');
    }
    cards.push({
      uid: card.uid,
      id: card.id,
      physicalOwnerSeat,
      holderSeat,
      zone: 'hand',
      kind,
    });
  }
  return { ok: true, value: cards };
}

interface TriggerContext {
  readonly team: TagDuelTeam;
  readonly effectPlayerSeat: TagPhysicalSeat;
  readonly opponentSeat: TagPhysicalSeat;
  readonly source: { readonly uid: string; readonly id: string; readonly physicalOwnerSeat: TagPhysicalSeat };
  readonly hand: readonly PrivateHandCard[];
  readonly lifePoints: number;
}

function readTriggerContext(game: TagDuel, event: TagBattleDestructionEvent): RuleResult<TriggerContext> {
  if (!game || game.mode !== 'tag-classic') return fail('classic-tag-duel-required');
  if (!game.core || !Array.isArray(game.core.players) || game.core.players.length !== 2 ||
      !Array.isArray(game.active) || game.active.length !== 2) return fail('invalid-tag-duel-shape');

  const team = game.core.current;
  if (team !== 0 && team !== 1) return fail('invalid-current-team');
  const opponentTeam = (1 - team) as TagDuelTeam;
  const effectPlayerSeat = game.active[team];
  if (!isSeat(effectPlayerSeat) || effectPlayerSeat % 2 !== team || game.cursor !== effectPlayerSeat) {
    return fail('active-resolver-seat-mismatch');
  }
  if (!event || event.kind !== 'battle-destruction' || event.sentToGyByBattle !== true ||
      !Number.isSafeInteger(event.turn) || event.turn !== game.core.turn || !Number.isSafeInteger(game.core.turn)) {
    return fail('not-a-current-turn-battle-destruction-event');
  }
  if (typeof event.sourceUid !== 'string' || !event.sourceUid.trim()) return fail('invalid-trigger-source-uid');

  const opponentSeat = event.opponentSeat;
  if (!isSeat(opponentSeat) || opponentSeat % 2 !== opponentTeam || game.active[opponentTeam] !== opponentSeat) {
    return fail('opponent-seat-must-be-active-battle-controller');
  }

  const source = game.core.players[team].grave.find(card => card.uid === event.sourceUid);
  if (!source || source.id !== AMAZONESS_CHAIN_MASTER_ID) return fail('amazoness-chain-master-not-in-shared-grave');
  const physicalOwnerSeat = physicalSeatFromUid(source.uid);
  if (physicalOwnerSeat === null || teamOfSeat(physicalOwnerSeat) !== team) {
    return fail('trigger-source-physical-owner-is-not-effect-team');
  }

  const hand = readPhysicalHand(game, opponentSeat);
  if (!hand.ok) return hand;
  return {
    ok: true,
    value: {
      team,
      effectPlayerSeat,
      opponentSeat,
      source: { uid: source.uid, id: source.id, physicalOwnerSeat },
      hand: hand.value,
      lifePoints: game.core.players[team].lp,
    },
  };
}

function readPlanHand(
  game: TagDuel,
  plan: TagAmazonessChainMasterPlan,
): RuleResult<PrivateHandCard[]> {
  if (!plan || !plan.effect || (plan.team !== 0 && plan.team !== 1) ||
      !isSeat(plan.effectPlayerSeat) || !isSeat(plan.opponentSeat) ||
      plan.effect.effectPlayerSeat !== plan.effectPlayerSeat ||
      plan.effect.opponentSeat !== plan.opponentSeat ||
      !plan.effect.triggerCardUid.trim() ||
      teamOfSeat(plan.effect.triggerPhysicalOwnerSeat) !== plan.team) {
    return fail('invalid-chain-master-plan');
  }
  if (!game || game.mode !== 'tag-classic' || !game.core || !Array.isArray(game.core.players) ||
      game.core.players.length !== 2 || !Array.isArray(game.active) || game.active.length !== 2) {
    return fail('classic-tag-duel-required');
  }
  if (game.core.current !== plan.team || game.core.turn !== plan.turn) return fail('stale-chain-master-turn');
  if (game.active[plan.team] !== plan.effectPlayerSeat || game.cursor !== plan.effectPlayerSeat) {
    return fail('stale-chain-master-resolver-seat');
  }
  const opponentTeam = (1 - plan.team) as TagDuelTeam;
  if (game.active[opponentTeam] !== plan.opponentSeat) return fail('stale-chain-master-opponent-seat');

  const currentLp = game.core.players[plan.team].lp;
  if (currentLp !== plan.effect.teamLifePointsBefore && currentLp !== plan.effect.teamLifePointsAfter) {
    return fail('stale-chain-master-team-life-points');
  }
  return readPhysicalHand(game, plan.opponentSeat);
}

/** Captures the real shared-GY source and the explicit opposing battle controller.
 * This adapter only plans the 1500-LP cost; the caller must commit that cost atomically. */
export function planTagAmazonessChainMaster(
  game: TagDuel,
  event: TagBattleDestructionEvent,
  acceptEffect: boolean,
): RuleResult<TagAmazonessChainMasterPlan> {
  const context = readTriggerContext(game, event);
  if (!context.ok) return context;
  const effect = planAmazonessChainMasterEffect({
    sourceCard: {
      uid: context.value.source.uid,
      id: context.value.source.id,
      physicalOwnerSeat: context.value.source.physicalOwnerSeat,
      zone: 'grave',
      sentToGyByBattle: true,
      destroyedByBattleTurn: event.turn,
    },
    turn: game.core.turn,
    effectPlayerSeat: context.value.effectPlayerSeat,
    opponentSeat: context.value.opponentSeat,
    teamLifePoints: context.value.lifePoints,
    acceptEffect,
    opponentHandAtActivation: context.value.hand,
  });
  if (!effect.ok) return effect;
  return {
    ok: true,
    value: {
      turn: game.core.turn,
      team: context.value.team,
      effectPlayerSeat: context.value.effectPlayerSeat,
      opponentSeat: context.value.opponentSeat,
      effect: effect.value,
    },
  };
}

/** Only the resolving physical seat receives card identities from the inspected hand. */
export function projectTagAmazonessChainMasterInspection(
  game: TagDuel,
  plan: TagAmazonessChainMasterPlan,
  viewerSeat: TagPhysicalSeat,
): RuleResult<HandInspectionProjection> {
  const hand = readPlanHand(game, plan);
  if (!hand.ok) return hand;
  return projectAmazonessChainMasterInspection(plan.effect, viewerSeat, hand.value);
}

/** Re-reads the selected opponent's current physical hand; stale selections fail closed. */
export function resolveTagAmazonessChainMaster(
  game: TagDuel,
  plan: TagAmazonessChainMasterPlan,
  selectedMonsterUid: string,
): RuleResult<AmazonessChainMasterResolution> {
  const hand = readPlanHand(game, plan);
  if (!hand.ok) return hand;
  return resolveAmazonessChainMasterEffect(plan.effect, hand.value, selectedMonsterUid);
}

/** The stolen card identity is visible only to the resolver and inspected opponent. */
export function projectTagAmazonessChainMasterTransfer(
  plan: TagAmazonessChainMasterPlan,
  transfer: StolenHandCard | null,
  viewerSeat: TagPhysicalSeat,
): RuleResult<TransferProjection> {
  if (transfer) {
    if (physicalSeatFromUid(transfer.uid) !== transfer.physicalOwnerSeat ||
        transfer.previousHolderSeat !== plan.opponentSeat ||
        transfer.newHolderSeat !== plan.effectPlayerSeat ||
        teamOfSeat(transfer.physicalOwnerSeat) === undefined) {
      return fail('transfer-does-not-match-chain-master-plan');
    }
  }
  return projectAmazonessChainMasterTransfer(plan.effect, transfer, viewerSeat);
}

export function tagAmazonessChainMasterPublicSummary(): string {
  return amazonessChainMasterPublicSummary();
}

import type { TagDuel } from './tagDuel';
import type { Monster } from './duelEngine';
import { atk } from './duelEngine';
import { monsterEffectsNegated } from './continuousEffects';
import { getPlayableCard } from './effectRegistry';
import {
  ARMED_DRAGON_IDS,
  canSummonArmedDragonLv7,
  planArmedDragonLevelUp,
  prepareArmedDragonDiscardEffect,
  resolveArmedDragonDiscardEffect,
  teamOfSeat,
  type ArmedDragonDiscardedMonster,
  type ArmedDragonDiscardPlan,
  type ArmedDragonDiscardResolution,
  type ArmedDragonFieldCard,
  type ArmedDragonLevelUpPlan,
  type ArmedDragonOpponentMonster,
  type ArmedDragonPhase,
  type DuelSeat,
  type RuleResult,
  type SummonMethod,
  type SummonSourceZone,
} from './armedDragonLevelUp';

export const ARMED_DRAGON_LV3_STANDBY_OPTION_ID = 'level-up';
export type TagArmedDragonTeam = 0 | 1;

export interface ArmedDragonBattleDestructionRecord {
  readonly sourceUid: string;
  readonly destroyedMonsterUid: string;
  readonly turn: number;
}

export interface TagArmedDragonLevelUpPlan {
  readonly turn: number;
  readonly team: TagArmedDragonTeam;
  readonly effectPlayerSeat: DuelSeat;
  readonly sourceUid: string;
  readonly effect: ArmedDragonLevelUpPlan;
}

export interface TagArmedDragonDiscardPlan {
  readonly turn: number;
  readonly team: TagArmedDragonTeam;
  readonly effectPlayerSeat: DuelSeat;
  readonly effect: ArmedDragonDiscardPlan;
}

type AdapterResult<T> = RuleResult<T>;

function fail<T>(reason: string): AdapterResult<T> {
  return { ok: false, reason };
}

function isSeat(value: number): value is DuelSeat {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

function physicalSeatFromUid(uid: string): DuelSeat | null {
  const match = /^m([0-3]):/.exec(uid);
  return match ? (Number(match[1]) as DuelSeat) : null;
}

function readActiveContext(game: TagDuel): AdapterResult<{
  team: TagArmedDragonTeam;
  effectPlayerSeat: DuelSeat;
  opponentTeam: TagArmedDragonTeam;
}> {
  if (!game || game.mode !== 'tag-classic') return fail('classic-tag-duel-required');
  if (!game.core || !Array.isArray(game.core.players) || game.core.players.length !== 2 ||
      !Array.isArray(game.active) || game.active.length !== 2) return fail('invalid-tag-duel-shape');
  const team = game.core.current;
  if (team !== 0 && team !== 1) return fail('invalid-current-team');
  const effectPlayerSeat = game.active[team];
  if (!isSeat(effectPlayerSeat) || effectPlayerSeat % 2 !== team || game.cursor !== effectPlayerSeat) {
    return fail('active-resolver-seat-mismatch');
  }
  return {
    ok: true,
    value: {
      team,
      effectPlayerSeat,
      opponentTeam: (1 - team) as TagArmedDragonTeam,
    },
  };
}

function readSourceCard(game: TagDuel, team: TagArmedDragonTeam, sourceUid: string): RuleResult<ArmedDragonFieldCard> {
  if (typeof sourceUid !== 'string' || !sourceUid.trim()) return fail('invalid-source-uid');
  const source = game.core.players[team].monsters.find(card => card.uid === sourceUid);
  if (!source) return fail('armed-dragon-source-not-on-shared-field');
  const physicalOwnerSeat = physicalSeatFromUid(source.uid);
  if (physicalOwnerSeat === null) return fail('source-without-physical-owner');
  return {
    ok: true,
    value: {
      uid: source.uid,
      id: source.id,
      physicalOwnerSeat,
      controllerTeam: team,
      zone: 'monster',
      faceUp: source.faceUp,
      negated: monsterEffectsNegated(game.core, source.uid),
    },
  };
}

function readSummonCandidates(
  game: TagDuel,
  team: TagArmedDragonTeam,
  effectPlayerSeat: DuelSeat,
  expectedId: string,
): Array<{ uid: string; id: string; physicalOwnerSeat: DuelSeat; zone: SummonSourceZone }> {
  const player = game.core.players[team];
  const candidates: Array<{ uid: string; id: string; physicalOwnerSeat: DuelSeat; zone: SummonSourceZone }> = [];
  for (const [zone, cards] of [['hand', player.hand], ['deck', player.deck]] as const) {
    for (const card of cards) {
      if (card.id !== expectedId) continue;
      const physicalOwnerSeat = physicalSeatFromUid(card.uid);
      if (physicalOwnerSeat === effectPlayerSeat) {
        candidates.push({ uid: card.uid, id: card.id, physicalOwnerSeat, zone });
      }
    }
  }
  return candidates;
}

export function armedDragonLv3StandbyTaskId(sourceUid: string, turn: number): string {
  return `armed-dragon-lv3:${sourceUid}:${turn}`;
}

function validateLv3StandbyWindow(game: TagDuel, team: TagArmedDragonTeam, sourceUid: string): boolean {
  const taskId = armedDragonLv3StandbyTaskId(sourceUid, game.core.turn);
  const flow = game.core.standby;
  const task = flow?.tasks.find(item => item.id === taskId);
  return game.core.phase === 'choice' &&
    game.core.choice?.source === 'standby' &&
    game.core.choice.actor === team &&
    game.core.choice.targets.includes(ARMED_DRAGON_LV3_STANDBY_OPTION_ID) &&
    game.core.choice.targets.includes('__skip__') &&
    flow?.active?.id === taskId &&
    flow.active.status === 'choosing' &&
    task?.turn === game.core.turn &&
    task.actor === team &&
    task.optional === true &&
    task.options.some(option => option.id === ARMED_DRAGON_LV3_STANDBY_OPTION_ID);
}

export function planTagArmedDragonLevelUp(
  game: TagDuel,
  sourceUid: string,
  selectedSummonUid: string,
  battleDestruction?: ArmedDragonBattleDestructionRecord,
): RuleResult<TagArmedDragonLevelUpPlan> {
  const context = readActiveContext(game);
  if (!context.ok) return context;
  const source = readSourceCard(game, context.value.team, sourceUid);
  if (!source.ok) return source;

  let phase: ArmedDragonPhase;
  if (source.value.id === ARMED_DRAGON_IDS.lv3) {
    if (!validateLv3StandbyWindow(game, context.value.team, sourceUid)) return fail('lv3-standby-task-not-active');
    phase = 'standby';
  } else if (source.value.id === ARMED_DRAGON_IDS.lv5) {
    if (game.core.phase !== 'main' || game.core.turnEnding !== true) return fail('lv5-end-phase-window-not-active');
    if (!battleDestruction || battleDestruction.sourceUid !== sourceUid ||
        battleDestruction.turn !== game.core.turn ||
        typeof battleDestruction.destroyedMonsterUid !== 'string' ||
        !battleDestruction.destroyedMonsterUid.trim()) return fail('lv5-current-turn-battle-destruction-record-required');
    phase = 'end';
  } else {
    return fail('unsupported-armed-dragon-level-up-source');
  }

  const expectedSummonId = source.value.id === ARMED_DRAGON_IDS.lv3
    ? ARMED_DRAGON_IDS.lv5
    : ARMED_DRAGON_IDS.lv7;
  const candidates = readSummonCandidates(game, context.value.team, context.value.effectPlayerSeat, expectedSummonId);
  const effect = planArmedDragonLevelUp({
    sourceCard: {
      ...source.value,
      ...(battleDestruction ? { destroyedByBattleTurn: battleDestruction.turn } : {}),
    },
    phase,
    turn: game.core.turn,
    effectPlayerSeat: context.value.effectPlayerSeat,
    teamMonsterCount: game.core.players[context.value.team].monsters.length,
    summonCandidates: candidates,
    selectedSummonUid,
  });
  if (!effect.ok) return effect;
  return {
    ok: true,
    value: {
      turn: game.core.turn,
      team: context.value.team,
      effectPlayerSeat: context.value.effectPlayerSeat,
      sourceUid,
      effect: effect.value,
    },
  };
}

function readDiscardedMonster(
  game: TagDuel,
  team: TagArmedDragonTeam,
  effectPlayerSeat: DuelSeat,
  uid: string,
): RuleResult<ArmedDragonDiscardedMonster> {
  const card = game.core.players[team].hand.find(item => item.uid === uid);
  if (!card) return fail('discarded-card-not-in-active-physical-hand');
  const physicalOwnerSeat = physicalSeatFromUid(card.uid);
  if (physicalOwnerSeat !== effectPlayerSeat) return fail('discarded-card-not-owned-by-active-physical-seat');
  const definition = getPlayableCard(card.id);
  if (!definition || definition.kind !== 'monster') return fail('discard-cost-must-be-certified-monster');
  if (typeof definition.atk !== 'number' || !Number.isSafeInteger(definition.atk) || definition.atk < 0) {
    return fail('discarded-monster-original-atk-unavailable');
  }
  return {
    ok: true,
    value: {
      uid: card.uid,
      id: card.id,
      physicalOwnerSeat,
      zone: 'hand',
      kind: 'monster',
      originalAtk: definition.atk,
    },
  };
}

function readOpposingMonsters(
  game: TagDuel,
  opponentTeam: TagArmedDragonTeam,
): RuleResult<ArmedDragonOpponentMonster[]> {
  const monsters: ArmedDragonOpponentMonster[] = [];
  for (const monster of game.core.players[opponentTeam].monsters) {
    const physicalOwnerSeat = physicalSeatFromUid(monster.uid);
    if (physicalOwnerSeat === null) return fail('opposing-monster-without-physical-owner');
    const currentAtk = atk(monster as Monster, game.core);
    if (!Number.isSafeInteger(currentAtk) || currentAtk < 0 || currentAtk > 99999) {
      return fail('invalid-opposing-current-atk');
    }
    monsters.push({
      uid: monster.uid,
      id: monster.id,
      physicalOwnerSeat,
      controllerTeam: opponentTeam,
      zone: 'monster',
      faceUp: monster.faceUp,
      currentAtk,
    });
  }
  return { ok: true, value: monsters };
}

function validateDiscardPlan(game: TagDuel, plan: TagArmedDragonDiscardPlan): RuleResult<{
  team: TagArmedDragonTeam;
  opponentTeam: TagArmedDragonTeam;
}> {
  if (!plan || !plan.effect || (plan.team !== 0 && plan.team !== 1) ||
      !isSeat(plan.effectPlayerSeat) ||
      plan.effect.effectPlayerSeat !== plan.effectPlayerSeat ||
      plan.effect.controllerTeam !== plan.team ||
      teamOfSeat(plan.effect.sourcePhysicalOwnerSeat) === undefined ||
      teamOfSeat(plan.effect.discardGraveyardTeam) !== plan.team) {
    return fail('invalid-armed-dragon-discard-plan');
  }
  const context = readActiveContext(game);
  if (!context.ok) return context;
  if (context.value.team !== plan.team || context.value.effectPlayerSeat !== plan.effectPlayerSeat ||
      game.core.turn !== plan.turn) return fail('stale-armed-dragon-discard-plan');
  return { ok: true, value: { team: plan.team, opponentTeam: context.value.opponentTeam } };
}

/** Plans LV5's targeted or LV7's non-targeting discard effect from the active seat's private hand. */
export function prepareTagArmedDragonDiscardEffect(
  game: TagDuel,
  sourceUid: string,
  discardedMonsterUid: string,
  selectedTargetUid?: string,
): RuleResult<TagArmedDragonDiscardPlan> {
  const context = readActiveContext(game);
  if (!context.ok) return context;
  if (game.core.phase !== 'main' || game.core.turnEnding === true) return fail('armed-dragon-ignition-window-not-active');
  const source = readSourceCard(game, context.value.team, sourceUid);
  if (!source.ok) return source;
  const discarded = readDiscardedMonster(game, context.value.team, context.value.effectPlayerSeat, discardedMonsterUid);
  if (!discarded.ok) return discarded;
  const opposing = readOpposingMonsters(game, context.value.opponentTeam);
  if (!opposing.ok) return opposing;
  const effect = prepareArmedDragonDiscardEffect({
    sourceCard: source.value,
    phase: 'main1',
    effectPlayerSeat: context.value.effectPlayerSeat,
    discardedMonster: discarded.value,
    opposingMonstersAtActivation: opposing.value,
    ...(selectedTargetUid === undefined ? {} : { selectedTargetUid }),
  });
  if (!effect.ok) return effect;
  return {
    ok: true,
    value: {
      turn: game.core.turn,
      team: context.value.team,
      effectPlayerSeat: context.value.effectPlayerSeat,
      effect: effect.value,
    },
  };
}

/** Re-reads both opposing physical owners' shared field at resolution; never locks LV7 targets. */
export function resolveTagArmedDragonDiscardEffect(
  game: TagDuel,
  plan: TagArmedDragonDiscardPlan,
): RuleResult<ArmedDragonDiscardResolution> {
  const validation = validateDiscardPlan(game, plan);
  if (!validation.ok) return validation;
  const opposing = readOpposingMonsters(game, validation.value.opponentTeam);
  if (!opposing.ok) return opposing;
  return resolveArmedDragonDiscardEffect(plan.effect, opposing.value);
}

export function canTagSummonArmedDragonLv7(
  method: SummonMethod,
  sourceZone: SummonSourceZone | 'grave' | 'banished',
): boolean {
  return canSummonArmedDragonLv7(method, sourceZone);
}

export function armedDragonTagPublicSummary(): string {
  return 'Armed Dragon: efeitos preparados para resolução; identidades privadas e alvos ocultos não são exibidos publicamente.';
}

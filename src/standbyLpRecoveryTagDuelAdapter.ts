import type { TagDuel } from './tagDuel';
import { tagInventory } from './tagDuel';
import { monsterEffectsNegated } from './continuousEffects';
import {
  DANCING_FAIRY_CARD_ID,
  DARKLORD_MARIE_CARD_ID,
  resolveDancingFairyStandbyGain,
  resolveDarklordMarieStandbyGain,
  type DancingFairySnapshot,
  type DarklordMarieSnapshot,
  type DancingFairyStandbyResult,
  type DarklordMarieStandbyResult,
} from './dancingFairyStandby';

type Team = 0 | 1;
type PhysicalSeat = 0 | 1 | 2 | 3;

export interface TagStandbyRecoveryEvent {
  readonly eventId: string;
  readonly taskId: string;
  readonly turnNumber: number;
  readonly activeTeam: Team;
  /** Captured from the active team's shared Graveyard when the task is opened. */
  readonly activationDarklordMarieUids: readonly string[];
}

export interface TagStandbyRecoveryResult {
  readonly eventId: string;
  readonly taskId: string;
  readonly turnNumber: number;
  readonly activeTeam: Team;
  readonly activePhysicalSeat: PhysicalSeat;
  readonly triggered: boolean;
  readonly reason: 'resolved' | 'duplicate-event' | 'no-eligible-copy';
  readonly triggerCount: number;
  readonly requestedGain: number;
  readonly recipientTeam: Team | null;
  readonly teamLifePointsBefore: [number, number];
  readonly teamLifePointsAfter: [number, number];
  readonly dancingFairy: DancingFairyStandbyResult;
  readonly darklordMarie: DarklordMarieStandbyResult;
  readonly processedEventIds: string[];
  readonly processedTurnCardKeys: string[];
}

function fail<T>(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function physicalSeatFromUid(uid: string): PhysicalSeat | null {
  const match = /^m([0-3]):/.exec(uid);
  return match ? Number(match[1]) as PhysicalSeat : null;
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value);
}

/** Validate TagDuel structure without requiring an unadmitted card to be playable.
 * M444 is an adapter preparation layer; certification/admission remains separate. */
function validateTagDuelShape(game: TagDuel): string | undefined {
  if (!game || game.version !== 1 || game.mode !== 'tag-classic') return 'classic-tag-duel-required';
  if (
    !Array.isArray(game.members) || game.members.length !== 4
    || game.members.some((member, index) => !member || !member.id || member.team !== index % 2)
    || new Set(game.members.map(member => member.id)).size !== 4
    || !Array.isArray(game.active) || game.active.length !== 2
    || !Number.isInteger(game.cursor) || game.cursor < 0 || game.cursor > 3
    || game.active[0] % 2 !== 0 || game.active[1] % 2 !== 1
    || game.active[game.cursor % 2] !== game.cursor
  ) return 'invalid-tag-duel-seats';
  if (
    !game.core || !Array.isArray(game.core.players) || game.core.players.length !== 2
    || game.core.players.some((player, team) => !player || player.id !== 'tag-team-' + team
      || !Array.isArray(player.monsters) || !Array.isArray(player.backrow)
      || !Array.isArray(player.grave) || (player.extra ?? []).length > 5
      || player.monsters.length > 3 || player.backrow.length > 3)
    || game.core.current !== game.cursor % 2
    || !game.core.teamRotation || game.core.teamRotation.version !== 1
    || game.core.teamRotation.cursor !== game.cursor
    || JSON.stringify([game.active, game.cursor, game.reserves])
      !== JSON.stringify([game.core.teamRotation.active, game.core.teamRotation.cursor, game.core.teamRotation.reserves])
  ) return 'invalid-tag-duel-core-or-zone-capacity';
  const reserveSeats = Object.keys(game.reserves ?? {});
  if (reserveSeats.length !== 2 || reserveSeats.some(key => {
    const seat = Number(key);
    const held = game.reserves[key];
    return !/^[0-3]$/.test(key) || game.active.includes(seat)
      || !held || !Array.isArray(held.deck) || !Array.isArray(held.hand)
      || !Array.isArray(held.extra) || held.extra.length > 5;
  })) return 'invalid-tag-duel-private-reserves';
  const inventory = tagInventory(game);
  if (!Array.isArray(inventory) || inventory.some(card => !card || typeof card.uid !== 'string' || !card.uid)
    || new Set(inventory.map(card => card.uid)).size !== inventory.length) {
    return 'tag-duel-physical-inventory-is-not-unique';
  }
  return undefined;
}

/**
 * Capture the Darklord Marie activation condition before the Standby task is
 * opened. Only the current team's shared Graveyard is inspected. The returned
 * physical UIDs must be carried unchanged to the later resolution call.
 */
export function captureDarklordMarieActivationUids(
  game: TagDuel,
  activeTeam: Team,
): string[] {
  const stateIssue = validateTagDuelShape(game);
  if (stateIssue) throw new Error(stateIssue);
  if (game.mode !== 'tag-classic') throw new Error('Duelo Tag Classic 2v2 obrigatório.');
  if (activeTeam !== 0 && activeTeam !== 1) throw new Error('Equipe ativa inválida.');
  if (
    game.core.phase !== 'main'
    || game.core.current !== activeTeam
    || game.active[activeTeam] !== game.cursor
  ) {
    throw new Error('A captura deve ocorrer no início da Standby da equipe ativa.');
  }

  const result: string[] = [];
  for (const card of game.core.players[activeTeam].grave) {
    if (card.id !== DARKLORD_MARIE_CARD_ID) continue;
    const physicalOwnerSeat = physicalSeatFromUid(card.uid);
    if (physicalOwnerSeat === null || physicalOwnerSeat % 2 !== activeTeam) {
      throw new Error('Darklord Marie não está no Cemitério de sua equipe proprietária.');
    }
    result.push(card.uid);
  }
  if (new Set(result).size !== result.length) throw new Error('UID físico duplicado no snapshot de ativação.');
  return result;
}

function validateEvent(
  game: TagDuel,
  event: TagStandbyRecoveryEvent,
  activationUids: readonly string[],
): string | undefined {
  if (!event || !validIdentifier(event.taskId) || !validIdentifier(event.eventId)) return 'invalid-standby-event-id';
  if (event.activeTeam !== 0 && event.activeTeam !== 1) return 'invalid-active-team';
  if (!Number.isSafeInteger(event.turnNumber) || event.turnNumber < 1) return 'invalid-standby-turn';
  const expectedTaskId = 'm444:standby:' + event.turnNumber + ':' + event.activeTeam;
  if (event.taskId !== expectedTaskId || event.eventId !== expectedTaskId + ':resolution') {
    return 'standby-event-does-not-match-deterministic-task';
  }
  if (
    game.core.turn !== event.turnNumber
    || game.core.current !== event.activeTeam
    || game.cursor % 2 !== event.activeTeam
    || game.active[event.activeTeam] !== game.cursor
  ) return 'standby-event-is-not-for-current-physical-turn';

  const flow = game.core.standby;
  const active = flow?.active;
  const task = flow?.tasks.find(candidate => candidate.id === event.taskId);
  if (
    !flow || !active || active.status !== 'responding' || active.id !== event.taskId
    || active.choice !== 'resolve' || !task
    || task.turn !== event.turnNumber || task.actor !== event.activeTeam
    || task.optional || (task.costLP ?? 0) !== 0
    || task.options.length !== 1 || task.options[0].id !== 'resolve'
    || task.options[0].operations.length !== 0
  ) return 'matching-standby-task-is-not-active-for-resolution';

  const pending = game.core.pending;
  if (
    game.core.phase !== 'response'
    || game.core.resume !== 'main'
    || game.core.choice
    || pending.kind !== 'standby'
    || pending.actor !== event.activeTeam
    || pending.taskId !== event.taskId
    || pending.choiceId !== 'resolve'
  ) return 'standby-task-resolution-window-mismatch';

  if (!Array.isArray(activationUids) || activationUids.length > 120) {
    return 'invalid-darklord-marie-activation-snapshot';
  }
  const inventory = tagInventory(game);
  const seen = new Set<string>();
  for (const uid of activationUids) {
    if (!validIdentifier(uid) || seen.has(uid)) return 'invalid-darklord-marie-activation-uid';
    seen.add(uid);
    const matches = inventory.filter(card => card.uid === uid);
    if (matches.length !== 1 || matches[0].id !== DARKLORD_MARIE_CARD_ID) {
      return 'activation-snapshot-does-not-match-physical-inventory';
    }
    const ownerSeat = physicalSeatFromUid(uid);
    if (ownerSeat === null || ownerSeat % 2 !== event.activeTeam) {
      return 'activation-snapshot-contains-foreign-owner';
    }
  }
  return undefined;
}

/**
 * Builds a read-only TagDuel plan for both Standby LP recovery effects.
 *
 * It consumes only a live, resolving M444 StandbyFlow continuation. Dancing
 * Fairy checks the current shared field and real continuous monster-effect
 * negation. Darklord Marie checks a captured activation Graveyard UID set and
 * the current shared Graveyard. The active team receives LP; physical owner
 * seats remain in the receipts. The caller must atomically commit LP and both
 * ledgers after this function succeeds.
 */
export function resolveTagStandbyLpRecovery(
  game: TagDuel,
  event: TagStandbyRecoveryEvent,
  processedEventIds: readonly string[] = [],
  processedTurnCardKeys: readonly string[] = [],
): { ok: true; value: TagStandbyRecoveryResult } | { ok: false; reason: string } {
  try {
    if (!game || game.mode !== 'tag-classic') return fail('classic-tag-duel-required');
    const stateIssue = validateTagDuelShape(game);
    if (stateIssue) return fail(stateIssue);
    const eventIssue = validateEvent(game, event, event.activationDarklordMarieUids);
    if (eventIssue) return fail(eventIssue);
    if (
      !Array.isArray(processedEventIds) || processedEventIds.length > 4096
      || !Array.isArray(processedTurnCardKeys) || processedTurnCardKeys.length > 4096
    ) return fail('invalid-standby-idempotency-ledger');

    const teamLifePointsBefore: [number, number] = [
      game.core.players[0].lp,
      game.core.players[1].lp,
    ];
    const turnKeys = new Set(processedTurnCardKeys);
    const dancingFairies: DancingFairySnapshot[] = [];
    for (const [controllerTeam, player] of game.core.players.entries()) {
      for (const monster of player.monsters) {
        if (monster.id !== DANCING_FAIRY_CARD_ID) continue;
        const physicalOwnerSeat = physicalSeatFromUid(monster.uid);
        if (physicalOwnerSeat === null) return fail('Dancing Fairy has no physical-owner UID.');
        if (monster.position !== 'atk' && monster.position !== 'def') {
          return fail('Dancing Fairy has an invalid battle position.');
        }
        dancingFairies.push({
          uid: monster.uid,
          cardId: monster.id,
          physicalOwnerSeat,
          controllerTeam: controllerTeam as Team,
          zone: 'monster',
          faceUp: monster.faceUp,
          position: monster.position === 'atk' ? 'attack' : 'defense',
          effectNegated: game.core.pendingNegated === true || monsterEffectsNegated(game.core, monster.uid),
        });
      }
    }

    const activeSeat = game.cursor as PhysicalSeat;
    const fairyEventId = event.eventId + ':fairy';
    const marieEventId = event.eventId + ':marie';
    const freshFairies = dancingFairies.filter(
      card => !turnKeys.has(event.turnNumber + ':' + card.uid),
    );
    const dancingFairy = resolveDancingFairyStandbyGain({
      eventId: fairyEventId,
      activeTeam: event.activeTeam,
      teamLifePointsBefore,
      dancingFairies: freshFairies,
      processedEventIds,
    });

    const processedAfterFairyEvents = processedEventIds.includes(fairyEventId)
      ? [...processedEventIds]
      : [...processedEventIds, fairyEventId];
    const processedAfterFairyKeys = [
      ...processedTurnCardKeys,
      ...dancingFairy.triggerSources.map(source => event.turnNumber + ':' + source.uid),
    ];

    const activationSet = new Set(event.activationDarklordMarieUids);
    const darklordMaries: DarklordMarieSnapshot[] = [];
    for (const [graveyardTeam, player] of game.core.players.entries()) {
      for (const card of player.grave) {
        if (card.id !== DARKLORD_MARIE_CARD_ID) continue;
        const physicalOwnerSeat = physicalSeatFromUid(card.uid);
        if (physicalOwnerSeat === null) return fail('Darklord Marie has no physical-owner UID.');
        if (physicalOwnerSeat % 2 !== graveyardTeam) {
          return fail('Darklord Marie is in a Graveyard other than its physical-owner team.');
        }
        if (graveyardTeam !== event.activeTeam || !activationSet.has(card.uid)) continue;
        darklordMaries.push({
          uid: card.uid,
          cardId: card.id,
          physicalOwnerSeat,
          ownerTeam: graveyardTeam as Team,
          zoneAtActivation: 'graveyard',
          zoneAtResolution: 'graveyard',
          effectNegated: game.core.pendingNegated === true,
        });
      }
    }

    const darklordMarie = resolveDarklordMarieStandbyGain({
      eventId: marieEventId,
      activeTeam: event.activeTeam,
      turnNumber: event.turnNumber,
      teamLifePointsBefore,
      darklordMaries,
      processedEventIds: processedAfterFairyEvents,
      processedTurnCardKeys: processedAfterFairyKeys,
    });

    const fairyGain = dancingFairy.triggered ? dancingFairy.appliedGain : 0;
    const marieGain = darklordMarie.triggered ? darklordMarie.gainAmount : 0;
    const requestedGain = fairyGain + marieGain;
    const nextLP = teamLifePointsBefore[event.activeTeam] + requestedGain;
    if (!Number.isSafeInteger(requestedGain) || !Number.isSafeInteger(nextLP)) {
      return fail('team Life Points would exceed the safe integer range.');
    }
    const teamLifePointsAfter: [number, number] = [...teamLifePointsBefore];
    teamLifePointsAfter[event.activeTeam] = nextLP;
    const triggerCount = dancingFairy.triggerCount + darklordMarie.triggerCount;
    const triggered = triggerCount > 0;
    const bothDuplicate = dancingFairy.reason === 'duplicate-event'
      && darklordMarie.reason === 'duplicate-event';

    return {
      ok: true,
      value: {
        eventId: event.eventId,
        taskId: event.taskId,
        turnNumber: event.turnNumber,
        activeTeam: event.activeTeam,
        activePhysicalSeat: activeSeat,
        triggered,
        reason: triggered ? 'resolved' : bothDuplicate ? 'duplicate-event' : 'no-eligible-copy',
        triggerCount,
        requestedGain,
        recipientTeam: triggered ? event.activeTeam : null,
        teamLifePointsBefore,
        teamLifePointsAfter,
        dancingFairy,
        darklordMarie,
        processedEventIds: darklordMarie.processedEventIds,
        processedTurnCardKeys: darklordMarie.processedTurnCardKeys,
      },
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'standby-lp-recovery-invalid');
  }
}

export function standbyLpRecoveryPublicSummary(): string {
  return 'Recuperação de LP na Standby aplicada à equipe ativa; UIDs e identidades privadas não são exibidos publicamente.';
}

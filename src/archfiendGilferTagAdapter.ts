import {
  ARCHFIEND_OF_GILFER_ID,
  archfiendGilferAtkDelta,
  prepareArchfiendGilferEquip,
  resolveArchfiendGilferEquip,
  type GilferOffer,
  type GilferReason,
  type GilferSeat,
} from './archfiendGilfer';

export type GilferTagMonster = Readonly<{
  uid: string;
  id: string;
  faceUp: boolean;
  position: 'atk' | 'def';
  owner?: number;
  returnTo?: number;
}>;
export type GilferTagBackrow = Readonly<{ uid: string; id: string; equippedTo?: string }>;
export type GilferTagPlayer = Readonly<{
  monsters: readonly GilferTagMonster[];
  backrow: readonly GilferTagBackrow[];
}>;
export type GilferTagState = Readonly<{
  mode: 'tag-classic';
  active: readonly [number, number];
  core: Readonly<{
    current: number;
    turn: number;
    grave: readonly Readonly<{ uid: string; id: string }>[];
    players: readonly [GilferTagPlayer, GilferTagPlayer];
  }>;
}>;
export type GilferSendEvent = Readonly<{
  kind: 'sendToGy';
  sourceUid: string;
  lastEventUid: string;
  lastEventKind: 'sendToGy' | 'other';
  sequence: number;
  lastEventSequence: number;
  activationId: string;
  effectNegated: boolean;
}>;
export type GilferTagOffer = Readonly<{
  offer: GilferOffer;
  targetCardId: string;
  targetPhysicalOwnerSeat: GilferSeat;
  targetControllerSeat: GilferSeat;
  targetZoneSlot: number;
}>;
export type GilferTagPlacement = Readonly<{
  backrowCard: Readonly<{
    uid: string;
    id: typeof ARCHFIEND_OF_GILFER_ID;
    setTurn: number;
    faceUp: true;
    resolved: true;
    equippedTo: string;
  }>;
  physicalOwnerSeat: GilferSeat;
  controllerSeat: GilferSeat;
  controllerTeam: 'even' | 'odd';
  targetUid: string;
  targetPhysicalOwnerSeat: GilferSeat;
  targetControllerSeat: GilferSeat;
  atkDelta: -500;
  modifierLifetime: 'while-equipped';
  oncePerTurnLimit: false;
}>;
export type GilferTagFailure =
  | GilferReason
  | 'invalid-tag-state'
  | 'invalid-physical-uid'
  | 'invalid-send-event'
  | 'source-not-in-shared-graveyard'
  | 'target-not-in-shared-monster-zones'
  | 'equipability-check-failed'
  | 'stale-tag-offer';
export type GilferTagResolution =
  | Readonly<{ resolved: false; reason: GilferTagFailure }>
  | Readonly<{ resolved: true; placement: GilferTagPlacement }>;

export type GilferEquipability = (target: GilferTagMonster, source: Readonly<{ uid: string; id: string }>) => boolean;

export function gilferPhysicalSeatFromUid(uid: string): GilferSeat | null {
  const match = /^m([0-3]):/.exec(uid);
  return match ? Number(match[1]) as GilferSeat : null;
}
export function gilferTeamOfSeat(seat: GilferSeat): 0 | 1 {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) throw new TypeError('Invalid physical seat.');
  return seat % 2 as 0 | 1;
}
function isSeat(value: unknown): value is GilferSeat {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}
function stateContext(state: GilferTagState): { team: 0 | 1; controllerSeat: GilferSeat } | null {
  if (!state || state.mode !== 'tag-classic' || !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core || !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.core.grave) || (state.core.current !== 0 && state.core.current !== 1) ||
      !Number.isSafeInteger(state.core.turn) || state.core.turn < 1) return null;
  const team = state.core.current as 0 | 1;
  const controllerSeat = state.active[team];
  if (!isSeat(controllerSeat) || gilferTeamOfSeat(controllerSeat) !== team) return null;
  return { team, controllerSeat };
}
function validEvent(event: GilferSendEvent, sourceUid: string): boolean {
  return !!event && event.kind === 'sendToGy' && event.sourceUid === sourceUid &&
    event.lastEventUid === sourceUid && event.lastEventKind === 'sendToGy' &&
    Number.isSafeInteger(event.sequence) && event.sequence > 0 &&
    event.lastEventSequence === event.sequence &&
    typeof event.activationId === 'string' && event.activationId.length > 0 &&
    event.activationId.length <= 128 && typeof event.effectNegated === 'boolean';
}
function findTarget(state: GilferTagState, uid: string): { team: 0 | 1; slot: number; monster: GilferTagMonster } | null {
  for (const team of [0, 1] as const) {
    const slot = state.core.players[team].monsters.findIndex(monster => monster.uid === uid);
    if (slot >= 0) return { team, slot, monster: state.core.players[team].monsters[slot] };
  }
  return null;
}
function existingEquipUids(state: GilferTagState): string[] {
  return state.core.players.flatMap(player => player.backrow.filter(card => !!card.equippedTo).map(card => card.uid));
}
function buildContext(
  state: GilferTagState,
  sourceUid: string,
  targetUid: string,
  event: GilferSendEvent,
  canEquip: GilferEquipability,
): { context: Parameters<typeof prepareArchfiendGilferEquip>[0]; target: GilferTagMonster; targetTeam: 0 | 1; targetSlot: number } | GilferTagFailure {
  const active = stateContext(state);
  if (!active) return 'invalid-tag-state';
  if (!validEvent(event, sourceUid)) return 'invalid-send-event';
  const sourceSeat = gilferPhysicalSeatFromUid(sourceUid);
  if (sourceSeat === null) return 'invalid-physical-uid';
  const sourceTeam = gilferTeamOfSeat(sourceSeat);
  if (sourceTeam !== active.team) return 'trigger-controller-outside-owner-team';
  const source = state.core.grave.find(card => card.uid === sourceUid && card.id === ARCHFIEND_OF_GILFER_ID);
  if (!source) return 'source-not-in-shared-graveyard';
  const found = findTarget(state, targetUid);
  if (!found) return 'target-not-in-shared-monster-zones';
  const targetSeat = gilferPhysicalSeatFromUid(found.monster.uid);
  if (targetSeat === null) return 'invalid-physical-uid';
  let canBeEquipped = false;
  try { canBeEquipped = canEquip(found.monster, source) === true; } catch { canBeEquipped = false; }
  if (!canBeEquipped) return 'equipability-check-failed';
  return {
    target: found.monster,
    targetTeam: found.team,
    targetSlot: found.slot,
    context: {
      source: {
        uid: source.uid,
        cardId: source.id,
        physicalOwnerSeat: sourceSeat,
        location: 'graveyard',
        sentToGyWasLastEvent: true,
        effectNegated: event.effectNegated,
      },
      target: {
        uid: found.monster.uid,
        cardId: found.monster.id,
        physicalOwnerSeat: targetSeat,
        controllerSeat: state.active[found.team],
        location: 'monster',
        zoneSlot: found.slot,
        faceUp: found.monster.faceUp,
        canBeEquipped,
      },
      triggerControllerSeat: active.controllerSeat,
      activationId: event.activationId,
      teamSpellTrapZonesUsed: state.core.players[active.team].backrow.length,
      existingEquipUids: existingEquipUids(state),
    },
  };
}

/** Lists only face-up monsters in either shared Monster Zone. Hidden cards never
 * contribute names, IDs, UIDs or selectable options. The trigger controller is
 * the active physical representative of the team that owns the GY source. */
export function listArchfiendGilferTagOffers(
  state: GilferTagState,
  sourceUid: string,
  event: GilferSendEvent,
  canEquip: GilferEquipability,
): GilferTagOffer[] {
  if (typeof canEquip !== 'function') throw new TypeError('An equipability predicate is required.');
  const active = stateContext(state);
  if (!active || !validEvent(event, sourceUid) || event.effectNegated) return [];
  const sourceSeat = gilferPhysicalSeatFromUid(sourceUid);
  if (sourceSeat === null || gilferTeamOfSeat(sourceSeat) !== active.team) return [];
  const source = state.core.grave.find(card => card.uid === sourceUid && card.id === ARCHFIEND_OF_GILFER_ID);
  if (!source) return [];
  const out: GilferTagOffer[] = [];
  for (const team of [0, 1] as const) {
    for (const monster of state.core.players[team].monsters) {
      if (!monster.faceUp) continue;
      const built = buildContext(state, sourceUid, monster.uid, event, canEquip);
      if (typeof built === 'string') continue;
      const evaluation = prepareArchfiendGilferEquip(built.context);
      if (!evaluation.eligible) continue;
      const targetSeat = gilferPhysicalSeatFromUid(monster.uid);
      if (targetSeat === null) continue;
      out.push({
        offer: evaluation.offer,
        targetCardId: monster.id,
        targetPhysicalOwnerSeat: targetSeat,
        targetControllerSeat: state.active[team],
        targetZoneSlot: built.targetSlot,
      });
    }
  }
  return out;
}

/** Rebuilds the complete context at resolution. A target that left, turned
 * face-down, changed team, became equip-protected, or lost the last open S/T
 * slot is rejected. The returned placement is a plan; the engine performs the
 * atomic GY -> shared backrow move and applies the while-equipped modifier. */
export function resolveArchfiendGilferTagOffer(
  state: GilferTagState,
  sourceUid: string,
  event: GilferSendEvent,
  selected: GilferTagOffer,
  canEquip: GilferEquipability,
): GilferTagResolution {
  if (!selected || !selected.offer || typeof canEquip !== 'function') return { resolved: false, reason: 'stale-tag-offer' };
  const built = buildContext(state, sourceUid, selected.offer.targetUid, event, canEquip);
  if (typeof built === 'string') return { resolved: false, reason: built };
  const targetSeat = gilferPhysicalSeatFromUid(built.target.uid);
  if (targetSeat === null || selected.targetCardId !== built.target.id ||
      selected.targetPhysicalOwnerSeat !== targetSeat ||
      selected.targetControllerSeat !== state.active[built.targetTeam]) {
    return { resolved: false, reason: 'stale-tag-offer' };
  }
  const resolution = resolveArchfiendGilferEquip(built.context, selected.offer);
  if (!resolution.resolved) return resolution;
  const equip = resolution.equip;
  return {
    resolved: true,
    placement: {
      backrowCard: {
        uid: equip.uid,
        id: ARCHFIEND_OF_GILFER_ID,
        setTurn: state.core.turn,
        faceUp: true,
        resolved: true,
        equippedTo: equip.targetUid,
      },
      physicalOwnerSeat: equip.physicalOwnerSeat,
      controllerSeat: equip.controllerSeat,
      controllerTeam: equip.controllerTeam,
      targetUid: equip.targetUid,
      targetPhysicalOwnerSeat: targetSeat,
      targetControllerSeat: equip.targetControllerSeatAtResolution,
      atkDelta: archfiendGilferAtkDelta(1) as -500,
      modifierLifetime: 'while-equipped',
      oncePerTurnLimit: false,
    },
  };
}

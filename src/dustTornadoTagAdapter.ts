import type { Backrow, CardRef } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { rulesFor } from './rulesProfile';
import { assertTagDuel, tagDecisionMember, tagInventory, type TagDuel } from './tagDuel';
import {
  cardActivationAllowed,
  continuousTrapActivationsBlocked,
  continuousTrapsNegated,
} from './continuousEffects';
import {
  bindTarget,
  synchronizeCardLifetimes,
  targetBindingValid,
  type TargetBinding,
} from './cardLifetime';
import { cleanEquips } from './classicEffects';

export const DUST_TORNADO_ID = '60082869';
type Seat = 0 | 1 | 2 | 3;
type Team = 0 | 1;

type SpellTrapLocation = {
  team: Team;
  zone: 'backrow' | 'field';
  card: Backrow;
};

export type DustTornadoPlan = {
  eventId: string;
  sourceUid: string;
  sourceId: string;
  sourceOwnerSeat: Seat;
  sourceOwnerTeam: Team;
  activeSeat: Seat;
  activeTeam: Team;
  targetUid: string;
  targetBinding: TargetBinding;
  turn: number;
};

export type DustTornadoActivation = {
  state: TagDuel;
  plan: DustTornadoPlan;
};

export type DustTornadoResolution = {
  state: TagDuel;
  targetDestroyed: boolean;
  setUid: string | null;
  negated: boolean;
};

type ReceiptState = TagDuel & { dustTornadoResolvedEvents?: string[] };

function isTeam(value: unknown): value is Team {
  return value === 0 || value === 1;
}

function physicalSeat(uid: string): Seat | null {
  const match = /^m([0-3]):/.exec(uid);
  return match ? Number(match[1]) as Seat : null;
}

function isSpellTrapCardId(cardId: string): boolean {
  const metadata = getDuelCard(cardId);
  return metadata?.kind === 'spell' || metadata?.kind === 'trap';
}

function isTrapCardId(cardId: string): boolean {
  if (cardId === DUST_TORNADO_ID) return true;
  return getDuelCard(cardId)?.kind === 'trap';
}

function privateHandForSeat(duel: TagDuel, seat: Seat): CardRef[] {
  const team = (seat % 2) as Team;
  if (duel.active[team] === seat) return duel.core.players[team].hand;
  const reserve = duel.reserves[String(seat)];
  if (!reserve) throw new Error('Mão privada do assento físico não encontrada.');
  return reserve.hand;
}

function findSpellTrap(core: TagDuel['core'], uid: string): SpellTrapLocation | null {
  for (const team of [0, 1] as const) {
    const backrow = core.players[team].backrow.find(card => card.uid === uid);
    if (backrow) return { team, zone: 'backrow', card: backrow };
    const field = core.players[team].field;
    if (field?.uid === uid) return { team, zone: 'field', card: field };
  }
  return null;
}

function inventorySignature(duel: TagDuel): string {
  return tagInventory(duel)
    .filter(card => card.entityKind !== 'token')
    .map(card => card.uid + '|' + card.id)
    .sort()
    .join('\n');
}

function assertSameInventory(before: string, after: TagDuel): void {
  if (before !== inventorySignature(after)) {
    throw new Error('O adapter alterou a identidade ou o inventário físico das cartas.');
  }
}

export function assertPhysicalExtraDeckCounts(
  extraCounts: readonly number[],
  maximum = 5,
): void {
  if (!Array.isArray(extraCounts) || extraCounts.length !== 4 ||
      !Number.isSafeInteger(maximum) || maximum < 0 ||
      extraCounts.some(count => !Number.isSafeInteger(count) || count < 0)) {
    throw new Error('Contagem do Deck Adicional inválida.');
  }
  if (extraCounts.some(count => count > maximum)) {
    throw new Error('Deck Adicional físico excede cinco cartas.');
  }
}

/** Enforces the owner's 2v2 format; the six-card hand check remains End Phase-only. */
export function assertDustTornadoRules(duel: TagDuel): void {
  assertTagDuel(duel);
  if (duel.mode !== 'tag-classic') {
    throw new Error('Dust Tornado exige TagDuel clássico.');
  }
  const rules = rulesFor(duel.core);
  if (rules.mainDeckMin !== 20 || rules.mainDeckMax !== 30 ||
      rules.handLimit !== 6 || rules.handCheck !== 'end' ||
      rules.monsterZones !== 3 || rules.spellTrapZones !== 3 ||
      rules.extraDeckMax !== 5) {
    throw new Error('Perfil de regras incompatível com o proprietário.');
  }

  const main = [0, 0, 0, 0];
  const extra = [0, 0, 0, 0];
  for (const ref of tagInventory(duel)) {
    if (ref.entityKind === 'token') continue;
    const seat = physicalSeat(ref.uid);
    if (seat === null) throw new Error('UID sem proprietário físico m0–m3.');
    const metadata = getDuelCard(ref.id);
    if (!metadata) throw new Error('Carta sem metadados habilitados no estado de teste.');
    if (metadata.fusion) extra[seat]++;
    else main[seat]++;
  }
  for (let seat = 0; seat < 4; seat++) {
    if (main[seat] < rules.mainDeckMin || main[seat] > rules.mainDeckMax) {
      throw new Error('Deck principal físico fora do limite 20–30.');
    }
  }
  assertPhysicalExtraDeckCounts(extra, rules.extraDeckMax);

  for (const team of duel.core.players) {
    if (team.monsters.length > rules.monsterZones) {
      throw new Error('Equipe excedeu as três Zonas de Monstros.');
    }
    if (team.backrow.length > rules.spellTrapZones) {
      throw new Error('Equipe excedeu as três Zonas de Magias/Armadilhas.');
    }
    // The Field Zone is separate from the three Spell/Trap Zones.
  }
}

function activeTrapSource(
  duel: TagDuel,
  sourceUid: string,
  cardId: string,
): { team: Team; seat: Seat; source: Backrow; sourceOwnerSeat: Seat } | null {
  const core = duel.core;
  const actor = tagDecisionMember(duel);
  const team = actor.team;
  const seat = duel.active[team];
  if (!isTeam(team) || !Number.isInteger(seat) || seat < 0 || seat > 3 ||
      duel.members[seat]?.team !== team || physicalSeat(sourceUid) === null ||
      core.phase === 'choice' || core.phase === 'discard' || core.phase === 'finished' ||
      core.damageStep === true || core.turnEnding || core.handFlow || core.choice ||
      core.pending.kind === 'end' ||
      core.pending.kind === 'attack' &&
        (core.pending.stage === 'damage' || core.pending.stage === 'calculation')) {
    return null;
  }
  if (continuousTrapActivationsBlocked(core) ||
      !cardActivationAllowed(core, team, 'trap')) {
    return null;
  }

  const location = findSpellTrap(core, sourceUid);
  if (!location || location.team !== team || location.zone !== 'backrow') return null;
  const source = location.card;
  const sourceOwnerSeat = physicalSeat(source.uid);
  if (sourceOwnerSeat === null || source.id !== cardId ||
      source.entityKind === 'token' || source.faceUp ||
      !Number.isSafeInteger(source.setTurn) || source.setTurn >= core.turn ||
      !isTrapCardId(cardId)) {
    return null;
  }
  return { team, seat, source, sourceOwnerSeat };
}

/** Activates a previously Set Dust Tornado from the active team's shared backrow.
 * The target identity is intentionally omitted from the public activation plan. */
export function activateDustTornado(
  input: TagDuel,
  sourceUid: string,
  targetUid: string,
  options: { cardId?: string } = {},
): DustTornadoActivation | null {
  assertDustTornadoRules(input);
  const cardId = options.cardId ?? DUST_TORNADO_ID;
  const active = activeTrapSource(input, sourceUid, cardId);
  if (!active || typeof targetUid !== 'string' || !targetUid || targetUid === sourceUid) {
    return null;
  }
  const target = findSpellTrap(input.core, targetUid);
  if (!target || target.team === active.team ||
      target.card.entityKind === 'token' || !isSpellTrapCardId(target.card.id)) {
    return null;
  }

  const before = inventorySignature(input);
  const next = structuredClone(input);
  const sourceIndex = next.core.players[active.team].backrow.findIndex(card =>
    card.uid === sourceUid && card.id === cardId
  );
  if (sourceIndex < 0) return null;
  const [trap] = next.core.players[active.team].backrow.splice(sourceIndex, 1);
  next.core.players[active.sourceOwnerSeat % 2].grave.push({
    uid: trap.uid,
    id: trap.id,
    ...(trap.properlySummoned ? { properlySummoned: true } : {}),
  });
  synchronizeCardLifetimes(next.core);

  const targetBinding = bindTarget(next.core, targetUid);
  if (!targetBinding || !['backrow', 'field'].includes(targetBinding.zone)) return null;
  const plan: DustTornadoPlan = {
    eventId: 'dust-tornado:' + next.core.turn + ':' + sourceUid + ':' + targetUid + ':' + active.seat,
    sourceUid,
    sourceId: cardId,
    sourceOwnerSeat: active.sourceOwnerSeat,
    sourceOwnerTeam: (active.sourceOwnerSeat % 2) as Team,
    activeSeat: active.seat,
    activeTeam: active.team,
    targetUid,
    targetBinding,
    turn: next.core.turn,
  };

  assertDustTornadoRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, plan };
}

function setFromActiveHand(
  duel: TagDuel,
  activeSeat: Seat,
  activeTeam: Team,
  setUid: string,
): boolean {
  if (typeof setUid !== 'string' || !setUid) return false;
  const hand = privateHandForSeat(duel, activeSeat);
  const index = hand.findIndex(card => card.uid === setUid && card.entityKind !== 'token');
  if (index < 0) return false;
  const card = hand[index];
  if (physicalSeat(card.uid) !== activeSeat) return false;
  const metadata = getDuelCard(card.id);
  if (!metadata || (metadata.kind !== 'spell' && metadata.kind !== 'trap')) return false;

  const player = duel.core.players[activeTeam];
  if (metadata.field === true) {
    if (player.field) return false;
  } else if (player.backrow.length >= 3) {
    return false;
  }

  const [removed] = hand.splice(index, 1);
  const setCard: Backrow = {
    uid: removed.uid,
    id: removed.id,
    faceUp: false,
    setTurn: duel.core.turn,
  };
  if (metadata.field === true) player.field = setCard;
  else player.backrow.push(setCard);
  return true;
}

/** Destroys the original opponent-controlled target to its physical owner's GY.
 * The optional Set uses only the active physical seat's private hand. */
export function resolveDustTornado(
  input: TagDuel,
  plan: DustTornadoPlan,
  options: { negated?: boolean; setUid?: string; cardId?: string } = {},
): DustTornadoResolution | null {
  assertDustTornadoRules(input);
  const cardId = options.cardId ?? DUST_TORNADO_ID;
  if (!plan || typeof plan.eventId !== 'string' || !plan.eventId.trim() ||
      plan.sourceId !== cardId || !Number.isSafeInteger(plan.turn) ||
      plan.turn !== input.core.turn || !isTeam(plan.activeTeam) ||
      !isTeam(plan.sourceOwnerTeam) ||
      !Number.isInteger(plan.activeSeat) || plan.activeSeat < 0 || plan.activeSeat > 3 ||
      plan.activeTeam !== plan.activeSeat % 2 ||
      plan.sourceOwnerTeam !== plan.sourceOwnerSeat % 2 ||
      physicalSeat(plan.sourceUid) !== plan.sourceOwnerSeat ||
      input.active[plan.activeTeam] !== plan.activeSeat ||
      !plan.targetBinding || plan.targetBinding.uid !== plan.targetUid ||
      !['backrow', 'field'].includes(plan.targetBinding.zone) ||
      !Number.isSafeInteger(plan.targetBinding.epoch) || plan.targetBinding.epoch < 0 ||
      plan.eventId !== 'dust-tornado:' + plan.turn + ':' + plan.sourceUid + ':' +
        plan.targetUid + ':' + plan.activeSeat) {
    return null;
  }

  const receipts = (input as ReceiptState).dustTornadoResolvedEvents ?? [];
  if (!Array.isArray(receipts) || receipts.includes(plan.eventId)) return null;
  const before = inventorySignature(input);
  const next = structuredClone(input);
  const negated = options.negated === true || continuousTrapsNegated(next.core);
  let targetDestroyed = false;
  let setUid: string | null = null;

  if (!negated && targetBindingValid(next.core, plan.targetBinding)) {
    const target = findSpellTrap(next.core, plan.targetUid);
    if (target && target.team === (1 - plan.activeTeam) &&
        target.zone === plan.targetBinding.zone &&
        target.card.entityKind !== 'token' && isSpellTrapCardId(target.card.id)) {
      const ownerSeat = physicalSeat(target.card.uid);
      if (ownerSeat !== null) {
        if (target.zone === 'backrow') {
          next.core.players[target.team].backrow =
            next.core.players[target.team].backrow.filter(card => card.uid !== plan.targetUid);
        } else {
          next.core.players[target.team].field = null;
        }
        next.core.players[ownerSeat % 2].grave.push({
          uid: target.card.uid,
          id: target.card.id,
          ...(target.card.properlySummoned ? { properlySummoned: true } : {}),
        });
        cleanEquips(next.core);
        synchronizeCardLifetimes(next.core);
        targetDestroyed = true;
      }
    }
  }

  if (options.setUid !== undefined) {
    if (!targetDestroyed || !setFromActiveHand(next, plan.activeSeat, plan.activeTeam, options.setUid)) {
      return null;
    }
    setUid = options.setUid;
    synchronizeCardLifetimes(next.core);
  }

  const nextReceipts = (next as ReceiptState).dustTornadoResolvedEvents ?? [];
  (next as ReceiptState).dustTornadoResolvedEvents = [...nextReceipts, plan.eventId].slice(-256);
  assertDustTornadoRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, targetDestroyed, setUid, negated };
}

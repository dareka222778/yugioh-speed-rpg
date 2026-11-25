import type { Backrow, CardRef } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { rulesFor } from './rulesProfile';
import { assertTagDuel, tagDecisionMember, tagInventory, type TagDuel } from './tagDuel';
import { cardActivationAllowed } from './continuousEffects';
import {
  bindTarget,
  synchronizeCardLifetimes,
  targetBindingValid,
  type TargetBinding,
} from './cardLifetime';

export const REMOVE_TRAP_ID = '51482758';
type Seat = 0 | 1 | 2 | 3;
type Team = 0 | 1;

type TrapLocation = { team: Team; card: Backrow };

export type RemoveTrapPlan = {
  eventId: string;
  sourceUid: string;
  sourceId: string;
  activeSeat: Seat;
  activeTeam: Team;
  targetUid: string;
  targetId: string;
  targetBinding: TargetBinding;
  turn: number;
};

export type RemoveTrapActivation = { state: TagDuel; plan: RemoveTrapPlan };
export type RemoveTrapResolution = {
  state: TagDuel;
  targetDestroyed: boolean;
  negated: boolean;
};

type ReceiptState = TagDuel & { removeTrapResolvedEvents?: string[] };

function isTeam(value: unknown): value is Team {
  return value === 0 || value === 1;
}

function physicalSeat(uid: string): Seat | null {
  const match = /^m([0-3]):/.exec(uid);
  return match ? Number(match[1]) as Seat : null;
}

function privateHandForSeat(duel: TagDuel, seat: Seat): CardRef[] {
  const team = (seat % 2) as Team;
  if (duel.active[team] === seat) return duel.core.players[team].hand;
  const reserve = duel.reserves[String(seat)];
  if (!reserve) throw new Error('Mão privada do assento físico não encontrada.');
  return reserve.hand;
}

function isNormalSpellCardId(cardId: string): boolean {
  if (cardId === REMOVE_TRAP_ID) return true;
  const metadata = getDuelCard(cardId);
  return metadata?.kind === 'spell' && metadata.field !== true;
}

function findFaceUpTrap(core: TagDuel['core'], uid: string): TrapLocation | null {
  for (const team of [0, 1] as const) {
    const card = core.players[team].backrow.find(item => item.uid === uid);
    if (card && card.faceUp && card.entityKind !== 'token' &&
        getDuelCard(card.id)?.kind === 'trap') {
      return { team, card };
    }
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

export function assertRemoveTrapRules(duel: TagDuel): void {
  assertTagDuel(duel);
  if (duel.mode !== 'tag-classic') throw new Error('Remove Trap exige TagDuel clássico.');
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
  if (extra.some(count => count > rules.extraDeckMax)) {
    throw new Error('Deck Adicional físico excede cinco cartas.');
  }
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

/** Remove Trap is a Normal Spell: only the active physical seat may use its hand. */
export function activateRemoveTrap(
  input: TagDuel,
  sourceUid: string,
  targetUid: string,
  options: { cardId?: string } = {},
): RemoveTrapActivation | null {
  assertRemoveTrapRules(input);
  const core = input.core;
  const actor = tagDecisionMember(input);
  const team = actor.team;
  const seatValue = input.active[team];
  if (!isTeam(team) || !Number.isInteger(seatValue) || seatValue < 0 || seatValue > 3) return null;
  const seat = seatValue as Seat;
  const cardId = options.cardId ?? REMOVE_TRAP_ID;

  if (input.members[seat]?.team !== team || physicalSeat(sourceUid) !== seat ||
      core.phase !== 'main' || core.pending.kind !== 'none' || core.chain.length !== 0 ||
      core.damageStep === true || core.turnEnding || core.handFlow || core.choice ||
      !cardActivationAllowed(core, team, 'spell') || !isNormalSpellCardId(cardId)) {
    return null;
  }
  const hand = privateHandForSeat(input, seat);
  const sourceIndex = hand.findIndex(card => card.uid === sourceUid && card.id === cardId &&
    card.entityKind !== 'token');
  if (sourceIndex < 0) return null;

  const target = findFaceUpTrap(core, targetUid);
  if (!target || targetUid === sourceUid) return null;
  const before = inventorySignature(input);
  const next = structuredClone(input);
  const nextHand = privateHandForSeat(next, seat);
  const nextSourceIndex = nextHand.findIndex(card => card.uid === sourceUid && card.id === cardId);
  if (nextSourceIndex < 0) return null;
  const [spell] = nextHand.splice(nextSourceIndex, 1);
  next.core.players[team].grave.push({ uid: spell.uid, id: spell.id });
  synchronizeCardLifetimes(next.core);

  const targetBinding = bindTarget(next.core, targetUid);
  if (!targetBinding || targetBinding.zone !== 'backrow') return null;
  const plan: RemoveTrapPlan = {
    eventId: 'remove-trap:' + next.core.turn + ':' + sourceUid + ':' + targetUid + ':' + seat,
    sourceUid,
    sourceId: cardId,
    activeSeat: seat,
    activeTeam: team,
    targetUid,
    targetId: target.card.id,
    targetBinding,
    turn: next.core.turn,
  };

  assertRemoveTrapRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, plan };
}

/** Destroys only the same face-up Trap instance selected at activation. */
export function resolveRemoveTrap(
  input: TagDuel,
  plan: RemoveTrapPlan,
  options: { negated?: boolean; cardId?: string } = {},
): RemoveTrapResolution | null {
  assertRemoveTrapRules(input);
  const cardId = options.cardId ?? REMOVE_TRAP_ID;
  if (!plan || typeof plan.eventId !== 'string' || !plan.eventId.trim() ||
      plan.sourceId !== cardId || !Number.isSafeInteger(plan.turn) ||
      plan.turn !== input.core.turn || !isTeam(plan.activeTeam) ||
      !Number.isInteger(plan.activeSeat) || plan.activeSeat < 0 || plan.activeSeat > 3 ||
      plan.activeTeam !== plan.activeSeat % 2 ||
      input.active[plan.activeTeam] !== plan.activeSeat ||
      physicalSeat(plan.sourceUid) !== plan.activeSeat ||
      !plan.targetBinding || plan.targetBinding.uid !== plan.targetUid ||
      plan.targetBinding.zone !== 'backrow' ||
      !Number.isSafeInteger(plan.targetBinding.epoch) || plan.targetBinding.epoch < 0 ||
      plan.eventId !== 'remove-trap:' + plan.turn + ':' + plan.sourceUid + ':' +
        plan.targetUid + ':' + plan.activeSeat) {
    return null;
  }
  const receipts = (input as ReceiptState).removeTrapResolvedEvents ?? [];
  if (!Array.isArray(receipts) || receipts.includes(plan.eventId)) return null;

  const before = inventorySignature(input);
  const next = structuredClone(input);
  const negated = options.negated === true;
  let targetDestroyed = false;
  if (!negated && targetBindingValid(next.core, plan.targetBinding)) {
    const target = findFaceUpTrap(next.core, plan.targetUid);
    if (target && target.card.id === plan.targetId) {
      const ownerSeat = physicalSeat(target.card.uid);
      if (ownerSeat !== null) {
        next.core.players[target.team].backrow =
          next.core.players[target.team].backrow.filter(card => card.uid !== plan.targetUid);
        next.core.players[ownerSeat % 2].grave.push({ uid: target.card.uid, id: target.card.id });
        synchronizeCardLifetimes(next.core);
        targetDestroyed = true;
      }
    }
  }

  const nextReceipts = (next as ReceiptState).removeTrapResolvedEvents ?? [];
  (next as ReceiptState).removeTrapResolvedEvents = [...nextReceipts, plan.eventId].slice(-256);
  assertRemoveTrapRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, targetDestroyed, negated };
}

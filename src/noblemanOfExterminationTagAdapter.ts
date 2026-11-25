import type { Backrow, CardRef } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { rulesCardName } from './cardIdentity';
import { bindTarget, synchronizeCardLifetimes, targetBindingValid, type TargetBinding } from './cardLifetime';
import { assertNoblemanRules, revealAndBanishCopies, type RevealedMainDeck } from './noblemanOfCrossoutTagAdapter';
import { type TagDuel, tagInventory } from './tagDuel';

export const NOBLEMAN_OF_EXTERMINATION_ID = '17449108';
type Seat = 0 | 1 | 2 | 3;
type Team = 0 | 1;
type Zone = 'backrow' | 'field';
export type NoblemanExterminationPlan = {
  eventId: string;
  sourceUid: string;
  sourceId: string;
  ownerSeat: Seat;
  ownerTeam: Team;
  targetUid: string;
  targetBinding: TargetBinding;
  turn: number;
};
export type NoblemanExterminationActivation = { state: TagDuel; plan: NoblemanExterminationPlan };
export type NoblemanExterminationResolution = {
  state: TagDuel;
  banishedTarget: { uid: string; id: string; name: string; kind: 'spell' | 'trap' } | null;
  trapTarget: boolean;
  revealedDecks: RevealedMainDeck[];
  banishedDeckUids: string[];
  negated: boolean;
};
type ReceiptState = TagDuel & { noblemanExterminationResolvedEvents?: string[] };

function isTeam(value: unknown): value is Team { return value === 0 || value === 1; }
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
function inventorySignature(duel: TagDuel): string {
  return tagInventory(duel).filter(card => card.entityKind !== 'token')
    .map(card => card.uid + '|' + card.id).sort().join('\n');
}
function assertSameInventory(before: string, after: TagDuel): void {
  if (before !== inventorySignature(after)) {
    throw new Error('O adapter alterou a identidade ou o inventário físico das cartas.');
  }
}
function isSpellCardId(cardId: string): boolean {
  if (cardId === NOBLEMAN_OF_EXTERMINATION_ID) return true;
  const metadata = getDuelCard(cardId);
  return metadata?.kind === 'spell' && metadata.field !== true;
}
function findBackrow(core: TagDuel['core'], uid: string): { controller: Team; zone: Zone; card: Backrow } | null {
  for (const team of [0, 1] as const) {
    const card = core.players[team].backrow.find(item => item.uid === uid);
    if (card) return { controller: team, zone: 'backrow', card };
    const field = core.players[team].field;
    if (field?.uid === uid) return { controller: team, zone: 'field', card: field };
  }
  return null;
}
function faceDownSpellTrap(core: TagDuel['core'], uid: string): { controller: Team; zone: Zone; card: Backrow } | null {
  const found = findBackrow(core, uid);
  if (!found || found.card.faceUp || found.card.entityKind === 'token') return null;
  const kind = getDuelCard(found.card.id)?.kind;
  return kind === 'spell' || kind === 'trap' ? found : null;
}
function activeMainHandSource(
  duel: TagDuel,
  sourceUid: string,
  cardId: string,
): { team: Team; seat: Seat; source: CardRef } | null {
  const core = duel.core;
  if (core.phase !== 'main' || core.pending.kind !== 'none' || core.chain.length !== 0 ||
      core.turnEnding || core.handFlow || core.choice || typeof sourceUid !== 'string' || !sourceUid) {
    return null;
  }
  const team = core.current as Team;
  const seat = duel.cursor as Seat;
  if (!isTeam(team) || duel.active[team] !== seat || duel.members[seat]?.team !== team) return null;
  const source = privateHandForSeat(duel, seat).find(card =>
    card.uid === sourceUid && card.id === cardId && card.entityKind !== 'token');
  if (!source || physicalSeat(source.uid) !== seat || !isSpellCardId(cardId)) return null;
  return { team, seat, source };
}

/** Selects a face-down Spell/Trap without exposing its identity in the public activation plan. */
export function activateNoblemanOfExtermination(
  input: TagDuel,
  sourceUid: string,
  targetUid: string,
  options: { cardId?: string } = {},
): NoblemanExterminationActivation | null {
  assertNoblemanRules(input);
  const cardId = options.cardId ?? NOBLEMAN_OF_EXTERMINATION_ID;
  const active = activeMainHandSource(input, sourceUid, cardId);
  if (!active || typeof targetUid !== 'string' || !targetUid) return null;
  const target = faceDownSpellTrap(input.core, targetUid);
  if (!target) return null;

  const before = inventorySignature(input);
  const next = structuredClone(input);
  const hand = privateHandForSeat(next, active.seat);
  const sourceIndex = hand.findIndex(card => card.uid === sourceUid && card.id === cardId);
  if (sourceIndex < 0) return null;
  const [spell] = hand.splice(sourceIndex, 1);
  next.core.players[active.team].grave.push(spell);
  synchronizeCardLifetimes(next.core);
  const targetBinding = bindTarget(next.core, targetUid);
  if (!targetBinding || targetBinding.zone !== target.zone) return null;
  const plan: NoblemanExterminationPlan = {
    eventId: 'nobleman-extermination:' + next.core.turn + ':' + sourceUid + ':' + targetUid,
    sourceUid,
    sourceId: cardId,
    ownerSeat: active.seat,
    ownerTeam: active.team,
    targetUid,
    targetBinding,
    turn: next.core.turn,
  };
  assertNoblemanRules(next);
  assertSameInventory(before, next);
  return { state: next, plan };
}

/** Destroys and banishes a backrow/Field Zone card to its original physical owner's team. */
function banishNoblemanExterminationTarget(core: TagDuel['core'], uid: string): boolean {
  const found = findBackrow(core, uid);
  const ownerSeat = physicalSeat(uid);
  if (!found || ownerSeat === null) return false;
  synchronizeCardLifetimes(core);
  if (found.zone === 'backrow') {
    core.players[found.controller].backrow =
      core.players[found.controller].backrow.filter(card => card.uid !== uid);
  } else {
    core.players[found.controller].field = null;
  }
  (core.players[ownerSeat % 2].banished ??= []).push({
    uid: found.card.uid,
    id: found.card.id,
  });
  synchronizeCardLifetimes(core);
  return true;
}

/** Resolves the original hidden Spell/Trap; Trap targets reuse the M621 four-deck reveal helper. */
export function resolveNoblemanOfExtermination(
  input: TagDuel,
  plan: NoblemanExterminationPlan,
  options: { negated?: boolean; cardId?: string } = {},
): NoblemanExterminationResolution | null {
  assertNoblemanRules(input);
  const cardId = options.cardId ?? NOBLEMAN_OF_EXTERMINATION_ID;
  if (!plan || typeof plan.eventId !== 'string' || !plan.eventId.trim() ||
      plan.sourceId !== cardId || !Number.isSafeInteger(plan.turn) || plan.turn !== input.core.turn ||
      !isTeam(plan.ownerTeam) || !Number.isInteger(plan.ownerSeat) || plan.ownerSeat < 0 ||
      plan.ownerSeat > 3 || plan.ownerTeam !== plan.ownerSeat % 2 ||
      physicalSeat(plan.sourceUid) !== plan.ownerSeat || physicalSeat(plan.targetUid) === null ||
      plan.eventId !== 'nobleman-extermination:' + plan.turn + ':' + plan.sourceUid + ':' + plan.targetUid ||
      !plan.targetBinding || plan.targetBinding.uid !== plan.targetUid ||
      (plan.targetBinding.zone !== 'backrow' && plan.targetBinding.zone !== 'field') ||
      !Number.isSafeInteger(plan.targetBinding.epoch) || plan.targetBinding.epoch < 0 ||
      input.active[plan.ownerTeam] !== plan.ownerSeat) return null;
  const receipts = (input as ReceiptState).noblemanExterminationResolvedEvents ?? [];
  if (!Array.isArray(receipts) || receipts.includes(plan.eventId)) return null;

  const before = inventorySignature(input);
  const next = structuredClone(input);
  let banishedTarget: NoblemanExterminationResolution['banishedTarget'] = null;
  let trapTarget = false;
  let revealedDecks: RevealedMainDeck[] = [];
  let banishedDeckUids: string[] = [];
  const negated = options.negated === true;
  if (!negated && targetBindingValid(next.core, plan.targetBinding)) {
    const target = findBackrow(next.core, plan.targetUid);
    if (target) {
      const metadata = getDuelCard(target.card.id);
      if (metadata && (metadata.kind === 'spell' || metadata.kind === 'trap') &&
          banishNoblemanExterminationTarget(next.core, plan.targetUid)) {
        const name = rulesCardName(metadata);
        banishedTarget = {
          uid: plan.targetUid,
          id: target.card.id,
          name,
          kind: metadata.kind,
        };
        trapTarget = metadata.kind === 'trap';
        if (trapTarget) {
          const revealed = revealAndBanishCopies(next, name);
          revealedDecks = revealed.revealedDecks;
          banishedDeckUids = revealed.banishedDeckUids;
        }
      }
    }
  }
  const nextReceipts = (next as ReceiptState).noblemanExterminationResolvedEvents ?? [];
  (next as ReceiptState).noblemanExterminationResolvedEvents = [...nextReceipts, plan.eventId].slice(-256);
  assertNoblemanRules(next);
  assertSameInventory(before, next);
  return { state: next, banishedTarget, trapTarget, revealedDecks, banishedDeckUids, negated };
}

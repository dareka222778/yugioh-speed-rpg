import type { CardRef } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { rulesFor } from './rulesProfile';
import { bindTarget, targetBindingValid, synchronizeCardLifetimes, type TargetBinding } from './cardLifetime';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';

export const SPIRITUALISM_ID = '15866454';
type Seat = 0 | 1 | 2 | 3;
type Team = 0 | 1;
type Zone = 'backrow' | 'field';

export type SpiritualismPlan = {
  eventId: string;
  sourceUid: string;
  sourceId: string;
  ownerSeat: Seat;
  ownerTeam: Team;
  targetUid: string;
  targetId: string;
  targetOwnerSeat: Seat;
  targetTeamAtActivation: Team;
  targetBinding: TargetBinding;
  turn: number;
};
export type SpiritualismActivation = { state: TagDuel; plan: SpiritualismPlan };
export type SpiritualismResolution = {
  state: TagDuel;
  returned: boolean;
  targetLost: boolean;
  returnedUid: string | null;
};
type ReceiptState = TagDuel & { spiritualismResolvedEvents?: string[] };

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
  return tagInventory(duel).map(card => card.uid + '|' + card.id).sort().join('\n');
}
function assertSameInventory(before: string, after: TagDuel): void {
  if (before !== inventorySignature(after)) {
    throw new Error('O adapter alterou a identidade ou o inventário físico das cartas.');
  }
}
function isSpellCardId(cardId: string): boolean {
  if (cardId === SPIRITUALISM_ID) return true;
  const metadata = getDuelCard(cardId);
  return metadata?.kind === 'spell' && metadata.field !== true;
}
function isSpellTrap(ref: CardRef): boolean {
  if (ref.entityKind === 'token') return false;
  const kind = getDuelCard(ref.id)?.kind;
  return kind === 'spell' || kind === 'trap';
}
function findSpellTrap(
  duel: TagDuel,
  uid: string,
): { team: Team; zone: Zone; card: CardRef } | null {
  for (const team of [0, 1] as const) {
    const backrow = duel.core.players[team].backrow.find(card => card.uid === uid);
    if (backrow && isSpellTrap(backrow)) return { team, zone: 'backrow', card: backrow };
    const field = duel.core.players[team].field;
    if (field?.uid === uid && isSpellTrap(field)) return { team, zone: 'field', card: field };
  }
  return null;
}
function toHandRef(card: CardRef): CardRef {
  return {
    uid: card.uid,
    id: card.id,
    ...(card.properlySummoned !== undefined ? { properlySummoned: card.properlySummoned } : {}),
    ...(card.entityKind !== undefined ? { entityKind: card.entityKind } : {}),
    ...(card.tokenPolicy !== undefined ? { tokenPolicy: card.tokenPolicy } : {}),
  };
}

/** Enforces the owner's physical deck/zone profile; hand overflow remains End Phase-only. */
export function assertSpiritualismRules(duel: TagDuel): void {
  assertTagDuel(duel);
  if (duel.mode !== 'tag-classic') throw new Error('Spiritualism exige TagDuel clássico.');
  const rules = rulesFor(duel.core);
  if (rules.mainDeckMin !== 20 || rules.mainDeckMax !== 30 || rules.handLimit !== 6 ||
      rules.handCheck !== 'end' || rules.monsterZones !== 3 || rules.spellTrapZones !== 3 ||
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
    if (team.monsters.length > rules.monsterZones) throw new Error('Equipe excedeu as três Zonas de Monstros.');
    if (team.backrow.length > rules.spellTrapZones) {
      throw new Error('Equipe excedeu as três Zonas de Magias/Armadilhas.');
    }
    // Field Zone remains separate from the three Spell/Trap Zones.
  }
}

function activeMainHandSource(
  duel: TagDuel,
  sourceUid: string,
  cardId: string,
): { team: Team; seat: Seat } | null {
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
  return { team, seat };
}

/** Targets only an opponent-controlled Spell/Trap; its activation/effect cannot be negated. */
export function activateSpiritualism(
  input: TagDuel,
  sourceUid: string,
  targetUid: string,
  options: { cardId?: string } = {},
): SpiritualismActivation | null {
  assertSpiritualismRules(input);
  const cardId = options.cardId ?? SPIRITUALISM_ID;
  const active = activeMainHandSource(input, sourceUid, cardId);
  const target = findSpellTrap(input, targetUid);
  const targetOwnerSeat = physicalSeat(targetUid);
  if (!active || !target || target.team === active.team || targetOwnerSeat === null) return null;

  const before = inventorySignature(input);
  const next = structuredClone(input);
  const targetBinding = bindTarget(next.core, targetUid);
  if (!targetBinding || !['backrow', 'field'].includes(targetBinding.zone)) return null;
  const hand = privateHandForSeat(next, active.seat);
  const sourceIndex = hand.findIndex(card => card.uid === sourceUid && card.id === cardId);
  if (sourceIndex < 0) return null;
  const [spell] = hand.splice(sourceIndex, 1);
  next.core.players[active.team].grave.push(spell);

  const plan: SpiritualismPlan = {
    eventId: 'spiritualism:' + next.core.turn + ':' + sourceUid + ':' + targetUid,
    sourceUid,
    sourceId: cardId,
    ownerSeat: active.seat,
    ownerTeam: active.team,
    targetUid,
    targetId: target.card.id,
    targetOwnerSeat,
    targetTeamAtActivation: target.team,
    targetBinding,
    turn: next.core.turn,
  };
  assertSpiritualismRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, plan };
}

/** Returns the targeted card to its original physical owner's private hand, even if inactive. */
export function resolveSpiritualism(
  input: TagDuel,
  plan: SpiritualismPlan,
  options: { cardId?: string } = {},
): SpiritualismResolution | null {
  assertSpiritualismRules(input);
  const cardId = options.cardId ?? SPIRITUALISM_ID;
  if (!plan || typeof plan.eventId !== 'string' || !plan.eventId.trim() ||
      plan.sourceId !== cardId || !Number.isInteger(plan.turn) || plan.turn !== input.core.turn ||
      !isTeam(plan.ownerTeam) || !Number.isInteger(plan.ownerSeat) || plan.ownerSeat < 0 ||
      plan.ownerSeat > 3 || plan.ownerTeam !== plan.ownerSeat % 2 ||
      physicalSeat(plan.sourceUid) !== plan.ownerSeat ||
      plan.eventId !== 'spiritualism:' + plan.turn + ':' + plan.sourceUid + ':' + plan.targetUid ||
      input.active[plan.ownerTeam] !== plan.ownerSeat ||
      physicalSeat(plan.targetUid) !== plan.targetOwnerSeat ||
      !isTeam(plan.targetTeamAtActivation) || plan.targetTeamAtActivation === plan.ownerTeam ||
      !plan.targetBinding || plan.targetBinding.uid !== plan.targetUid ||
      !['backrow', 'field'].includes(plan.targetBinding.zone)) return null;

  const receipts = (input as ReceiptState).spiritualismResolvedEvents ?? [];
  if (!Array.isArray(receipts) || receipts.includes(plan.eventId)) return null;
  const source = input.core.players[plan.ownerTeam].grave.find(card =>
    card.uid === plan.sourceUid && card.id === cardId && card.entityKind !== 'token');
  if (!source) return null;

  const before = inventorySignature(input);
  const next = structuredClone(input);
  let returned = false;
  let targetLost = !targetBindingValid(next.core, plan.targetBinding);
  if (!targetLost) {
    const target = findSpellTrap(next, plan.targetUid);
    if (!target || target.card.id !== plan.targetId) {
      targetLost = true;
    } else {
      let card: CardRef | null = null;
      if (target.zone === 'backrow') {
        const index = next.core.players[target.team].backrow.findIndex(ref => ref.uid === plan.targetUid);
        if (index >= 0) card = next.core.players[target.team].backrow.splice(index, 1)[0];
      } else {
        const field = next.core.players[target.team].field;
        if (field?.uid === plan.targetUid) {
          card = field;
          next.core.players[target.team].field = null;
        }
      }
      if (!card) {
        targetLost = true;
      } else {
        privateHandForSeat(next, plan.targetOwnerSeat).push(toHandRef(card));
        returned = true;
      }
    }
  }

  const nextReceipts = (next as ReceiptState).spiritualismResolvedEvents ?? [];
  (next as ReceiptState).spiritualismResolvedEvents = [...nextReceipts, plan.eventId].slice(-256);
  synchronizeCardLifetimes(next.core);
  assertSpiritualismRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, returned, targetLost, returnedUid: returned ? plan.targetUid : null };
}

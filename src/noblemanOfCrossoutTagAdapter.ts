import type { CardRef, Monster } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { rulesCardName } from './cardIdentity';
import { getMonsterEffect } from './monsterEffects';
import { rulesFor } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';
import { canAffectMonster } from './continuousEffects';
import { bindTarget, synchronizeCardLifetimes, targetBindingValid, type TargetBinding } from './cardLifetime';
import { cleanEquips } from './classicEffects';

export const NOBLEMAN_OF_CROSSOUT_ID = '71044499';
type Seat = 0 | 1 | 2 | 3;
type Team = 0 | 1;
type RevealedCard = { id: string; name: string };
export type RevealedMainDeck = { seat: Seat; cards: RevealedCard[] };
export type NoblemanPlan = {
  eventId: string;
  sourceUid: string;
  sourceId: string;
  ownerSeat: Seat;
  ownerTeam: Team;
  targetUid: string;
  targetBinding: TargetBinding;
  turn: number;
};
export type NoblemanActivation = { state: TagDuel; plan: NoblemanPlan };
export type NoblemanResolution = {
  state: TagDuel;
  banishedTarget: { uid: string; id: string; name: string } | null;
  flipMonster: boolean;
  revealedDecks: RevealedMainDeck[];
  banishedDeckUids: string[];
  negated: boolean;
};
type ReceiptState = TagDuel & { noblemanResolvedEvents?: string[] };

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
function privateDeckForSeat(duel: TagDuel, seat: Seat): CardRef[] {
  const team = (seat % 2) as Team;
  if (duel.active[team] === seat) return duel.core.players[team].deck;
  const reserve = duel.reserves[String(seat)];
  if (!reserve) throw new Error('Deck privado do assento físico não encontrado.');
  return reserve.deck;
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
  if (cardId === NOBLEMAN_OF_CROSSOUT_ID) return true;
  const metadata = getDuelCard(cardId);
  return metadata?.kind === 'spell' && metadata.field !== true;
}
function findMonster(core: TagDuel['core'], uid: string): { controller: Team; monster: Monster } | null {
  for (const team of [0, 1] as const) {
    const monster = core.players[team].monsters.find(card => card.uid === uid);
    if (monster) return { controller: team, monster };
  }
  return null;
}
function faceDownTarget(core: TagDuel['core'], uid: string): { controller: Team; monster: Monster } | null {
  const found = findMonster(core, uid);
  return found && !found.monster.faceUp && found.monster.entityKind !== 'token' ? found : null;
}

export function assertPhysicalExtraDeckCounts(extraCounts: readonly number[], maximum = 5): void {
  if (!Array.isArray(extraCounts) || extraCounts.length !== 4 || !Number.isSafeInteger(maximum) ||
      maximum < 0 || extraCounts.some(count => !Number.isSafeInteger(count) || count < 0)) {
    throw new Error('Contagem do Deck Adicional inválida.');
  }
  if (extraCounts.some(count => count > maximum)) {
    throw new Error('Deck Adicional físico excede cinco cartas.');
  }
}

/** Validates all four physical inventories while keeping the six-card check End Phase-only. */
export function assertNoblemanRules(duel: TagDuel): void {
  assertTagDuel(duel);
  if (duel.mode !== 'tag-classic') throw new Error('Nobleman of Crossout exige TagDuel clássico.');
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
  assertPhysicalExtraDeckCounts(extra, rules.extraDeckMax);
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

/** The hidden target identity stays out of the activation plan until resolution. */
export function activateNoblemanOfCrossout(
  input: TagDuel,
  sourceUid: string,
  targetUid: string,
  options: { cardId?: string } = {},
): NoblemanActivation | null {
  assertNoblemanRules(input);
  const cardId = options.cardId ?? NOBLEMAN_OF_CROSSOUT_ID;
  const active = activeMainHandSource(input, sourceUid, cardId);
  if (!active || typeof targetUid !== 'string' || !targetUid) return null;
  const target = faceDownTarget(input.core, targetUid);
  if (!target || !canAffectMonster(input.core, targetUid, 'spell')) return null;

  const before = inventorySignature(input);
  const next = structuredClone(input);
  const hand = privateHandForSeat(next, active.seat);
  const sourceIndex = hand.findIndex(card => card.uid === sourceUid && card.id === cardId);
  if (sourceIndex < 0) return null;
  const [spell] = hand.splice(sourceIndex, 1);
  next.core.players[active.team].grave.push(spell);
  synchronizeCardLifetimes(next.core);
  const targetBinding = bindTarget(next.core, targetUid);
  if (!targetBinding || targetBinding.zone !== 'monsters') return null;
  const plan: NoblemanPlan = {
    eventId: 'nobleman-crossout:' + next.core.turn + ':' + sourceUid + ':' + targetUid,
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
  assertTagDuel(next);
  return { state: next, plan };
}

/** Banishes a destroyed monster to the original physical owner's team. */
function banishNoblemanTarget(core: TagDuel['core'], uid: string): boolean {
  const found = findMonster(core, uid);
  const ownerSeat = physicalSeat(uid);
  if (!found || ownerSeat === null || found.monster.entityKind === 'token') return false;
  synchronizeCardLifetimes(core);
  const ownerTeam = (ownerSeat % 2) as Team;
  core.players[found.controller].monsters =
    core.players[found.controller].monsters.filter(monster => monster.uid !== uid);
  (core.players[ownerTeam].banished ??= []).push({
    uid: found.monster.uid,
    id: found.monster.id,
    ...(found.monster.properlySummoned ? { properlySummoned: true } : {}),
  });
  cleanEquips(core);
  synchronizeCardLifetimes(core);
  return true;
}

/** Reveals all four physical Main Decks, then banishes every matching rules name. */
export function revealAndBanishCopies(duel: TagDuel, targetName: string): {
  revealedDecks: RevealedMainDeck[];
  banishedDeckUids: string[];
} {
  const revealedDecks: RevealedMainDeck[] = [];
  const banishedDeckUids: string[] = [];
  for (const seat of [0, 1, 2, 3] as const) {
    const deck = privateDeckForSeat(duel, seat);
    const revealedCards = deck.map(card => {
      const metadata = getDuelCard(card.id);
      if (!metadata) throw new Error('Deck revelado contém carta sem metadados.');
      return { id: card.id, name: rulesCardName(metadata) };
    });
    revealedDecks.push({ seat, cards: revealedCards });
    const matches = deck.filter(card => {
      const metadata = getDuelCard(card.id);
      return !!metadata && rulesCardName(metadata) === targetName;
    });
    for (const card of matches) {
      const index = deck.findIndex(current => current.uid === card.uid);
      if (index < 0) continue;
      const [removed] = deck.splice(index, 1);
      const ownerSeat = physicalSeat(removed.uid);
      if (ownerSeat === null) throw new Error('Carta do Deck sem proprietário físico.');
      (duel.core.players[ownerSeat % 2].banished ??= []).push({
        uid: removed.uid,
        id: removed.id,
        ...(removed.properlySummoned ? { properlySummoned: true } : {}),
      });
      banishedDeckUids.push(removed.uid);
    }
  }
  synchronizeCardLifetimes(duel.core);
  return { revealedDecks, banishedDeckUids };
}

/** Resolves the original hidden target; only a Flip monster causes deck reveal/search. */
export function resolveNoblemanOfCrossout(
  input: TagDuel,
  plan: NoblemanPlan,
  options: { negated?: boolean; cardId?: string } = {},
): NoblemanResolution | null {
  assertNoblemanRules(input);
  const cardId = options.cardId ?? NOBLEMAN_OF_CROSSOUT_ID;
  if (!plan || typeof plan.eventId !== 'string' || !plan.eventId.trim() ||
      plan.sourceId !== cardId || !Number.isSafeInteger(plan.turn) || plan.turn !== input.core.turn ||
      !isTeam(plan.ownerTeam) || !Number.isInteger(plan.ownerSeat) || plan.ownerSeat < 0 ||
      plan.ownerSeat > 3 || plan.ownerTeam !== plan.ownerSeat % 2 ||
      physicalSeat(plan.sourceUid) !== plan.ownerSeat || physicalSeat(plan.targetUid) === null ||
      plan.eventId !== 'nobleman-crossout:' + plan.turn + ':' + plan.sourceUid + ':' + plan.targetUid ||
      !plan.targetBinding || plan.targetBinding.uid !== plan.targetUid ||
      plan.targetBinding.zone !== 'monsters' || !Number.isSafeInteger(plan.targetBinding.epoch) ||
      plan.targetBinding.epoch < 0 || input.active[plan.ownerTeam] !== plan.ownerSeat) return null;
  const receipts = (input as ReceiptState).noblemanResolvedEvents ?? [];
  if (!Array.isArray(receipts) || receipts.includes(plan.eventId)) return null;

  const before = inventorySignature(input);
  const next = structuredClone(input);
  let banishedTarget: NoblemanResolution['banishedTarget'] = null;
  let flipMonster = false;
  let revealedDecks: RevealedMainDeck[] = [];
  let banishedDeckUids: string[] = [];
  const negated = options.negated === true;
  if (!negated && targetBindingValid(next.core, plan.targetBinding)) {
    const target = findMonster(next.core, plan.targetUid);
    if (target && target.monster.entityKind !== 'token' &&
        canAffectMonster(next.core, plan.targetUid, 'spell')) {
      const metadata = getDuelCard(target.monster.id);
      if (metadata && banishNoblemanTarget(next.core, plan.targetUid)) {
        const name = rulesCardName(metadata);
        banishedTarget = { uid: plan.targetUid, id: target.monster.id, name };
        flipMonster = getMonsterEffect(target.monster.id)?.trigger === 'flip';
        if (flipMonster) {
          const revealed = revealAndBanishCopies(next, name);
          revealedDecks = revealed.revealedDecks;
          banishedDeckUids = revealed.banishedDeckUids;
        }
      }
    }
  }
  const nextReceipts = (next as ReceiptState).noblemanResolvedEvents ?? [];
  (next as ReceiptState).noblemanResolvedEvents = [...nextReceipts, plan.eventId].slice(-256);
  assertNoblemanRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, banishedTarget, flipMonster, revealedDecks, banishedDeckUids, negated };
}

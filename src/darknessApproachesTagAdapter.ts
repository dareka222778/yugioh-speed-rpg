import type { CardRef, Monster } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { rulesFor } from './rulesProfile';
import { synchronizeCardLifetimes } from './cardLifetime';
import { turnMonsterFaceDown } from './classicEffects';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';

export const DARKNESS_APPROACHES_ID = '80168720';
type Seat = 0 | 1 | 2 | 3;
type Team = 0 | 1;

export type DarknessApproachesPlan = {
  eventId: string;
  sourceUid: string;
  sourceId: string;
  costUids: string[];
  ownerSeat: Seat;
  ownerTeam: Team;
  targetUid: string;
  targetId: string;
  targetOwnerSeat: Seat;
  targetTeamAtActivation: Team;
  turn: number;
};
export type DarknessApproachesActivation = { state: TagDuel; plan: DarknessApproachesPlan };
export type DarknessApproachesResolution = {
  state: TagDuel;
  targetApplied: boolean;
  targetLost: boolean;
  negated: boolean;
};
type ReceiptState = TagDuel & { darknessApproachesResolvedEvents?: string[] };

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
  if (cardId === DARKNESS_APPROACHES_ID) return true;
  const metadata = getDuelCard(cardId);
  return metadata?.kind === 'spell' && metadata.field !== true;
}
function isMonsterCard(card: CardRef): boolean {
  return card.entityKind !== 'token' && getDuelCard(card.id)?.kind === 'monster';
}
function findFaceUpMonster(
  duel: TagDuel,
  uid: string,
): { team: Team; monster: Monster } | null {
  for (const team of [0, 1] as const) {
    const monster = duel.core.players[team].monsters.find(card => card.uid === uid);
    if (monster && monster.faceUp && monster.entityKind !== 'token' && isMonsterCard(monster)) {
      return { team, monster };
    }
  }
  return null;
}

/** Enforces the owner's physical deck/zone profile without truncating hands before End Phase. */
export function assertDarknessApproachesRules(duel: TagDuel): void {
  assertTagDuel(duel);
  if (duel.mode !== 'tag-classic') throw new Error('Darkness Approaches exige TagDuel clássico.');
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

/** Pays the two-card cost immediately and binds one face-up monster from either field. */
export function activateDarknessApproaches(
  input: TagDuel,
  sourceUid: string,
  costUids: readonly string[],
  targetUid: string,
  options: { cardId?: string } = {},
): DarknessApproachesActivation | null {
  assertDarknessApproachesRules(input);
  const cardId = options.cardId ?? DARKNESS_APPROACHES_ID;
  const active = activeMainHandSource(input, sourceUid, cardId);
  if (!active || !Array.isArray(costUids) || costUids.length !== 2 ||
      costUids.some(uid => typeof uid !== 'string' || !uid) ||
      new Set(costUids).size !== 2 || costUids.includes(sourceUid)) return null;
  const hand = privateHandForSeat(input, active.seat);
  const costs = costUids.map(uid => hand.find(card => card.uid === uid));
  if (costs.some(card => !card || card.entityKind === 'token')) return null;
  const target = findFaceUpMonster(input, targetUid);
  const targetOwnerSeat = physicalSeat(targetUid);
  if (!target || targetOwnerSeat === null) return null;

  const before = inventorySignature(input);
  const next = structuredClone(input);
  const nextHand = privateHandForSeat(next, active.seat);
  const sourceIndex = nextHand.findIndex(card => card.uid === sourceUid && card.id === cardId);
  if (sourceIndex < 0) return null;
  const [spell] = nextHand.splice(sourceIndex, 1);
  next.core.players[active.team].grave.push(spell);
  for (const uid of costUids) {
    const index = nextHand.findIndex(card => card.uid === uid);
    if (index < 0) return null;
    const [cost] = nextHand.splice(index, 1);
    next.core.players[active.team].grave.push(cost);
  }
  const plan: DarknessApproachesPlan = {
    eventId: 'darkness-approaches:' + next.core.turn + ':' + sourceUid,
    sourceUid,
    sourceId: cardId,
    costUids: [...costUids],
    ownerSeat: active.seat,
    ownerTeam: active.team,
    targetUid,
    targetId: target.monster.id,
    targetOwnerSeat,
    targetTeamAtActivation: target.team,
    turn: next.core.turn,
  };
  assertDarknessApproachesRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, plan };
}

/** Resolves only the original target; costs stay paid if negated or if that target left face-up field. */
export function resolveDarknessApproaches(
  input: TagDuel,
  plan: DarknessApproachesPlan,
  options: { negated?: boolean; cardId?: string } = {},
): DarknessApproachesResolution | null {
  assertDarknessApproachesRules(input);
  const cardId = options.cardId ?? DARKNESS_APPROACHES_ID;
  if (!plan || typeof plan.eventId !== 'string' || !plan.eventId.trim() ||
      plan.sourceId !== cardId || !Number.isInteger(plan.turn) || plan.turn !== input.core.turn ||
      !isTeam(plan.ownerTeam) || !Number.isInteger(plan.ownerSeat) || plan.ownerSeat < 0 ||
      plan.ownerSeat > 3 || plan.ownerTeam !== plan.ownerSeat % 2 ||
      physicalSeat(plan.sourceUid) !== plan.ownerSeat ||
      plan.eventId !== 'darkness-approaches:' + plan.turn + ':' + plan.sourceUid ||
      !Array.isArray(plan.costUids) || plan.costUids.length !== 2 ||
      plan.costUids.some(uid => typeof uid !== 'string' || !uid) ||
      new Set(plan.costUids).size !== 2 || plan.costUids.includes(plan.sourceUid) ||
      physicalSeat(plan.targetUid) !== plan.targetOwnerSeat ||
      !isTeam(plan.targetTeamAtActivation) || input.active[plan.ownerTeam] !== plan.ownerSeat) return null;
  const receipts = (input as ReceiptState).darknessApproachesResolvedEvents ?? [];
  if (!Array.isArray(receipts) || receipts.includes(plan.eventId)) return null;
  const inventory = tagInventory(input);
  if (!inventory.some(card => card.uid === plan.sourceUid && card.id === cardId)) return null;

  const negated = options.negated === true;
  const next = structuredClone(input);
  let targetApplied = false;
  const target = findFaceUpMonster(next, plan.targetUid);
  const targetLost = !target || target.monster.id !== plan.targetId;
  if (!negated && !targetLost && target) {
    turnMonsterFaceDown(target.monster);
    target.monster.changed = next.core.turn;
    synchronizeCardLifetimes(next.core);
    targetApplied = true;
  }
  const nextReceipts = (next as ReceiptState).darknessApproachesResolvedEvents ?? [];
  (next as ReceiptState).darknessApproachesResolvedEvents = [...nextReceipts, plan.eventId].slice(-256);
  assertDarknessApproachesRules(next);
  assertSameInventory(inventorySignature(input), next);
  assertTagDuel(next);
  return { state: next, targetApplied, targetLost, negated };
}

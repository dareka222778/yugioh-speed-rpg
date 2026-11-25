import type { CardRef, Monster } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { rulesFor } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';
import { canAffectMonster } from './continuousEffects';
import { bindTarget, synchronizeCardLifetimes, targetBindingValid, type TargetBinding } from './cardLifetime';
import { cleanEquips } from './classicEffects';
import { removeToken } from './tokens';

export const DARK_CORE_ID = '70231910';
type Seat = 0 | 1 | 2 | 3;
type Team = 0 | 1;

export type DarkCorePlan = {
  eventId: string;
  sourceUid: string;
  sourceId: string;
  costUid: string;
  costId: string;
  ownerSeat: Seat;
  ownerTeam: Team;
  targetUid: string;
  targetId: string;
  targetBinding: TargetBinding;
  turn: number;
};
export type DarkCoreActivation = { state: TagDuel; plan: DarkCorePlan };
export type DarkCoreResolution = {
  state: TagDuel;
  banishedUid: string | null;
  negated: boolean;
};
type ReceiptState = TagDuel & { darkCoreResolvedEvents?: string[] };

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
  // Tokens are not physical inventory; every physical UID/card identity must remain conserved.
  return tagInventory(duel).filter(card => card.entityKind !== 'token')
    .map(card => card.uid + '|' + card.id).sort().join('\n');
}
function assertSameInventory(before: string, after: TagDuel): void {
  if (before !== inventorySignature(after)) {
    throw new Error('O adapter alterou a identidade ou o inventário físico das cartas.');
  }
}
function isSpellCardId(cardId: string): boolean {
  if (cardId === DARK_CORE_ID) return true;
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
function faceUpTarget(core: TagDuel['core'], uid: string): { controller: Team; monster: Monster } | null {
  const found = findMonster(core, uid);
  return found?.monster.faceUp ? found : null;
}

/** Keeps the owner's physical 2v2 limits explicit without truncating any Deck or hand. */
export function assertPhysicalExtraDeckCounts(extraCounts: readonly number[], maximum = 5): void {
  if (!Array.isArray(extraCounts) || extraCounts.length !== 4 || !Number.isSafeInteger(maximum) ||
      maximum < 0 || extraCounts.some(count => !Number.isSafeInteger(count) || count < 0)) {
    throw new Error('Contagem do Deck Adicional inválida.');
  }
  if (extraCounts.some(count => count > maximum)) {
    throw new Error('Deck Adicional físico excede cinco cartas.');
  }
}

/** Enforces the project's classic TagDuel profile; the six-card hand check remains End Phase-only. */
export function assertDarkCoreRules(duel: TagDuel): void {
  assertTagDuel(duel);
  if (duel.mode !== 'tag-classic') throw new Error('Dark Core exige TagDuel clássico.');
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
    // Field Zone is separate and is deliberately not counted as a Spell/Trap Zone.
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

/** Pays exactly one card from the active physical seat before binding a face-up field target. */
export function activateDarkCore(
  input: TagDuel,
  sourceUid: string,
  discardUid: string,
  targetUid: string,
  options: { cardId?: string } = {},
): DarkCoreActivation | null {
  assertDarkCoreRules(input);
  const cardId = options.cardId ?? DARK_CORE_ID;
  const active = activeMainHandSource(input, sourceUid, cardId);
  if (!active || typeof discardUid !== 'string' || !discardUid || discardUid === sourceUid ||
      typeof targetUid !== 'string' || !targetUid) return null;
  const hand = privateHandForSeat(input, active.seat);
  const cost = hand.find(card => card.uid === discardUid && card.entityKind !== 'token');
  if (!cost) return null;
  const target = faceUpTarget(input.core, targetUid);
  if (!target || !canAffectMonster(input.core, targetUid, 'spell')) return null;

  const before = inventorySignature(input);
  const next = structuredClone(input);
  const nextHand = privateHandForSeat(next, active.seat);
  const costIndex = nextHand.findIndex(card => card.uid === discardUid);
  if (costIndex < 0) return null;
  const [discarded] = nextHand.splice(costIndex, 1);
  const sourceIndex = nextHand.findIndex(card => card.uid === sourceUid && card.id === cardId);
  if (sourceIndex < 0) return null;
  const [spell] = nextHand.splice(sourceIndex, 1);
  // The discard is an activation cost; the Normal Spell itself leaves the hand at activation.
  next.core.players[active.team].grave.push(discarded, spell);
  synchronizeCardLifetimes(next.core);
  const targetBinding = bindTarget(next.core, targetUid);
  if (!targetBinding || targetBinding.zone !== 'monsters') return null;
  const plan: DarkCorePlan = {
    eventId: 'dark-core:' + next.core.turn + ':' + sourceUid + ':' + targetUid,
    sourceUid,
    sourceId: cardId,
    costUid: discardUid,
    costId: discarded.id,
    ownerSeat: active.seat,
    ownerTeam: active.team,
    targetUid,
    targetId: target.monster.id,
    targetBinding,
    turn: next.core.turn,
  };
  assertDarkCoreRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, plan };
}

/** Moves a face-up monster to its original team's banished pile; tokens simply leave the field. */
function banishDarkCoreTarget(core: TagDuel['core'], uid: string): boolean {
  const found = findMonster(core, uid);
  if (!found) return false;
  synchronizeCardLifetimes(core);
  if (found.monster.entityKind === 'token') {
    if (!removeToken(core, uid, 'banish')) return false;
    cleanEquips(core);
    synchronizeCardLifetimes(core);
    return true;
  }
  const owner = found.monster.owner === 0 || found.monster.owner === 1
    ? found.monster.owner as Team
    : found.controller;
  core.players[found.controller].monsters =
    core.players[found.controller].monsters.filter(monster => monster.uid !== uid);
  (core.players[owner].banished ??= []).push({
    uid: found.monster.uid,
    id: found.monster.id,
    ...(found.monster.properlySummoned ? { properlySummoned: true } : {}),
  });
  cleanEquips(core);
  synchronizeCardLifetimes(core);
  return true;
}

/** Resolves only the original bound target. A stale, face-down or protected target is not replaced. */
export function resolveDarkCore(
  input: TagDuel,
  plan: DarkCorePlan,
  options: { negated?: boolean; cardId?: string } = {},
): DarkCoreResolution | null {
  assertDarkCoreRules(input);
  const cardId = options.cardId ?? DARK_CORE_ID;
  if (!plan || typeof plan.eventId !== 'string' || !plan.eventId.trim() ||
      plan.sourceId !== cardId || !Number.isSafeInteger(plan.turn) || plan.turn !== input.core.turn ||
      !isTeam(plan.ownerTeam) || !Number.isInteger(plan.ownerSeat) || plan.ownerSeat < 0 ||
      plan.ownerSeat > 3 || plan.ownerTeam !== plan.ownerSeat % 2 ||
      physicalSeat(plan.sourceUid) !== plan.ownerSeat || physicalSeat(plan.costUid) !== plan.ownerSeat ||
      !plan.costId || physicalSeat(plan.targetUid) === null ||
      plan.eventId !== 'dark-core:' + plan.turn + ':' + plan.sourceUid + ':' + plan.targetUid ||
      !plan.targetBinding || plan.targetBinding.uid !== plan.targetUid ||
      plan.targetBinding.zone !== 'monsters' || !Number.isSafeInteger(plan.targetBinding.epoch) ||
      plan.targetBinding.epoch < 0 || input.active[plan.ownerTeam] !== plan.ownerSeat) return null;

  const receipts = (input as ReceiptState).darkCoreResolvedEvents ?? [];
  if (!Array.isArray(receipts) || receipts.includes(plan.eventId)) return null;
  const before = inventorySignature(input);
  const next = structuredClone(input);
  let banishedUid: string | null = null;
  const negated = options.negated === true;
  if (!negated && targetBindingValid(next.core, plan.targetBinding)) {
    const target = faceUpTarget(next.core, plan.targetUid);
    if (target && target.monster.id === plan.targetId &&
        canAffectMonster(next.core, plan.targetUid, 'spell') &&
        banishDarkCoreTarget(next.core, plan.targetUid)) {
      banishedUid = plan.targetUid;
    }
  }
  const nextReceipts = (next as ReceiptState).darkCoreResolvedEvents ?? [];
  (next as ReceiptState).darkCoreResolvedEvents = [...nextReceipts, plan.eventId].slice(-256);
  assertDarkCoreRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, banishedUid, negated };
}

import type { CardRef, DuelState, Monster } from './duelEngine';
import { getDuelCard } from './effectRegistry';
import { rulesFor } from './rulesProfile';
import { bindTarget, targetBindingValid, synchronizeCardLifetimes, type TargetBinding } from './cardLifetime';
import { executeDestruction, type DestructionServices } from './effectOperations';
import type { DestructionModel } from './effectModels';
import { sendMonsterToGrave } from './monsterExit';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';

export const TRIBUTE_TO_THE_DOOMED_ID = '79759861';
type Seat = 0 | 1 | 2 | 3;
type Team = 0 | 1;

export type TributeToTheDoomedPlan = {
  eventId: string;
  sourceUid: string;
  sourceId: string;
  costUid: string;
  ownerSeat: Seat;
  ownerTeam: Team;
  targetUid: string;
  targetId: string;
  targetOwnerSeat: Seat;
  targetTeamAtActivation: Team;
  targetBinding: TargetBinding;
  turn: number;
};
export type TributeToTheDoomedActivation = { state: TagDuel; plan: TributeToTheDoomedPlan };
export type TributeToTheDoomedResolution = {
  state: TagDuel;
  destroyed: boolean;
  targetLost: boolean;
  negated: boolean;
};
type ReceiptState = TagDuel & { tributeToTheDoomedResolvedEvents?: string[] };

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
  if (cardId === TRIBUTE_TO_THE_DOOMED_ID) return true;
  const metadata = getDuelCard(cardId);
  return metadata?.kind === 'spell' && metadata.field !== true;
}
function isMonsterCard(card: CardRef): boolean {
  return card.entityKind !== 'token' && getDuelCard(card.id)?.kind === 'monster';
}
function findMonster(duel: TagDuel, uid: string): { team: Team; monster: Monster } | null {
  for (const team of [0, 1] as const) {
    const monster = duel.core.players[team].monsters.find(card => card.uid === uid);
    if (monster && isMonsterCard(monster)) return { team, monster };
  }
  return null;
}

/** Enforces the owner's physical deck/zone profile; hand overflow is handled only in End Phase. */
export function assertTributeToTheDoomedRules(duel: TagDuel): void {
  assertTagDuel(duel);
  if (duel.mode !== 'tag-classic') throw new Error('Tribute to The Doomed exige TagDuel clássico.');
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

/** Discards exactly one card as cost and binds one monster on either team's field. */
export function activateTributeToTheDoomed(
  input: TagDuel,
  sourceUid: string,
  costUid: string,
  targetUid: string,
  options: { cardId?: string } = {},
): TributeToTheDoomedActivation | null {
  assertTributeToTheDoomedRules(input);
  const cardId = options.cardId ?? TRIBUTE_TO_THE_DOOMED_ID;
  const active = activeMainHandSource(input, sourceUid, cardId);
  if (!active || typeof costUid !== 'string' || !costUid || costUid === sourceUid) return null;
  const hand = privateHandForSeat(input, active.seat);
  const cost = hand.find(card => card.uid === costUid);
  if (!cost || cost.entityKind === 'token') return null;
  const target = findMonster(input, targetUid);
  const targetOwnerSeat = physicalSeat(targetUid);
  if (!target || targetOwnerSeat === null) return null;

  const before = inventorySignature(input);
  const next = structuredClone(input);
  const targetBinding = bindTarget(next.core, targetUid);
  if (!targetBinding) return null;
  const nextHand = privateHandForSeat(next, active.seat);
  const sourceIndex = nextHand.findIndex(card => card.uid === sourceUid && card.id === cardId);
  const costIndex = nextHand.findIndex(card => card.uid === costUid);
  if (sourceIndex < 0 || costIndex < 0 || sourceIndex === costIndex) return null;
  const [spell] = nextHand.splice(sourceIndex, 1);
  next.core.players[active.team].grave.push(spell);
  const remainingCostIndex = nextHand.findIndex(card => card.uid === costUid);
  if (remainingCostIndex < 0) return null;
  const [costCard] = nextHand.splice(remainingCostIndex, 1);
  next.core.players[active.team].grave.push(costCard);

  const plan: TributeToTheDoomedPlan = {
    eventId: 'tribute-to-the-doomed:' + next.core.turn + ':' + sourceUid,
    sourceUid,
    sourceId: cardId,
    costUid,
    ownerSeat: active.seat,
    ownerTeam: active.team,
    targetUid,
    targetId: target.monster.id,
    targetOwnerSeat,
    targetTeamAtActivation: target.team,
    targetBinding,
    turn: next.core.turn,
  };
  assertTributeToTheDoomedRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, plan };
}

/** Uses the shared destruction pipeline so protection, owner grave and grave triggers remain authoritative. */
export function resolveTributeToTheDoomed(
  input: TagDuel,
  plan: TributeToTheDoomedPlan,
  options: { negated?: boolean; cardId?: string } = {},
): TributeToTheDoomedResolution | null {
  assertTributeToTheDoomedRules(input);
  const cardId = options.cardId ?? TRIBUTE_TO_THE_DOOMED_ID;
  if (!plan || typeof plan.eventId !== 'string' || !plan.eventId.trim() ||
      plan.sourceId !== cardId || !Number.isInteger(plan.turn) || plan.turn !== input.core.turn ||
      !isTeam(plan.ownerTeam) || !Number.isInteger(plan.ownerSeat) || plan.ownerSeat < 0 ||
      plan.ownerSeat > 3 || plan.ownerTeam !== plan.ownerSeat % 2 ||
      physicalSeat(plan.sourceUid) !== plan.ownerSeat || physicalSeat(plan.costUid) !== plan.ownerSeat ||
      plan.costUid === plan.sourceUid ||
      plan.eventId !== 'tribute-to-the-doomed:' + plan.turn + ':' + plan.sourceUid ||
      physicalSeat(plan.targetUid) !== plan.targetOwnerSeat || !isTeam(plan.targetTeamAtActivation) ||
      !plan.targetBinding || plan.targetBinding.uid !== plan.targetUid ||
      input.active[plan.ownerTeam] !== plan.ownerSeat) return null;
  const receipts = (input as ReceiptState).tributeToTheDoomedResolvedEvents ?? [];
  if (!Array.isArray(receipts) || receipts.includes(plan.eventId)) return null;

  const before = inventorySignature(input);
  const next = structuredClone(input);
  const negated = options.negated === true;
  let targetLost = !targetBindingValid(next.core, plan.targetBinding);
  let destroyed = false;
  if (!negated && !targetLost) {
    const target = findMonster(next, plan.targetUid);
    if (!target || target.monster.id !== plan.targetId) {
      targetLost = true;
    } else {
      const model: DestructionModel = {
        operation: 'destroyMonsters',
        scope: 'selected',
        destination: 'grave',
      };
      const services: DestructionServices = {
        kind: 'spell',
        destroy: (state: DuelState, uid: string) => { sendMonsterToGrave(state, uid); },
        attack: () => 0,
      };
      destroyed = executeDestruction(next.core, plan.ownerTeam, model, plan.targetUid, services) > 0;
    }
  }
  const nextReceipts = (next as ReceiptState).tributeToTheDoomedResolvedEvents ?? [];
  (next as ReceiptState).tributeToTheDoomedResolvedEvents = [...nextReceipts, plan.eventId].slice(-256);
  synchronizeCardLifetimes(next.core);
  assertTributeToTheDoomedRules(next);
  assertSameInventory(before, next);
  assertTagDuel(next);
  return { state: next, destroyed, targetLost, negated };
}

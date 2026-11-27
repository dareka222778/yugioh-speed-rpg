import type { Card } from './cardCatalog';
import type { DuelState, Monster } from './duelEngine';
import { atk } from './duelEngine';
import { bindTarget, targetBindingValid, type TargetBinding } from './cardLifetime';
import { getDuelCard, getPlayableCard } from './effectRegistry';
import { RULES_PROFILE } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';

export const DARK_JEROID_ID = '90980792';
export const DARK_JEROID_ATK_REDUCTION = 800;

type Team = 0 | 1;
type SummonKind = 'normal' | 'flip' | 'special';

export type DarkJeroidSummonEvent = Readonly<{
  kind: 'monster-summoned';
  eventId: string;
  turn: number;
  controllerTeam: Team;
  sourceUid: string;
  sourceId: string;
  summonKind: SummonKind;
  sourceWasFaceUp: true;
  summonSucceeded: true;
}>;

export type DarkJeroidPlan = Readonly<{
  kind: 'darkJeroidSummonAtkReduction';
  eventId: string;
  activationId: string;
  turn: number;
  sourceUid: string;
  sourceId: string;
  sourceOwnerSeat: number;
  controllerTeam: Team;
  selectingSeat: number;
  targetUid: string;
  targetId: string;
  targetTeam: Team;
  targetBinding: TargetBinding;
  reduction: 800;
}>;

export type DarkJeroidState = TagDuel & {
  darkJeroid?: { resolvedActivationIds: string[] };
};

export type CardLookup = (id: string) => Pick<Card, 'kind' | 'monsterType'> | undefined;
export type ResolveOptions = Readonly<{ effectNegated?: boolean }>;
export type DarkJeroidResolution = Readonly<{
  state: DarkJeroidState;
  status: 'reduced' | 'negated' | 'target-left-field' | 'target-no-longer-face-up' | 'duplicate';
  targetAtk?: number;
}>;

type LocatedMonster = { team: Team; monster: Monster };

const cardLookup: CardLookup = id => getPlayableCard(id);
const validTeam = (team: number): team is Team => team === 0 || team === 1;
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 160;

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('UID físico 2v2 inválido.');
  return Number(match[1]);
}

function activeSeatForTeam(state: DarkJeroidState, team: Team): number {
  const overflow = state.core.teamRotation?.overflowReturn;
  return overflow && overflow.seat % 2 === team ? overflow.seat : state.active[team];
}

function assertPhysicalRules(state: DarkJeroidState): void {
  for (let team = 0; team < 2; team++) {
    const player = state.core.players[team];
    if (player.monsters.length > RULES_PROFILE.monsterZones) {
      throw new Error('A equipe excedeu três Monster Zones.');
    }
    if (player.backrow.length > RULES_PROFILE.spellTrapZones) {
      throw new Error('A equipe excedeu três Spell/Trap Zones.');
    }
  }

  const mainCounts = [0, 0, 0, 0];
  const extraCounts = [0, 0, 0, 0];
  for (const card of tagInventory(state)) {
    if (card.entityKind === 'token') continue;
    const seat = physicalSeat(card.uid);
    if (state.members[seat]?.team !== seat % 2) {
      throw new Error('Proprietário físico incompatível com o UID.');
    }
    const info = getDuelCard(card.id);
    if (!info) throw new Error('Carta física sem metadados admitidos.');
    if (info.fusion) extraCounts[seat]++;
    else mainCounts[seat]++;
  }

  for (let seat = 0; seat < 4; seat++) {
    if (mainCounts[seat] < RULES_PROFILE.mainDeckMin ||
        mainCounts[seat] > RULES_PROFILE.mainDeckMax) {
      throw new Error('Deck Principal físico fora de 20–30 no assento ' + seat + '.');
    }
    if (extraCounts[seat] > RULES_PROFILE.extraDeckMax) {
      throw new Error('Deck Adicional excedeu cinco cartas no assento ' + seat + '.');
    }
  }
}

function assertState(state: DarkJeroidState): void {
  if (!state || state.mode !== 'tag-classic' || !state.core ||
      !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.members) || state.members.length !== 4 ||
      !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core.teamRotation || !Number.isSafeInteger(state.core.turn) ||
      state.core.turn < 1 || !Array.isArray(state.core.chain)) {
    throw new Error('Estado TagDuel clássico inválido para Dark Jeroid.');
  }
  assertTagDuel(state);
  assertPhysicalRules(state);

  const ids = state.darkJeroid?.resolvedActivationIds;
  if (state.darkJeroid && (!Array.isArray(ids) || ids.some(id => !validId(id)) ||
      new Set(ids).size !== ids.length)) {
    throw new Error('Recibos de Dark Jeroid inválidos.');
  }
}

function inventorySnapshot(state: DarkJeroidState): string {
  const cards = tagInventory(state);
  const uids = cards.map(card => card.uid);
  if (new Set(uids).size !== uids.length) {
    throw new Error('Inventário físico duplicado no estado TagDuel.');
  }
  return cards.map(card => card.uid + '=' + card.id).sort().join('|');
}

function assertConserved(before: string, after: DarkJeroidState): void {
  if (inventorySnapshot(after) !== before) {
    throw new Error('Dark Jeroid alterou o inventário físico.');
  }
}

function locateMonster(state: DuelState, uid: string): LocatedMonster | undefined {
  const matches: LocatedMonster[] = [];
  for (let team = 0; team < 2; team++) {
    const monster = state.players[team].monsters.find(item => item.uid === uid);
    if (monster) matches.push({ team: team as Team, monster });
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function activationId(eventId: string, sourceUid: string): string {
  return eventId + ':dark-jeroid:' + sourceUid;
}

function validateSummonEvent(
  state: DarkJeroidState,
  event: DarkJeroidSummonEvent,
  darkJeroidId: string,
  lookup: CardLookup
): number {
  assertState(state);
  if (!event || event.kind !== 'monster-summoned' ||
      !validId(event.eventId) || event.eventId.length > 80 ||
      !Number.isSafeInteger(event.turn) || event.turn !== state.core.turn ||
      !validTeam(event.controllerTeam) || event.controllerTeam !== state.core.current ||
      typeof event.sourceUid !== 'string' || !event.sourceUid ||
      event.sourceId !== darkJeroidId ||
      !['normal', 'flip', 'special'].includes(event.summonKind) ||
      event.sourceWasFaceUp !== true || event.summonSucceeded !== true) {
    throw new Error('Dark Jeroid exige uma Invocação bem-sucedida e face-up no turno/equipe atuais.');
  }

  const ownerSeat = physicalSeat(event.sourceUid);
  const ownerTeam = (ownerSeat % 2) as Team;
  if (state.members[ownerSeat]?.team !== ownerTeam) {
    throw new Error('Proprietário físico de Dark Jeroid incompatível com o UID.');
  }

  const source = locateMonster(state.core, event.sourceUid);
  if (!source || source.team !== event.controllerTeam ||
      source.monster.id !== darkJeroidId || source.monster.faceUp !== true ||
      source.monster.owner !== undefined && source.monster.owner !== ownerTeam) {
    throw new Error('Dark Jeroid precisa estar face-up no campo da equipe que o Invocou.');
  }

  const metadata = lookup(darkJeroidId);
  if (!metadata || metadata.kind !== 'monster' || metadata.monsterType !== 'effect') {
    throw new Error('Dark Jeroid precisa ser um monstro de efeito admitido.');
  }
  return ownerSeat;
}

function validatePlan(
  state: DarkJeroidState,
  plan: DarkJeroidPlan,
  darkJeroidId: string
): void {
  if (!plan || plan.kind !== 'darkJeroidSummonAtkReduction' ||
      !validId(plan.eventId) || !validId(plan.activationId) ||
      typeof plan.sourceUid !== 'string' || !plan.sourceUid ||
      plan.sourceId !== darkJeroidId ||
      !Number.isSafeInteger(plan.turn) || plan.turn !== state.core.turn ||
      !validTeam(plan.controllerTeam) ||
      !Number.isSafeInteger(plan.sourceOwnerSeat) || plan.sourceOwnerSeat < 0 || plan.sourceOwnerSeat > 3 ||
      physicalSeat(plan.sourceUid) !== plan.sourceOwnerSeat ||
      !Number.isSafeInteger(plan.selectingSeat) || plan.selectingSeat < 0 || plan.selectingSeat > 3 ||
      state.members[plan.sourceOwnerSeat]?.team !== plan.sourceOwnerSeat % 2 ||
      state.members[plan.selectingSeat]?.team !== plan.controllerTeam ||
      !validId(plan.targetUid) || !validId(plan.targetId) ||
      !validTeam(plan.targetTeam) ||
      !plan.targetBinding || plan.targetBinding.uid !== plan.targetUid ||
      plan.targetBinding.zone !== 'monsters' ||
      !Number.isSafeInteger(plan.targetBinding.epoch) || plan.targetBinding.epoch < 0 ||
      plan.reduction !== DARK_JEROID_ATK_REDUCTION ||
      plan.activationId !== activationId(plan.eventId, plan.sourceUid)) {
    throw new Error('Plano de redução de ATK de Dark Jeroid inválido.');
  }
}

export function createDarkJeroidSummonAtkReductionAdapter(
  darkJeroidId = DARK_JEROID_ID,
  lookup: CardLookup = cardLookup
) {
  function plan(
    state: DarkJeroidState,
    event: DarkJeroidSummonEvent,
    targetUid: string
  ): DarkJeroidPlan {
    const sourceOwnerSeat = validateSummonEvent(state, event, darkJeroidId, lookup);
    if (typeof targetUid !== 'string' || !targetUid) {
      throw new Error('Dark Jeroid exige um alvo face-up.');
    }
    const target = locateMonster(state.core, targetUid);
    if (!target || target.monster.faceUp !== true) {
      throw new Error('Dark Jeroid só pode escolher um monstro face-up no campo.');
    }
    const targetMetadata = getDuelCard(target.monster.id);
    if (!targetMetadata || targetMetadata.kind !== 'monster') {
      throw new Error('O alvo de Dark Jeroid não é um monstro admitido.');
    }

    const snapshot = structuredClone(state.core);
    const targetBinding = bindTarget(snapshot, targetUid);
    if (!targetBinding || targetBinding.zone !== 'monsters') {
      throw new Error('O alvo de Dark Jeroid não possui vínculo de campo válido.');
    }

    return Object.freeze({
      kind: 'darkJeroidSummonAtkReduction',
      eventId: event.eventId,
      activationId: activationId(event.eventId, event.sourceUid),
      turn: event.turn,
      sourceUid: event.sourceUid,
      sourceId: darkJeroidId,
      sourceOwnerSeat,
      controllerTeam: event.controllerTeam,
      selectingSeat: activeSeatForTeam(state, event.controllerTeam),
      targetUid,
      targetId: target.monster.id,
      targetTeam: target.team,
      targetBinding: Object.freeze({ ...targetBinding }),
      reduction: DARK_JEROID_ATK_REDUCTION,
    });
  }

  function resolve(
    input: DarkJeroidState,
    plan: DarkJeroidPlan,
    options: ResolveOptions = {}
  ): DarkJeroidResolution {
    assertState(input);
    validatePlan(input, plan, darkJeroidId);
    const before = inventorySnapshot(input);
    const state = structuredClone(input);
    const receipts = state.darkJeroid ??= { resolvedActivationIds: [] };
    if (receipts.resolvedActivationIds.includes(plan.activationId)) {
      assertConserved(before, state);
      return { state, status: 'duplicate' };
    }
    receipts.resolvedActivationIds.push(plan.activationId);

    if (options.effectNegated === true) {
      assertConserved(before, state);
      return { state, status: 'negated' };
    }

    if (!targetBindingValid(state.core, plan.targetBinding)) {
      assertConserved(before, state);
      return { state, status: 'target-left-field' };
    }

    const target = locateMonster(state.core, plan.targetUid);
    if (!target || target.monster.id !== plan.targetId) {
      assertConserved(before, state);
      return { state, status: 'target-left-field' };
    }
    if (!target.monster.faceUp) {
      assertConserved(before, state);
      return { state, status: 'target-no-longer-face-up' };
    }

    target.monster.atkBoost -= DARK_JEROID_ATK_REDUCTION;
    const targetAtk = atk(target.monster, state.core);
    assertConserved(before, state);
    return { state, status: 'reduced', targetAtk };
  }

  return { plan, resolve };
}

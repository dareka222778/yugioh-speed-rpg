import type { Card } from './cardCatalog';
import type { CardRef, DuelState, Monster } from './duelEngine';
import { atk } from './duelEngine';
import { bindTarget, targetBindingValid, type TargetBinding } from './cardLifetime';
import { getDuelCard, getPlayableCard } from './effectRegistry';
import { syncContinuous } from './continuousEffects';
import { RULES_PROFILE } from './rulesProfile';
import { assertTagDuel, tagInventory, type TagDuel } from './tagDuel';

export const ZOMBYRA_THE_DARK_ID = '88472456';
export const DARK_RULER_HA_DES_ID = '53982768';
export const ZOMBYRA_ATK_LOSS = 200;

type Team = 0 | 1;
type GraveZone = 'grave' | 'banished';

export type CardLookup = (id: string) => Pick<Card, 'kind' | 'monsterType' | 'race'> | undefined;
type AdapterIds = Readonly<{ zombyraId?: string; haDesId?: string }>;

export type ZombyraBattleEvent = Readonly<{
  kind: 'zombyra-battle-destroyed';
  eventId: string;
  turn: number;
  controllerTeam: Team;
  sourceUid: string;
  sourceId: string;
  sourceWasFaceUp: true;
  destroyedMonsterUid: string;
  destroyedMonsterId: string;
  destroyedByBattle: true;
  damageStepComplete: true;
}>;

export type HaDesBattleEvent = Readonly<{
  kind: 'fiend-battle-destroyed';
  eventId: string;
  turn: number;
  destroyerTeam: Team;
  destroyerUid: string;
  destroyerId: string;
  destroyedMonsterUid: string;
  destroyedMonsterId: string;
  destroyedByBattle: true;
  damageStepComplete: true;
}>;

export type ZombyraBattlePlan = Readonly<{
  kind: 'zombyraBattleAttrition';
  eventId: string;
  activationId: string;
  turn: number;
  controllerTeam: Team;
  sourceUid: string;
  sourceId: string;
  sourceOwnerSeat: number;
  sourceBinding: TargetBinding;
  destroyedMonsterUid: string;
  destroyedMonsterId: string;
  loss: 200;
}>;

export type HaDesBattlePlan = Readonly<{
  kind: 'haDesBattleNegation';
  eventId: string;
  activationId: string;
  turn: number;
  destroyerTeam: Team;
  destroyerUid: string;
  destroyerId: string;
  haDesUid: string;
  haDesId: string;
  haDesOwnerSeat: number;
  haDesBinding: TargetBinding;
  destroyedMonsterUid: string;
  destroyedMonsterId: string;
  destroyedBinding: TargetBinding;
}>;

type HaDesNegationReceipt = Readonly<{ eventId: string; targetBinding: TargetBinding }>;

export type BattleAttritionState = TagDuel & {
  battleAttrition?: {
    zombyraResolvedActivationIds: string[];
    haDesResolvedActivationIds: string[];
    haDesNegatedTargets: HaDesNegationReceipt[];
  };
};

export type ZombyraResolution = Readonly<{
  state: BattleAttritionState;
  status: 'reduced' | 'negated' | 'source-left-field' | 'source-no-longer-face-up' | 'duplicate';
  targetAtk?: number;
}>;

export type HaDesResolution = Readonly<{
  state: BattleAttritionState;
  status: 'applied' | 'negated' | 'source-left-field' | 'target-left-destination' | 'duplicate';
}>;

export type ResolveOptions = Readonly<{ effectNegated?: boolean }>;

type LocatedMonster = { team: Team; monster: Monster };
type LocatedCard = { team: Team; zone: GraveZone; card: CardRef };

const defaultLookup: CardLookup = id => getPlayableCard(id);
const validTeam = (team: number): team is Team => team === 0 || team === 1;
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 160;

function physicalSeat(uid: string): number {
  const match = /^m([0-3]):/.exec(uid);
  if (!match) throw new Error('UID físico 2v2 inválido.');
  return Number(match[1]);
}

function locateMonster(state: DuelState, uid: string): LocatedMonster | undefined {
  const found: LocatedMonster[] = [];
  for (let team = 0; team < 2; team++) {
    const monster = state.players[team].monsters.find(item => item.uid === uid);
    if (monster) found.push({ team: team as Team, monster });
  }
  return found.length === 1 ? found[0] : undefined;
}

function locateGraveOrBanished(state: DuelState, uid: string): LocatedCard | undefined {
  const found: LocatedCard[] = [];
  for (let team = 0; team < 2; team++) {
    const player = state.players[team];
    const grave = player.grave.find(card => card.uid === uid);
    if (grave) found.push({ team: team as Team, zone: 'grave', card: grave });
    const banished = (player.banished ?? []).find(card => card.uid === uid);
    if (banished) found.push({ team: team as Team, zone: 'banished', card: banished });
  }
  return found.length === 1 ? found[0] : undefined;
}

function assertPhysicalRules(state: BattleAttritionState): void {
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

function validBinding(value: unknown): value is TargetBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const binding = value as TargetBinding;
  return validId(binding.uid) &&
    ['deck', 'hand', 'monsters', 'backrow', 'grave', 'extra', 'banished', 'field'].includes(binding.zone) &&
    Number.isSafeInteger(binding.epoch) && binding.epoch >= 0;
}

function assertState(state: BattleAttritionState): void {
  if (!state || state.mode !== 'tag-classic' || !state.core ||
      !Array.isArray(state.core.players) || state.core.players.length !== 2 ||
      !Array.isArray(state.members) || state.members.length !== 4 ||
      !Array.isArray(state.active) || state.active.length !== 2 ||
      !state.core.teamRotation || !Number.isSafeInteger(state.core.turn) ||
      state.core.turn < 1 || !Array.isArray(state.core.chain)) {
    throw new Error('Estado TagDuel clássico inválido para Battle Attrition.');
  }
  assertTagDuel(state);
  assertPhysicalRules(state);

  const ledger = state.battleAttrition;
  if (!ledger) return;
  const zombyra = ledger.zombyraResolvedActivationIds;
  const haDes = ledger.haDesResolvedActivationIds;
  const targets = ledger.haDesNegatedTargets;
  if (!Array.isArray(zombyra) || zombyra.some(id => !validId(id)) ||
      new Set(zombyra).size !== zombyra.length ||
      !Array.isArray(haDes) || haDes.some(id => !validId(id)) ||
      new Set(haDes).size !== haDes.length ||
      !Array.isArray(targets) || targets.length > 4096 ||
      targets.some(item => !item || !validId(item.eventId) || !validBinding(item.targetBinding)) ||
      new Set(targets.map(item => item.eventId)).size !== targets.length) {
    throw new Error('Ledger de Battle Attrition inválido.');
  }
}

function inventorySnapshot(state: BattleAttritionState): string {
  const cards = tagInventory(state);
  const uids = cards.map(card => card.uid);
  if (new Set(uids).size !== uids.length) {
    throw new Error('Inventário físico duplicado no estado TagDuel.');
  }
  return cards.map(card => card.uid + '=' + card.id).sort().join('|');
}

function assertConserved(before: string, after: BattleAttritionState): void {
  if (inventorySnapshot(after) !== before) {
    throw new Error('Battle Attrition alterou o inventário físico.');
  }
}

function ensureLedger(state: BattleAttritionState) {
  return state.battleAttrition ??= {
    zombyraResolvedActivationIds: [],
    haDesResolvedActivationIds: [],
    haDesNegatedTargets: [],
  };
}

function activationId(eventId: string, family: 'zombyra' | 'ha-des', uid: string): string {
  return eventId + ':' + family + ':' + uid;
}

function validateZombyraPlan(
  state: BattleAttritionState,
  plan: ZombyraBattlePlan,
  zombyraId: string
): void {
  if (!plan || plan.kind !== 'zombyraBattleAttrition' ||
      !validId(plan.eventId) || !validId(plan.activationId) ||
      !validTeam(plan.controllerTeam) || plan.controllerTeam !== state.core.current ||
      !validId(plan.sourceUid) || plan.sourceId !== zombyraId ||
      !Number.isSafeInteger(plan.turn) || plan.turn !== state.core.turn ||
      !Number.isSafeInteger(plan.sourceOwnerSeat) || plan.sourceOwnerSeat < 0 || plan.sourceOwnerSeat > 3 ||
      physicalSeat(plan.sourceUid) !== plan.sourceOwnerSeat ||
      state.members[plan.sourceOwnerSeat]?.team !== plan.sourceOwnerSeat % 2 ||
      !validBinding(plan.sourceBinding) || plan.sourceBinding.uid !== plan.sourceUid ||
      plan.sourceBinding.zone !== 'monsters' ||
      !validId(plan.destroyedMonsterUid) || !validId(plan.destroyedMonsterId) ||
      plan.loss !== ZOMBYRA_ATK_LOSS ||
      plan.activationId !== activationId(plan.eventId, 'zombyra', plan.sourceUid)) {
    throw new Error('Plano de Battle Attrition de Zombyra inválido.');
  }
}

function validateHaDesPlan(
  state: BattleAttritionState,
  plan: HaDesBattlePlan,
  haDesId: string
): void {
  if (!plan || plan.kind !== 'haDesBattleNegation' ||
      !validId(plan.eventId) || !validId(plan.activationId) ||
      !validTeam(plan.destroyerTeam) || plan.destroyerTeam !== state.core.current ||
      !Number.isSafeInteger(plan.turn) || plan.turn !== state.core.turn ||
      !validId(plan.destroyerUid) || !validId(plan.destroyerId) ||
      !validId(plan.haDesUid) || plan.haDesId !== haDesId ||
      !Number.isSafeInteger(plan.haDesOwnerSeat) || plan.haDesOwnerSeat < 0 || plan.haDesOwnerSeat > 3 ||
      physicalSeat(plan.haDesUid) !== plan.haDesOwnerSeat ||
      state.members[plan.haDesOwnerSeat]?.team !== plan.haDesOwnerSeat % 2 ||
      !validBinding(plan.haDesBinding) || plan.haDesBinding.uid !== plan.haDesUid ||
      plan.haDesBinding.zone !== 'monsters' ||
      !validId(plan.destroyedMonsterUid) || !validId(plan.destroyedMonsterId) ||
      !validBinding(plan.destroyedBinding) ||
      plan.destroyedBinding.uid !== plan.destroyedMonsterUid ||
      !['grave', 'banished'].includes(plan.destroyedBinding.zone) ||
      plan.activationId !== activationId(plan.eventId, 'ha-des', plan.haDesUid)) {
    throw new Error('Plano de negação de Dark Ruler Ha Des inválido.');
  }
}

export function canZombyraAttackDirectly(
  cardId: string,
  faceUp: boolean,
  effectNegated = false,
  zombyraId = ZOMBYRA_THE_DARK_ID
): boolean {
  return cardId !== zombyraId || !faceUp || effectNegated;
}

/** This is a summoning condition, not an activated effect: negating Ha Des does not remove it. */
export function canHaDesBeSpecialSummonedFrom(
  cardId: string,
  sourceZone: 'deck' | 'hand' | 'grave' | 'banished' | 'extra',
  haDesId = DARK_RULER_HA_DES_ID
): boolean {
  return cardId !== haDesId || sourceZone !== 'grave';
}

export function createBattleAttritionTagAdapter(
  ids: AdapterIds = {},
  lookup: CardLookup = defaultLookup
) {
  const zombyraId = ids.zombyraId ?? ZOMBYRA_THE_DARK_ID;
  const haDesId = ids.haDesId ?? DARK_RULER_HA_DES_ID;

  function prepareZombyra(
    input: BattleAttritionState,
    event: ZombyraBattleEvent
  ): ZombyraBattlePlan {
    assertState(input);
    if (!event || event.kind !== 'zombyra-battle-destroyed' ||
        !validId(event.eventId) || event.eventId.length > 80 ||
        !Number.isSafeInteger(event.turn) || event.turn !== input.core.turn ||
        !validTeam(event.controllerTeam) || event.controllerTeam !== input.core.current ||
        !validId(event.sourceUid) || event.sourceId !== zombyraId ||
        event.sourceWasFaceUp !== true ||
        !validId(event.destroyedMonsterUid) || !validId(event.destroyedMonsterId) ||
        event.destroyedByBattle !== true || event.damageStepComplete !== true) {
      throw new Error('Zombyra exige destruição de monstro por batalha após a Damage Step.');
    }

    const sourceOwnerSeat = physicalSeat(event.sourceUid);
    const ownerTeam = (sourceOwnerSeat % 2) as Team;
    if (input.members[sourceOwnerSeat]?.team !== ownerTeam) {
      throw new Error('Proprietário físico de Zombyra incompatível com o UID.');
    }

    const source = locateMonster(input.core, event.sourceUid);
    const metadata = lookup(zombyraId);
    if (!source || source.team !== event.controllerTeam ||
        source.monster.id !== zombyraId || source.monster.faceUp !== true ||
        source.monster.owner !== undefined && source.monster.owner !== ownerTeam ||
        !metadata || metadata.kind !== 'monster' ||
        metadata.monsterType !== 'effect' || metadata.race !== 'Warrior') {
      throw new Error('Zombyra precisa permanecer face-up no campo como Guerreiro de Efeito.');
    }

    const snapshot = structuredClone(input.core);
    const sourceBinding = bindTarget(snapshot, event.sourceUid);
    if (!sourceBinding || sourceBinding.zone !== 'monsters') {
      throw new Error('Zombyra não possui vínculo de campo válido.');
    }

    return Object.freeze({
      kind: 'zombyraBattleAttrition',
      eventId: event.eventId,
      activationId: activationId(event.eventId, 'zombyra', event.sourceUid),
      turn: event.turn,
      controllerTeam: event.controllerTeam,
      sourceUid: event.sourceUid,
      sourceId: zombyraId,
      sourceOwnerSeat,
      sourceBinding: Object.freeze({ ...sourceBinding }),
      destroyedMonsterUid: event.destroyedMonsterUid,
      destroyedMonsterId: event.destroyedMonsterId,
      loss: ZOMBYRA_ATK_LOSS,
    });
  }

  function resolveZombyra(
    input: BattleAttritionState,
    plan: ZombyraBattlePlan,
    options: ResolveOptions = {}
  ): ZombyraResolution {
    assertState(input);
    validateZombyraPlan(input, plan, zombyraId);
    const before = inventorySnapshot(input);
    const state = structuredClone(input);
    const ledger = ensureLedger(state);

    if (ledger.zombyraResolvedActivationIds.includes(plan.activationId)) {
      assertConserved(before, state);
      return { state, status: 'duplicate' };
    }
    ledger.zombyraResolvedActivationIds.push(plan.activationId);

    if (options.effectNegated === true) {
      assertConserved(before, state);
      return { state, status: 'negated' };
    }

    if (!targetBindingValid(state.core, plan.sourceBinding)) {
      assertConserved(before, state);
      return { state, status: 'source-left-field' };
    }

    const source = locateMonster(state.core, plan.sourceUid);
    if (!source || source.monster.id !== zombyraId) {
      assertConserved(before, state);
      return { state, status: 'source-left-field' };
    }
    if (!source.monster.faceUp) {
      assertConserved(before, state);
      return { state, status: 'source-no-longer-face-up' };
    }

    const continuous = state.core.continuousState ??= { next: 0, sources: {}, temporary: [] };
    if (!Number.isSafeInteger(continuous.next) || continuous.next >= 1_000_000) {
      throw new Error('Limite de modificadores contínuos excedido.');
    }
    continuous.temporary.push({
      sequence: ++continuous.next,
      uid: plan.sourceUid,
      epoch: state.core.cardLifetimes?.[plan.sourceUid]?.epoch ?? 0,
      atk: -ZOMBYRA_ATK_LOSS,
      def: 0,
      expiresTurn: Number.MAX_SAFE_INTEGER,
    });
    syncContinuous(state.core);

    const targetAtk = atk(source.monster, state.core);
    assertConserved(before, state);
    return { state, status: 'reduced', targetAtk };
  }

  function prepareHaDes(
    input: BattleAttritionState,
    event: HaDesBattleEvent
  ): HaDesBattlePlan {
    assertState(input);
    if (!event || event.kind !== 'fiend-battle-destroyed' ||
        !validId(event.eventId) || event.eventId.length > 80 ||
        !Number.isSafeInteger(event.turn) || event.turn !== input.core.turn ||
        !validTeam(event.destroyerTeam) || event.destroyerTeam !== input.core.current ||
        !validId(event.destroyerUid) || !validId(event.destroyerId) ||
        !validId(event.destroyedMonsterUid) || !validId(event.destroyedMonsterId) ||
        event.destroyedByBattle !== true || event.damageStepComplete !== true) {
      throw new Error('Dark Ruler Ha Des exige um monstro destruído por batalha após a Damage Step.');
    }

    const destroyerMetadata = lookup(event.destroyerId);
    const destroyedMetadata = lookup(event.destroyedMonsterId);
    if (!destroyerMetadata || destroyerMetadata.kind !== 'monster' ||
        destroyerMetadata.race !== 'Fiend' ||
        !destroyedMetadata || destroyedMetadata.kind !== 'monster' ||
        destroyedMetadata.monsterType !== 'effect') {
      throw new Error('A negação de Ha Des exige destruidor Fiend e monstro de Efeito destruído.');
    }

    const destroyed = locateGraveOrBanished(input.core, event.destroyedMonsterUid);
    if (!destroyed || destroyed.card.id !== event.destroyedMonsterId) {
      throw new Error('O monstro destruído precisa estar no Cemitério ou na zona banida.');
    }

    const source = input.core.players[event.destroyerTeam].monsters.find(monster =>
      monster.id === haDesId && monster.faceUp
    );
    const sourceMetadata = lookup(haDesId);
    if (!source || !sourceMetadata || sourceMetadata.kind !== 'monster' ||
        sourceMetadata.monsterType !== 'effect' || sourceMetadata.race !== 'Fiend') {
      throw new Error('Dark Ruler Ha Des precisa estar face-up na equipe do monstro Fiend.');
    }

    const haDesOwnerSeat = physicalSeat(source.uid);
    const ownerTeam = (haDesOwnerSeat % 2) as Team;
    if (input.members[haDesOwnerSeat]?.team !== ownerTeam ||
        source.owner !== undefined && source.owner !== ownerTeam) {
      throw new Error('Proprietário físico de Ha Des incompatível com o UID.');
    }

    const snapshot = structuredClone(input.core);
    const haDesBinding = bindTarget(snapshot, source.uid);
    const destroyedBinding = bindTarget(snapshot, event.destroyedMonsterUid);
    if (!haDesBinding || haDesBinding.zone !== 'monsters' ||
        !destroyedBinding || destroyedBinding.zone !== destroyed.zone) {
      throw new Error('Vínculo de Ha Des ou do monstro destruído inválido.');
    }

    return Object.freeze({
      kind: 'haDesBattleNegation',
      eventId: event.eventId,
      activationId: activationId(event.eventId, 'ha-des', source.uid),
      turn: event.turn,
      destroyerTeam: event.destroyerTeam,
      destroyerUid: event.destroyerUid,
      destroyerId: event.destroyerId,
      haDesUid: source.uid,
      haDesId,
      haDesOwnerSeat,
      haDesBinding: Object.freeze({ ...haDesBinding }),
      destroyedMonsterUid: event.destroyedMonsterUid,
      destroyedMonsterId: event.destroyedMonsterId,
      destroyedBinding: Object.freeze({ ...destroyedBinding }),
    });
  }

  function resolveHaDes(
    input: BattleAttritionState,
    plan: HaDesBattlePlan,
    options: ResolveOptions = {}
  ): HaDesResolution {
    assertState(input);
    validateHaDesPlan(input, plan, haDesId);
    const before = inventorySnapshot(input);
    const state = structuredClone(input);
    const ledger = ensureLedger(state);

    if (ledger.haDesResolvedActivationIds.includes(plan.activationId)) {
      assertConserved(before, state);
      return { state, status: 'duplicate' };
    }
    ledger.haDesResolvedActivationIds.push(plan.activationId);

    if (options.effectNegated === true) {
      assertConserved(before, state);
      return { state, status: 'negated' };
    }

    if (!targetBindingValid(state.core, plan.haDesBinding)) {
      assertConserved(before, state);
      return { state, status: 'source-left-field' };
    }
    const source = locateMonster(state.core, plan.haDesUid);
    if (!source || source.team !== plan.destroyerTeam ||
        source.monster.id !== haDesId || !source.monster.faceUp) {
      assertConserved(before, state);
      return { state, status: 'source-left-field' };
    }

    if (!targetBindingValid(state.core, plan.destroyedBinding)) {
      assertConserved(before, state);
      return { state, status: 'target-left-destination' };
    }
    const destroyed = locateGraveOrBanished(state.core, plan.destroyedMonsterUid);
    if (!destroyed || destroyed.card.id !== plan.destroyedMonsterId ||
        destroyed.zone !== plan.destroyedBinding.zone) {
      assertConserved(before, state);
      return { state, status: 'target-left-destination' };
    }

    ledger.haDesNegatedTargets.push({
      eventId: plan.eventId,
      targetBinding: Object.freeze({ ...plan.destroyedBinding }),
    });
    assertConserved(before, state);
    return { state, status: 'applied' };
  }

  function isHaDesEffectNegated(input: BattleAttritionState, uid: string): boolean {
    assertState(input);
    if (!validId(uid)) return false;
    return (input.battleAttrition?.haDesNegatedTargets ?? []).some(receipt =>
      receipt.targetBinding.uid === uid && targetBindingValid(input.core, receipt.targetBinding)
    );
  }

  return {
    prepareZombyra,
    resolveZombyra,
    prepareHaDes,
    resolveHaDes,
    isHaDesEffectNegated,
    canZombyraAttackDirectly: (cardId: string, faceUp: boolean, effectNegated = false) =>
      canZombyraAttackDirectly(cardId, faceUp, effectNegated, zombyraId),
    canHaDesBeSpecialSummonedFrom: (cardId: string, sourceZone: 'deck' | 'hand' | 'grave' | 'banished' | 'extra') =>
      canHaDesBeSpecialSummonedFrom(cardId, sourceZone, haDesId),
  };
}

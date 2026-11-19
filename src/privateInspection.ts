import type { Card } from './cardCatalog';

export const A_MAN_WITH_WDJAT_ID = '51351302';
export const AMAZONESS_CHAIN_MASTER_ID = '29654737';
export const AMAZONESS_CHAIN_MASTER_LP_COST = 1500;

export type InspectionSeat = 0 | 1 | 2 | 3;
export type InspectionTeam = 0 | 1;
export type SetCardZone = 'monster' | 'backrow' | 'field';
export type WdjatTrigger = 'normalSummon' | 'standby';

export interface OpposingSetCard {
  readonly uid: string;
  readonly id: string;
  readonly physicalOwnerSeat: InspectionSeat;
  readonly controllerTeam: InspectionTeam;
  readonly zone: SetCardZone;
  readonly faceUp: boolean;
}

export interface OpponentHandCard {
  readonly uid: string;
  readonly id: string;
  /** Original physical owner; it may differ after a card changes hands. */
  readonly ownerSeat?: InspectionSeat;
  /** Current holder of this private hand, when the fixture carries it explicitly. */
  readonly holderSeat?: InspectionSeat;
  readonly entityKind?: 'token';
}

export type PrivateInspectionGrant =
  | Readonly<{
      scope: 'set-card';
      viewerSeat: InspectionSeat;
      targetTeam: InspectionTeam;
      targetSeat: InspectionSeat;
      targetUid: string;
      turn: number;
    }>
  | Readonly<{
      scope: 'opponent-hand';
      viewerSeat: InspectionSeat;
      targetTeam: InspectionTeam;
      targetSeat: InspectionSeat;
      turn: number;
    }>;

export interface SetCardInspectionOption {
  readonly uid: string;
  readonly physicalOwnerSeat: InspectionSeat;
  readonly controllerTeam: InspectionTeam;
  readonly zone: SetCardZone;
}

export interface PrivateCardProjection {
  readonly visible: boolean;
  readonly uid: string;
  readonly label: string;
  readonly id?: string;
  readonly name?: string;
}

export interface PrivateHandProjection {
  readonly visible: boolean;
  readonly count: number;
  readonly cards?: readonly Readonly<{ uid: string; id: string; name: string }>[];
}

function validSeat(value: unknown): value is InspectionSeat {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function validTeam(value: unknown): value is InspectionTeam {
  return value === 0 || value === 1;
}

/** The project assigns physical seats 0/2 to team 0 and 1/3 to team 1. */
export function inspectionTeamOfSeat(seat: number): InspectionTeam {
  if (!validSeat(seat)) throw new RangeError('Inspection seat must be 0, 1, 2, or 3.');
  return (seat % 2) as InspectionTeam;
}

function assertTurn(turn: number): void {
  if (!Number.isSafeInteger(turn) || turn < 1) {
    throw new RangeError('Inspection turn must be a positive safe integer.');
  }
}

function assertSetCardList(cards: readonly OpposingSetCard[]): void {
  if (!Array.isArray(cards)) throw new TypeError('Set-card field must be an array.');
  const seen = new Set<string>();
  for (const card of cards) {
    if (!card || typeof card.uid !== 'string' || card.uid.length === 0 ||
        typeof card.id !== 'string' || card.id.length === 0 ||
        !validSeat(card.physicalOwnerSeat) || !validTeam(card.controllerTeam) ||
        !['monster', 'backrow', 'field'].includes(card.zone) ||
        typeof card.faceUp !== 'boolean') {
      throw new TypeError('Set-card field contains an invalid physical reference.');
    }
    if (seen.has(card.uid)) throw new Error('Set-card field contains a duplicate physical UID.');
    seen.add(card.uid);
  }
}

function assertOpponentHand<T extends OpponentHandCard>(
  hand: readonly T[],
  targetSeat: InspectionSeat,
): void {
  if (!Array.isArray(hand)) throw new TypeError('Opponent physical hand must be an array.');
  const seen = new Set<string>();
  for (const card of hand) {
    if (!card || typeof card.uid !== 'string' || card.uid.length === 0 ||
        typeof card.id !== 'string' || card.id.length === 0) {
      throw new TypeError('Opponent physical hand contains an invalid card reference.');
    }
    if (card.ownerSeat !== undefined && !validSeat(card.ownerSeat)) {
      throw new Error('Opponent hand contains an invalid original physical owner.');
    }
    if (card.holderSeat !== undefined && card.holderSeat !== targetSeat) {
      throw new Error('Opponent hand contains a card held by another physical seat.');
    }
    if (seen.has(card.uid)) throw new Error('Opponent physical hand contains a duplicate UID.');
    seen.add(card.uid);
  }
}

export function aManWithWdjatCanInspect(
  sourceCardId: string,
  sourceFaceUp: boolean,
  trigger: WdjatTrigger,
): boolean {
  return sourceCardId === A_MAN_WITH_WDJAT_ID &&
    sourceFaceUp === true &&
    (trigger === 'normalSummon' || trigger === 'standby');
}

/** Offer only opposing Set cards; the option contains no card ID/name. */
export function aManWithWdjatSetCardOptions(
  viewerSeat: number,
  sourceCardId: string,
  sourceFaceUp: boolean,
  trigger: WdjatTrigger,
  field: readonly OpposingSetCard[],
): readonly SetCardInspectionOption[] {
  const viewerTeam = inspectionTeamOfSeat(viewerSeat);
  assertSetCardList(field);
  if (!aManWithWdjatCanInspect(sourceCardId, sourceFaceUp, trigger)) {
    return Object.freeze([]);
  }
  return Object.freeze(field
    .filter(card => !card.faceUp && card.controllerTeam !== viewerTeam)
    .map(card => Object.freeze({
      uid: card.uid,
      physicalOwnerSeat: card.physicalOwnerSeat,
      controllerTeam: card.controllerTeam,
      zone: card.zone,
    })));
}

/** Create a single-viewer grant for one Set card without moving or revealing it publicly. */
export function createSetCardInspectionGrant(
  viewerSeat: number,
  sourceCardId: string,
  sourceFaceUp: boolean,
  trigger: WdjatTrigger,
  field: readonly OpposingSetCard[],
  selectedUid: string,
  turn: number,
): PrivateInspectionGrant | null {
  assertTurn(turn);
  const options = aManWithWdjatSetCardOptions(
    viewerSeat, sourceCardId, sourceFaceUp, trigger, field,
  );
  if (typeof selectedUid !== 'string' || selectedUid.length === 0) return null;
  const selected = options.find(option => option.uid === selectedUid);
  if (!selected) return null;
  return Object.freeze({
    scope: 'set-card',
    viewerSeat: viewerSeat as InspectionSeat,
    targetTeam: selected.controllerTeam,
    targetSeat: selected.physicalOwnerSeat,
    targetUid: selected.uid,
    turn,
  });
}

/** Only the exact physical seat that resolved the effect may see the identity. */
export function canViewPrivateInspection(
  grant: PrivateInspectionGrant,
  viewerSeat: number,
): boolean {
  return !!grant && validSeat(viewerSeat) && grant.viewerSeat === viewerSeat;
}

export function projectSetCardInspection(
  grant: PrivateInspectionGrant,
  viewerSeat: number,
  card: { readonly uid: string; readonly id: string; readonly name: string },
): PrivateCardProjection {
  if (!grant || grant.scope !== 'set-card' || card.uid !== grant.targetUid) {
    throw new Error('Set-card inspection grant does not match the selected physical UID.');
  }
  if (!canViewPrivateInspection(grant, viewerSeat)) {
    return Object.freeze({ visible: false, uid: card.uid, label: 'Carta virada para baixo' });
  }
  return Object.freeze({
    visible: true,
    uid: card.uid,
    label: card.name,
    id: card.id,
    name: card.name,
  });
}

/** Inspection is informational only: preserve the same UID, zone, owner and face-down state. */
export function restoreSetCardAfterInspection(
  grant: PrivateInspectionGrant,
  field: readonly OpposingSetCard[],
): OpposingSetCard | null {
  if (!grant || grant.scope !== 'set-card') return null;
  assertSetCardList(field);
  const current = field.find(card => card.uid === grant.targetUid);
  if (!current || current.faceUp || current.controllerTeam !== grant.targetTeam ||
      current.physicalOwnerSeat !== grant.targetSeat) return null;
  return current;
}

/** Amazoness Chain Master can inspect one chosen opposing physical hand, never both hands together. */
export function createAmazonessChainMasterHandGrant(
  sourceCardId: string,
  viewerSeat: number,
  targetSeat: number,
  turn: number,
  teamLP: number,
  destroyedByBattle: boolean,
  sentToGrave: boolean,
): Readonly<{ grant: PrivateInspectionGrant; teamLP: number }> | null {
  assertTurn(turn);
  if (sourceCardId !== AMAZONESS_CHAIN_MASTER_ID ||
      !validSeat(viewerSeat) || !validSeat(targetSeat) ||
      inspectionTeamOfSeat(viewerSeat) === inspectionTeamOfSeat(targetSeat) ||
      !amazonessChainMasterCanPay(sourceCardId, destroyedByBattle, sentToGrave, teamLP)) {
    return null;
  }
  return Object.freeze({
    grant: Object.freeze({
      scope: 'opponent-hand',
      viewerSeat,
      targetTeam: inspectionTeamOfSeat(targetSeat),
      targetSeat,
      turn,
    }),
    teamLP: teamLP - AMAZONESS_CHAIN_MASTER_LP_COST,
  });
}

/** Only the authorized physical seat receives card identities; others see count only. */
export function projectOpponentHand(
  grant: PrivateInspectionGrant,
  viewerSeat: number,
  hand: readonly OpponentHandCard[],
  getCard: (id: string) => Card | undefined,
): PrivateHandProjection {
  if (!Array.isArray(hand)) throw new TypeError('Opponent physical hand must be an array.');
  if (!grant || grant.scope !== 'opponent-hand') {
    throw new Error('Opponent-hand inspection grant is invalid.');
  }
  if (!canViewPrivateInspection(grant, viewerSeat)) {
    return Object.freeze({ visible: false, count: hand.length });
  }
  assertOpponentHand(hand, grant.targetSeat);
  if (typeof getCard !== 'function') throw new TypeError('Private hand card lookup must be a function.');
  return Object.freeze({
    visible: true,
    count: hand.length,
    cards: Object.freeze(hand.map(ref => {
      const info = getCard(ref.id);
      return Object.freeze({ uid: ref.uid, id: ref.id, name: info?.name ?? 'Carta' });
    })),
  });
}

/** Chain Master pays 1500 from shared team LP only after battle destruction to the GY. */
export function amazonessChainMasterCanPay(
  sourceCardId: string,
  destroyedByBattle: boolean,
  sentToGrave: boolean,
  teamLP: number,
): boolean {
  return sourceCardId === AMAZONESS_CHAIN_MASTER_ID &&
    destroyedByBattle === true && sentToGrave === true &&
    Number.isSafeInteger(teamLP) && teamLP > AMAZONESS_CHAIN_MASTER_LP_COST;
}

export function payAmazonessChainMasterCost(
  sourceCardId: string,
  destroyedByBattle: boolean,
  sentToGrave: boolean,
  teamLP: number,
): number | null {
  if (!amazonessChainMasterCanPay(sourceCardId, destroyedByBattle, sentToGrave, teamLP)) {
    return null;
  }
  return teamLP - AMAZONESS_CHAIN_MASTER_LP_COST;
}

/** Return only Monster cards from the single opponent hand authorized by the grant. */
export function amazonessChainMasterMonsterCandidates<T extends OpponentHandCard>(
  grant: PrivateInspectionGrant,
  viewerSeat: number,
  physicalHandOwnerSeat: number,
  hand: readonly T[],
  getCard: (id: string) => Card | undefined,
): readonly T[] {
  if (!grant || grant.scope !== 'opponent-hand' ||
      !canViewPrivateInspection(grant, viewerSeat)) return Object.freeze([]);
  if (physicalHandOwnerSeat !== grant.targetSeat) {
    throw new Error('Amazoness Chain Master may inspect only the granted opponent physical hand.');
  }
  assertOpponentHand(hand, grant.targetSeat);
  if (typeof getCard !== 'function') throw new TypeError('Private hand card lookup must be a function.');
  return Object.freeze(hand.filter(ref => ref.entityKind !== 'token' &&
    getCard(ref.id)?.kind === 'monster'));
}

/** Revalidate the selected Monster UID; preserve its original owner metadata. */
export function resolveAmazonessChainMasterSelection<T extends OpponentHandCard>(
  grant: PrivateInspectionGrant,
  viewerSeat: number,
  physicalHandOwnerSeat: number,
  hand: readonly T[],
  selectedUid: string,
  getCard: (id: string) => Card | undefined,
): T | null {
  const current = amazonessChainMasterMonsterCandidates(
    grant, viewerSeat, physicalHandOwnerSeat, hand, getCard,
  );
  if (typeof selectedUid !== 'string' || selectedUid.length === 0) return null;
  return current.find(ref => ref.uid === selectedUid) ?? null;
}

/** Plan the hand transfer without mutating zones or rewriting the original owner. */
export function planAmazonessChainMasterTransfer<T extends OpponentHandCard>(
  grant: PrivateInspectionGrant,
  viewerSeat: number,
  physicalHandOwnerSeat: number,
  hand: readonly T[],
  selectedUid: string,
  getCard: (id: string) => Card | undefined,
): Readonly<{
  card: T;
  fromSeat: InspectionSeat;
  toSeat: InspectionSeat;
  ownerSeat: InspectionSeat;
}> | null {
  const selected = resolveAmazonessChainMasterSelection(
    grant, viewerSeat, physicalHandOwnerSeat, hand, selectedUid, getCard,
  );
  if (!selected || !validSeat(viewerSeat) || !validSeat(physicalHandOwnerSeat)) return null;
  return Object.freeze({
    card: selected,
    fromSeat: physicalHandOwnerSeat,
    toSeat: viewerSeat,
    ownerSeat: selected.ownerSeat ?? physicalHandOwnerSeat,
  });
}

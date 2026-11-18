/**
 * Pure eligibility/selection primitive for effects whose Tribute cost is
 * restricted to copies of the activating card's identity.
 *
 * This deliberately does not pay the cost, move cards, draw, or impose a
 * once-per-turn flag. The duel resolver owns those state transitions.
 */
export interface IdentityTributeCard {
  readonly uid: string;
  readonly id: string;
  readonly faceUp: boolean;
}

export interface IdentityTributeEligibility<T extends IdentityTributeCard> {
  readonly cardId: string;
  readonly sourceUid: string;
  readonly requiredCopies: number;
  readonly tributeCount: number;
  readonly candidates: readonly T[];
}

/**
 * Build the legal Tribute set for an identity-scoped cost.
 *
 * The caller supplies the controller's shared Monster Zones. Physical UIDs
 * are retained verbatim so the resolver can send each selected card to the
 * correct shared destination without losing its original owner identity.
 *
 * Returns null when the source is not face-up, the source has another
 * identity, or too few face-up copies are controlled. Duplicate UIDs and
 * invalid rule parameters are integrity errors and throw.
 */
export function identityTributeEligibility<T extends IdentityTributeCard>(
  field: readonly T[],
  sourceUid: string,
  cardId: string,
  requiredCopies: number,
  tributeCount: number,
): IdentityTributeEligibility<T> | null {
  if (!Array.isArray(field)) throw new TypeError('Identity Tribute field must be an array.');
  if (typeof sourceUid !== 'string' || sourceUid.length === 0) {
    throw new TypeError('Identity Tribute source UID is required.');
  }
  if (typeof cardId !== 'string' || cardId.length === 0) {
    throw new TypeError('Identity Tribute card ID is required.');
  }
  if (!Number.isInteger(requiredCopies) || requiredCopies < 1) {
    throw new RangeError('Identity Tribute requiredCopies must be a positive integer.');
  }
  if (!Number.isInteger(tributeCount) || tributeCount < 1 || tributeCount > requiredCopies) {
    throw new RangeError('Identity Tribute tributeCount must be between one and requiredCopies.');
  }

  const seen = new Set<string>();
  for (const candidate of field) {
    if (!candidate || typeof candidate.uid !== 'string' || candidate.uid.length === 0) {
      throw new TypeError('Identity Tribute field contains a card without a physical UID.');
    }
    if (seen.has(candidate.uid)) {
      throw new Error('Identity Tribute field contains a duplicate physical UID.');
    }
    seen.add(candidate.uid);
  }

  const source = field.find(candidate => candidate.uid === sourceUid);
  if (!source || !source.faceUp || source.id !== cardId) return null;

  const candidates = field.filter(candidate => candidate.faceUp && candidate.id === cardId);
  if (candidates.length < requiredCopies) return null;

  return Object.freeze({
    cardId,
    sourceUid,
    requiredCopies,
    tributeCount,
    candidates: Object.freeze([...candidates]),
  });
}

/**
 * Validate the exact cards selected to pay an identity-scoped Tribute cost.
 *
 * The activating copy may be selected or left on the field: the card text
 * decides which copies are eligible, not whether the source must survive.
 * The returned references are the original field objects, including their
 * physical UIDs and any engine-specific metadata.
 */
export function selectIdentityTributes<T extends IdentityTributeCard>(
  eligibility: IdentityTributeEligibility<T>,
  selectedUids: readonly string[],
): readonly T[] | null {
  if (!Array.isArray(selectedUids) || selectedUids.length !== eligibility.tributeCount) {
    return null;
  }

  const seen = new Set<string>();
  const selected: T[] = [];
  for (const uid of selectedUids) {
    if (typeof uid !== 'string' || uid.length === 0 || seen.has(uid)) return null;
    seen.add(uid);
    const candidate = eligibility.candidates.find(card => card.uid === uid);
    if (!candidate) return null;
    selected.push(candidate);
  }

  return Object.freeze(selected);
}


/**
 * Pay a validated identity-scoped Tribute cost by moving the selected physical
 * cards from the shared team field to that team's shared Graveyard.
 *
 * Eligibility is recomputed immediately before mutation so a stale menu
 * cannot pay a cost after the field has changed. The original objects and
 * physical UIDs are preserved. Drawing and effect resolution remain the
 * caller's responsibility.
 */
export function payIdentityTributes<T extends IdentityTributeCard>(
  field: T[],
  grave: Array<{ readonly uid: string; readonly id: string }>,
  eligibility: IdentityTributeEligibility<T>,
  selectedUids: readonly string[],
): readonly T[] | null {
  const current = identityTributeEligibility(
    field,
    eligibility.sourceUid,
    eligibility.cardId,
    eligibility.requiredCopies,
    eligibility.tributeCount,
  );
  if (!current) return null;

  const selected = selectIdentityTributes(current, selectedUids);
  if (!selected) return null;

  const graveUids = new Set(grave.map(card => card.uid));
  if (selected.some(card => graveUids.has(card.uid))) {
    throw new Error('Identity Tribute selected UID already exists in the Graveyard.');
  }

  for (const uid of selectedUids) {
    const index = field.findIndex(card => card.uid === uid);
    if (index < 0) return null;
    const [card] = field.splice(index, 1);
    grave.push(card);
  }

  return selected;
}

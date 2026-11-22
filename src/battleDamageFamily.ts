export type DuelTeam = 0 | 1;
export type TeamDamage = readonly [number, number];
export type MutableTeamDamage = [number, number];

function assertTeam(value: number, label: string): asserts value is DuelTeam {
  if (value !== 0 && value !== 1) throw new Error(label + " must be team 0 or 1.");
}

function assertSeat(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error(label + " must be a physical seat from 0 to 3.");
  }
}

function assertAmount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(label + " must be a non-negative safe integer.");
  }
}

function copyTeamDamage(value: TeamDamage): MutableTeamDamage {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("battleDamageByTeam must contain exactly two team totals.");
  }
  assertAmount(value[0], "team 0 battle damage");
  assertAmount(value[1], "team 1 battle damage");
  return [value[0], value[1]];
}

function addTeamDamage(damage: MutableTeamDamage, team: DuelTeam, amount: number): void {
  const next = damage[team] + amount;
  if (!Number.isSafeInteger(next)) throw new Error("team damage total exceeds the safe integer range.");
  damage[team] = next;
}

export interface AmazonessSwordsWomanInput {
  battleDamageByTeam: TeamDamage;
  battleInvolvesSource: boolean;
  sourceControllerTeam: DuelTeam;
  opposingTeam: DuelTeam;
}

export interface BattleDamageRoutingResult {
  battleDamageByTeam: MutableTeamDamage;
  redirectedDamage: number;
  recipientTeam: DuelTeam | null;
}

/**
 * Amazoness Swords Woman redirects only battle damage its controller's team
 * would take from a battle involving this card. The amount is conserved.
 * Physical card ownership is intentionally not used to choose the LP team.
 */
export function routeAmazonessSwordsWomanBattleDamage(
  input: AmazonessSwordsWomanInput,
): BattleDamageRoutingResult {
  const damage = copyTeamDamage(input.battleDamageByTeam);
  assertTeam(input.sourceControllerTeam, "sourceControllerTeam");
  assertTeam(input.opposingTeam, "opposingTeam");
  if (input.sourceControllerTeam === input.opposingTeam) {
    throw new Error("sourceControllerTeam and opposingTeam must differ.");
  }

  const redirected = input.battleInvolvesSource ? damage[input.sourceControllerTeam] : 0;
  if (redirected > 0) {
    damage[input.sourceControllerTeam] = 0;
    addTeamDamage(damage, input.opposingTeam, redirected);
  }
  return {
    battleDamageByTeam: damage,
    redirectedDamage: redirected,
    recipientTeam: redirected > 0 ? input.opposingTeam : null,
  };
}

export interface AtomicFireflyInput {
  battleDamageByTeam: TeamDamage;
  sourceFaceUpAtBattleStart: boolean;
  destroyedByBattle: boolean;
  sourceControllerTeam: DuelTeam;
  destroyingTeam: DuelTeam;
}

export interface AtomicFireflyResult {
  battleDamageByTeam: MutableTeamDamage;
  triggered: boolean;
  retaliationDamage: number;
  recipientTeam: DuelTeam | null;
}

/**
 * Atomic Firefly retaliates against the team that destroyed it by battle.
 * It must have been face-up when the battle event began. No Graveyard
 * destination is required by this condition.
 */
export function applyAtomicFireflyBattleRetaliation(
  input: AtomicFireflyInput,
): AtomicFireflyResult {
  const damage = copyTeamDamage(input.battleDamageByTeam);
  assertTeam(input.sourceControllerTeam, "sourceControllerTeam");
  assertTeam(input.destroyingTeam, "destroyingTeam");

  const triggered = input.sourceFaceUpAtBattleStart
    && input.destroyedByBattle
    && input.sourceControllerTeam !== input.destroyingTeam;
  if (triggered) addTeamDamage(damage, input.destroyingTeam, 1000);

  return {
    battleDamageByTeam: damage,
    triggered,
    retaliationDamage: triggered ? 1000 : 0,
    recipientTeam: triggered ? input.destroyingTeam : null,
  };
}

export interface AirknightParshathInput {
  damageKind: "battle" | "effect";
  battleDamageInflicted: number;
  effectControllerSeat: number;
  sourcePhysicalOwnerSeat: number;
}

export interface AirknightParshathDrawResult {
  shouldDraw: boolean;
  drawCount: 0 | 1;
  drawSeat: number | null;
  sourcePhysicalOwnerSeat: number;
}

/**
 * Airknight Parshath draws only after it actually inflicts battle damage.
 * The caller supplies the physical seat resolving the effect; that seat's
 * private Deck is used even when the card's physical owner is a teammate.
 */
export function resolveAirknightParshathDraw(
  input: AirknightParshathInput,
): AirknightParshathDrawResult {
  assertAmount(input.battleDamageInflicted, "battleDamageInflicted");
  assertSeat(input.effectControllerSeat, "effectControllerSeat");
  assertSeat(input.sourcePhysicalOwnerSeat, "sourcePhysicalOwnerSeat");
  const shouldDraw = input.damageKind === "battle" && input.battleDamageInflicted > 0;
  return {
    shouldDraw,
    drawCount: shouldDraw ? 1 : 0,
    drawSeat: shouldDraw ? input.effectControllerSeat : null,
    sourcePhysicalOwnerSeat: input.sourcePhysicalOwnerSeat,
  };
}

export interface SharedGraveyardCard {
  uid: string;
  id: string;
  kind: "monster" | "spell" | "trap";
  physicalOwnerSeat: number;
}

export interface AswanApparitionInput {
  damageKind: "battle" | "effect";
  battleDamageInflicted: number;
  effectControllerSeat: number;
  sharedGraveyard: readonly SharedGraveyardCard[];
}

export interface AswanApparitionRecoveryOptions {
  available: boolean;
  deckTopSeat: number;
  targets: readonly SharedGraveyardCard[];
}

export interface AswanApparitionRecoverySelection {
  card: SharedGraveyardCard;
  deckTopSeat: number;
}

/**
 * Aswan Apparition may recover a Trap from the shared Graveyard only after
 * inflicting battle damage. The selected UID is placed on top of the
 * resolving physical seat's Deck; the card's original owner metadata remains.
 */
export function aswanApparitionRecoveryOptions(
  input: AswanApparitionInput,
): AswanApparitionRecoveryOptions {
  assertAmount(input.battleDamageInflicted, "battleDamageInflicted");
  assertSeat(input.effectControllerSeat, "effectControllerSeat");
  if (!Array.isArray(input.sharedGraveyard)) throw new Error("sharedGraveyard must be an array.");

  const seen = new Set<string>();
  for (const card of input.sharedGraveyard) {
    if (!card || typeof card.uid !== "string" || !card.uid.trim()) {
      throw new Error("shared Graveyard card UID is required.");
    }
    if (seen.has(card.uid)) throw new Error("duplicate physical UID in shared Graveyard.");
    seen.add(card.uid);
    if (typeof card.id !== "string" || !card.id.trim()) throw new Error("shared Graveyard card ID is required.");
    if (!["monster", "spell", "trap"].includes(card.kind)) throw new Error("invalid shared Graveyard card kind.");
    assertSeat(card.physicalOwnerSeat, "physicalOwnerSeat");
  }

  const mayRecover = input.damageKind === "battle" && input.battleDamageInflicted > 0;
  const targets = mayRecover
    ? input.sharedGraveyard.filter(card => card.kind === "trap")
    : [];
  return {
    available: targets.length > 0,
    deckTopSeat: input.effectControllerSeat,
    targets: [...targets],
  };
}

export function chooseAswanApparitionRecovery(
  options: AswanApparitionRecoveryOptions,
  selectedUid: string,
): AswanApparitionRecoverySelection | null {
  assertSeat(options.deckTopSeat, "deckTopSeat");
  if (!options.available || typeof selectedUid !== "string" || !selectedUid) return null;
  const matches = options.targets.filter(card => card.uid === selectedUid);
  if (matches.length !== 1) return null;
  return { card: matches[0], deckTopSeat: options.deckTopSeat };
}

export const ANTI_AIRCRAFT_FLOWER_CARD_ID = "65064143" as const;
export const ARCANE_ARCHER_OF_THE_FOREST_CARD_ID = "55001420" as const;

export type DuelTeam = 0 | 1;
export type PhysicalSeat = 0 | 1 | 2 | 3;
export type MonsterType = string;

export interface TypedTributeSource {
  cardId: string;
  uid: string;
  physicalOwnerSeat: number;
  physicalOwnerTeam: DuelTeam;
  controllerTeam: DuelTeam;
  faceUpAtActivation: boolean;
}

export interface FieldMonster {
  uid: string;
  cardId: string;
  physicalOwnerSeat: number;
  physicalOwnerTeam: DuelTeam;
  controllerTeam: DuelTeam;
  monsterType: MonsterType;
  zoneIndex: number;
  faceUp: boolean;
}

export interface FieldSpellTrap {
  uid: string;
  cardId: string;
  physicalOwnerSeat: number;
  physicalOwnerTeam: DuelTeam;
  controllerTeam: DuelTeam;
  cardKind: "spell" | "trap";
  zone: "spellTrap" | "field";
  zoneIndex: number;
  faceUp: boolean;
}

export interface TypedTributePayment {
  uid: string;
  cardId: string;
  physicalOwnerSeat: PhysicalSeat;
  physicalOwnerTeam: DuelTeam;
  controllerTeam: DuelTeam;
  destination: "graveyard";
  destinationTeam: DuelTeam;
  selectionVisibility: "controller-private";
}

export interface AntiAircraftFlowerInput {
  source: TypedTributeSource;
  fieldMonstersAtActivation: readonly FieldMonster[];
  selectedTributeUid: string;
}

export interface AntiAircraftFlowerResult {
  sourceUid: string;
  sourcePhysicalOwnerSeat: PhysicalSeat;
  sourceControllerTeam: DuelTeam;
  tribute: TypedTributePayment;
  damageTeam: DuelTeam;
  damageAmount: 800;
  hasOncePerTurnRestriction: false;
}

export interface ArcaneArcherInput {
  source: TypedTributeSource;
  fieldMonstersAtActivation: readonly FieldMonster[];
  fieldCardsAtActivation: readonly FieldSpellTrap[];
  selectedTributeUid: string;
  selectedTargetUid: string;
  fieldCardsAtResolution: readonly FieldSpellTrap[];
}

export interface ArcaneArcherResult {
  sourceUid: string;
  sourcePhysicalOwnerSeat: PhysicalSeat;
  sourceControllerTeam: DuelTeam;
  tribute: TypedTributePayment;
  targetUid: string;
  targetDestroyed: boolean;
  targetDestinationTeam: DuelTeam | null;
  targetPhysicalOwnerSeat: PhysicalSeat | null;
  hasOncePerTurnRestriction: false;
}

export interface ArcaneArcherAttackRestriction {
  cannotBeAttacked: boolean;
  reason: "source-face-down" | "plant-present" | "no-plant";
}

function assertUid(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(label + " is required.");
  }
}

function assertTeam(value: number, label: string): asserts value is DuelTeam {
  if (value !== 0 && value !== 1) {
    throw new Error(label + " must be team 0 or team 1.");
  }
}

function assertSeat(value: number, label: string): asserts value is PhysicalSeat {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error(label + " must be a physical seat from 0 to 3.");
  }
}

function assertPhysicalOwner(seat: number, team: number, label: string): void {
  assertSeat(seat, label + " physical owner seat");
  assertTeam(team, label + " physical owner team");
  if (seat % 2 !== team) {
    throw new Error(label + " physical owner team does not match the seat's team.");
  }
}

function assertMonsterField(monsters: readonly FieldMonster[]): void {
  if (!Array.isArray(monsters)) throw new Error("fieldMonsters must be an array.");
  const seenUids = new Set<string>();
  const usedZones: [Set<number>, Set<number>] = [new Set<number>(), new Set<number>()];

  for (const [index, monster] of monsters.entries()) {
    assertUid(monster.uid, "fieldMonsters[" + index + "].uid");
    assertUid(monster.cardId, "fieldMonsters[" + index + "].cardId");
    assertPhysicalOwner(monster.physicalOwnerSeat, monster.physicalOwnerTeam, "field monster");
    assertTeam(monster.controllerTeam, "field monster controllerTeam");
    assertUid(monster.monsterType, "field monster type");
    if (typeof monster.faceUp !== "boolean") throw new Error("field monster faceUp must be boolean.");
    if (!Number.isInteger(monster.zoneIndex) || monster.zoneIndex < 0 || monster.zoneIndex > 2) {
      throw new Error("each team has exactly three Monster Zones (indices 0–2).");
    }
    if (seenUids.has(monster.uid)) throw new Error("duplicate physical UID in Monster Zones.");
    seenUids.add(monster.uid);
    if (usedZones[monster.controllerTeam].has(monster.zoneIndex)) {
      throw new Error("a shared Monster Zone cannot contain two cards.");
    }
    usedZones[monster.controllerTeam].add(monster.zoneIndex);
  }
}

function assertSpellTrapField(cards: readonly FieldSpellTrap[]): void {
  if (!Array.isArray(cards)) throw new Error("fieldCards must be an array.");
  const seenUids = new Set<string>();
  const usedSpellTrapZones: [Set<number>, Set<number>] = [new Set<number>(), new Set<number>()];
  const fieldZoneCount: [number, number] = [0, 0];

  for (const [index, card] of cards.entries()) {
    assertUid(card.uid, "fieldCards[" + index + "].uid");
    assertUid(card.cardId, "fieldCards[" + index + "].cardId");
    assertPhysicalOwner(card.physicalOwnerSeat, card.physicalOwnerTeam, "field Spell/Trap");
    assertTeam(card.controllerTeam, "field Spell/Trap controllerTeam");
    if (card.cardKind !== "spell" && card.cardKind !== "trap") {
      throw new Error("field card must be a Spell or Trap.");
    }
    if (typeof card.faceUp !== "boolean") throw new Error("field Spell/Trap faceUp must be boolean.");
    if (seenUids.has(card.uid)) throw new Error("duplicate physical UID in Spell/Trap Zones.");
    seenUids.add(card.uid);

    if (card.zone === "spellTrap") {
      if (!Number.isInteger(card.zoneIndex) || card.zoneIndex < 0 || card.zoneIndex > 2) {
        throw new Error("each team has exactly three Spell/Trap Zones (indices 0–2).");
      }
      if (usedSpellTrapZones[card.controllerTeam].has(card.zoneIndex)) {
        throw new Error("a shared Spell/Trap Zone cannot contain two cards.");
      }
      usedSpellTrapZones[card.controllerTeam].add(card.zoneIndex);
    } else if (card.zone === "field") {
      if (card.zoneIndex !== 0) throw new Error("Field Zone index must be zero.");
      fieldZoneCount[card.controllerTeam] += 1;
      if (fieldZoneCount[card.controllerTeam] > 1) {
        throw new Error("each team has one separate Field Zone.");
      }
    } else {
      throw new Error("unknown Spell/Trap field zone.");
    }
  }
}

function assertNoCrossZoneDuplicateUids(
  monsters: readonly FieldMonster[],
  cards: readonly FieldSpellTrap[],
): void {
  const monsterUids = new Set(monsters.map((monster) => monster.uid));
  for (const card of cards) {
    if (monsterUids.has(card.uid)) {
      throw new Error("a physical UID cannot occupy Monster and Spell/Trap Zones simultaneously.");
    }
  }
}

function validateSourceOnField(
  source: TypedTributeSource,
  expectedCardId: string,
  monsters: readonly FieldMonster[],
): FieldMonster {
  assertUid(source.cardId, "source.cardId");
  assertUid(source.uid, "source.uid");
  assertPhysicalOwner(source.physicalOwnerSeat, source.physicalOwnerTeam, "source");
  assertTeam(source.controllerTeam, "source.controllerTeam");
  if (source.cardId !== expectedCardId) {
    throw new Error("source card ID must be " + expectedCardId + ".");
  }
  if (source.faceUpAtActivation !== true) {
    throw new Error("the ignition effect requires its source to be face-up at activation.");
  }

  const sourceOnField = monsters.find((monster) => monster.uid === source.uid);
  if (!sourceOnField) throw new Error("source monster is not in the shared Monster Zones.");
  if (sourceOnField.cardId !== source.cardId
    || sourceOnField.physicalOwnerSeat !== source.physicalOwnerSeat
    || sourceOnField.physicalOwnerTeam !== source.physicalOwnerTeam
    || sourceOnField.controllerTeam !== source.controllerTeam
    || sourceOnField.faceUp !== true) {
    throw new Error("source physical identity or activation state does not match the field snapshot.");
  }
  return sourceOnField;
}

export function eligibleTypedTributeUids(
  monsters: readonly FieldMonster[],
  controllerTeam: DuelTeam,
  requiredType: MonsterType,
): string[] {
  assertMonsterField(monsters);
  assertTeam(controllerTeam, "controllerTeam");
  assertUid(requiredType, "requiredType");
  // The source itself is intentionally eligible if its current Type matches.
  // A type-changing effect can make Arcane Archer tribute itself.
  return monsters
    .filter((monster) => monster.controllerTeam === controllerTeam
      && monster.monsterType === requiredType)
    .map((monster) => monster.uid);
}

function payTypedTribute(
  monsters: readonly FieldMonster[],
  controllerTeam: DuelTeam,
  requiredType: MonsterType,
  selectedUid: string,
): TypedTributePayment {
  assertUid(selectedUid, "selectedTributeUid");
  const eligible = eligibleTypedTributeUids(monsters, controllerTeam, requiredType);
  if (!eligible.includes(selectedUid)) {
    throw new Error("selected Tribute must be one controlled " + requiredType + " monster.");
  }
  const tribute = monsters.find((monster) => monster.uid === selectedUid);
  if (!tribute) throw new Error("selected Tribute disappeared from the activation snapshot.");
  return {
    uid: tribute.uid,
    cardId: tribute.cardId,
    physicalOwnerSeat: tribute.physicalOwnerSeat as PhysicalSeat,
    physicalOwnerTeam: tribute.physicalOwnerTeam,
    controllerTeam: tribute.controllerTeam,
    destination: "graveyard",
    destinationTeam: tribute.physicalOwnerTeam,
    selectionVisibility: "controller-private",
  };
}

/**
 * Anti-Aircraft Flower Tributes one Insect-Type monster it controls as cost,
 * then inflicts 800 damage to the opposing team. Face-down monsters controlled
 * by the activator remain eligible for a type-specific Tribute cost.
 */
export function resolveAntiAircraftFlower(
  input: AntiAircraftFlowerInput,
): AntiAircraftFlowerResult {
  assertMonsterField(input.fieldMonstersAtActivation);
  const source = validateSourceOnField(
    input.source,
    ANTI_AIRCRAFT_FLOWER_CARD_ID,
    input.fieldMonstersAtActivation,
  );
  const tribute = payTypedTribute(
    input.fieldMonstersAtActivation,
    source.controllerTeam,
    "Insect",
    input.selectedTributeUid,
  );
  return {
    sourceUid: source.uid,
    sourcePhysicalOwnerSeat: source.physicalOwnerSeat as PhysicalSeat,
    sourceControllerTeam: source.controllerTeam,
    tribute,
    damageTeam: source.controllerTeam === 0 ? 1 : 0,
    damageAmount: 800,
    hasOncePerTurnRestriction: false,
  };
}

/**
 * Arcane Archer's continuous protection is active only while the Archer is
 * face-up. The server evaluates Plant presence from authoritative field state
 * and returns only a boolean/reason, never the hidden monster identity.
 */
export function arcaneArcherAttackRestriction(
  sourceUid: string,
  fieldMonsters: readonly FieldMonster[],
): ArcaneArcherAttackRestriction {
  assertUid(sourceUid, "sourceUid");
  assertMonsterField(fieldMonsters);
  const source = fieldMonsters.find((monster) => monster.uid === sourceUid);
  if (!source || source.cardId !== ARCANE_ARCHER_OF_THE_FOREST_CARD_ID) {
    throw new Error("Arcane Archer source is not present in the Monster Zones.");
  }
  if (!source.faceUp) {
    return { cannotBeAttacked: false, reason: "source-face-down" };
  }
  const plantPresent = fieldMonsters.some((monster) =>
    monster.controllerTeam === source.controllerTeam && monster.monsterType === "Plant");
  return plantPresent
    ? { cannotBeAttacked: true, reason: "plant-present" }
    : { cannotBeAttacked: false, reason: "no-plant" };
}

/**
 * Arcane Archer Tributes one Plant-Type monster it controls as cost and targets
 * one Spell/Trap on either team's field. If that exact physical target leaves
 * the field before resolution, the cost stays paid and nothing is destroyed.
 */
export function resolveArcaneArcherOfTheForest(
  input: ArcaneArcherInput,
): ArcaneArcherResult {
  assertMonsterField(input.fieldMonstersAtActivation);
  assertSpellTrapField(input.fieldCardsAtActivation);
  assertSpellTrapField(input.fieldCardsAtResolution);
  assertNoCrossZoneDuplicateUids(input.fieldMonstersAtActivation, input.fieldCardsAtActivation);
  const source = validateSourceOnField(
    input.source,
    ARCANE_ARCHER_OF_THE_FOREST_CARD_ID,
    input.fieldMonstersAtActivation,
  );
  assertUid(input.selectedTargetUid, "selectedTargetUid");
  const targetAtActivation = input.fieldCardsAtActivation.find(
    (card) => card.uid === input.selectedTargetUid,
  );
  if (!targetAtActivation) {
    throw new Error("Arcane Archer must select a Spell/Trap that is on the field at activation.");
  }

  const tribute = payTypedTribute(
    input.fieldMonstersAtActivation,
    source.controllerTeam,
    "Plant",
    input.selectedTributeUid,
  );
  const targetAtResolution = input.fieldCardsAtResolution.find(
    (card) => card.uid === input.selectedTargetUid,
  );

  if (!targetAtResolution) {
    return {
      sourceUid: source.uid,
      sourcePhysicalOwnerSeat: source.physicalOwnerSeat as PhysicalSeat,
      sourceControllerTeam: source.controllerTeam,
      tribute,
      targetUid: targetAtActivation.uid,
      targetDestroyed: false,
      targetDestinationTeam: null,
      targetPhysicalOwnerSeat: null,
      hasOncePerTurnRestriction: false,
    };
  }

  if (targetAtResolution.cardId !== targetAtActivation.cardId
    || targetAtResolution.physicalOwnerSeat !== targetAtActivation.physicalOwnerSeat
    || targetAtResolution.physicalOwnerTeam !== targetAtActivation.physicalOwnerTeam
    || targetAtResolution.cardKind !== targetAtActivation.cardKind) {
    throw new Error("target physical identity changed between activation and resolution.");
  }

  return {
    sourceUid: source.uid,
    sourcePhysicalOwnerSeat: source.physicalOwnerSeat as PhysicalSeat,
    sourceControllerTeam: source.controllerTeam,
    tribute,
    targetUid: targetAtResolution.uid,
    targetDestroyed: true,
    targetDestinationTeam: targetAtResolution.physicalOwnerTeam,
    targetPhysicalOwnerSeat: targetAtResolution.physicalOwnerSeat as PhysicalSeat,
    hasOncePerTurnRestriction: false,
  };
}

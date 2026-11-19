export const ANCIENT_LAMP_CARD_ID = '54912977' as const;
export const LA_JINN_CARD_ID = '97590747' as const;

export type DuelSeat = 0 | 1 | 2 | 3;
export type DuelTeam = 'even' | 'odd';
export type MonsterPosition = 'attack' | 'defense';

export type AncientLampFieldMonster = Readonly<{
  uid: string;
  cardId?: string;
  physicalOwnerSeat: DuelSeat;
  controllerSeat: DuelSeat;
  zone: 'monster';
  zoneSlot: 0 | 1 | 2;
  faceUp: boolean;
  position: MonsterPosition;
  effectNegated?: boolean;
}>;

export type AncientLampHandCard = Readonly<{
  uid: string;
  cardId: string;
  physicalOwnerSeat: DuelSeat;
  kind: 'monster' | 'spell' | 'trap';
}>;

export type AncientLampSummonPlan = Readonly<{
  sourceUid: string;
  activeSeat: DuelSeat;
  team: DuelTeam;
  laJinnUid: string;
  monsterZoneSlot: 0 | 1 | 2;
}>;

export type AncientLampSummonPlanResult =
  | Readonly<{ allowed: false; reason: 'wrong-phase' | 'source-not-face-up' | 'source-not-controlled-by-team' | 'source-effect-negated' | 'la-jinn-not-in-active-hand' | 'monster-zone-full' }>
  | Readonly<{ allowed: true; plan: AncientLampSummonPlan }>;

export type AncientLampSummonResolution =
  | Readonly<{ resolved: false; reason: 'stale-plan' | 'source-not-face-up' | 'source-effect-negated' | 'la-jinn-not-in-active-hand' | 'monster-zone-full' }>
  | Readonly<{
      resolved: true;
      team: DuelTeam;
      activeSeat: DuelSeat;
      hand: readonly AncientLampHandCard[];
      field: readonly AncientLampFieldMonster[];
      summonedUid: string;
      physicalOwnerSeat: DuelSeat;
      controllerSeat: DuelSeat;
      monsterZoneSlot: 0 | 1 | 2;
      position: MonsterPosition;
    }>;

export type AncientLampAttackSnapshot = Readonly<{
  eventId: string;
  timing: 'before-damage-calculation';
  attackerUid: string;
  attackerControllerSeat: DuelSeat;
  currentTargetUid: string;
  ancientLampUid: string;
  ancientLampControllerSeat: DuelSeat;
  wasFaceDownAtDamageStepStart: boolean;
}>;

export type AncientLampRedirectPlan = Readonly<{
  eventId: string;
  attackerUid: string;
  attackerTeam: DuelTeam;
  ancientLampUid: string;
  targetUid: string;
}>;

export type AncientLampRedirectPlanResult =
  | Readonly<{ allowed: false; reason: 'wrong-timing' | 'lamp-not-current-target' | 'lamp-was-not-face-down-at-damage-step-start' | 'lamp-not-face-up-now' | 'attacker-not-opponent' | 'invalid-redirect-target' }>
  | Readonly<{ allowed: true; plan: AncientLampRedirectPlan }>;

export type AncientLampRedirectResolution =
  | Readonly<{ redirected: false; reason: 'stale-attack' | 'attacker-missing' | 'target-missing' | 'target-no-longer-opponent-controlled' | 'lamp-no-longer-current-target' }>
  | Readonly<{
      redirected: true;
      eventId: string;
      attackerUid: string;
      targetUid: string;
      targetTeam: DuelTeam;
      targetFaceUp: boolean;
    }>;

const seats: readonly DuelSeat[] = [0, 1, 2, 3];
const isSeat = (value: unknown): value is DuelSeat =>
  typeof value === 'number' && Number.isInteger(value) && seats.includes(value as DuelSeat);

function requireSeat(value: unknown, label: string): asserts value is DuelSeat {
  if (!isSeat(value)) throw new TypeError(`Invalid ${label}.`);
}

function requireId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new TypeError(`Invalid ${label}.`);
  }
}

export function teamOfAncientLampSeat(seat: DuelSeat): DuelTeam {
  requireSeat(seat, 'seat');
  return seat % 2 === 0 ? 'even' : 'odd';
}

function validateHand(hand: readonly AncientLampHandCard[], activeSeat: DuelSeat): void {
  if (!Array.isArray(hand) || hand.length > 30) throw new TypeError('Invalid active physical hand.');
  const uids = new Set<string>();
  for (const card of hand) {
    if (!card || typeof card !== 'object') throw new TypeError('Invalid hand card.');
    requireId(card.uid, 'hand physical UID');
    requireId(card.cardId, 'hand card ID');
    requireSeat(card.physicalOwnerSeat, 'hand physical owner');
    if (card.physicalOwnerSeat !== activeSeat) throw new TypeError('Partner private hand must not be read.');
    if (!['monster', 'spell', 'trap'].includes(card.kind)) throw new TypeError('Invalid hand card kind.');
    if (uids.has(card.uid)) throw new TypeError('Duplicate physical UID in active hand.');
    uids.add(card.uid);
  }
}

function validateField(field: readonly AncientLampFieldMonster[]): void {
  if (!Array.isArray(field) || field.length > 6) throw new TypeError('Invalid shared Monster Field.');
  const uids = new Set<string>();
  const slots = new Set<string>();
  for (const monster of field) {
    if (!monster || typeof monster !== 'object') throw new TypeError('Invalid field monster.');
    requireId(monster.uid, 'physical UID');
    requireSeat(monster.physicalOwnerSeat, 'physical owner');
    requireSeat(monster.controllerSeat, 'controller');
    if (monster.zone !== 'monster') throw new TypeError('Invalid monster zone.');
    if (monster.zoneSlot !== 0 && monster.zoneSlot !== 1 && monster.zoneSlot !== 2) {
      throw new TypeError('Monster must occupy one of the three shared Monster Zones.');
    }
    if (typeof monster.faceUp !== 'boolean') throw new TypeError('Invalid face-up state.');
    if (monster.position !== 'attack' && monster.position !== 'defense') throw new TypeError('Invalid monster position.');
    if (monster.faceUp) requireId(monster.cardId, 'face-up card ID');
    else if (monster.cardId !== undefined) throw new TypeError('Face-down card identity must remain hidden.');
    if (monster.effectNegated !== undefined && typeof monster.effectNegated !== 'boolean') {
      throw new TypeError('Invalid effect-negation state.');
    }
    if (uids.has(monster.uid)) throw new TypeError('Duplicate physical UID on shared Monster Field.');
    uids.add(monster.uid);
    const key = `${teamOfAncientLampSeat(monster.controllerSeat)}:${monster.zoneSlot}`;
    if (slots.has(key)) throw new TypeError('A shared Monster Zone slot is occupied more than once.');
    slots.add(key);
  }
}

function freeMonsterSlot(field: readonly AncientLampFieldMonster[], team: DuelTeam): 0 | 1 | 2 | undefined {
  const occupied = new Set(field
    .filter(monster => teamOfAncientLampSeat(monster.controllerSeat) === team)
    .map(monster => monster.zoneSlot));
  return ([0, 1, 2] as const).find(slot => !occupied.has(slot));
}

function findAncientLamp(uid: string, field: readonly AncientLampFieldMonster[]): AncientLampFieldMonster | undefined {
  return field.find(monster => monster.uid === uid && monster.faceUp && monster.cardId === ANCIENT_LAMP_CARD_ID);
}

export function planAncientLampLaJinnSummon(input: Readonly<{
  phase: 'main' | 'battle' | 'response' | 'end';
  activeSeat: DuelSeat;
  sourceUid: string;
  laJinnUid: string;
  hand: readonly AncientLampHandCard[];
  field: readonly AncientLampFieldMonster[];
}>): AncientLampSummonPlanResult {
  requireSeat(input.activeSeat, 'active seat');
  requireId(input.sourceUid, 'Ancient Lamp UID');
  requireId(input.laJinnUid, 'La Jinn UID');
  validateHand(input.hand, input.activeSeat);
  validateField(input.field);
  if (input.phase !== 'main') return { allowed: false, reason: 'wrong-phase' };

  const source = findAncientLamp(input.sourceUid, input.field);
  if (!source) return { allowed: false, reason: 'source-not-face-up' };
  const team = teamOfAncientLampSeat(input.activeSeat);
  if (teamOfAncientLampSeat(source.controllerSeat) !== team) {
    return { allowed: false, reason: 'source-not-controlled-by-team' };
  }
  if (source.effectNegated) return { allowed: false, reason: 'source-effect-negated' };

  const laJinn = input.hand.find(card => card.uid === input.laJinnUid && card.cardId === LA_JINN_CARD_ID);
  if (!laJinn || laJinn.physicalOwnerSeat !== input.activeSeat) {
    return { allowed: false, reason: 'la-jinn-not-in-active-hand' };
  }
  if (input.field.some(card => card.uid === laJinn.uid)) throw new TypeError('A physical card cannot be in hand and on the field.');
  const monsterZoneSlot = freeMonsterSlot(input.field, team);
  if (monsterZoneSlot === undefined) return { allowed: false, reason: 'monster-zone-full' };

  return {
    allowed: true,
    plan: { sourceUid: source.uid, activeSeat: input.activeSeat, team, laJinnUid: laJinn.uid, monsterZoneSlot },
  };
}

export function resolveAncientLampLaJinnSummon(input: Readonly<{
  plan: AncientLampSummonPlan;
  phase: 'main' | 'battle' | 'response' | 'end';
  activeSeat: DuelSeat;
  position: MonsterPosition;
  hand: readonly AncientLampHandCard[];
  field: readonly AncientLampFieldMonster[];
}>): AncientLampSummonResolution {
  requireSeat(input.activeSeat, 'active seat');
  if (input.position !== 'attack' && input.position !== 'defense') throw new TypeError('Invalid summon position.');
  const plan = input.plan;
  if (!plan || typeof plan !== 'object' || !isSeat(plan.activeSeat) ||
      plan.activeSeat !== input.activeSeat || plan.team !== teamOfAncientLampSeat(input.activeSeat) ||
      (plan.monsterZoneSlot !== 0 && plan.monsterZoneSlot !== 1 && plan.monsterZoneSlot !== 2) ||
      input.phase !== 'main') return { resolved: false, reason: 'stale-plan' };
  requireId(plan.sourceUid, 'planned Ancient Lamp UID');
  requireId(plan.laJinnUid, 'planned La Jinn UID');
  validateHand(input.hand, input.activeSeat);
  validateField(input.field);

  const source = findAncientLamp(plan.sourceUid, input.field);
  if (!source || teamOfAncientLampSeat(source.controllerSeat) !== plan.team) {
    return { resolved: false, reason: 'source-not-face-up' };
  }
  if (source.effectNegated) return { resolved: false, reason: 'source-effect-negated' };
  const laJinn = input.hand.find(card => card.uid === plan.laJinnUid && card.cardId === LA_JINN_CARD_ID &&
    card.physicalOwnerSeat === input.activeSeat);
  if (!laJinn) return { resolved: false, reason: 'la-jinn-not-in-active-hand' };
  if (input.field.some(card => card.uid === laJinn.uid)) throw new TypeError('A physical card cannot be in hand and on the field.');

  const slot = freeMonsterSlot(input.field, plan.team);
  if (slot === undefined) return { resolved: false, reason: 'monster-zone-full' };
  if (slot !== plan.monsterZoneSlot) return { resolved: false, reason: 'stale-plan' };

  const summoned: AncientLampFieldMonster = {
    uid: laJinn.uid,
    cardId: laJinn.cardId,
    physicalOwnerSeat: laJinn.physicalOwnerSeat,
    controllerSeat: input.activeSeat,
    zone: 'monster',
    zoneSlot: slot,
    faceUp: true,
    position: input.position,
  };
  const nextHand = input.hand.filter(card => card.uid !== laJinn.uid);
  const nextField = [...input.field, summoned];
  validateField(nextField);
  return {
    resolved: true,
    team: plan.team,
    activeSeat: input.activeSeat,
    hand: nextHand,
    field: nextField,
    summonedUid: summoned.uid,
    physicalOwnerSeat: summoned.physicalOwnerSeat,
    controllerSeat: summoned.controllerSeat,
    monsterZoneSlot: slot,
    position: input.position,
  };
}

function findMonster(uid: string, field: readonly AncientLampFieldMonster[]): AncientLampFieldMonster | undefined {
  return field.find(monster => monster.uid === uid);
}

export function planAncientLampAttackRedirect(input: Readonly<{
  attack: AncientLampAttackSnapshot;
  selectedTargetUid: string;
  field: readonly AncientLampFieldMonster[];
}>): AncientLampRedirectPlanResult {
  const attack = input.attack;
  if (!attack || typeof attack !== 'object') throw new TypeError('Invalid attack snapshot.');
  requireId(attack.eventId, 'attack event ID');
  requireId(attack.attackerUid, 'attacker UID');
  requireSeat(attack.attackerControllerSeat, 'attacker controller');
  requireId(attack.currentTargetUid, 'current attack target UID');
  requireId(attack.ancientLampUid, 'Ancient Lamp UID');
  requireSeat(attack.ancientLampControllerSeat, 'Ancient Lamp controller');
  requireId(input.selectedTargetUid, 'redirect target UID');
  if (typeof attack.wasFaceDownAtDamageStepStart !== 'boolean') {
    throw new TypeError('Invalid Damage Step starting position.');
  }
  validateField(input.field);

  if (attack.timing !== 'before-damage-calculation') return { allowed: false, reason: 'wrong-timing' };
  if (attack.currentTargetUid !== attack.ancientLampUid) return { allowed: false, reason: 'lamp-not-current-target' };
  if (!attack.wasFaceDownAtDamageStepStart) {
    return { allowed: false, reason: 'lamp-was-not-face-down-at-damage-step-start' };
  }
  const lamp = findAncientLamp(attack.ancientLampUid, input.field);
  if (!lamp) return { allowed: false, reason: 'lamp-not-face-up-now' };
  if (teamOfAncientLampSeat(lamp.controllerSeat) !== teamOfAncientLampSeat(attack.ancientLampControllerSeat)) {
    return { allowed: false, reason: 'lamp-not-face-up-now' };
  }

  const attackerTeam = teamOfAncientLampSeat(attack.attackerControllerSeat);
  const lampTeam = teamOfAncientLampSeat(lamp.controllerSeat);
  if (attackerTeam === lampTeam) return { allowed: false, reason: 'attacker-not-opponent' };
  const target = findMonster(input.selectedTargetUid, input.field);
  if (!target || target.uid === attack.attackerUid || target.uid === lamp.uid ||
      teamOfAncientLampSeat(target.controllerSeat) !== attackerTeam) {
    return { allowed: false, reason: 'invalid-redirect-target' };
  }

  return {
    allowed: true,
    plan: {
      eventId: attack.eventId,
      attackerUid: attack.attackerUid,
      attackerTeam,
      ancientLampUid: lamp.uid,
      targetUid: target.uid,
    },
  };
}

export function resolveAncientLampAttackRedirect(input: Readonly<{
  plan: AncientLampRedirectPlan;
  attack: AncientLampAttackSnapshot;
  field: readonly AncientLampFieldMonster[];
}>): AncientLampRedirectResolution {
  const plan = input.plan;
  if (!plan || typeof plan !== 'object' || !input.attack || typeof input.attack !== 'object') {
    return { redirected: false, reason: 'stale-attack' };
  }
  requireId(plan.eventId, 'planned attack event ID');
  requireId(plan.attackerUid, 'planned attacker UID');
  requireId(plan.ancientLampUid, 'planned Ancient Lamp UID');
  requireId(plan.targetUid, 'planned target UID');
  validateField(input.field);

  const attack = input.attack;
  if (attack.eventId !== plan.eventId || attack.attackerUid !== plan.attackerUid ||
      attack.ancientLampUid !== plan.ancientLampUid || attack.currentTargetUid !== plan.ancientLampUid ||
      attack.timing !== 'before-damage-calculation' || !attack.wasFaceDownAtDamageStepStart) {
    return { redirected: false, reason: 'stale-attack' };
  }
  const attacker = findMonster(plan.attackerUid, input.field);
  if (!attacker) return { redirected: false, reason: 'attacker-missing' };
  const target = findMonster(plan.targetUid, input.field);
  if (!target) return { redirected: false, reason: 'target-missing' };
  if (teamOfAncientLampSeat(target.controllerSeat) !== plan.attackerTeam ||
      teamOfAncientLampSeat(attacker.controllerSeat) !== plan.attackerTeam) {
    return { redirected: false, reason: 'target-no-longer-opponent-controlled' };
  }
  const lamp = findAncientLamp(plan.ancientLampUid, input.field);
  if (lamp && teamOfAncientLampSeat(lamp.controllerSeat) === plan.attackerTeam) {
    return { redirected: false, reason: 'stale-attack' };
  }
  if (attack.currentTargetUid !== plan.ancientLampUid) {
    return { redirected: false, reason: 'lamp-no-longer-current-target' };
  }

  return {
    redirected: true,
    eventId: plan.eventId,
    attackerUid: plan.attackerUid,
    targetUid: target.uid,
    targetTeam: teamOfAncientLampSeat(target.controllerSeat),
    targetFaceUp: target.faceUp,
  };
}

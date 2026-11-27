export const NEKO_MANE_KING_ID = '11021521' as const;
export type TagTeam = 0 | 1;
export type TagSeat = 0 | 1 | 2 | 3;
export type TagPhase = 'draw' | 'standby' | 'main1' | 'battle' | 'main2' | 'end';
export type NekoSourceZone = 'hand' | 'deck' | 'monster' | 'banished' | 'grave';
export type NekoDestinationZone = 'grave' | 'banished' | 'hand' | 'deck';
export type NekoSendCause = 'card-effect' | 'battle' | 'rule';

export type NekoManeKingSendEvent = {
  eventId: string;
  activationId: string;
  cardId: string;
  sourceUid: string;
  fromZone: NekoSourceZone;
  toZone: NekoDestinationZone;
  ownerSeat: TagSeat;
  possessorTeam: TagTeam;
  sourceControllerTeam?: TagTeam;
  turnTeam: TagTeam;
  turnSeat: TagSeat;
  effectControllerTeam: TagTeam;
  cause: NekoSendCause;
  chainResolved: boolean;
  turnNumber: number;
  phase: TagPhase;
};

export type NekoManeKingTrigger = {
  activationId: string;
  eventId: string;
  cardId: typeof NEKO_MANE_KING_ID;
  sourceUid: string;
  ownerSeat: TagSeat;
  ownerTeam: TagTeam;
  possessorTeam: TagTeam;
  effectControllerTeam: TagTeam;
  turnTeam: TagTeam;
  turnSeat: TagSeat;
  turnNumber: number;
  capturedPhase: TagPhase;
  mandatory: true;
  operation: 'become-end-phase';
};

export type NekoManeKingResolution = {
  activationId: string;
  sourceUid: string;
  ownerSeat: TagSeat;
  ownerTeam: TagTeam;
  possessorTeam: TagTeam;
  turnNumber: number;
  turnSeat: TagSeat;
  status: 'negated' | 'end-phase' | 'already-end-phase';
  nextPhase: 'end' | null;
  phaseChanged: boolean;
  turnAdvances: false;
  mustRunEndPhaseProcedures: boolean;
};

export type NekoManeKingSession = {
  version: 1;
  seenEvents: Record<string, true>;
  usedActivations: Record<string, true>;
  pending: Record<string, NekoManeKingTrigger>;
  resolved: Record<string, NekoManeKingResolution>;
};

export type NekoManeKingResolveContext = {
  turnNumber: number;
  turnSeat: TagSeat;
  phase: TagPhase;
  negated?: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const safeKey = (value: unknown): value is string =>
  typeof value === 'string' && !['__proto__', 'constructor', 'prototype'].includes(value) &&
  /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(value);
const isSeat = (value: unknown): value is TagSeat =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
const isTeam = (value: unknown): value is TagTeam => value === 0 || value === 1;
const otherTeam = (team: TagTeam): TagTeam => (team === 0 ? 1 : 0);
const phases = new Set<TagPhase>(['draw', 'standby', 'main1', 'battle', 'main2', 'end']);
const sourceZones = new Set<NekoSourceZone>(['hand', 'deck', 'monster', 'banished', 'grave']);
const destinationZones = new Set<NekoDestinationZone>(['grave', 'banished', 'hand', 'deck']);
const causes = new Set<NekoSendCause>(['card-effect', 'battle', 'rule']);

function assertEvent(event: NekoManeKingSendEvent): void {
  if (!isRecord(event) || !safeKey(event.eventId) || !safeKey(event.activationId) ||
      typeof event.cardId !== 'string' || !/^\d{8}$/.test(event.cardId) ||
      typeof event.sourceUid !== 'string' || !/^m[0-3]:[^\s]{1,120}$/.test(event.sourceUid) ||
      !sourceZones.has(event.fromZone) || !destinationZones.has(event.toZone) ||
      !isSeat(event.ownerSeat) || !isTeam(event.possessorTeam) || !isTeam(event.turnTeam) ||
      !isSeat(event.turnSeat) || !isTeam(event.effectControllerTeam) ||
      !causes.has(event.cause) || typeof event.chainResolved !== 'boolean' ||
      !Number.isSafeInteger(event.turnNumber) || event.turnNumber < 1 || !phases.has(event.phase)) {
    throw new Error('Evento de envio do Neko Mane King inválido.');
  }
  const uidSeat = Number(/^m([0-3]):/.exec(event.sourceUid)![1]);
  if (uidSeat !== event.ownerSeat || event.turnSeat % 2 !== event.turnTeam) {
    throw new Error('Assento físico ou equipe do turno inconsistente.');
  }
  if (event.sourceControllerTeam !== undefined && !isTeam(event.sourceControllerTeam)) {
    throw new Error('Controlador físico inválido.');
  }
  if (event.fromZone === 'monster' && event.sourceControllerTeam !== event.possessorTeam) {
    throw new Error('A posse do monstro precisa corresponder ao controlador no evento.');
  }
}

export function assertNekoManeKingSession(session: NekoManeKingSession): void {
  if (!isRecord(session) || session.version !== 1 || !isRecord(session.seenEvents) ||
      !isRecord(session.usedActivations) || !isRecord(session.pending) || !isRecord(session.resolved)) {
    throw new Error('Sessão Neko Mane King inválida.');
  }
  for (const key of Object.keys(session.seenEvents)) {
    if (!safeKey(key) || session.seenEvents[key] !== true) throw new Error('Registro de evento inválido.');
  }
  for (const key of Object.keys(session.usedActivations)) {
    if (!safeKey(key) || session.usedActivations[key] !== true) throw new Error('Registro de ativação inválido.');
  }
  for (const [key, trigger] of Object.entries(session.pending)) {
    if (!safeKey(key) || !trigger || trigger.activationId !== key || trigger.operation !== 'become-end-phase' ||
        trigger.mandatory !== true || !session.usedActivations[key] || !session.seenEvents[trigger.eventId] ||
        Object.prototype.hasOwnProperty.call(session.resolved, key)) {
      throw new Error('Gatilho pendente inválido.');
    }
  }
  for (const [key, resolution] of Object.entries(session.resolved)) {
    if (!safeKey(key) || !resolution || resolution.activationId !== key || resolution.turnAdvances !== false ||
        !session.usedActivations[key] || !['negated', 'end-phase', 'already-end-phase'].includes(resolution.status)) {
      throw new Error('Resolução armazenada inválida.');
    }
  }
}

export function createNekoManeKingSession(): NekoManeKingSession {
  return { version: 1, seenEvents: {}, usedActivations: {}, pending: {}, resolved: {} };
}

/** Capture only after the sending chain has fully resolved; the mandatory trigger starts a new chain. */
export function captureNekoManeKingEvent(
  input: NekoManeKingSession,
  event: NekoManeKingSendEvent,
): { session: NekoManeKingSession; trigger: NekoManeKingTrigger | null } {
  assertNekoManeKingSession(input);
  assertEvent(event);
  if (Object.prototype.hasOwnProperty.call(input.seenEvents, event.eventId)) {
    throw new Error('Evento Neko Mane King duplicado.');
  }
  if (!event.chainResolved) return { session: structuredClone(input), trigger: null };
  const session = structuredClone(input);
  session.seenEvents[event.eventId] = true;
  const eligible = event.cardId === NEKO_MANE_KING_ID && event.toZone === 'grave' &&
    event.fromZone !== 'grave' && event.cause === 'card-effect' &&
    event.turnTeam === otherTeam(event.possessorTeam) &&
    event.effectControllerTeam === otherTeam(event.possessorTeam) &&
    (event.sourceControllerTeam === undefined || event.sourceControllerTeam === event.possessorTeam);
  if (!eligible) return { session, trigger: null };
  if (Object.prototype.hasOwnProperty.call(session.usedActivations, event.activationId)) {
    throw new Error('ID de ativação Neko Mane King reutilizado.');
  }
  const trigger: NekoManeKingTrigger = {
    activationId: event.activationId,
    eventId: event.eventId,
    cardId: NEKO_MANE_KING_ID,
    sourceUid: event.sourceUid,
    ownerSeat: event.ownerSeat,
    ownerTeam: (event.ownerSeat % 2) as TagTeam,
    possessorTeam: event.possessorTeam,
    effectControllerTeam: event.effectControllerTeam,
    turnTeam: event.turnTeam,
    turnSeat: event.turnSeat,
    turnNumber: event.turnNumber,
    capturedPhase: event.phase,
    mandatory: true,
    operation: 'become-end-phase',
  };
  session.usedActivations[event.activationId] = true;
  session.pending[event.activationId] = trigger;
  assertNekoManeKingSession(session);
  return { session, trigger: structuredClone(trigger) };
}

/** Resolving this effect changes the current turn to End Phase; End Phase rules still execute. */
export function resolveNekoManeKingTrigger(
  input: NekoManeKingSession,
  activationId: string,
  context: NekoManeKingResolveContext,
): { session: NekoManeKingSession; resolution: NekoManeKingResolution } {
  assertNekoManeKingSession(input);
  if (!safeKey(activationId) || !context || !Number.isSafeInteger(context.turnNumber) ||
      context.turnNumber < 1 || !isSeat(context.turnSeat) || !phases.has(context.phase) ||
      (context.negated !== undefined && typeof context.negated !== 'boolean')) {
    throw new Error('Contexto de resolução Neko Mane King inválido.');
  }
  const cached = input.resolved[activationId];
  if (cached) return { session: structuredClone(input), resolution: structuredClone(cached) };
  const trigger = input.pending[activationId];
  if (!trigger) throw new Error('Não existe gatilho Neko Mane King pendente.');
  if (context.turnNumber !== trigger.turnNumber || context.turnSeat !== trigger.turnSeat) {
    throw new Error('O turno/assento mudou antes da resolução Neko Mane King.');
  }
  const negated = context.negated === true;
  const phaseChanged = !negated && context.phase !== 'end';
  const resolution: NekoManeKingResolution = {
    activationId,
    sourceUid: trigger.sourceUid,
    ownerSeat: trigger.ownerSeat,
    ownerTeam: trigger.ownerTeam,
    possessorTeam: trigger.possessorTeam,
    turnNumber: trigger.turnNumber,
    turnSeat: trigger.turnSeat,
    status: negated ? 'negated' : phaseChanged ? 'end-phase' : 'already-end-phase',
    nextPhase: negated ? null : 'end',
    phaseChanged,
    turnAdvances: false,
    mustRunEndPhaseProcedures: !negated,
  };
  const session = structuredClone(input);
  delete session.pending[activationId];
  session.resolved[activationId] = resolution;
  assertNekoManeKingSession(session);
  return { session, resolution: structuredClone(resolution) };
}
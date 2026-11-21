import type { TagRecord } from './tagStore';

export type TagInviteRules = NonNullable<TagRecord['rules']>;

const supportedRules = new Set<TagInviteRules>([
  'classic-loan',
  'classic-owned',
  'normal'
]);

export interface TagInviteInput {
  hostId: string;
  partnerId: string;
  opponent1Id: string;
  opponent2Id: string;
  rules?: string | null;
}

export interface TagInvite {
  /** Seat order is intentionally alternating: host/partner versus opponent1/opponent2. */
  members: [string, string, string, string];
  rules: TagInviteRules;
}

/**
 * Converts the Discord /dupla convidar fields into physical TagDuel seats.
 * Team assignment is based on index parity in tagStore, so the partner must
 * occupy seat 2 while the first opponent occupies seat 1.
 */
export function buildTagInvite(input: TagInviteInput): TagInvite {
  const members = [input.hostId, input.opponent1Id, input.partnerId, input.opponent2Id];
  if (members.some(id => typeof id !== 'string' || id.trim().length === 0)) {
    throw new Error('Convide quatro jogadores diferentes.');
  }
  if (new Set(members).size !== 4) {
    throw new Error('Convide quatro jogadores diferentes.');
  }

  const selected = input.rules?.trim() || 'classic-loan';
  if (!supportedRules.has(selected as TagInviteRules)) {
    throw new Error('Modo de cartas 2v2 inválido.');
  }

  return {
    members: members as [string, string, string, string],
    rules: selected as TagInviteRules
  };
}

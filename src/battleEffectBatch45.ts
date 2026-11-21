import type {MonsterDefinition} from './monsterEffects';

/**
 * Supplemental, not-yet-admitted definitions for the next historical batch.
 * The central monster registry must import this map after the reserved M61
 * handoff; keeping it separate prevents edits to that shared registry.
 */
export const battleEffectMonsters45: Readonly<Record<string, MonsterDefinition>> = Object.freeze({
  // Amazoness Swords Woman — battle damage her controller would take is
  // assigned to the opposing team instead.
  '94004268': {
    effect: {
      trigger: 'continuous',
      operation: {
        kind: 'continuous',
        rules: [{
          kind: 'combat',
          filter: { selfOnly: true },
          rule: { kind: 'redirectControllerDamage' },
        }],
      },
    },
    activation: { policy: 'continuous', window: 'continuous' },
  },

  // Atomic Firefly — mandatory 1000 damage when battle-destroyed and sent
  // to the Graveyard. The existing onBattleDestroyed/burn resolver is reused.
  '87340664': {
    effect: {
      trigger: 'onBattleDestroyed',
      operation: { kind: 'burn', amount: 1000 },
    },
    activation: { policy: 'mandatory', window: 'battleDestroyed' },
  },
});

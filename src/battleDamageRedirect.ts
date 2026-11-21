/**
 * Apply continuous effects that redirect battle damage their controller would
 * otherwise receive to the opposing team. Inputs are the post-protection and
 * post-damage-modifier totals, so prevention and doubling resolve first.
 *
 * Both decisions use the original damage snapshot. If both teams have a
 * redirection effect, damage cannot bounce back a second time.
 */
export type BattleTeam = 0 | 1;
export type BattleDamagePair = readonly [number, number];

export function redirectControllerBattleDamage(
  damage: BattleDamagePair,
  attackerTeam: BattleTeam,
  attackerRedirects: boolean,
  defenderRedirects: boolean,
): [number, number] {
  if (!Array.isArray(damage) || damage.length !== 2 ||
      damage.some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError('Battle damage must contain two non-negative safe integers.');
  }
  if (attackerTeam !== 0 && attackerTeam !== 1) {
    throw new RangeError('Attacking team must be 0 or 1.');
  }
  if (typeof attackerRedirects !== 'boolean' || typeof defenderRedirects !== 'boolean') {
    throw new TypeError('Battle damage redirection flags must be booleans.');
  }

  const defenderTeam: BattleTeam = attackerTeam === 0 ? 1 : 0;
  const original: [number, number] = [damage[0], damage[1]];
  const result: [number, number] = [...original];

  if (attackerRedirects && original[attackerTeam] > 0) {
    result[attackerTeam] -= original[attackerTeam];
    result[defenderTeam] += original[attackerTeam];
  }
  if (defenderRedirects && original[defenderTeam] > 0) {
    result[defenderTeam] -= original[defenderTeam];
    result[attackerTeam] += original[defenderTeam];
  }

  return result;
}

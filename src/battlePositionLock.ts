export interface BattlePositionState {
  faceUp: boolean;
  position: 'atk' | 'def';
  positionLockedThrough?: number;
}

/** A position lock remains active through the recorded turn, including that
 * turn's End Phase. The next turn is free to change the monster again.
 */
export function canChangeBattlePosition(monster: BattlePositionState, turn: number): boolean {
  if (!monster || typeof monster !== 'object') throw new TypeError('Battle position target is required.');
  if (!Number.isSafeInteger(turn) || turn < 1) throw new RangeError('Battle position turn is invalid.');
  const lockedThrough = monster.positionLockedThrough;
  if (lockedThrough !== undefined && (!Number.isSafeInteger(lockedThrough) || lockedThrough < 0)) {
    throw new RangeError('Battle position lock turn is invalid.');
  }
  return lockedThrough === undefined || lockedThrough < turn;
}

/** Apply Aqua Spirit's selected face-up position change and lock that target
 * through the current turn. This does not choose the target or team; the
 * effect resolver must supply a face-up opponent monster from the shared field.
 */
export function applyAquaSpiritPositionChange(
  monster: BattlePositionState,
  turn: number,
  nextPosition: 'atk' | 'def',
): boolean {
  if (!canChangeBattlePosition(monster, turn)) return false;
  if (!monster.faceUp || (nextPosition !== 'atk' && nextPosition !== 'def') ||
      monster.position === nextPosition) return false;
  monster.position = nextPosition;
  monster.positionLockedThrough = Math.max(monster.positionLockedThrough ?? 0, turn);
  return true;
}

/**
 * Pure Eternal Grind XP/level rules.
 *
 * This module is used by the live Eternal Grind XP award path on the
 * integration branch. It captures the existing XP threshold formula so the
 * rules can be tested independently of the dungeon loop.
 */
export function xpThreshold(level, classCount = 1) {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError('level must be a positive integer');
  }
  if (!Number.isInteger(classCount) || classCount < 1 || classCount > 3) {
    throw new RangeError('classCount must be an integer from 1 to 3');
  }
  return Math.round(60 * Math.pow(level, 1.45) * (1 + 0.15 * (classCount - 1)));
}

/**
 * Apply an XP award using the existing threshold curve.
 * Returns a new result and never mutates the supplied character-like object.
 * maxLevel defaults to Infinity to match the current uncapped dungeon loop.
 */
export function advanceExperience({ level, xp }, awardedXp, classCount = 1, maxLevel = Infinity) {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError('level must be a positive integer');
  }
  if (!Number.isFinite(xp) || xp < 0) {
    throw new RangeError('xp must be a finite non-negative number');
  }
  if (!Number.isFinite(awardedXp) || awardedXp < 0) {
    throw new RangeError('awardedXp must be a finite non-negative number');
  }
  if (!(maxLevel === Infinity || (Number.isInteger(maxLevel) && maxLevel >= level))) {
    throw new RangeError('maxLevel must be Infinity or an integer at least level');
  }
  // Validate class count even when the award is zero.
  xpThreshold(level, classCount);

  let nextLevel = level;
  let remainingXp = xp + awardedXp;
  const levelsGained = [];
  while (nextLevel < maxLevel) {
    const need = xpThreshold(nextLevel, classCount);
    if (remainingXp < need) break;
    remainingXp -= need;
    nextLevel += 1;
    levelsGained.push(nextLevel);
  }
  return { level: nextLevel, xp: remainingXp, levelsGained };
}

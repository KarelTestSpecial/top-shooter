import {
  BossEntity,
  GameplaySettings,
  GateOp,
  StageWaveEvent,
  UpgradeLevels,
  WeaponTier,
} from './types';

export const ABSOLUTE_MAX_CAP = 1250;

/**
 * Wereldwijde vijand-druk. De speler groeide vroeger sneller dan de
 * vijand-aantallen, waardoor golven wegsmolten voor ze de speler bereikten.
 * Deze factor zet de basisgolven omhoog; settings.enemyCountMult blijft
 * daar bovenop werken zodat de speler zelf kan bijstellen.
 */
const ENEMY_PRESSURE_FACTOR = 1.3;

export const STAGE_LENGTH_PRESETS: Array<{ factor: number; label: string; shortLabel: string }> = [
  { factor: 1, label: 'Standaard', shortLabel: '1×' },
  { factor: 2, label: 'Lang', shortLabel: '2×' },
  { factor: 3.5, label: 'Marathon', shortLabel: '3,5×' },
  { factor: 6, label: 'Ultra', shortLabel: '6×' },
];

export function getStageLengthMetrics(factor: number) {
  const clamped = Math.max(1, Math.min(6, Math.round(factor * 2) / 2));
  const extraBlocks = Math.max(1, Math.round(1 + (clamped - 1) * 2.2));
  const units = 190 + extraBlocks * 95;
  const goldMult = 1 + (clamped - 1) * 0.34;
  const bossHpMult = 1 + (clamped - 1) * 0.28;
  return { factor: clamped, extraBlocks, units, goldMult, bossHpMult };
}

export const DEFAULT_GAMEPLAY_SETTINGS: GameplaySettings = {
  stageLengthFactor: 1,
  gameSpeed: 1.0,
  enemyHpMult: 1.3,
  enemyCountMult: 1.35,
  enemyMaxGroupSize: 140,
  goldMult: 1.0,
  startWeapon: 'RIFLE',
  startShield: 0,
  startDrones: 0,
  biomeChoice: 'AUTO',
  maxSquadCap: 300,
  purpleGateFreq: 15,
  purpleDoubleChance: 15,
  purpleGateMin: 75,
  purpleGateMax: 300,
  miniBossMult: 1.4,
  bossMult: 1.5,
};

export function getStartSquadCount(upgrades: UpgradeLevels): number {
  return 6 + upgrades.startSquad * 2;
}

export function getNextStartSquadGain(_level: number): number {
  return 2;
}

export function getFirepowerMultiplier(upgrades: UpgradeLevels): number {
  return 1 + upgrades.firepower * 0.18;
}

export function getFireRateMultiplier(upgrades: UpgradeLevels): number {
  return 1 + upgrades.fireRate * 0.12;
}

export function getGoldMultiplier(upgrades: UpgradeLevels): number {
  return 1 + upgrades.goldBonus * 0.2;
}

export function getUpgradeCost(key: keyof UpgradeLevels, level: number): number {
  const base =
    key === 'startSquad' ? 40 : key === 'firepower' ? 50 : key === 'fireRate' ? 45 : 55;
  return Math.round(base * Math.pow(1.42, level));
}

export interface GateSpec {
  op: GateOp;
  value: number;
  shootable: boolean;
  shotsPerStep: number;
  moveAmp?: number;
}

export interface BarrelSpec {
  x: number;
  hp: number;
  kind: 'WOOD' | 'STEEL' | 'WEAPON_CRATE' | 'SQUAD_CRATE' | 'SHIELD_CRATE' | 'DRONE_CRATE' | 'TNT_BARREL';
  weaponTier?: WeaponTier;
  squadBonus?: number;
  goldAmount?: number;
}

export interface BarrierSpec {
  x: number;
  width: number;
  hp: number;
  damage: number;
}

export interface EnemySpec {
  x: number;
  count: number;
  hpPerUnit: number;
  kind: 'RAIDER' | 'BRUTE' | 'RUSHER' | 'TURRET' | 'BOMBER';
  speed?: number;
}

function pseudoRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function roundTo25(n: number): number {
  return Math.min(ABSOLUTE_MAX_CAP, Math.max(50, Math.round(n / 25) * 25));
}

export function getPurpleGateRange(
  stage: number,
  progress: number,
  settings: GameplaySettings,
): { min: number; max: number } {
  const clampedStage = Math.max(1, stage);
  const clampedProgress = Math.max(0, Math.min(1, progress));

  const stageFactor =
    clampedStage <= 8
      ? 0.45 + ((clampedStage - 1) / 7) * 0.55
      : Math.min(2.0, 1 + (clampedStage - 8) * 0.1);

  const progressFactor = 0.45 + 0.55 * clampedProgress;
  const effectiveScale = stageFactor * progressFactor;

  const configuredMin = Math.min(settings.purpleGateMin, settings.purpleGateMax, ABSOLUTE_MAX_CAP);
  const configuredMax = Math.min(ABSOLUTE_MAX_CAP, Math.max(configuredMin, settings.purpleGateMax));

  const localMax = Math.min(ABSOLUTE_MAX_CAP, Math.max(50, roundTo25(configuredMax * effectiveScale)));
  const localMin = Math.max(50, Math.min(localMax, roundTo25(configuredMin * (0.5 + 0.5 * effectiveScale))));

  return { min: localMin, max: localMax };
}

type HordeRole = 'SCOUT' | 'STANDARD' | 'ELITE' | 'SWARM';

function computeEnemyCount(
  baseCount: number,
  atDistance: number,
  totalUnits: number,
  stage: number,
  seedIndex: number,
  role: HordeRole,
  settings: GameplaySettings,
  isEliteHeavy = false,
): number {
  const progress = totalUnits > 0 ? Math.max(0, Math.min(1, atDistance / totalUnits)) : 0;
  const levelScale = Math.pow(1.26, Math.min(stage - 1, 14));
  const roadScale = 0.45 + 0.95 * progress;

  const roll = pseudoRand(stage * 167 + seedIndex * 53 + Math.round(atDistance) * 11);
  const roleRanges: Record<HordeRole, [number, number]> = {
    SCOUT: [0.4, 0.75],
    STANDARD: [0.72, 1.28],
    ELITE: [0.58, 1.08],
    SWARM: [1.15, 1.9],
  };
  const [minVar, maxVar] = roleRanges[role];
  const varietyMult = minVar + (maxVar - minVar) * roll;

  const raw =
    baseCount * ENEMY_PRESSURE_FACTOR * levelScale * roadScale * settings.enemyCountMult * varietyMult;
  const maxCap = isEliteHeavy
    ? Math.max(1, Math.min(settings.enemyMaxGroupSize, Math.round(settings.enemyMaxGroupSize * 0.35)))
    : settings.enemyMaxGroupSize;
  return Math.max(1, Math.min(maxCap, Math.round(raw)));
}

function maybeAppendPurpleGate(
  events: StageWaveEvent[],
  atDistance: number,
  totalUnits: number,
  stage: number,
  slotCounter: { next: number; lastPurpleAt: number },
  slideAmp: number,
  settings: GameplaySettings,
) {
  const slotIndex = slotCounter.next++;
  if (settings.purpleGateFreq <= 0) return;
  if (atDistance - slotCounter.lastPurpleAt < 68) return;

  const freqRoll = pseudoRand(stage * 97 + slotIndex * 31 + 3);
  if (freqRoll >= settings.purpleGateFreq / 100) return;

  slotCounter.lastPurpleAt = atDistance;

  const progress = totalUnits > 0 ? Math.max(0, Math.min(1, atDistance / totalUnits)) : 0;
  const { min: minCap, max: maxCap } = getPurpleGateRange(stage, progress, settings);
  const span = maxCap - minCap;

  const doubleRoll = pseudoRand(stage * 131 + slotIndex * 47 + 11);
  const isDouble = doubleRoll < settings.purpleDoubleChance / 100;
  const valRollA = pseudoRand(stage * 53 + slotIndex * 19 + 5);
  const valRollB = pseudoRand(stage * 71 + slotIndex * 23 + 7);
  const laneRoll = pseudoRand(stage * 89 + slotIndex * 41 + 13);

  if (isDouble) {
    const lowVal = roundTo25(minCap + span * 0.35 * valRollA);
    let highVal = roundTo25(minCap + span * (0.55 + 0.45 * valRollB));
    if (maxCap - minCap >= 25 && highVal <= lowVal) {
      highVal = Math.min(maxCap, lowVal + 25);
    }
    const lowGate: GateSpec = { op: 'CAP_SET', value: lowVal, shootable: false, shotsPerStep: 8 };
    const highGate: GateSpec = {
      op: 'CAP_SET',
      value: Math.max(lowVal, highVal),
      shootable: false,
      shotsPerStep: 8,
      moveAmp: slideAmp * 0.4,
    };
    const highOnLeft = laneRoll >= 0.5;
    events.push({
      atDistance,
      type: 'GATE_PAIR',
      payload: highOnLeft ? { left: highGate, right: lowGate } : { left: lowGate, right: highGate },
    });
  } else {
    const lanes = [-0.52, 0.0, 0.52];
    const laneX = lanes[Math.floor(laneRoll * lanes.length) % lanes.length];
    const rawVal = slotIndex % 2 === 0 ? minCap + span * (0.55 + 0.45 * valRollA) : minCap + span * 0.45 * valRollA;
    const capVal = roundTo25(rawVal);
    events.push({
      atDistance,
      type: 'GATE_SINGLE',
      payload: {
        x: laneX,
        width: 0.62,
        gate: {
          op: 'CAP_SET',
          value: capVal,
          shootable: false,
          shotsPerStep: 8,
          moveAmp: laneX === 0 ? slideAmp * 0.35 : 0,
        } satisfies GateSpec,
      },
    });
  }
}

function appendMiddleBlock(
  events: StageWaveEvent[],
  offset: number,
  totalUnits: number,
  stage: number,
  hpScale: number,
  slideAmp: number,
  blockIndex: number,
  settings: GameplaySettings,
  slotCounter: { next: number; lastPurpleAt: number },
) {
  const flip = (blockIndex + stage) % 2 === 1;
  const pattern = (stage + blockIndex * 3) % 4;
  const s = hpScale * (1 + blockIndex * 0.18);
  const dmgBase = Math.max(2, Math.round((6 + stage * 1.2) * Math.sqrt(settings.enemyHpMult)));
  const weaponChoices: WeaponTier[] = ['SPREAD', 'ROCKET', 'LASER'];
  const crateWeapon = weaponChoices[(stage + blockIndex) % weaponChoices.length];

  if (pattern === 0) {
    // Pattern 0: Hinderlaag, Bombers & Vaten-Keten
    events.push({
      atDistance: offset + 4,
      type: 'BARRELS',
      payload: [
        { x: -0.54, hp: Math.round(52 * s), kind: 'SQUAD_CRATE', squadBonus: 6 + stage * 2 },
        { x: 0.0, hp: Math.round(64 * s), kind: 'WEAPON_CRATE', weaponTier: crateWeapon },
        { x: 0.54, hp: Math.round(52 * s), kind: 'SHIELD_CRATE' },
      ] satisfies BarrelSpec[],
    });

    events.push({
      atDistance: offset + 13,
      type: 'ENEMIES',
      payload: [
        {
          x: flip ? -0.48 : 0.48,
          count: computeEnemyCount(6, offset + 13, totalUnits, stage, blockIndex * 10 + 1, 'SCOUT', settings),
          hpPerUnit: Math.round(4.8 * s),
          kind: 'RUSHER',
          speed: 0.45,
        },
        {
          x: 0.0,
          count: computeEnemyCount(4, offset + 13, totalUnits, stage, blockIndex * 10 + 19, 'SCOUT', settings),
          hpPerUnit: Math.round(6.5 * s),
          kind: 'BOMBER',
          speed: 0.36,
        },
        {
          x: flip ? 0.48 : -0.48,
          count: computeEnemyCount(10, offset + 13, totalUnits, stage, blockIndex * 10 + 2, 'STANDARD', settings),
          hpPerUnit: Math.round(6.0 * s),
          kind: 'RAIDER',
        },
      ] satisfies EnemySpec[],
    });

    events.push({
      atDistance: offset + 22,
      type: 'BARRIER',
      payload: [{ x: flip ? -0.42 : 0.42, width: 0.94, hp: Math.round(145 * s), damage: dmgBase }] satisfies BarrierSpec[],
    });

    maybeAppendPurpleGate(events, offset + 29, totalUnits, stage, slotCounter, slideAmp, settings);

    events.push({
      atDistance: offset + 35,
      type: 'GATE_TRIO',
      payload: {
        left: { op: 'RATE_UP', value: 22, shootable: false, shotsPerStep: 10 } satisfies GateSpec,
        center: { op: 'ADD', value: 8 + stage * 2, shootable: false, shotsPerStep: 10, moveAmp: slideAmp * 0.65 } satisfies GateSpec,
        right: { op: 'ADD', value: -10, shootable: true, shotsPerStep: Math.max(4, Math.round(4.5 * s * 0.5)), moveAmp: slideAmp * 0.4 } satisfies GateSpec,
      },
    });

    events.push({
      atDistance: offset + 47,
      type: 'ENEMIES',
      payload: [
        {
          x: -0.44,
          count: computeEnemyCount(15, offset + 47, totalUnits, stage, blockIndex * 10 + 3, 'SWARM', settings),
          hpPerUnit: Math.round(5.8 * s),
          kind: 'RAIDER',
        },
        {
          x: 0.44,
          count: computeEnemyCount(4, offset + 47, totalUnits, stage, blockIndex * 10 + 4, 'ELITE', settings, true),
          hpPerUnit: Math.round(19 * s),
          kind: 'BRUTE',
        },
      ] satisfies EnemySpec[],
    });
    events.push({
      atDistance: offset + 48,
      type: 'BARRELS',
      payload: [
        { x: 0.0, hp: Math.round(28 * s), kind: 'TNT_BARREL' },
        { x: 0.28, hp: Math.round(32 * s), kind: 'TNT_BARREL' },
      ] satisfies BarrelSpec[],
    });

    events.push({
      atDistance: offset + 60,
      type: 'BARRELS',
      payload: [
        { x: -0.55, hp: Math.round(58 * s), kind: 'WOOD', goldAmount: 30 },
        { x: 0.0, hp: Math.round(62 * s), kind: 'DRONE_CRATE' },
        { x: 0.55, hp: Math.round(68 * s), kind: 'STEEL', goldAmount: 42 },
      ] satisfies BarrelSpec[],
    });

    maybeAppendPurpleGate(events, offset + 69, totalUnits, stage, slotCounter, slideAmp, settings);

    events.push({
      atDistance: offset + 76,
      type: 'ENEMIES',
      payload: [
        {
          x: -0.44,
          count: computeEnemyCount(14, offset + 76, totalUnits, stage, blockIndex * 10 + 24, 'SWARM', settings),
          hpPerUnit: Math.round(5.6 * s),
          kind: 'RAIDER',
        },
        {
          x: 0.44,
          count: computeEnemyCount(4, offset + 76, totalUnits, stage, blockIndex * 10 + 25, 'ELITE', settings, true),
          hpPerUnit: Math.round(21 * s),
          kind: 'BRUTE',
        },
      ] satisfies EnemySpec[],
    });
  } else if (pattern === 1) {
    // Pattern 1: Pantser-Colonne & Spervuur
    events.push({
      atDistance: offset + 5,
      type: 'GATE_PAIR',
      payload: {
        left: { op: 'ADD', value: -9, shootable: true, shotsPerStep: Math.max(4, Math.round(4.2 * s * 0.55)), moveAmp: slideAmp * 0.4 } satisfies GateSpec,
        right: { op: 'ADD', value: 7 + stage * 2, shootable: false, shotsPerStep: 10, moveAmp: slideAmp * 0.5 } satisfies GateSpec,
      },
    });

    events.push({
      atDistance: offset + 16,
      type: 'ENEMIES',
      payload: [
        {
          x: -0.5,
          count: computeEnemyCount(2, offset + 16, totalUnits, stage, blockIndex * 10 + 5, 'ELITE', settings, true),
          hpPerUnit: Math.round(24 * s),
          kind: 'TURRET',
          speed: 0.16,
        },
        {
          x: 0.0,
          count: computeEnemyCount(4, offset + 16, totalUnits, stage, blockIndex * 10 + 6, 'ELITE', settings, true),
          hpPerUnit: Math.round(19 * s),
          kind: 'BRUTE',
        },
        {
          x: 0.5,
          count: computeEnemyCount(2, offset + 16, totalUnits, stage, blockIndex * 10 + 7, 'ELITE', settings, true),
          hpPerUnit: Math.round(24 * s),
          kind: 'TURRET',
          speed: 0.16,
        },
      ] satisfies EnemySpec[],
    });

    maybeAppendPurpleGate(events, offset + 28, totalUnits, stage, slotCounter, slideAmp, settings);

    events.push({
      atDistance: offset + 35,
      type: 'BARRELS',
      payload: [
        { x: -0.52, hp: Math.round(56 * s), kind: 'DRONE_CRATE' },
        { x: 0.0, hp: Math.round(68 * s), kind: 'WEAPON_CRATE', weaponTier: crateWeapon },
        { x: 0.52, hp: Math.round(54 * s), kind: 'SQUAD_CRATE', squadBonus: 7 + stage * 2 },
      ] satisfies BarrelSpec[],
    });

    events.push({
      atDistance: offset + 46,
      type: 'BARRIER',
      payload: [
        { x: -0.45, width: 0.82, hp: Math.round(140 * s), damage: dmgBase },
        { x: 0.45, width: 0.82, hp: Math.round(140 * s), damage: dmgBase },
      ] satisfies BarrierSpec[],
    });

    events.push({
      atDistance: offset + 56,
      type: 'ENEMIES',
      payload: [
        {
          x: flip ? 0.36 : -0.36,
          count: computeEnemyCount(17, offset + 56, totalUnits, stage, blockIndex * 10 + 8, 'SWARM', settings),
          hpPerUnit: Math.round(5.4 * s),
          kind: 'RUSHER',
          speed: 0.44,
        },
        {
          x: flip ? -0.44 : 0.44,
          count: computeEnemyCount(5, offset + 56, totalUnits, stage, blockIndex * 10 + 21, 'SCOUT', settings),
          hpPerUnit: Math.round(6.8 * s),
          kind: 'BOMBER',
          speed: 0.37,
        },
      ] satisfies EnemySpec[],
    });
    events.push({
      atDistance: offset + 58,
      type: 'BARRELS',
      payload: [{ x: flip ? -0.15 : 0.15, hp: Math.round(28 * s), kind: 'TNT_BARREL' }] satisfies BarrelSpec[],
    });

    maybeAppendPurpleGate(events, offset + 70, totalUnits, stage, slotCounter, slideAmp, settings);

    events.push({
      atDistance: offset + 76,
      type: 'ENEMIES',
      payload: [
        {
          x: -0.42,
          count: computeEnemyCount(13, offset + 76, totalUnits, stage, blockIndex * 10 + 26, 'SWARM', settings),
          hpPerUnit: Math.round(5.8 * s),
          kind: 'RUSHER',
          speed: 0.44,
        },
        {
          x: 0.42,
          count: computeEnemyCount(4, offset + 76, totalUnits, stage, blockIndex * 10 + 27, 'ELITE', settings, true),
          hpPerUnit: Math.round(20 * s),
          kind: 'BRUTE',
        },
      ] satisfies EnemySpec[],
    });
  } else if (pattern === 2) {
    // Pattern 2: Spervuur-Brug & Zwerm
    events.push({
      atDistance: offset + 5,
      type: 'BARRIER',
      payload: [{ x: 0.0, width: 1.08, hp: Math.round(165 * s), damage: dmgBase }] satisfies BarrierSpec[],
    });
    events.push({
      atDistance: offset + 7,
      type: 'BARRELS',
      payload: [
        { x: -0.62, hp: Math.round(48 * s), kind: 'SHIELD_CRATE' },
        { x: 0.62, hp: Math.round(48 * s), kind: 'SQUAD_CRATE', squadBonus: 7 + stage * 2 },
      ] satisfies BarrelSpec[],
    });

    events.push({
      atDistance: offset + 18,
      type: 'ENEMIES',
      payload: [
        {
          x: -0.45,
          count: computeEnemyCount(12, offset + 18, totalUnits, stage, blockIndex * 10 + 9, 'STANDARD', settings),
          hpPerUnit: Math.round(6.0 * s),
          kind: 'RAIDER',
        },
        {
          x: 0.45,
          count: computeEnemyCount(12, offset + 18, totalUnits, stage, blockIndex * 10 + 10, 'STANDARD', settings),
          hpPerUnit: Math.round(6.0 * s),
          kind: 'RAIDER',
        },
      ] satisfies EnemySpec[],
    });
    events.push({
      atDistance: offset + 19,
      type: 'BARRELS',
      payload: [{ x: 0.0, hp: Math.round(28 * s), kind: 'TNT_BARREL' }] satisfies BarrelSpec[],
    });

    maybeAppendPurpleGate(events, offset + 29, totalUnits, stage, slotCounter, slideAmp, settings);

    events.push({
      atDistance: offset + 37,
      type: 'ENEMIES',
      payload: [
        {
          x: 0.0,
          count: computeEnemyCount(16, offset + 37, totalUnits, stage, blockIndex * 10 + 28, 'SWARM', settings),
          hpPerUnit: Math.round(5.6 * s),
          kind: 'RAIDER',
        },
        {
          x: -0.46,
          count: computeEnemyCount(4, offset + 37, totalUnits, stage, blockIndex * 10 + 29, 'ELITE', settings, true),
          hpPerUnit: Math.round(21 * s),
          kind: 'BRUTE',
        },
      ] satisfies EnemySpec[],
    });

    events.push({
      atDistance: offset + 48,
      type: 'BARRELS',
      payload: [
        { x: -0.54, hp: Math.round(62 * s), kind: 'STEEL', goldAmount: 42 },
        { x: 0.0, hp: Math.round(66 * s), kind: 'WEAPON_CRATE', weaponTier: crateWeapon },
        { x: 0.54, hp: Math.round(58 * s), kind: 'WOOD', goldAmount: 32 },
      ] satisfies BarrelSpec[],
    });

    events.push({
      atDistance: offset + 59,
      type: 'ENEMIES',
      payload: [
        {
          x: -0.48,
          count: computeEnemyCount(8, offset + 59, totalUnits, stage, blockIndex * 10 + 11, 'SCOUT', settings),
          hpPerUnit: Math.round(4.8 * s),
          kind: 'RUSHER',
          speed: 0.45,
        },
        {
          x: 0.0,
          count: computeEnemyCount(16, offset + 59, totalUnits, stage, blockIndex * 10 + 12, 'SWARM', settings),
          hpPerUnit: Math.round(6.2 * s),
          kind: 'RAIDER',
        },
        {
          x: 0.48,
          count: computeEnemyCount(2, offset + 59, totalUnits, stage, blockIndex * 10 + 13, 'ELITE', settings, true),
          hpPerUnit: Math.round(24 * s),
          kind: 'TURRET',
          speed: 0.16,
        },
      ] satisfies EnemySpec[],
    });

    maybeAppendPurpleGate(events, offset + 69, totalUnits, stage, slotCounter, slideAmp, settings);

    events.push({
      atDistance: offset + 76,
      type: 'GATE_PAIR',
      payload: {
        left: { op: 'ADD', value: 11 + stage * 2, shootable: false, shotsPerStep: 10, moveAmp: slideAmp * 0.45 } satisfies GateSpec,
        right: { op: 'DMG_UP', value: 28, shootable: false, shotsPerStep: 12 } satisfies GateSpec,
      },
    });
  } else {
    // Pattern 3: Goudkoorts & Bomber-Overval
    events.push({
      atDistance: offset + 5,
      type: 'ENEMIES',
      payload: [
        {
          x: -0.35,
          count: computeEnemyCount(7, offset + 5, totalUnits, stage, blockIndex * 10 + 14, 'SCOUT', settings),
          hpPerUnit: Math.round(4.8 * s),
          kind: 'RUSHER',
          speed: 0.44,
        },
        {
          x: 0.35,
          count: computeEnemyCount(4, offset + 5, totalUnits, stage, blockIndex * 10 + 23, 'SCOUT', settings),
          hpPerUnit: Math.round(6.5 * s),
          kind: 'BOMBER',
          speed: 0.37,
        },
      ] satisfies EnemySpec[],
    });

    events.push({
      atDistance: offset + 14,
      type: 'BARRELS',
      payload: [
        { x: -0.58, hp: Math.round(56 * s), kind: 'WOOD', goldAmount: 32 },
        { x: -0.2, hp: Math.round(56 * s), kind: 'SQUAD_CRATE', squadBonus: 8 + stage * 2 },
        { x: 0.2, hp: Math.round(64 * s), kind: 'STEEL', goldAmount: 46 },
        { x: 0.58, hp: Math.round(56 * s), kind: 'DRONE_CRATE' },
      ] satisfies BarrelSpec[],
    });

    maybeAppendPurpleGate(events, offset + 28, totalUnits, stage, slotCounter, slideAmp, settings);

    events.push({
      atDistance: offset + 34,
      type: 'BARRIER',
      payload: [{ x: flip ? 0.44 : -0.44, width: 0.96, hp: Math.round(150 * s), damage: dmgBase }] satisfies BarrierSpec[],
    });
    events.push({
      atDistance: offset + 44,
      type: 'ENEMIES',
      payload: [
        {
          x: -0.45,
          count: computeEnemyCount(15, offset + 44, totalUnits, stage, blockIndex * 10 + 30, 'SWARM', settings),
          hpPerUnit: Math.round(5.6 * s),
          kind: 'RAIDER',
        },
        {
          x: 0.45,
          count: computeEnemyCount(4, offset + 44, totalUnits, stage, blockIndex * 10 + 31, 'ELITE', settings, true),
          hpPerUnit: Math.round(22 * s),
          kind: 'TURRET',
          speed: 0.17,
        },
      ] satisfies EnemySpec[],
    });

    events.push({
      atDistance: offset + 55,
      type: 'ENEMIES',
      payload: [
        {
          x: flip ? -0.45 : 0.45,
          count: computeEnemyCount(18, offset + 55, totalUnits, stage, blockIndex * 10 + 15, 'SWARM', settings),
          hpPerUnit: Math.round(6.0 * s),
          kind: 'RAIDER',
        },
        {
          x: flip ? 0.45 : -0.45,
          count: computeEnemyCount(4, offset + 55, totalUnits, stage, blockIndex * 10 + 16, 'ELITE', settings, true),
          hpPerUnit: Math.round(20 * s),
          kind: 'BRUTE',
        },
      ] satisfies EnemySpec[],
    });
    events.push({
      atDistance: offset + 56,
      type: 'BARRELS',
      payload: [{ x: 0.0, hp: Math.round(28 * s), kind: 'TNT_BARREL' }] satisfies BarrelSpec[],
    });

    maybeAppendPurpleGate(events, offset + 69, totalUnits, stage, slotCounter, slideAmp, settings);

    events.push({
      atDistance: offset + 76,
      type: 'GATE_PAIR',
      payload: {
        left: { op: 'MUL', value: 2, shootable: false, shotsPerStep: 12, moveAmp: slideAmp * 0.5 } satisfies GateSpec,
        right: { op: 'DIV', value: 2, shootable: false, shotsPerStep: 12, moveAmp: slideAmp * 0.65 } satisfies GateSpec,
      },
    });
  }

  const kinds: Array<BossEntity['kind']> = ['TANK', 'HELI', 'MECH'];
  const miniKind = kinds[(stage + blockIndex) % kinds.length];
  const miniGoldBonus = settings.miniBossMult > 1 ? 1 + (settings.miniBossMult - 1) * 0.35 : 1;
  events.push({
    atDistance: offset + 89,
    type: 'MINIBOSS',
    payload: {
      kind: miniKind,
      name: `Sector-Commandant ${stage}.${blockIndex + 1}`,
      hp: Math.round(
        780 *
          Math.pow(1.52, stage - 1) *
          (1 + blockIndex * 0.25) *
          settings.enemyHpMult *
          settings.miniBossMult,
      ),
      goldReward: Math.round((75 + stage * 30 + blockIndex * 22) * settings.goldMult * miniGoldBonus),
    },
  });
}

export function generateStageEvents(stage: number, settings: GameplaySettings): StageWaveEvent[] {
  const lenCfg = getStageLengthMetrics(settings.stageLengthFactor);

  const baseScale = Math.pow(1.36, stage - 1);
  const hpScale = baseScale * settings.enemyHpMult;
  const barrierDmg = Math.max(2, Math.round((6 + stage * 1.1) * Math.sqrt(settings.enemyHpMult)));

  const events: StageWaveEvent[] = [];
  const slideAmp = stage >= 2 ? Math.min(0.2, 0.09 + stage * 0.022) : 0.06;
  const variant = stage % 3;
  const slotCounter = { next: 0, lastPurpleAt: -100 };

  // === ACT 1: OPENING & ESCALATION (0 -> 94) ===
  events.push({
    atDistance: 4,
    type: 'GATE_PAIR',
    payload: {
      left: { op: 'ADD', value: 4 + stage, shootable: false, shotsPerStep: 6 } satisfies GateSpec,
      right: {
        op: 'ADD',
        value: -4,
        shootable: true,
        shotsPerStep: Math.max(3, Math.round(4.5 * hpScale * 0.6)),
      } satisfies GateSpec,
    },
  });

  events.push({
    atDistance: 12,
    type: 'BARRELS',
    payload: [
      { x: -0.54, hp: Math.round(18 * hpScale), kind: 'WOOD', goldAmount: 18 },
      { x: 0.0, hp: Math.round(28 * hpScale), kind: 'WEAPON_CRATE', weaponTier: 'DOUBLE' },
      { x: 0.54, hp: Math.round(22 * hpScale), kind: 'SHIELD_CRATE' },
    ] satisfies BarrelSpec[],
  });

  events.push({
    atDistance: 21,
    type: 'ENEMIES',
    payload:
      variant === 0
        ? [
            {
              x: -0.45,
              count: computeEnemyCount(8, 21, lenCfg.units, stage, 1, 'SCOUT', settings),
              hpPerUnit: Math.round(5.4 * hpScale),
              kind: 'RAIDER',
            },
            {
              x: 0.45,
              count: computeEnemyCount(10, 21, lenCfg.units, stage, 2, 'STANDARD', settings),
              hpPerUnit: Math.round(5.4 * hpScale),
              kind: 'RAIDER',
            },
          ]
        : variant === 1
          ? [
              {
                x: -0.25,
                count: computeEnemyCount(13, 21, lenCfg.units, stage, 1, 'STANDARD', settings),
                hpPerUnit: Math.round(4.6 * hpScale),
                kind: 'RUSHER',
                speed: 0.42,
              },
              {
                x: 0.42,
                count: computeEnemyCount(4, 21, lenCfg.units, stage, 2, 'SCOUT', settings),
                hpPerUnit: Math.round(6.2 * hpScale),
                kind: 'BOMBER',
                speed: 0.36,
              },
            ]
          : [
              {
                x: -0.46,
                count: computeEnemyCount(7, 21, lenCfg.units, stage, 1, 'SCOUT', settings),
                hpPerUnit: Math.round(5.4 * hpScale),
                kind: 'RAIDER',
              },
              {
                x: 0.46,
                count: computeEnemyCount(3, 21, lenCfg.units, stage, 2, 'ELITE', settings, true),
                hpPerUnit: Math.round(18 * hpScale),
                kind: 'BRUTE',
              },
            ],
  });
  events.push({
    atDistance: 22,
    type: 'BARRELS',
    payload: [{ x: variant === 1 ? -0.45 : 0.0, hp: Math.round(16 * hpScale), kind: 'TNT_BARREL' }] satisfies BarrelSpec[],
  });

  maybeAppendPurpleGate(events, 29, lenCfg.units, stage, slotCounter, slideAmp, settings);

  events.push({
    atDistance: 33,
    type: 'BARRIER',
    payload: [
      {
        x: variant === 1 ? 0.42 : -0.42,
        width: 0.94,
        hp: Math.round(115 * hpScale),
        damage: barrierDmg,
      },
    ] satisfies BarrierSpec[],
  });
  events.push({
    atDistance: 36,
    type: 'BARRELS',
    payload: [
      {
        x: variant === 1 ? -0.48 : 0.48,
        hp: Math.round(30 * hpScale),
        kind: 'SQUAD_CRATE',
        squadBonus: 5 + stage * 2,
      },
      ...(settings.enemyCountMult >= 1.1 ? [{ x: 0.0, hp: Math.round(20 * hpScale), kind: 'TNT_BARREL' as const }] : []),
    ] satisfies BarrelSpec[],
  });

  events.push({
    atDistance: 43,
    type: 'GATE_TRIO',
    payload: {
      left: { op: 'ADD', value: Math.round(7 + stage * 2), shootable: false, shotsPerStep: 8 } satisfies GateSpec,
      center: { op: 'MUL', value: 2, shootable: false, shotsPerStep: 10, moveAmp: slideAmp * 0.55 } satisfies GateSpec,
      right: {
        op: 'ADD',
        value: -8,
        shootable: true,
        shotsPerStep: Math.max(4, Math.round(4.5 * hpScale * 0.55)),
      } satisfies GateSpec,
    },
  });

  events.push({
    atDistance: 53,
    type: 'ENEMIES',
    payload: [
      {
        x: variant === 2 ? 0.48 : -0.48,
        count: computeEnemyCount(10, 53, lenCfg.units, stage, 3, 'STANDARD', settings),
        hpPerUnit: Math.round(4.6 * hpScale),
        kind: 'RUSHER',
        speed: 0.43,
      },
      {
        x: 0.0,
        count: computeEnemyCount(4, 53, lenCfg.units, stage, 12, 'SCOUT', settings),
        hpPerUnit: Math.round(6.2 * hpScale),
        kind: 'BOMBER',
        speed: 0.36,
      },
      {
        x: variant === 2 ? -0.5 : 0.5,
        count: computeEnemyCount(2, 53, lenCfg.units, stage, 4, 'ELITE', settings, true),
        hpPerUnit: Math.round(23 * hpScale),
        kind: 'TURRET',
        speed: 0.17,
      },
    ] satisfies EnemySpec[],
  });

  events.push({
    atDistance: 61,
    type: 'BARRELS',
    payload: [
      { x: -0.56, hp: Math.round(46 * hpScale), kind: 'WEAPON_CRATE', weaponTier: 'SPREAD' },
      { x: 0.0, hp: Math.round(46 * hpScale), kind: 'DRONE_CRATE' },
      { x: 0.56, hp: Math.round(48 * hpScale), kind: 'STEEL', goldAmount: 30 },
    ] satisfies BarrelSpec[],
  });

  maybeAppendPurpleGate(events, 67, lenCfg.units, stage, slotCounter, slideAmp, settings);

  events.push({
    atDistance: 73,
    type: 'ENEMIES',
    payload: [
      {
        x: 0.0,
        count: computeEnemyCount(15, 73, lenCfg.units, stage, 5, 'SWARM', settings),
        hpPerUnit: Math.round(6.0 * hpScale),
        kind: 'RAIDER',
      },
      {
        x: -0.52,
        count: computeEnemyCount(3, 73, lenCfg.units, stage, 6, 'ELITE', settings, true),
        hpPerUnit: Math.round(19 * hpScale),
        kind: 'BRUTE',
      },
      {
        x: 0.52,
        count: computeEnemyCount(3, 73, lenCfg.units, stage, 7, 'ELITE', settings, true),
        hpPerUnit: Math.round(19 * hpScale),
        kind: 'BRUTE',
      },
    ] satisfies EnemySpec[],
  });

  events.push({
    atDistance: 83,
    type: 'ENEMIES',
    payload: [
      {
        x: -0.46,
        count: computeEnemyCount(14, 83, lenCfg.units, stage, 20, 'SWARM', settings),
        hpPerUnit: Math.round(5.6 * hpScale),
        kind: 'RAIDER',
      },
      {
        x: 0.46,
        count: computeEnemyCount(4, 83, lenCfg.units, stage, 21, 'ELITE', settings, true),
        hpPerUnit: Math.round(22 * hpScale),
        kind: 'BRUTE',
      },
    ] satisfies EnemySpec[],
  });

  const miniBossKind: BossEntity['kind'] = variant === 0 ? 'HELI' : variant === 1 ? 'TANK' : 'MECH';
  const miniGoldBonus = settings.miniBossMult > 1 ? 1 + (settings.miniBossMult - 1) * 0.35 : 1;
  events.push({
    atDistance: 94,
    type: 'MINIBOSS',
    payload: {
      kind: miniBossKind,
      name: `Voorhoede-Kapitein ${stage}`,
      hp: Math.round(700 * Math.pow(1.52, stage - 1) * settings.enemyHpMult * settings.miniBossMult),
      goldReward: Math.round((65 + stage * 28) * settings.goldMult * miniGoldBonus),
    },
  });

  // === MIDDLE ACTS ===
  const extraMiddleBlocks = lenCfg.extraBlocks;
  for (let i = 0; i < extraMiddleBlocks; i++) {
    appendMiddleBlock(
      events,
      96 + i * 95,
      lenCfg.units,
      stage,
      hpScale,
      slideAmp,
      i + 1,
      settings,
      slotCounter,
    );
  }

  // === FINAL ACT ===
  const finalOffset = 95 + extraMiddleBlocks * 95;
  const finalScale = hpScale * (1 + extraMiddleBlocks * 0.16);
  const finalBarrierDmg = Math.max(2, Math.round((7 + stage * 1.2) * Math.sqrt(settings.enemyHpMult)));

  events.push({
    atDistance: finalOffset + 4,
    type: 'BARRELS',
    payload: [
      { x: -0.52, hp: Math.round(56 * finalScale), kind: 'SQUAD_CRATE', squadBonus: 8 + stage * 2 },
      { x: 0.0, hp: Math.round(80 * finalScale), kind: 'WEAPON_CRATE', weaponTier: 'ROCKET' },
      { x: 0.52, hp: Math.round(58 * finalScale), kind: 'SHIELD_CRATE' },
    ] satisfies BarrelSpec[],
  });

  events.push({
    atDistance: finalOffset + 14,
    type: 'BARRIER',
    payload: [{ x: variant === 2 ? -0.45 : 0.45, width: 0.92, hp: Math.round(150 * finalScale), damage: finalBarrierDmg }] satisfies BarrierSpec[],
  });
  events.push({
    atDistance: finalOffset + 22,
    type: 'BARRIER',
    payload: [{ x: variant === 2 ? 0.45 : -0.45, width: 0.92, hp: Math.round(150 * finalScale), damage: finalBarrierDmg }] satisfies BarrierSpec[],
  });

  maybeAppendPurpleGate(events, finalOffset + 28, lenCfg.units, stage, slotCounter, slideAmp, settings);

  events.push({
    atDistance: finalOffset + 32,
    type: 'BARRELS',
    payload: [
      { x: -0.58, hp: Math.round(62 * finalScale), kind: 'WOOD', goldAmount: 28 },
      { x: -0.2, hp: Math.round(28 * finalScale), kind: 'TNT_BARREL' },
      { x: 0.2, hp: Math.round(68 * finalScale), kind: 'STEEL', goldAmount: 42 },
      { x: 0.58, hp: Math.round(62 * finalScale), kind: 'WOOD', goldAmount: 28 },
    ] satisfies BarrelSpec[],
  });

  events.push({
    atDistance: finalOffset + 41,
    type: 'GATE_PAIR',
    payload: {
      left: {
        op: 'ADD',
        value: -12,
        shootable: true,
        shotsPerStep: Math.max(4, Math.round(4.8 * finalScale * 0.5)),
        moveAmp: slideAmp * 0.4,
      } satisfies GateSpec,
      right: { op: 'MUL', value: 2, shootable: false, shotsPerStep: 12, moveAmp: slideAmp } satisfies GateSpec,
    },
  });

  events.push({
    atDistance: finalOffset + 50,
    type: 'ENEMIES',
    payload: [
      {
        x: -0.52,
        count: computeEnemyCount(2, finalOffset + 50, lenCfg.units, stage, 80, 'ELITE', settings, true),
        hpPerUnit: Math.round(25 * finalScale),
        kind: 'TURRET',
        speed: 0.16,
      },
      {
        x: 0.0,
        count: computeEnemyCount(14, finalOffset + 50, lenCfg.units, stage, 81, 'SWARM', settings),
        hpPerUnit: Math.round(5.0 * finalScale),
        kind: 'RUSHER',
        speed: 0.44,
      },
      {
        x: 0.52,
        count: computeEnemyCount(4, finalOffset + 50, lenCfg.units, stage, 82, 'ELITE', settings, true),
        hpPerUnit: Math.round(20 * finalScale),
        kind: 'BRUTE',
      },
    ] satisfies EnemySpec[],
  });

  events.push({
    atDistance: finalOffset + 61,
    type: 'BARRELS',
    payload: [
      { x: -0.5, hp: Math.round(88 * finalScale), kind: 'DRONE_CRATE' },
      { x: 0.0, hp: Math.round(108 * finalScale), kind: 'WEAPON_CRATE', weaponTier: 'LASER' },
      { x: 0.5, hp: Math.round(80 * finalScale), kind: 'SQUAD_CRATE', squadBonus: 10 + stage * 2 },
    ] satisfies BarrelSpec[],
  });

  maybeAppendPurpleGate(events, finalOffset + 67, lenCfg.units, stage, slotCounter, slideAmp, settings);

  events.push({
    atDistance: finalOffset + 72,
    type: 'ENEMIES',
    payload: [
      {
        x: -0.44,
        count: computeEnemyCount(16, finalOffset + 72, lenCfg.units, stage, 93, 'SWARM', settings),
        hpPerUnit: Math.round(5.8 * finalScale),
        kind: 'RAIDER',
      },
      {
        x: 0.0,
        count: computeEnemyCount(6, finalOffset + 72, lenCfg.units, stage, 94, 'ELITE', settings, true),
        hpPerUnit: Math.round(21 * finalScale),
        kind: 'BRUTE',
      },
      {
        x: 0.44,
        count: computeEnemyCount(5, finalOffset + 72, lenCfg.units, stage, 95, 'SCOUT', settings),
        hpPerUnit: Math.round(6.6 * finalScale),
        kind: 'BOMBER',
        speed: 0.38,
      },
    ] satisfies EnemySpec[],
  });

  events.push({
    atDistance: finalOffset + 81,
    type: 'ENEMIES',
    payload: [
      {
        x: -0.46,
        count: computeEnemyCount(18, finalOffset + 81, lenCfg.units, stage, 90, 'SWARM', settings),
        hpPerUnit: Math.round(6.6 * finalScale),
        kind: 'RAIDER',
      },
      {
        x: 0.0,
        count: computeEnemyCount(5, finalOffset + 81, lenCfg.units, stage, 92, 'SCOUT', settings),
        hpPerUnit: Math.round(7.2 * finalScale),
        kind: 'BOMBER',
        speed: 0.38,
      },
      {
        x: 0.46,
        count: computeEnemyCount(18, finalOffset + 81, lenCfg.units, stage, 91, 'SWARM', settings),
        hpPerUnit: Math.round(6.6 * finalScale),
        kind: 'RAIDER',
      },
    ] satisfies EnemySpec[],
  });
  events.push({
    atDistance: finalOffset + 83,
    type: 'BARRELS',
    payload: [
      { x: -0.22, hp: Math.round(32 * finalScale), kind: 'TNT_BARREL' },
      { x: 0.22, hp: Math.round(68 * finalScale), kind: 'SHIELD_CRATE' },
    ] satisfies BarrelSpec[],
  });

  const bossKinds: Array<BossEntity['kind']> = ['TANK', 'HELI', 'MECH'];
  const bossKind = bossKinds[(stage - 1) % bossKinds.length];
  const bossNames: Record<BossEntity['kind'], string> = {
    TANK: `Pantsertank Mk.${stage}`,
    HELI: `Storm-Gunship V${stage}`,
    MECH: `IJzeren Kolos ${stage}`,
    CARRIER: `Vliegdekschip ${stage}`,
  };

  const bossGoldBonus = settings.bossMult > 1 ? 1 + (settings.bossMult - 1) * 0.35 : 1;
  events.push({
    atDistance: lenCfg.units - 2,
    type: 'BOSS',
    payload: {
      kind: bossKind,
      name: bossNames[bossKind],
      hp: Math.round(
        1400 *
          Math.pow(1.6, stage - 1) *
          lenCfg.bossHpMult *
          settings.enemyHpMult *
          settings.bossMult,
      ),
      goldReward: Math.round((150 + stage * 70) * lenCfg.goldMult * settings.goldMult * bossGoldBonus),
    },
  });

  events.sort((a, b) => a.atDistance - b.atDistance);
  return events;
}

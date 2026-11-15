import {
  BossEntity,
  BossStrengthMode,
  DensityMode,
  DifficultyMode,
  GameplaySettings,
  GateOp,
  MaxSquadMode,
  SpeedMode,
  StageLengthMode,
  StageWaveEvent,
  UpgradeLevels,
  WeaponTier,
} from './types';

export const STAGE_LENGTH_CONFIG: Record<
  StageLengthMode,
  { label: string; factorLabel: string; units: number; goldMult: number; bossHpMult: number; extraBlocks: number; bonusLabel: string }
> = {
  NORMAL: { label: 'Standaard', factorLabel: '1×', units: 190, goldMult: 1, bossHpMult: 1, extraBlocks: 0, bonusLabel: '1× standaard' },
  LONG: { label: 'Lang', factorLabel: '2×', units: 380, goldMult: 1.4, bossHpMult: 1.3, extraBlocks: 2, bonusLabel: '2× · +40% eindbaas goud' },
  MARATHON: { label: 'Marathon', factorLabel: '3,5×', units: 665, goldMult: 1.85, bossHpMult: 1.75, extraBlocks: 5, bonusLabel: '3,5× · +85% eindbaas goud' },
  ULTRA: { label: 'Ultra', factorLabel: '6×', units: 1140, goldMult: 2.6, bossHpMult: 2.4, extraBlocks: 10, bonusLabel: '6× · +160% eindbaas goud' },
};

export const DIFFICULTY_CONFIG: Record<
  DifficultyMode,
  { label: string; hpMult: number; countMult: number; goldMult: number; dmgMult: number }
> = {
  CHILL: { label: 'Chill', hpMult: 0.75, countMult: 0.85, goldMult: 0.9, dmgMult: 0.75 },
  NORMAL: { label: 'Normaal', hpMult: 1, countMult: 1, goldMult: 1, dmgMult: 1 },
  CHAOS: { label: 'Chaos', hpMult: 1.4, countMult: 1.35, goldMult: 1.5, dmgMult: 1.3 },
};

export const SPEED_CONFIG: Record<SpeedMode, { label: string; mult: number }> = {
  SLOW: { label: 'Rustig', mult: 0.78 },
  NORMAL: { label: 'Normaal', mult: 1.0 },
  TURBO: { label: 'Turbo', mult: 1.35 },
};

export const DENSITY_CONFIG: Record<DensityMode, { label: string; enemyMult: number; extraTnt: boolean; extraGold: boolean }> = {
  STANDARD: { label: 'Standaard', enemyMult: 1.0, extraTnt: false, extraGold: false },
  BUSY: { label: 'Druk', enemyMult: 1.25, extraTnt: true, extraGold: false },
  EXTREME: { label: 'Extreem', enemyMult: 1.55, extraTnt: true, extraGold: true },
};

export const MAX_SQUAD_CONFIG: Record<
  MaxSquadMode,
  { label: string; shortLabel: string; cap: number | null }
> = {
  '150': { label: '150', shortLabel: 'Max 150', cap: 150 },
  '300': { label: '300', shortLabel: 'Max 300', cap: 300 },
  '550': { label: '550', shortLabel: 'Max 550', cap: 550 },
  '1500': { label: '1500', shortLabel: 'Max 1500', cap: 1500 },
  UNLIMITED: { label: '∞', shortLabel: 'Onbeperkt', cap: null },
};

export const BOSS_STRENGTH_CONFIG: Record<
  BossStrengthMode,
  { label: string; factorLabel: string; hpMult: number; dmgMult: number; goldMult: number }
> = {
  WEAK: { label: 'Zwak', factorLabel: '0.6×', hpMult: 0.6, dmgMult: 0.75, goldMult: 0.9 },
  NORMAL: { label: 'Normaal', factorLabel: '1×', hpMult: 1, dmgMult: 1, goldMult: 1 },
  STRONG: { label: 'Sterk', factorLabel: '1.8×', hpMult: 1.8, dmgMult: 1.25, goldMult: 1.35 },
  TITAN: { label: 'Titaan', factorLabel: '3×', hpMult: 3.0, dmgMult: 1.5, goldMult: 1.8 },
};

export const DEFAULT_GAMEPLAY_SETTINGS: GameplaySettings = {
  stageLength: 'NORMAL',
  difficulty: 'NORMAL',
  gameSpeed: 'NORMAL',
  waveDensity: 'STANDARD',
  startWeapon: 'RIFLE',
  startShield: 0,
  startDrones: 0,
  biomeChoice: 'AUTO',
  maxSquadCap: '550',
  dynamicSquadCap: true,
  miniBossStrength: 'NORMAL',
  bossStrength: 'NORMAL',
};

export function getStartSquadCount(upgrades: UpgradeLevels): number {
  return 6 + upgrades.startSquad * 2;
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
  kind: 'RAIDER' | 'BRUTE' | 'RUSHER' | 'TURRET';
  speed?: number;
}

function appendMiddleBlock(
  events: StageWaveEvent[],
  offset: number,
  stage: number,
  hpScale: number,
  countScale: number,
  slideAmp: number,
  blockIndex: number,
  density: (typeof DENSITY_CONFIG)[DensityMode],
  dynamicSquadCap: boolean,
  miniBossCfg: (typeof BOSS_STRENGTH_CONFIG)[BossStrengthMode],
) {
  const flip = blockIndex % 2 === 1;
  const s = hpScale * (1 + blockIndex * 0.18);
  const cs = countScale * (1 + blockIndex * 0.12);

  events.push({
    atDistance: offset + 4,
    type: 'BARRELS',
    payload: [
      { x: -0.54, hp: Math.round(44 * s), kind: 'SQUAD_CRATE', squadBonus: 7 + stage * 2 },
      { x: 0.0, hp: Math.round(52 * s), kind: blockIndex >= 2 ? 'WEAPON_CRATE' : 'DRONE_CRATE', weaponTier: 'ROCKET' },
      { x: 0.54, hp: Math.round(44 * s), kind: 'SHIELD_CRATE' },
    ] satisfies BarrelSpec[],
  });

  events.push({
    atDistance: offset + 14,
    type: 'BARRIER',
    payload: [{ x: flip ? -0.45 : 0.45, width: 0.9, hp: Math.round(125 * s), damage: 6 + stage }] satisfies BarrierSpec[],
  });
  events.push({
    atDistance: offset + 22,
    type: 'BARRIER',
    payload: [{ x: flip ? 0.45 : -0.45, width: 0.9, hp: Math.round(125 * s), damage: 6 + stage }] satisfies BarrierSpec[],
  });

  events.push({
    atDistance: offset + 31,
    type: 'BARRELS',
    payload: [
      { x: -0.56, hp: Math.round(52 * s), kind: 'WOOD', goldAmount: 26 },
      { x: -0.18, hp: Math.round(24 * s), kind: 'TNT_BARREL' },
      { x: 0.2, hp: Math.round(56 * s), kind: 'STEEL', goldAmount: 38 },
      { x: 0.56, hp: Math.round(52 * s), kind: 'WOOD', goldAmount: 26 },
    ] satisfies BarrelSpec[],
  });

  events.push({
    atDistance: offset + 41,
    type: 'GATE_TRIO',
    payload: {
      left: { op: 'RATE_UP', value: 25, shootable: false, shotsPerStep: 10 } satisfies GateSpec,
      center: { op: 'ADD', value: 10 + stage * 2, shootable: false, shotsPerStep: 10, moveAmp: slideAmp * 0.6 } satisfies GateSpec,
      right: {
        op: 'ADD',
        value: -8,
        shootable: true,
        shotsPerStep: Math.max(4, Math.round(4.5 * s * 0.5)),
      } satisfies GateSpec,
    },
  });

  if (dynamicSquadCap) {
    const lowCap = blockIndex % 2 === 1 ? 150 : 250;
    const highCap = 650 + blockIndex * 250;
    const lowGate: GateSpec = { op: 'CAP_SET', value: lowCap, shootable: false, shotsPerStep: 10 };
    const highGate: GateSpec = { op: 'CAP_SET', value: highCap, shootable: false, shotsPerStep: 10, moveAmp: slideAmp * 0.4 };
    events.push({
      atDistance: offset + 47,
      type: 'GATE_PAIR',
      payload: flip ? { left: highGate, right: lowGate } : { left: lowGate, right: highGate },
    });
  }

  events.push({
    atDistance: offset + 52,
    type: 'ENEMIES',
    payload: [
      { x: flip ? 0.5 : -0.5, count: Math.max(1, Math.round(2 * cs)), hpPerUnit: Math.round(20 * s), kind: 'TURRET', speed: 0.16 },
      { x: 0.0, count: Math.max(3, Math.round(9 * cs)), hpPerUnit: Math.round(4.2 * s), kind: 'RUSHER', speed: 0.42 },
      { x: flip ? -0.5 : 0.5, count: Math.max(2, Math.round(4 * cs)), hpPerUnit: Math.round(16 * s), kind: 'BRUTE' },
    ] satisfies EnemySpec[],
  });

  if (density.extraGold) {
    events.push({
      atDistance: offset + 58,
      type: 'BARRELS',
      payload: [
        { x: -0.35, hp: Math.round(30 * s), kind: 'WOOD', goldAmount: 28 },
        { x: 0.35, hp: Math.round(30 * s), kind: 'WOOD', goldAmount: 28 },
      ] satisfies BarrelSpec[],
    });
  }

  events.push({
    atDistance: offset + 64,
    type: 'ENEMIES',
    payload: [
      { x: -0.44, count: Math.max(4, Math.round(12 * cs)), hpPerUnit: Math.round(5.2 * s), kind: 'RAIDER' },
      { x: 0.44, count: Math.max(4, Math.round(12 * cs)), hpPerUnit: Math.round(5.2 * s), kind: 'RAIDER' },
    ] satisfies EnemySpec[],
  });
  events.push({
    atDistance: offset + 65,
    type: 'BARRELS',
    payload: [{ x: 0.0, hp: Math.round(26 * s), kind: 'TNT_BARREL' }] satisfies BarrelSpec[],
  });

  events.push({
    atDistance: offset + 76,
    type: 'GATE_PAIR',
    payload: {
      left: { op: 'DMG_UP', value: 30, shootable: false, shotsPerStep: 10 } satisfies GateSpec,
      right: { op: 'MUL', value: 2, shootable: false, shotsPerStep: 12, moveAmp: slideAmp } satisfies GateSpec,
    },
  });

  const kinds: Array<BossEntity['kind']> = ['TANK', 'HELI', 'MECH'];
  const miniKind = kinds[(stage + blockIndex) % kinds.length];
  events.push({
    atDistance: offset + 89,
    type: 'MINIBOSS',
    payload: {
      kind: miniKind,
      name: `Sector-Commandant ${stage}.${blockIndex + 1}`,
      hp: Math.round(520 * Math.pow(1.48, stage - 1) * (1 + blockIndex * 0.25) * (s / Math.pow(1.34, stage - 1)) * miniBossCfg.hpMult),
      goldReward: Math.round((65 + stage * 28 + blockIndex * 18) * miniBossCfg.goldMult),
    },
  });
}

export function generateStageEvents(stage: number, settings: GameplaySettings): StageWaveEvent[] {
  const cfg = STAGE_LENGTH_CONFIG[settings.stageLength];
  const diff = DIFFICULTY_CONFIG[settings.difficulty];
  const density = DENSITY_CONFIG[settings.waveDensity];
  const miniBossCfg = BOSS_STRENGTH_CONFIG[settings.miniBossStrength];
  const bossCfg = BOSS_STRENGTH_CONFIG[settings.bossStrength];

  const baseScale = Math.pow(1.34, stage - 1);
  const hpScale = baseScale * diff.hpMult;
  const countScale = baseScale * diff.countMult * density.enemyMult;

  const events: StageWaveEvent[] = [];
  const slideAmp = stage >= 2 ? Math.min(0.18, 0.08 + stage * 0.02) : 0;
  const variant = stage % 3;

  // === ACT 1: OPENING & ESCALATION (0 -> 94) ===
  events.push({
    atDistance: 4,
    type: 'GATE_PAIR',
    payload: {
      left: { op: 'ADD', value: 4 + stage, shootable: false, shotsPerStep: 6 } satisfies GateSpec,
      right: {
        op: 'ADD',
        value: -3,
        shootable: true,
        shotsPerStep: Math.max(3, Math.round(4 * hpScale * 0.6)),
      } satisfies GateSpec,
    },
  });

  events.push({
    atDistance: 12,
    type: 'BARRELS',
    payload: [
      { x: -0.54, hp: Math.round(14 * hpScale), kind: 'WOOD', goldAmount: 14 },
      { x: 0.0, hp: Math.round(22 * hpScale), kind: 'WEAPON_CRATE', weaponTier: 'DOUBLE' },
      { x: 0.54, hp: Math.round(18 * hpScale), kind: 'SHIELD_CRATE' },
    ] satisfies BarrelSpec[],
  });

  events.push({
    atDistance: 21,
    type: 'ENEMIES',
    payload: [
      { x: -0.45, count: Math.max(3, Math.round(7 * countScale)), hpPerUnit: Math.round(4 * hpScale), kind: 'RAIDER' },
      { x: 0.45, count: Math.max(3, Math.round(7 * countScale)), hpPerUnit: Math.round(4 * hpScale), kind: 'RAIDER' },
    ] satisfies EnemySpec[],
  });
  events.push({
    atDistance: 22,
    type: 'BARRELS',
    payload: [{ x: 0.0, hp: Math.round(12 * hpScale), kind: 'TNT_BARREL' }] satisfies BarrelSpec[],
  });

  if (settings.dynamicSquadCap) {
    const lowGate: GateSpec = { op: 'CAP_SET', value: 150, shootable: false, shotsPerStep: 8 };
    const highGate: GateSpec = { op: 'CAP_SET', value: 700, shootable: false, shotsPerStep: 8 };
    events.push({
      atDistance: 26,
      type: 'GATE_PAIR',
      payload: variant === 1 ? { left: lowGate, right: highGate } : { left: highGate, right: lowGate },
    });
  }

  events.push({
    atDistance: 30,
    type: 'BARRIER',
    payload: [
      {
        x: variant === 1 ? 0.42 : -0.42,
        width: 0.92,
        hp: Math.round(95 * hpScale),
        damage: Math.max(2, Math.round((5 + stage) * diff.dmgMult)),
      },
    ] satisfies BarrierSpec[],
  });
  events.push({
    atDistance: 33,
    type: 'BARRELS',
    payload: [
      {
        x: variant === 1 ? -0.48 : 0.48,
        hp: Math.round(24 * hpScale),
        kind: 'SQUAD_CRATE',
        squadBonus: 5 + stage * 2,
      },
      ...(density.extraTnt ? [{ x: 0.0, hp: Math.round(16 * hpScale), kind: 'TNT_BARREL' as const }] : []),
    ] satisfies BarrelSpec[],
  });

  events.push({
    atDistance: 41,
    type: 'GATE_TRIO',
    payload: {
      left: { op: 'ADD', value: Math.round(7 + stage * 2), shootable: false, shotsPerStep: 8 } satisfies GateSpec,
      center: { op: 'MUL', value: 2, shootable: false, shotsPerStep: 10, moveAmp: slideAmp * 0.5 } satisfies GateSpec,
      right: {
        op: 'ADD',
        value: -6,
        shootable: true,
        shotsPerStep: Math.max(4, Math.round(4 * hpScale * 0.55)),
      } satisfies GateSpec,
    },
  });

  events.push({
    atDistance: 51,
    type: 'ENEMIES',
    payload: [
      { x: -0.48, count: Math.max(3, Math.round(6 * countScale)), hpPerUnit: Math.round(3.5 * hpScale), kind: 'RUSHER', speed: 0.41 },
      { x: 0.5, count: Math.max(1, Math.round(2 * countScale)), hpPerUnit: Math.round(18 * hpScale), kind: 'TURRET', speed: 0.17 },
    ] satisfies EnemySpec[],
  });

  events.push({
    atDistance: 61,
    type: 'BARRELS',
    payload: [
      { x: -0.56, hp: Math.round(36 * hpScale), kind: 'WEAPON_CRATE', weaponTier: 'SPREAD' },
      { x: 0.0, hp: Math.round(36 * hpScale), kind: 'DRONE_CRATE' },
      { x: 0.56, hp: Math.round(38 * hpScale), kind: 'STEEL', goldAmount: 26 },
    ] satisfies BarrelSpec[],
  });

  if (settings.dynamicSquadCap) {
    const trapGate: GateSpec = { op: 'CAP_SET', value: 200, shootable: false, shotsPerStep: 8 };
    const boostGate: GateSpec = { op: 'CAP_SET', value: 900, shootable: false, shotsPerStep: 8, moveAmp: slideAmp * 0.45 };
    events.push({
      atDistance: 67,
      type: 'GATE_PAIR',
      payload: variant === 0 ? { left: trapGate, right: boostGate } : { left: boostGate, right: trapGate },
    });
  }

  events.push({
    atDistance: 72,
    type: 'ENEMIES',
    payload: [
      { x: 0.0, count: Math.max(4, Math.round(12 * countScale)), hpPerUnit: Math.round(5 * hpScale), kind: 'RAIDER' },
      { x: -0.52, count: Math.max(1, Math.round(3 * countScale)), hpPerUnit: Math.round(15 * hpScale), kind: 'BRUTE' },
      { x: 0.52, count: Math.max(1, Math.round(3 * countScale)), hpPerUnit: Math.round(15 * hpScale), kind: 'BRUTE' },
    ] satisfies EnemySpec[],
  });

  if (density.extraGold) {
    events.push({
      atDistance: 78,
      type: 'BARRELS',
      payload: [
        { x: -0.45, hp: Math.round(24 * hpScale), kind: 'WOOD', goldAmount: 24 },
        { x: 0.45, hp: Math.round(24 * hpScale), kind: 'WOOD', goldAmount: 24 },
      ] satisfies BarrelSpec[],
    });
  }

  events.push({
    atDistance: 83,
    type: 'GATE_PAIR',
    payload: {
      left: { op: 'RATE_UP', value: 25, shootable: false, shotsPerStep: 8 } satisfies GateSpec,
      right: { op: 'DMG_UP', value: 30, shootable: false, shotsPerStep: 8, moveAmp: slideAmp } satisfies GateSpec,
    },
  });

  const miniBossKind: BossEntity['kind'] = variant === 0 ? 'HELI' : variant === 1 ? 'TANK' : 'MECH';
  events.push({
    atDistance: 94,
    type: 'MINIBOSS',
    payload: {
      kind: miniBossKind,
      name: `Voorhoede-Kapitein ${stage}`,
      hp: Math.round(420 * Math.pow(1.48, stage - 1) * diff.hpMult * miniBossCfg.hpMult),
      goldReward: Math.round((55 + stage * 25) * diff.goldMult * miniBossCfg.goldMult),
    },
  });

  // === OPTIONAL EXTRA MIDDLE ACTS ===
  const extraMiddleBlocks = cfg.extraBlocks;
  for (let i = 0; i < extraMiddleBlocks; i++) {
    appendMiddleBlock(
      events,
      96 + i * 95,
      stage,
      hpScale,
      countScale,
      slideAmp,
      i + 1,
      density,
      settings.dynamicSquadCap,
      miniBossCfg,
    );
  }

  // === FINAL ACT ===
  const finalOffset = 95 + extraMiddleBlocks * 95;
  const finalScale = hpScale * (1 + extraMiddleBlocks * 0.14);
  const finalCountScale = countScale * (1 + extraMiddleBlocks * 0.1);

  events.push({
    atDistance: finalOffset + 4,
    type: 'BARRELS',
    payload: [
      { x: -0.52, hp: Math.round(45 * finalScale), kind: 'SQUAD_CRATE', squadBonus: 8 + stage * 2 },
      { x: 0.0, hp: Math.round(68 * finalScale), kind: 'WEAPON_CRATE', weaponTier: 'ROCKET' },
      { x: 0.52, hp: Math.round(48 * finalScale), kind: 'SHIELD_CRATE' },
    ] satisfies BarrelSpec[],
  });

  events.push({
    atDistance: finalOffset + 14,
    type: 'BARRIER',
    payload: [
      {
        x: 0.45,
        width: 0.88,
        hp: Math.round(125 * finalScale),
        damage: Math.max(2, Math.round((6 + stage) * diff.dmgMult)),
      },
    ] satisfies BarrierSpec[],
  });
  events.push({
    atDistance: finalOffset + 22,
    type: 'BARRIER',
    payload: [
      {
        x: -0.45,
        width: 0.88,
        hp: Math.round(125 * finalScale),
        damage: Math.max(2, Math.round((6 + stage) * diff.dmgMult)),
      },
    ] satisfies BarrierSpec[],
  });

  if (settings.dynamicSquadCap) {
    const lowFinal: GateSpec = { op: 'CAP_SET', value: 150, shootable: false, shotsPerStep: 10 };
    const highFinal: GateSpec = {
      op: 'CAP_SET',
      value: 1000 + extraMiddleBlocks * 200,
      shootable: false,
      shotsPerStep: 10,
      moveAmp: slideAmp * 0.4,
    };
    events.push({
      atDistance: finalOffset + 26,
      type: 'GATE_PAIR',
      payload: variant === 2 ? { left: lowFinal, right: highFinal } : { left: highFinal, right: lowFinal },
    });
  }

  events.push({
    atDistance: finalOffset + 30,
    type: 'BARRELS',
    payload: [
      { x: -0.58, hp: Math.round(52 * finalScale), kind: 'WOOD', goldAmount: 24 },
      { x: -0.2, hp: Math.round(24 * finalScale), kind: 'TNT_BARREL' },
      { x: 0.2, hp: Math.round(55 * finalScale), kind: 'STEEL', goldAmount: 36 },
      { x: 0.58, hp: Math.round(52 * finalScale), kind: 'WOOD', goldAmount: 24 },
    ] satisfies BarrelSpec[],
  });

  events.push({
    atDistance: finalOffset + 40,
    type: 'GATE_PAIR',
    payload: {
      left: {
        op: 'ADD',
        value: -10,
        shootable: true,
        shotsPerStep: Math.max(4, Math.round(4.5 * finalScale * 0.5)),
      } satisfies GateSpec,
      right: { op: 'MUL', value: 2, shootable: false, shotsPerStep: 12, moveAmp: slideAmp } satisfies GateSpec,
    },
  });

  events.push({
    atDistance: finalOffset + 50,
    type: 'ENEMIES',
    payload: [
      { x: -0.52, count: Math.max(1, Math.round(2 * finalCountScale)), hpPerUnit: Math.round(20 * finalScale), kind: 'TURRET', speed: 0.16 },
      { x: 0.0, count: Math.max(3, Math.round(9 * finalCountScale)), hpPerUnit: Math.round(4 * finalScale), kind: 'RUSHER', speed: 0.42 },
      { x: 0.52, count: Math.max(2, Math.round(4 * finalCountScale)), hpPerUnit: Math.round(16 * finalScale), kind: 'BRUTE' },
    ] satisfies EnemySpec[],
  });

  events.push({
    atDistance: finalOffset + 61,
    type: 'BARRELS',
    payload: [
      { x: -0.5, hp: Math.round(74 * finalScale), kind: 'DRONE_CRATE' },
      { x: 0.0, hp: Math.round(92 * finalScale), kind: 'WEAPON_CRATE', weaponTier: 'LASER' },
      { x: 0.5, hp: Math.round(68 * finalScale), kind: 'SQUAD_CRATE', squadBonus: 10 + stage * 2 },
    ] satisfies BarrelSpec[],
  });

  events.push({
    atDistance: finalOffset + 71,
    type: 'GATE_TRIO',
    payload: {
      left: { op: 'DMG_UP', value: 40, shootable: false, shotsPerStep: 10 } satisfies GateSpec,
      center: { op: 'MUL', value: stage >= 3 ? 3 : 2, shootable: false, shotsPerStep: 12 } satisfies GateSpec,
      right: { op: 'RATE_UP', value: 35, shootable: false, shotsPerStep: 10 } satisfies GateSpec,
    },
  });

  events.push({
    atDistance: finalOffset + 81,
    type: 'ENEMIES',
    payload: [
      { x: -0.45, count: Math.max(5, Math.round(14 * finalCountScale)), hpPerUnit: Math.round(5.5 * finalScale), kind: 'RAIDER' },
      { x: 0.45, count: Math.max(5, Math.round(14 * finalCountScale)), hpPerUnit: Math.round(5.5 * finalScale), kind: 'RAIDER' },
    ] satisfies EnemySpec[],
  });
  events.push({
    atDistance: finalOffset + 83,
    type: 'BARRELS',
    payload: [
      { x: -0.22, hp: Math.round(28 * finalScale), kind: 'TNT_BARREL' },
      { x: 0.22, hp: Math.round(58 * finalScale), kind: 'SHIELD_CRATE' },
    ] satisfies BarrelSpec[],
  });

  const bossKinds: Array<BossEntity['kind']> = ['TANK', 'HELI', 'MECH'];
  const bossKind = bossKinds[(stage - 1) % bossKinds.length];
  const bossNames: Record<BossEntity['kind'], string> = {
    TANK: `Pantsertank Mk.${stage}`,
    HELI: `Storm-Gunship V${stage}`,
    MECH: `IJzeren Kolos ${stage}`,
  };

  events.push({
    atDistance: cfg.units - 2,
    type: 'BOSS',
    payload: {
      kind: bossKind,
      name: bossNames[bossKind],
      hp: Math.round(1150 * Math.pow(1.55, stage - 1) * cfg.bossHpMult * diff.hpMult * bossCfg.hpMult),
      goldReward: Math.round((130 + stage * 65) * cfg.goldMult * diff.goldMult * bossCfg.goldMult),
    },
  });

  events.sort((a, b) => a.atDistance - b.atDistance);
  return events;
}

import { BossEntity, GateOp, StageLengthMode, StageWaveEvent, UpgradeLevels, WeaponTier } from './types';

export const STAGE_LENGTH_CONFIG: Record<
  StageLengthMode,
  { label: string; factorLabel: string; units: number; goldMult: number; bossHpMult: number }
> = {
  NORMAL: { label: 'Standaard', factorLabel: '1×', units: 190, goldMult: 1, bossHpMult: 1 },
  LONG: { label: 'Lang', factorLabel: '2×', units: 380, goldMult: 1.4, bossHpMult: 1.3 },
  MARATHON: { label: 'Marathon', factorLabel: '3,5×', units: 665, goldMult: 1.85, bossHpMult: 1.75 },
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
  scale: number,
  slideAmp: number,
  blockIndex: number,
) {
  const flip = blockIndex % 2 === 1;
  const s = scale * (1 + blockIndex * 0.18);

  // Supply & weapon choice
  events.push({
    atDistance: offset + 4,
    type: 'BARRELS',
    payload: [
      { x: -0.54, hp: Math.round(44 * s), kind: 'SQUAD_CRATE', squadBonus: 7 + stage * 2 },
      { x: 0.0, hp: Math.round(52 * s), kind: blockIndex >= 2 ? 'WEAPON_CRATE' : 'DRONE_CRATE', weaponTier: 'ROCKET' },
      { x: 0.54, hp: Math.round(44 * s), kind: 'SHIELD_CRATE' },
    ] satisfies BarrelSpec[],
  });

  // Slalom electric barriers
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

  // TNT Gold Vault
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

  // 3-Lane Gate Trio
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

  // Combined Arms Ambush: Turrets + Rushers + Brutes
  events.push({
    atDistance: offset + 52,
    type: 'ENEMIES',
    payload: [
      { x: flip ? 0.5 : -0.5, count: Math.round(2 * s), hpPerUnit: Math.round(20 * s), kind: 'TURRET', speed: 0.16 },
      { x: 0.0, count: Math.round(9 * s), hpPerUnit: Math.round(4.2 * s), kind: 'RUSHER', speed: 0.42 },
      { x: flip ? -0.5 : 0.5, count: Math.round(4 * s), hpPerUnit: Math.round(16 * s), kind: 'BRUTE' },
    ] satisfies EnemySpec[],
  });

  // Extra TNT + Raider Push
  events.push({
    atDistance: offset + 64,
    type: 'ENEMIES',
    payload: [
      { x: -0.44, count: Math.round(12 * s), hpPerUnit: Math.round(5.2 * s), kind: 'RAIDER' },
      { x: 0.44, count: Math.round(12 * s), hpPerUnit: Math.round(5.2 * s), kind: 'RAIDER' },
    ] satisfies EnemySpec[],
  });
  events.push({
    atDistance: offset + 65,
    type: 'BARRELS',
    payload: [{ x: 0.0, hp: Math.round(26 * s), kind: 'TNT_BARREL' }] satisfies BarrelSpec[],
  });

  // Power Gate Pair before Mini-Boss
  events.push({
    atDistance: offset + 76,
    type: 'GATE_PAIR',
    payload: {
      left: { op: 'DMG_UP', value: 30, shootable: false, shotsPerStep: 10 } satisfies GateSpec,
      right: { op: 'MUL', value: 2, shootable: false, shotsPerStep: 12, moveAmp: slideAmp } satisfies GateSpec,
    },
  });

  // Checkpoint Mini-Boss
  const kinds: Array<BossEntity['kind']> = ['TANK', 'HELI', 'MECH'];
  const miniKind = kinds[(stage + blockIndex) % kinds.length];
  events.push({
    atDistance: offset + 89,
    type: 'MINIBOSS',
    payload: {
      kind: miniKind,
      name: `Sector-Commandant ${stage}.${blockIndex + 1}`,
      hp: Math.round(520 * Math.pow(1.48, stage - 1) * (1 + blockIndex * 0.25)),
      goldReward: 65 + stage * 28 + blockIndex * 18,
    },
  });
}

export function generateStageEvents(stage: number, lengthMode: StageLengthMode = 'NORMAL'): StageWaveEvent[] {
  const cfg = STAGE_LENGTH_CONFIG[lengthMode];
  const scale = Math.pow(1.34, stage - 1);
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
        shotsPerStep: Math.max(3, Math.round(4 * scale * 0.6)),
      } satisfies GateSpec,
    },
  });

  events.push({
    atDistance: 12,
    type: 'BARRELS',
    payload: [
      { x: -0.54, hp: Math.round(14 * scale), kind: 'WOOD', goldAmount: 14 },
      { x: 0.0, hp: Math.round(22 * scale), kind: 'WEAPON_CRATE', weaponTier: 'DOUBLE' },
      { x: 0.54, hp: Math.round(18 * scale), kind: 'SHIELD_CRATE' },
    ] satisfies BarrelSpec[],
  });

  events.push({
    atDistance: 21,
    type: 'ENEMIES',
    payload: [
      { x: -0.45, count: Math.round(7 * scale), hpPerUnit: Math.round(4 * scale), kind: 'RAIDER' },
      { x: 0.45, count: Math.round(7 * scale), hpPerUnit: Math.round(4 * scale), kind: 'RAIDER' },
    ] satisfies EnemySpec[],
  });
  events.push({
    atDistance: 22,
    type: 'BARRELS',
    payload: [{ x: 0.0, hp: Math.round(12 * scale), kind: 'TNT_BARREL' }] satisfies BarrelSpec[],
  });

  events.push({
    atDistance: 30,
    type: 'BARRIER',
    payload: [
      {
        x: variant === 1 ? 0.42 : -0.42,
        width: 0.92,
        hp: Math.round(95 * scale),
        damage: 5 + stage,
      },
    ] satisfies BarrierSpec[],
  });
  events.push({
    atDistance: 33,
    type: 'BARRELS',
    payload: [
      {
        x: variant === 1 ? -0.48 : 0.48,
        hp: Math.round(24 * scale),
        kind: 'SQUAD_CRATE',
        squadBonus: 5 + stage * 2,
      },
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
        shotsPerStep: Math.max(4, Math.round(4 * scale * 0.55)),
      } satisfies GateSpec,
    },
  });

  events.push({
    atDistance: 51,
    type: 'ENEMIES',
    payload: [
      { x: -0.48, count: Math.round(6 * scale), hpPerUnit: Math.round(3.5 * scale), kind: 'RUSHER', speed: 0.41 },
      { x: 0.5, count: Math.round(2 * scale), hpPerUnit: Math.round(18 * scale), kind: 'TURRET', speed: 0.17 },
    ] satisfies EnemySpec[],
  });

  events.push({
    atDistance: 61,
    type: 'BARRELS',
    payload: [
      { x: -0.56, hp: Math.round(36 * scale), kind: 'WEAPON_CRATE', weaponTier: 'SPREAD' },
      { x: 0.0, hp: Math.round(36 * scale), kind: 'DRONE_CRATE' },
      { x: 0.56, hp: Math.round(38 * scale), kind: 'STEEL', goldAmount: 26 },
    ] satisfies BarrelSpec[],
  });

  events.push({
    atDistance: 72,
    type: 'ENEMIES',
    payload: [
      { x: 0.0, count: Math.round(12 * scale), hpPerUnit: Math.round(5 * scale), kind: 'RAIDER' },
      { x: -0.52, count: Math.round(3 * scale), hpPerUnit: Math.round(15 * scale), kind: 'BRUTE' },
      { x: 0.52, count: Math.round(3 * scale), hpPerUnit: Math.round(15 * scale), kind: 'BRUTE' },
    ] satisfies EnemySpec[],
  });

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
      hp: Math.round(420 * Math.pow(1.48, stage - 1)),
      goldReward: 55 + stage * 25,
    },
  });

  // === OPTIONAL EXTRA MIDDLE ACTS FOR LONG (2x) AND MARATHON (3.5x) ===
  const extraMiddleBlocks = lengthMode === 'NORMAL' ? 0 : lengthMode === 'LONG' ? 2 : 5;
  for (let i = 0; i < extraMiddleBlocks; i++) {
    appendMiddleBlock(events, 96 + i * 95, stage, scale, slideAmp, i + 1);
  }

  // === FINAL ACT LEADING TO STAGE BOSS ===
  const finalOffset = 95 + extraMiddleBlocks * 95;
  const finalScale = scale * (1 + extraMiddleBlocks * 0.14);

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
    payload: [{ x: 0.45, width: 0.88, hp: Math.round(125 * finalScale), damage: 6 + stage }] satisfies BarrierSpec[],
  });
  events.push({
    atDistance: finalOffset + 22,
    type: 'BARRIER',
    payload: [{ x: -0.45, width: 0.88, hp: Math.round(125 * finalScale), damage: 6 + stage }] satisfies BarrierSpec[],
  });

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
      { x: -0.52, count: Math.round(2 * finalScale), hpPerUnit: Math.round(20 * finalScale), kind: 'TURRET', speed: 0.16 },
      { x: 0.0, count: Math.round(9 * finalScale), hpPerUnit: Math.round(4 * finalScale), kind: 'RUSHER', speed: 0.42 },
      { x: 0.52, count: Math.round(4 * finalScale), hpPerUnit: Math.round(16 * finalScale), kind: 'BRUTE' },
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
      { x: -0.45, count: Math.round(14 * finalScale), hpPerUnit: Math.round(5.5 * finalScale), kind: 'RAIDER' },
      { x: 0.45, count: Math.round(14 * finalScale), hpPerUnit: Math.round(5.5 * finalScale), kind: 'RAIDER' },
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
      hp: Math.round(1150 * Math.pow(1.55, stage - 1) * cfg.bossHpMult),
      goldReward: Math.round((130 + stage * 65) * cfg.goldMult),
    },
  });

  return events;
}

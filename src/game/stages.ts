import { BossEntity, GateOp, StageWaveEvent, UpgradeLevels, WeaponTier } from './types';

export const STAGE_LENGTH_UNITS = 100;

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
  kind: 'WOOD' | 'STEEL' | 'WEAPON_CRATE' | 'SQUAD_CRATE' | 'SHIELD_CRATE' | 'DRONE_CRATE';
  weaponTier?: WeaponTier;
  squadBonus?: number;
  goldAmount?: number;
}

export interface EnemySpec {
  x: number;
  count: number;
  hpPerUnit: number;
  kind: 'RAIDER' | 'BRUTE';
  speed?: number;
}

export function generateStageEvents(stage: number): StageWaveEvent[] {
  const scale = Math.pow(1.36, stage - 1);
  const events: StageWaveEvent[] = [];
  const slideAmp = stage >= 2 ? Math.min(0.18, 0.08 + stage * 0.02) : 0;

  // 1. Opening instant gate pair
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

  // 2. First barrel row with Weapon Crate + Shield option
  events.push({
    atDistance: 12,
    type: 'BARRELS',
    payload: [
      { x: -0.54, hp: Math.round(14 * scale), kind: 'WOOD', goldAmount: 12 },
      { x: 0.0, hp: Math.round(22 * scale), kind: 'WEAPON_CRATE', weaponTier: 'DOUBLE' },
      { x: 0.54, hp: Math.round(18 * scale), kind: 'SHIELD_CRATE' },
    ] satisfies BarrelSpec[],
  });

  // 3. First enemy wave
  events.push({
    atDistance: 21,
    type: 'ENEMIES',
    payload: [
      { x: -0.44, count: Math.round(7 * scale), hpPerUnit: Math.round(4 * scale), kind: 'RAIDER' },
      { x: 0.44, count: Math.round(6 * scale), hpPerUnit: Math.round(4 * scale), kind: 'RAIDER' },
    ] satisfies EnemySpec[],
  });

  // 4. Multiplier vs shootable add gate
  events.push({
    atDistance: 29,
    type: 'GATE_PAIR',
    payload: {
      left: { op: 'MUL', value: 2, shootable: false, shotsPerStep: 10, moveAmp: slideAmp } satisfies GateSpec,
      right: {
        op: 'ADD',
        value: Math.round(8 + stage * 3),
        shootable: true,
        shotsPerStep: Math.max(4, Math.round(5 * scale * 0.6)),
      } satisfies GateSpec,
    },
  });

  // 5. Squad crate + Drone crate + Spread weapon crate
  events.push({
    atDistance: 38,
    type: 'BARRELS',
    payload: [
      { x: -0.56, hp: Math.round(32 * scale), kind: 'SQUAD_CRATE', squadBonus: 6 + stage * 2 },
      { x: 0.0, hp: Math.round(36 * scale), kind: 'DRONE_CRATE' },
      { x: 0.56, hp: Math.round(38 * scale), kind: 'WEAPON_CRATE', weaponTier: 'SPREAD' },
    ] satisfies BarrelSpec[],
  });

  // 6. Heavy Raider + Brute push
  events.push({
    atDistance: 48,
    type: 'ENEMIES',
    payload: [
      { x: 0.0, count: Math.round(11 * scale), hpPerUnit: Math.round(5 * scale), kind: 'RAIDER' },
      { x: -0.52, count: Math.round(3 * scale), hpPerUnit: Math.round(14 * scale), kind: 'BRUTE' },
    ] satisfies EnemySpec[],
  });

  // 7. Shoot-to-flip high-reward gate vs fire rate gate
  events.push({
    atDistance: 57,
    type: 'GATE_PAIR',
    payload: {
      left: {
        op: 'ADD',
        value: -8,
        shootable: true,
        shotsPerStep: Math.max(4, Math.round(5 * scale * 0.55)),
      } satisfies GateSpec,
      right: { op: 'RATE_UP', value: 25, shootable: false, shotsPerStep: 8, moveAmp: slideAmp } satisfies GateSpec,
    },
  });

  // 8. Armored convoy + Rocket Launcher crate
  events.push({
    atDistance: 66,
    type: 'BARRELS',
    payload: [
      { x: -0.48, hp: Math.round(72 * scale), kind: 'STEEL', goldAmount: 32 },
      { x: 0.02, hp: Math.round(85 * scale), kind: 'WEAPON_CRATE', weaponTier: 'ROCKET' },
      { x: 0.54, hp: Math.round(56 * scale), kind: 'SQUAD_CRATE', squadBonus: 8 + stage * 2 },
    ] satisfies BarrelSpec[],
  });

  // 9. Swarm wave
  events.push({
    atDistance: 75,
    type: 'ENEMIES',
    payload: [
      { x: -0.48, count: Math.round(12 * scale), hpPerUnit: Math.round(5.5 * scale), kind: 'RAIDER' },
      { x: 0.48, count: Math.round(12 * scale), hpPerUnit: Math.round(5.5 * scale), kind: 'RAIDER' },
      { x: 0.0, count: Math.round(4 * scale), hpPerUnit: Math.round(16 * scale), kind: 'BRUTE' },
    ] satisfies EnemySpec[],
  });

  // 10. Final pre-boss multiplier gate!
  events.push({
    atDistance: 84,
    type: 'GATE_PAIR',
    payload: {
      left: { op: 'MUL', value: stage >= 3 ? 3 : 2, shootable: false, shotsPerStep: 12 } satisfies GateSpec,
      right: { op: 'DMG_UP', value: 35, shootable: false, shotsPerStep: 12 } satisfies GateSpec,
    },
  });

  // 11. Pre-boss gold & shield barrels
  events.push({
    atDistance: 91,
    type: 'BARRELS',
    payload: [
      { x: -0.42, hp: Math.round(62 * scale), kind: 'WOOD', goldAmount: 28 },
      { x: 0.0, hp: Math.round(54 * scale), kind: 'SHIELD_CRATE' },
      { x: 0.42, hp: Math.round(62 * scale), kind: 'WOOD', goldAmount: 28 },
    ] satisfies BarrelSpec[],
  });

  // 12. Boss arrival
  const bossKinds: Array<BossEntity['kind']> = ['TANK', 'HELI', 'MECH'];
  const bossKind = bossKinds[(stage - 1) % bossKinds.length];
  const bossNames: Record<BossEntity['kind'], string> = {
    TANK: `Pantsertank Mk.${stage}`,
    HELI: `Storm-Gunship V${stage}`,
    MECH: `IJzeren Kolos ${stage}`,
  };

  events.push({
    atDistance: 99,
    type: 'BOSS',
    payload: {
      kind: bossKind,
      name: bossNames[bossKind],
      hp: Math.round(820 * Math.pow(1.55, stage - 1)),
      goldReward: 85 + stage * 50,
    },
  });

  return events;
}

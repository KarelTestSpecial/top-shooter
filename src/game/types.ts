export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'STAGE_CLEAR' | 'GAME_OVER';

export type WeaponTier = 'RIFLE' | 'DOUBLE' | 'SPREAD' | 'ROCKET';

export interface UpgradeLevels {
  startSquad: number;
  firepower: number;
  fireRate: number;
  goldBonus: number;
}

export interface PersistentProgress {
  gold: number;
  highestStage: number;
  bestSquad: number;
  totalKills: number;
  upgrades: UpgradeLevels;
  muted: boolean;
}

export type GateOp = 'ADD' | 'SUB' | 'MUL' | 'DIV' | 'RATE_UP' | 'DMG_UP';

export interface GateEntity {
  id: number;
  lane: 'left' | 'right' | 'center';
  x: number; // normalized -1 to 1
  baseX: number;
  width: number; // normalized width (e.g. 0.88)
  z: number; // 0 (horizon) -> 1 (player line)
  op: GateOp;
  value: number;
  shootable: boolean;
  hitProgress: number;
  shotsPerStep: number;
  moveAmp: number; // horizontal oscillation amplitude
  movePhase: number;
  triggered: boolean;
  flashTimer: number;
}

export type CrateReward =
  | { type: 'GOLD'; amount: number }
  | { type: 'SQUAD'; amount: number }
  | { type: 'WEAPON'; tier: WeaponTier }
  | { type: 'SHIELD'; charges: number }
  | { type: 'DRONE'; count: number };

export interface BarrelEntity {
  id: number;
  x: number;
  z: number;
  radius: number;
  hp: number;
  maxHp: number;
  kind: 'WOOD' | 'STEEL' | 'WEAPON_CRATE' | 'SQUAD_CRATE' | 'SHIELD_CRATE' | 'DRONE_CRATE';
  reward: CrateReward;
  flashTimer: number;
  destroyed: boolean;
}

export interface EnemyUnit {
  offsetX: number;
  offsetZ: number;
  alive: boolean;
}

export interface EnemyGroup {
  id: number;
  x: number;
  z: number;
  speed: number;
  count: number;
  maxCount: number;
  hpPerUnit: number;
  currentFrontHp: number;
  kind: 'RAIDER' | 'BRUTE';
  flashTimer: number;
  units: EnemyUnit[];
}

export interface BossEntity {
  id: number;
  name: string;
  x: number;
  z: number;
  targetZ: number;
  vx: number;
  hp: number;
  maxHp: number;
  kind: 'TANK' | 'HELI' | 'MECH';
  flashTimer: number;
  goldReward: number;
  attackTimer: number;
  rotorAngle: number;
  telegraphLaneX: number | null;
  telegraphTimer: number;
}

export interface EnemyHazard {
  id: number;
  x: number;
  z: number;
  speed: number;
  damage: number;
  radius: number;
}

export interface Bullet {
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  vx: number;
  vz: number;
  damage: number;
  isRocket: boolean;
  isDroneLaser?: boolean;
  aoeRadius: number;
  color: string;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface CoinDrop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export interface HudSnapshot {
  squadCount: number;
  weaponTier: WeaponTier;
  shieldCharges: number;
  droneCount: number;
  hyperCharge: number; // 0..100
  hyperActive: boolean;
  stage: number;
  stageProgress: number; // 0..1
  runGold: number;
  kills: number;
  dps: number;
  bossHp: number | null;
  bossMaxHp: number | null;
  bossName: string | null;
}

export interface StageWaveEvent {
  atDistance: number;
  type: 'GATE_PAIR' | 'SINGLE_GATE' | 'BARRELS' | 'ENEMIES' | 'BOSS';
  payload: unknown;
}

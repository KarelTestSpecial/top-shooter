export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'STAGE_CLEAR' | 'GAME_OVER';

export type BiomeChoice = 'AUTO' | 'COAST' | 'DESERT' | 'REACTOR';

export interface GameplaySettings {
  stageLengthFactor: number; // 1.0 .. 6.0 (step 0.5)
  gameSpeed: number; // 0.6 .. 1.5 (step 0.05)
  enemyHpMult: number; // 0.5 .. 2.5 (step 0.1)
  enemyCountMult: number; // 0.5 .. 2.5 (step 0.1)
  enemyMaxGroupSize: number; // 15 .. 250 (step 5)
  goldMult: number; // 0.5 .. 3.0 (step 0.1)
  startWeapon: WeaponTier;
  startShield: number; // 0 .. 5
  startDrones: number; // 0 .. 6
  biomeChoice: BiomeChoice;
  maxSquadCap: number | null; // 50 .. 1250 or null (unlimited)
  purpleGateFreq: number; // 0 .. 100 (%)
  purpleDoubleChance: number; // 0 .. 100 (%)
  purpleGateMin: number; // 50 .. 1000
  purpleGateMax: number; // 100 .. 1250
  miniBossMult: number; // 0.4 .. 4.0 (step 0.2)
  bossMult: number; // 0.4 .. 4.0 (step 0.2)
  specialSituations: number; // 0 .. 100 (%) — frequentie van veld-pickups, nieuwe vijanden, poorten en omgevingshazards
}

export type WeaponTier = 'RIFLE' | 'DOUBLE' | 'SPREAD' | 'ROCKET' | 'LASER';

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
  settings: GameplaySettings;
  settingsVersion?: number;
}

/** Een handmatig opgeslagen momentopname van de volledige spelersstatus. */
export interface SaveSlot {
  savedAt: number;
  progress: PersistentProgress;
}

/** Vaste 3 opslag-slots (elke kan null/ledig zijn). */
export type SaveSlots = [SaveSlot | null, SaveSlot | null, SaveSlot | null];

export type GateOp =
  | 'ADD'
  | 'SUB'
  | 'MUL'
  | 'DIV'
  | 'RATE_UP'
  | 'DMG_UP'
  | 'CAP_SET'
  | 'SHIELD_ADD'
  | 'DRONE_ADD'
  | 'GOLD_RUSH'
  | 'MYSTERY'
  | 'FREEZE'
  | 'MULTISHOT'
  | 'PIERCE'
  | 'HEAL'
  | 'TIMEWARP'
  | 'FORTIFY'
  | 'BLITZ'
  | 'VAMP';

export interface GateEntity {
  id: number;
  lane: 'left' | 'right' | 'center';
  x: number;
  baseX: number;
  width: number;
  z: number;
  op: GateOp;
  value: number;
  shootable: boolean;
  hitProgress: number;
  shotsPerStep: number;
  moveAmp: number;
  movePhase: number;
  triggered: boolean;
  flashTimer: number;
}

export type CrateReward =
  | { type: 'GOLD'; amount: number }
  | { type: 'SQUAD'; amount: number }
  | { type: 'WEAPON'; tier: WeaponTier }
  | { type: 'SHIELD'; charges: number }
  | { type: 'DRONE'; count: number }
  | { type: 'CRYO'; duration: number }
  | { type: 'HYPER'; charge: number }
  | { type: 'TESLA'; damage: number; chains: number }
  | { type: 'MINE'; radius: number; damage: number }
  | { type: 'TNT'; radius: number; damage: number };

export interface BarrelEntity {
  id: number;
  x: number;
  baseX?: number;
  z: number;
  radius: number;
  hp: number;
  maxHp: number;
  kind:
    | 'WOOD'
    | 'STEEL'
    | 'GOLD_SAFE'
    | 'WEAPON_CRATE'
    | 'SQUAD_CRATE'
    | 'SHIELD_CRATE'
    | 'DRONE_CRATE'
    | 'CRYO_CRATE'
    | 'HYPER_CRATE'
    | 'TESLA_CRATE'
    | 'MINE'
    | 'TNT_BARREL';
  reward: CrateReward;
  moveAmp?: number;
  movePhase?: number;
  flashTimer: number;
  destroyed: boolean;
}

export interface BridgeBarrier {
  id: number;
  x: number;
  baseX?: number;
  width: number;
  z: number;
  hp: number;
  maxHp: number;
  damage: number;
  moveAmp?: number;
  movePhase?: number;
  flashTimer: number;
  destroyed: boolean;
}

export interface EnemyUnit {
  offsetX: number;
  offsetZ: number;
  alive: boolean;
}

export type EnemyKind =
  | 'RAIDER'
  | 'BRUTE'
  | 'RUSHER'
  | 'TURRET'
  | 'BOMBER'
  | 'SNIPER'
  | 'SPLITTER'
  | 'SHIELD_UNIT'
  | 'JUMPER'
  | 'MEDIC'
  | 'MORTAR'
  | 'BERSERKER';

export interface EnemyGroup {
  id: number;
  x: number;
  z: number;
  speed: number;
  count: number;
  maxCount: number;
  hpPerUnit: number;
  currentFrontHp: number;
  kind: EnemyKind;
  fireTimer: number;
  actionTimer?: number;
  shieldHp?: number;
  maxShieldHp?: number;
  aimX?: number;
  aimLocked?: boolean;
  flashTimer: number;
  jumpTimer?: number;
  jumpCooldown?: number;
  healTimer?: number;
  attackMode?: number;
  modeTimer?: number;
  chargeTimer?: number;
  units: EnemyUnit[];
}

export interface BossEntity {
  id: number;
  name: string;
  isMiniBoss: boolean;
  x: number;
  z: number;
  targetZ: number;
  vx: number;
  hp: number;
  maxHp: number;
  kind: 'TANK' | 'HELI' | 'MECH' | 'CARRIER';
  flashTimer: number;
  goldReward: number;
  attackTimer: number;
  rotorAngle: number;
  telegraphLanes: number[];
  telegraphTimer: number;
  summonedReinforcements?: boolean;
  patternStep?: number;
}

export interface FieldPickup {
  id: number;
  x: number;
  z: number;
  kind: 'MAGNET' | 'FRENZY' | 'SQUAD' | 'NUKE';
  value: number;
  collected: boolean;
}

export interface PickupSpec {
  x: number;
  kind: FieldPickup['kind'];
  value: number;
}

export interface MortarStrike {
  id: number;
  x: number;
  z: number;
  timer: number;
  maxTimer: number;
  radius: number;
  damage: number;
  kind: 'MORTAR' | 'LASER' | 'BARRAGE' | 'FLANK';
  droneDamage: boolean;
  radiusMax?: number;
  aimed?: boolean;
}

export interface BeamFlash {
  x: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

export interface LightningArc {
  points: Array<{ x: number; y: number }>;
  life: number;
  maxLife: number;
  color: string;
}

export interface EnemyHazard {
  id: number;
  x: number;
  z: number;
  vx?: number;
  speed: number;
  damage: number;
  radius: number;
  kind?: 'ORB' | 'SNIPER' | 'MISSILE' | 'WAVE';
}

export interface AirstrikeMissile {
  x: number;
  z: number;
  yOffset: number;
  fallSpeed: number;
  damage: number;
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
  isLaser?: boolean;
  isDroneLaser?: boolean;
  pierceLeft: number;
  hitIds: Set<number>;
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
  maxSquadReached: number;
  maxSquadLimit: number | null;
  weaponTier: WeaponTier;
  shieldCharges: number;
  droneCount: number;
  hyperCharge: number; // 0..100
  hyperActive: boolean;
  airstrikeCharge: number; // 0..100
  shockwaveCharge: number; // 0..100
  formation: 'WIDE' | 'FOCUS';
  magnetActive: boolean;
  frenzyActive: boolean;
  cryoActive: boolean;
  freezeActive: boolean;
  timewarpActive?: boolean;
  fortifyActive?: boolean;
  blitzActive?: boolean;
  vampActive?: boolean;
  comboCount: number;
  biomeName: string;
  stage: number;
  stageProgress: number; // 0..1
  runGold: number;
  kills: number;
  dps: number;
  bossHp: number | null;
  bossMaxHp: number | null;
  bossName: string | null;
  bossEnraged: boolean;
  bossIsMini: boolean;
}

export interface StageWaveEvent {
  atDistance: number;
  type:
    | 'GATE_SINGLE'
    | 'GATE_PAIR'
    | 'GATE_TRIO'
    | 'BARRELS'
    | 'BARRIER'
    | 'PICKUPS'
    | 'ENEMIES'
    | 'MINIBOSS'
    | 'BOSS';
  payload: unknown;
  banner?: string;
}

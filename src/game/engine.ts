import {
  ABSOLUTE_MAX_CAP,
  BarrelSpec,
  BarrierSpec,
  EnemySpec,
  GAME_SPEED_CALIBRATION,
  GateSpec,
  generateStageEvents,
  getFireRateMultiplier,
  getFirepowerMultiplier,
  getGoldMultiplier,
  getPlayerWeaponScale,
  getStageCurve,
  getStageLengthMetrics,
  getStartSquadCount,
} from './stages';
import { sound } from './sound';
import {
  AirstrikeMissile,
  BarrelEntity,
  BeamFlash,
  BossEntity,
  BridgeBarrier,
  Bullet,
  CoinDrop,
  EnemyGroup,
  EnemyHazard,
  FieldPickup,
  FloatingText,
  GameplaySettings,
  GateEntity,
  HudSnapshot,
  MortarStrike,
  Particle,
  PickupSpec,
  Shockwave,
  StageWaveEvent,
  UpgradeLevels,
  WeaponTier,
} from './types';

export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onStageClear: (summary: { stage: number; runGold: number; kills: number; squadCount: number }) => void;
  onGameOver: (summary: { stage: number; runGold: number; kills: number; maxSquad: number }) => void;
}

interface BiomeTheme {
  name: string;
  skyTop: string;
  skyMid: string;
  skyBot: string;
  horizonGlow: string;
  deckTop: string;
  deckMid: string;
  deckBot: string;
  curb: string;
}

/**
 * Afstand tussen twee baas-lanes, in genormaliseerde X-eenheden.
 * De treffer-test is |kogel.x - playerX| < hazard-radius + speler-half,
 * dus de ruimte tussen twee kogels moet > 2 × (0.13 + 0.10) = 0.46 zijn,
 * anders is het midden technisch onbereikbaar en word je altijd geraakt.
 * 0.55 geeft ±0.045 speelruimte om er tussen te staan.
 */
const BOSS_LANE_GAP = 0.55;

const BIOMES: BiomeTheme[] = [
  {
    name: 'Kustbrug',
    skyTop: '#070B14',
    skyMid: '#0F172A',
    skyBot: '#09111E',
    horizonGlow: 'rgba(56, 189, 248, 0.18)',
    deckTop: '#1E293B',
    deckMid: '#243247',
    deckBot: '#1A2436',
    curb: 'rgba(56, 189, 248, 0.35)',
  },
  {
    name: 'Woestijnkloof',
    skyTop: '#170B08',
    skyMid: '#2B1610',
    skyBot: '#140B08',
    horizonGlow: 'rgba(245, 158, 11, 0.2)',
    deckTop: '#332924',
    deckMid: '#3D312B',
    deckBot: '#29211D',
    curb: 'rgba(251, 191, 36, 0.35)',
  },
  {
    name: 'Nacht-Reactor',
    skyTop: '#050D11',
    skyMid: '#0A1C22',
    skyBot: '#061116',
    horizonGlow: 'rgba(16, 185, 129, 0.2)',
    deckTop: '#17252B',
    deckMid: '#1C2D34',
    deckBot: '#132026',
    curb: 'rgba(52, 211, 153, 0.36)',
  },
];

const WEAPON_STATS: Record<
  WeaponTier,
  {
    label: string;
    fireInterval: number;
    damage: number;
    pellets: number;
    spread: number;
    isRocket: boolean;
    isLaser: boolean;
    pierce: number;
    aoe: number;
    color: string;
  }
> = {
  RIFLE: { label: 'Rifle', fireInterval: 0.24, damage: 5.5, pellets: 1, spread: 0, isRocket: false, isLaser: false, pierce: 1, aoe: 0, color: '#38BDF8' },
  DOUBLE: { label: 'Dubbel-SMG', fireInterval: 0.16, damage: 5.8, pellets: 2, spread: 0.08, isRocket: false, isLaser: false, pierce: 1, aoe: 0, color: '#60A5FA' },
  SPREAD: { label: 'Shotgun', fireInterval: 0.23, damage: 6.2, pellets: 3, spread: 0.26, isRocket: false, isLaser: false, pierce: 1, aoe: 0, color: '#FBBF24' },
  ROCKET: { label: 'Raketwerper', fireInterval: 0.34, damage: 18, pellets: 1, spread: 0, isRocket: true, isLaser: false, pierce: 1, aoe: 0.28, color: '#FB7185' },
  LASER: { label: 'Plasmakanon', fireInterval: 0.2, damage: 16, pellets: 1, spread: 0, isRocket: false, isLaser: true, pierce: 4, aoe: 0, color: '#C084FC' },
};

export const WEAPON_LABELS: Record<WeaponTier, string> = {
  RIFLE: 'Rifle Squad',
  DOUBLE: 'Dubbel-SMG',
  SPREAD: '3-Way Shotgun',
  ROCKET: 'Raketwerper',
  LASER: 'Plasmakanon',
};

interface DroneUnit {
  id: number;
  slot: number;
  hp: number;
  maxHp: number;
  flashTimer: number;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: EngineCallbacks;

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private running = false;
  private paused = false;

  private width = 640;
  private height = 760;

  // Player state
  private playerX = 0;
  private targetX = 0;
  private keyboardDir = 0;
  private squadCount = 8;
  private currentMaxSquad: number | null = 550;
  private maxSquadReached = 8;
  private weaponTier: WeaponTier = 'RIFLE';
  private shieldCharges = 0;
  private drones: DroneUnit[] = [];
  private droneCooldown = 0;

  private get droneCount(): number {
    return this.drones.length;
  }
  private hyperCharge = 0;
  private hyperTimer = 0;
  private goldRushTimer = 0;
  private cryoTimer = 0;
  private freezeTimer = 0;
  private frenzyTimer = 0;
  private multishotTimer = 0;
  private pierceTimer = 0;
  private magnetTimer = 0;
  private timewarpTimer = 0;
  private fortifyTimer = 0;
  private blitzTimer = 0;
  private vampTimer = 0;
  private specialEnvTimer = 8;
  private airstrikeCharge = 50;
  private comboCount = 0;
  private comboTimer = 0;
  private tempFireRateBonus = 1;
  private tempDamageBonus = 1;
  private upgrades: UpgradeLevels = { startSquad: 0, firepower: 0, fireRate: 0, goldBonus: 0 };

  // Stage state
  private stage = 1;
  private stageLengthUnits = 190;
  private speedMult = 1;
  private difficultyGoldMult = 1;
  private difficultyDmgMult = 1;
  private miniBossDmgMult = 1;
  private bossDmgMult = 1;
  private biome: BiomeTheme = BIOMES[0];
  private distance = 0;
  private scrollSpeed = 7.2;
  private events: StageWaveEvent[] = [];
  private nextEventIndex = 0;
  private bossSpawned = false;
  private runGold = 0;
  private kills = 0;

  // Timers & feedback
  private elapsedTime = 0;
  private fireCooldown = 0;
  private roadScroll = 0;
  private shakeIntensity = 0;
  private damageCooldown = 0;
  private damageFlashTimer = 0;
  private hudSyncTimer = 0;
  private muzzleFlash = 0;
  private nextEntityId = 1;
  private reducedMotion = false;

  // Entities
  private gates: GateEntity[] = [];
  private barrels: BarrelEntity[] = [];
  private barriers: BridgeBarrier[] = [];
  private enemies: EnemyGroup[] = [];
  private boss: BossEntity | null = null;
  private hazards: EnemyHazard[] = [];
  private missiles: AirstrikeMissile[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private coins: CoinDrop[] = [];
  private texts: FloatingText[] = [];
  private pickups: FieldPickup[] = [];
  private mortarStrikes: MortarStrike[] = [];
  private beams: BeamFlash[] = [];
  private settings: GameplaySettings | null = null;

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = context;
    this.callbacks = callbacks;
    if (import.meta.env.DEV) {
      // Dev-only test-hook: laat een headless bot de engine lezen en aansturen.
      (window as unknown as { __poortRush?: GameEngine }).__poortRush = this;
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }

  resize(cssWidth: number, cssHeight: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(320, cssWidth);
    this.height = Math.max(420, cssHeight);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  startStage(stage: number, upgrades: UpgradeLevels, settings: GameplaySettings) {
    this.stage = stage;
    this.settings = settings;
    this.stageLengthUnits = getStageLengthMetrics(settings.stageLengthFactor, stage).units;
    this.speedMult = settings.gameSpeed * GAME_SPEED_CALIBRATION;
    this.difficultyGoldMult = settings.goldMult;
    this.difficultyDmgMult = Math.sqrt(settings.enemyHpMult);
    this.miniBossDmgMult = Math.sqrt(settings.miniBossMult);
    this.bossDmgMult = Math.sqrt(settings.bossMult);

    if (settings.biomeChoice === 'COAST') this.biome = BIOMES[0];
    else if (settings.biomeChoice === 'DESERT') this.biome = BIOMES[1];
    else if (settings.biomeChoice === 'REACTOR') this.biome = BIOMES[2];
    else this.biome = BIOMES[(stage - 1) % BIOMES.length];

    this.currentMaxSquad = settings.maxSquadCap === null ? null : Math.min(ABSOLUTE_MAX_CAP, settings.maxSquadCap);
    this.upgrades = { ...upgrades };
    this.playerX = 0;
    this.targetX = 0;
    this.keyboardDir = 0;
    this.squadCount = this.clampSquad(getStartSquadCount(upgrades));
    this.maxSquadReached = this.squadCount;
    this.weaponTier = settings.startWeapon;
    this.shieldCharges = settings.startShield;
    this.drones = [];
    this.addDrones(settings.startDrones);
    this.droneCooldown = 0;
    this.hyperCharge = 0;
    this.hyperTimer = 0;
    this.goldRushTimer = 0;
    this.cryoTimer = 0;
    this.freezeTimer = 0;
    this.frenzyTimer = 0;
    this.multishotTimer = 0;
    this.pierceTimer = 0;
    this.magnetTimer = 0;
    this.timewarpTimer = 0;
    this.fortifyTimer = 0;
    this.blitzTimer = 0;
    this.vampTimer = 0;
    this.specialEnvTimer = 8;
    this.airstrikeCharge = 55;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.tempFireRateBonus = 1;
    this.tempDamageBonus = 1;

    this.distance = 0;
    this.scrollSpeed = (7.2 + Math.min(2.6, (stage - 1) * 0.35)) * this.speedMult;
    this.events = generateStageEvents(stage, settings);
    this.nextEventIndex = 0;
    this.bossSpawned = false;
    this.runGold = 0;
    this.kills = 0;

    this.gates = [];
    this.barrels = [];
    this.barriers = [];
    this.enemies = [];
    this.boss = null;
    this.hazards = [];
    this.missiles = [];
    this.bullets = [];
    this.particles = [];
    this.shockwaves = [];
    this.coins = [];
    this.texts = [];
    this.pickups = [];
    this.mortarStrikes = [];
    this.beams = [];

    this.elapsedTime = 0;
    this.fireCooldown = 0;
    this.shakeIntensity = 0;
    this.damageCooldown = 0;
    this.damageFlashTimer = 0;
    this.paused = false;
    this.running = true;

    this.pushHud();
    this.lastTimestamp = performance.now();
    this.loop(this.lastTimestamp);
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (!paused && this.running) {
      this.lastTimestamp = performance.now();
    }
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  setTargetXNormalized(normX: number) {
    this.targetX = Math.max(-0.78, Math.min(0.78, normX));
  }

  setKeyboardDir(dir: number) {
    this.keyboardDir = dir;
  }

  triggerAirstrike(): boolean {
    if (!this.running || this.paused || this.airstrikeCharge < 100) return false;
    this.airstrikeCharge = 0;
    sound.playAirstrike();

    const baseDamage =
      (65 + this.squadCount * 3.5) *
      getFirepowerMultiplier(this.upgrades) *
      getPlayerWeaponScale(this.stage);
    const lanes = [-0.62, -0.36, -0.1, 0.16, 0.42, 0.64];
    lanes.forEach((lx, idx) => {
      this.missiles.push({
        x: lx,
        z: 0.3 + (idx % 3) * 0.18,
        yOffset: 240 + idx * 45,
        fallSpeed: 680,
        damage: baseDamage,
      });
    });

    this.spawnFloatingText(this.width * 0.5, this.height * 0.25, 'LUCHTAANVAL INGEZET!', '#FB7185', 1.4);
    this.pushHud();
    return true;
  }

  renderIdleBackdrop() {
    this.elapsedTime += 0.016;
    this.roadScroll = (this.roadScroll + 0.008) % 1;
    this.render();
  }

  private project(normX: number, z: number) {
    const horizonY = this.height * 0.12;
    const bottomY = this.height * 0.87;
    const easedZ = Math.pow(Math.max(0, z), 1.28);
    const y = horizonY + (bottomY - horizonY) * easedZ;
    const topHalfW = this.width * 0.24;
    const bottomHalfW = this.width * 0.46;
    const halfW = topHalfW + (bottomHalfW - topHalfW) * easedZ;
    const cx = this.width * 0.5;
    const x = cx + normX * halfW;
    const scale = 0.42 + 0.68 * easedZ;
    return { x, y, halfW, scale };
  }

  private loop = (timestamp: number) => {
    if (!this.running) return;
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));

    if (!this.paused) {
      this.update(dt);
    }
    this.render();

    if (this.running) {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  private update(dt: number) {
    this.elapsedTime += dt;

    if (this.keyboardDir !== 0) {
      this.setTargetXNormalized(this.targetX + this.keyboardDir * 1.45 * dt);
    }
    const lerpSpeed = 16;
    this.playerX += (this.targetX - this.playerX) * Math.min(1, lerpSpeed * dt);

    if (this.hyperTimer > 0) {
      this.hyperTimer = Math.max(0, this.hyperTimer - dt);
      if (this.hyperTimer === 0) {
        this.hyperCharge = 0;
      }
    }

    if (this.goldRushTimer > 0) {
      this.goldRushTimer = Math.max(0, this.goldRushTimer - dt);
    }
    if (this.cryoTimer > 0) {
      this.cryoTimer = Math.max(0, this.cryoTimer - dt);
    }
    if (this.freezeTimer > 0) {
      this.freezeTimer = Math.max(0, this.freezeTimer - dt);
    }
    if (this.frenzyTimer > 0) {
      this.frenzyTimer = Math.max(0, this.frenzyTimer - dt);
    }
    if (this.multishotTimer > 0) {
      this.multishotTimer = Math.max(0, this.multishotTimer - dt);
    }
    if (this.pierceTimer > 0) {
      this.pierceTimer = Math.max(0, this.pierceTimer - dt);
    }
    if (this.magnetTimer > 0) {
      this.magnetTimer = Math.max(0, this.magnetTimer - dt);
    }
    if (this.timewarpTimer > 0) {
      this.timewarpTimer = Math.max(0, this.timewarpTimer - dt);
    }
    if (this.fortifyTimer > 0) {
      this.fortifyTimer = Math.max(0, this.fortifyTimer - dt);
    }
    if (this.blitzTimer > 0) {
      this.blitzTimer = Math.max(0, this.blitzTimer - dt);
    }
    if (this.vampTimer > 0) {
      this.vampTimer = Math.max(0, this.vampTimer - dt);
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
      }
    }

    if (this.airstrikeCharge < 100) {
      this.airstrikeCharge = Math.min(100, this.airstrikeCharge + dt * 4.5);
    }

    const activeBoss = this.boss !== null;
    if (!activeBoss) {
      this.distance += this.scrollSpeed * dt;
      this.roadScroll = (this.roadScroll + dt * 1.48 * this.speedMult) % 1;
    } else {
      this.roadScroll = (this.roadScroll + dt * 0.35 * this.speedMult) % 1;
    }

    while (this.nextEventIndex < this.events.length && this.distance >= this.events[this.nextEventIndex].atDistance) {
      this.spawnEvent(this.events[this.nextEventIndex]);
      this.nextEventIndex++;
    }

    this.updateSpecialEnvironment(dt);
    this.updateShooting(dt);
    this.updateDroneShooting(dt);
    this.updateDrones(dt);
    this.updateMissiles(dt);
    this.updateBullets(dt);
    this.updateGates(dt);
    this.updateBarrels(dt);
    this.updatePickups(dt);
    this.updateBarriers(dt);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateHazards(dt);
    this.updateMortarStrikes(dt);
    this.updateParticles(dt);
    this.updateShockwaves(dt);
    this.updateBeams(dt);
    this.updateCoins(dt);
    this.updateTexts(dt);

    if (this.timewarpTimer > 0 && !this.boss) {
      this.distance += this.scrollSpeed * dt * 0.35;
      this.roadScroll = (this.roadScroll + dt * 0.5 * this.speedMult) % 1;
    }
    if (this.vampTimer > 0) {
      const vampHeal = this.squadCount * 0.08 * dt;
      this.squadCount = Math.min(this.currentMaxSquad ?? Infinity, this.squadCount + vampHeal);
      this.maxSquadReached = Math.max(this.maxSquadReached, Math.floor(this.squadCount));
    }

    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 28);
    }
    if (this.damageCooldown > 0) {
      this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    }
    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt);
    }
    if (this.muzzleFlash > 0) {
      this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 12);
    }

    if (this.squadCount <= 0) {
      this.squadCount = 0;
      this.running = false;
      this.pushHud();
      sound.playExplosion();
      this.callbacks.onGameOver({
        stage: this.stage,
        runGold: this.runGold,
        kills: this.kills,
        maxSquad: this.maxSquadReached,
      });
      return;
    }

    this.hudSyncTimer += dt;
    if (this.hudSyncTimer >= 0.08) {
      this.hudSyncTimer = 0;
      this.pushHud();
    }
  }

  private registerComboHit(amount = 1) {
    this.comboCount += amount;
    this.comboTimer = 2.4;
    if (this.comboCount === 15 || this.comboCount === 30 || this.comboCount === 50) {
      const proj = this.project(this.playerX, 0.9);
      this.spawnFloatingText(proj.x, proj.y - 54, `${this.comboCount}× COMBO!`, '#FDE047', 1.25);
    }
  }

  private addHyperCharge(amount: number) {
    this.airstrikeCharge = Math.min(100, this.airstrikeCharge + amount * 0.4);
    if (this.hyperTimer > 0) return;
    this.hyperCharge = Math.min(100, this.hyperCharge + amount);
    if (this.hyperCharge >= 100) {
      this.hyperTimer = 5.5;
      sound.playHyperStart();
      const proj = this.project(this.playerX, 0.92);
      this.spawnShockwave(proj.x, proj.y, '#FACC15', 110);
      this.spawnFloatingText(proj.x, proj.y - 44, 'HYPERVUUR! 2× GOUD', '#FDE047', 1.35);
    }
  }

  private awardGold(baseAmount: number, worldX?: number, worldY?: number) {
    const hyperMult = this.hyperTimer > 0 ? 2 : 1;
    const goldRushMult = this.goldRushTimer > 0 ? 1.5 : 1;
    const earned = Math.max(
      1,
      Math.round(
        baseAmount * getGoldMultiplier(this.upgrades) * this.difficultyGoldMult * hyperMult * goldRushMult,
      ),
    );
    this.runGold += earned;
    if (worldX !== undefined && worldY !== undefined) {
      const coinCount = Math.min(6, Math.max(1, Math.ceil(earned / 6)));
      for (let i = 0; i < coinCount; i++) {
        this.coins.push({
          x: worldX + (Math.random() - 0.5) * 20,
          y: worldY + (Math.random() - 0.5) * 14,
          vx: (Math.random() - 0.5) * 90,
          vy: -70 - Math.random() * 60,
          life: 0.65,
          maxLife: 0.65,
        });
      }
    }
    return earned;
  }

  private createGate(lane: 'left' | 'right' | 'center', x: number, width: number, spec: GateSpec, phase: number): GateEntity {
    return {
      id: this.nextEntityId++,
      lane,
      x,
      baseX: x,
      width,
      z: 0.02,
      op: spec.op,
      value: spec.value,
      shootable: spec.shootable,
      hitProgress: 0,
      shotsPerStep: spec.shotsPerStep,
      moveAmp: spec.moveAmp ?? 0,
      movePhase: phase,
      triggered: false,
      flashTimer: 0,
    };
  }

  private spawnEvent(ev: StageWaveEvent) {
    if (ev.type === 'GATE_SINGLE') {
      const payload = ev.payload as { x: number; width: number; gate: GateSpec };
      this.gates.push(this.createGate('center', payload.x, payload.width, payload.gate, 0));
    } else if (ev.type === 'GATE_PAIR') {
      const payload = ev.payload as { left: GateSpec; right: GateSpec };
      this.gates.push(this.createGate('left', -0.49, 0.86, payload.left, 0));
      this.gates.push(this.createGate('right', 0.49, 0.86, payload.right, Math.PI));
    } else if (ev.type === 'GATE_TRIO') {
      const payload = ev.payload as { left: GateSpec; center: GateSpec; right: GateSpec };
      this.gates.push(this.createGate('left', -0.64, 0.56, payload.left, 0));
      this.gates.push(this.createGate('center', 0.0, 0.56, payload.center, Math.PI * 0.5));
      this.gates.push(this.createGate('right', 0.64, 0.56, payload.right, Math.PI));
    } else if (ev.type === 'BARRIER') {
      const specs = ev.payload as BarrierSpec[];
      for (const br of specs) {
        this.barriers.push({
          id: this.nextEntityId++,
          x: br.x,
          width: br.width,
          z: 0.02,
          hp: br.hp,
          maxHp: br.hp,
          damage: br.damage,
          flashTimer: 0,
          destroyed: false,
        });
      }
    } else if (ev.type === 'BARRELS') {
      const specs = ev.payload as BarrelSpec[];
      for (const b of specs) {
        const reward =
          b.kind === 'WEAPON_CRATE'
            ? { type: 'WEAPON' as const, tier: b.weaponTier ?? 'DOUBLE' }
            : b.kind === 'SQUAD_CRATE'
            ? { type: 'SQUAD' as const, amount: b.squadBonus ?? 6 }
            : b.kind === 'SHIELD_CRATE'
            ? { type: 'SHIELD' as const, charges: 1 }
            : b.kind === 'DRONE_CRATE'
            ? { type: 'DRONE' as const, count: 1 }
            : b.kind === 'CRYO_CRATE'
            ? { type: 'CRYO' as const, duration: 6 }
            : b.kind === 'HYPER_CRATE'
            ? { type: 'HYPER' as const, charge: 50 }
            : b.kind === 'TESLA_CRATE'
            ? {
                type: 'TESLA' as const,
                damage: Math.round(70 * Math.pow(1.24, this.stage - 1)),
                chains: 6 + Math.min(4, Math.floor(this.stage / 3)),
              }
            : b.kind === 'TNT_BARREL'
            ? {
                type: 'TNT' as const,
                radius: 0.75,
                damage: Math.round(95 * Math.pow(1.36, this.stage - 1) * this.difficultyDmgMult),
              }
            : { type: 'GOLD' as const, amount: b.goldAmount ?? (b.kind === 'GOLD_SAFE' ? 40 + this.stage * 5 : 12) };

        this.barrels.push({
          id: this.nextEntityId++,
          x: b.x,
          z: 0.02,
          radius: b.kind === 'WOOD' || b.kind === 'STEEL' || b.kind === 'TNT_BARREL' ? 0.14 : 0.16,
          hp: b.hp,
          maxHp: b.hp,
          kind: b.kind,
          reward,
          flashTimer: 0,
          destroyed: false,
        });
      }
    } else if (ev.type === 'ENEMIES') {
      const specs = ev.payload as EnemySpec[];
      for (const e of specs) {
        const hpPerUnit = Math.max(1, Math.round(e.hpPerUnit * this.squadThreatFactor()));
        const spriteCap = Math.min(36, e.count);
        const cols = Math.min(6, Math.ceil(Math.sqrt(spriteCap)));
        const units = Array.from({ length: spriteCap }, (_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          return {
            offsetX: (col - (cols - 1) / 2) * 0.072 + (Math.random() - 0.5) * 0.015,
            offsetZ: -row * 0.024,
            alive: true,
          };
        });
        this.enemies.push({
          id: this.nextEntityId++,
          x: e.x,
          z: 0.02,
          speed: e.speed ?? 0.25,
          count: e.count,
          maxCount: e.count,
          hpPerUnit,
          currentFrontHp: hpPerUnit,
          kind: e.kind,
          fireTimer:
            e.kind === 'TURRET'
              ? 0.95
              : e.kind === 'SNIPER'
              ? 1.6
              : e.kind === 'RAIDER'
              ? 1.15 + Math.random() * 0.85
              : e.kind === 'MORTAR'
                ? 1.8
                : 0,
          attackMode: e.kind === 'TURRET' || e.kind === 'RAIDER' ? Math.floor(Math.random() * 2) : undefined,
          modeTimer: e.kind === 'TURRET' || e.kind === 'RAIDER' ? 3 + Math.random() * 4 : undefined,
          chargeTimer: e.kind === 'BERSERKER' ? 1.8 : undefined,
          shieldHp: e.kind === 'SHIELD_UNIT' ? Math.round(hpPerUnit * 3.2) : 0,
          maxShieldHp: e.kind === 'SHIELD_UNIT' ? Math.round(hpPerUnit * 3.2) : 0,
          jumpCooldown: e.kind === 'JUMPER' ? 1.1 : undefined,
          healTimer: e.kind === 'MEDIC' ? 1.6 : undefined,
          flashTimer: 0,
          units,
        });
      }
    } else if (ev.type === 'PICKUPS') {
      const specs = ev.payload as PickupSpec[];
      for (const p of specs) {
        this.pickups.push({
          id: this.nextEntityId++,
          x: p.x,
          z: 0.02,
          kind: p.kind,
          value: p.value,
          collected: false,
        });
      }
    } else if (ev.type === 'MINIBOSS' || ev.type === 'BOSS') {
      const isMini = ev.type === 'MINIBOSS';
      const payload = ev.payload as { kind: BossEntity['kind']; name: string; hp: number; goldReward: number };
      if (!isMini) this.bossSpawned = true;
      const bossHp = Math.round(
        payload.hp *
          (isMini
            ? this.squadThreatFactor(0.38, 1.95) * this.miniBuildFactor()
            : this.squadThreatFactor(0.44, 2.6) * this.bossBuildFactor()),
      );
      this.boss = {
        id: this.nextEntityId++,
        name: payload.name,
        isMiniBoss: isMini,
        kind: payload.kind,
        x: 0,
        z: 0.02,
        targetZ: payload.kind === 'CARRIER' ? 0.3 : isMini ? 0.36 : 0.34,
        vx:
          payload.kind === 'CARRIER'
            ? isMini
              ? 0.18
              : 0.26
            : payload.kind === 'HELI'
              ? isMini
                ? 0.28
                : 0.36
              : isMini
                ? 0.22
                : 0.28,
        hp: bossHp,
        maxHp: bossHp,
        flashTimer: 0,
        goldReward: payload.goldReward,
        attackTimer: payload.kind === 'CARRIER' ? 1.2 : isMini ? 1.55 : 1.25,
        patternStep: 0,
        rotorAngle: 0,
        telegraphLanes: [],
        telegraphTimer: 0,
        summonedReinforcements: false,
      };
      sound.playBossAlert();
      this.spawnFloatingText(
        this.width * 0.5,
        this.height * 0.3,
        `${isMini ? 'MINI-BAAS' : 'EINDBAAS'}: ${payload.name.toUpperCase()}`,
        isMini ? '#FBBF24' : '#F87171',
        1.35,
      );
    }
  }

  private updateShooting(dt: number) {
    const spec = WEAPON_STATS[this.weaponTier];
    const hyperMult = this.hyperTimer > 0 ? 1.55 : 1;
    const frenzyMult = this.frenzyTimer > 0 ? 2 : 1;
    const effectiveRate = getFireRateMultiplier(this.upgrades) * this.tempFireRateBonus * hyperMult * frenzyMult;
    const interval = spec.fireInterval / effectiveRate;

    this.fireCooldown -= dt;
    if (this.fireCooldown > 0) return;
    this.fireCooldown = interval * (this.blitzTimer > 0 ? 0.55 : 1);

    const activeShooters = Math.min(7, Math.max(1, Math.ceil(this.squadCount / 4)));
    const effectiveSquadPower = Math.pow(this.squadCount, 0.6);
    const fortifyMult = this.fortifyTimer > 0 ? 1.35 : 1;
    const stagePower = getPlayerWeaponScale(this.stage);
    const dmgScale =
      (effectiveSquadPower / activeShooters) *
      getFirepowerMultiplier(this.upgrades) *
      this.tempDamageBonus *
      fortifyMult *
      stagePower;
    const critChance = Math.min(0.4, this.comboCount * 0.012);
    const isCrit = Math.random() < critChance;
    const bulletDamage =
      spec.damage *
      dmgScale *
      0.48 *
      (this.hyperTimer > 0 ? 1.2 : 1) *
      (this.frenzyTimer > 0 ? 1.5 : 1) *
      (isCrit ? 1.75 : 1);

    const extraPellets = this.multishotTimer > 0 ? 2 : 0;
    const totalPellets = spec.pellets + extraPellets;
    const spread = spec.pellets > 1 ? spec.spread : 0.1;

    this.muzzleFlash = 1;
    sound.playShot(spec.isRocket, this.hyperTimer > 0, spec.isLaser);

    for (let s = 0; s < activeShooters; s++) {
      const spreadIdx = activeShooters === 1 ? 0 : s - (activeShooters - 1) / 2;
      const originX = this.playerX + spreadIdx * 0.042;
      const originZ = 0.94;

      for (let p = 0; p < totalPellets; p++) {
        const pelletOffset = totalPellets === 1 ? 0 : (p - (totalPellets - 1) / 2) * spread;
        const bx = originX + pelletOffset * 0.06;
        this.bullets.push({
          x: bx,
          z: originZ,
          prevX: bx,
          prevZ: originZ,
          vx: pelletOffset * 0.72,
          vz: spec.isLaser ? -1.85 : -1.48,
          damage: bulletDamage / totalPellets,
          isRocket: spec.isRocket,
          isLaser: spec.isLaser,
          pierceLeft: spec.pierce + (this.pierceTimer > 0 ? 3 : 0),
          hitIds: new Set<number>(),
          aoeRadius: spec.aoe,
          color: this.hyperTimer > 0 && !spec.isRocket && !spec.isLaser ? '#FDE047' : spec.color,
        });
      }
    }
  }

  private addDrones(amount: number) {
    const maxDrones = 6;
    for (let n = 0; n < amount; n++) {
      if (this.drones.length >= maxDrones) return;
      let slot = 0;
      while (slot < maxDrones && this.drones.some((d) => d.slot === slot)) slot++;
      if (slot >= maxDrones) return;
      this.drones.push({ id: this.nextEntityId++, slot, hp: 4, maxHp: 4, flashTimer: 0 });
    }
  }

  private droneX(slot: number): number {
    const side = slot % 2 === 0 ? -1 : 1;
    const tierOffset = Math.floor(slot / 2) * 0.08;
    return this.playerX + side * (0.24 + tierOffset);
  }

  private randomDroneX(): number | null {
    if (this.drones.length === 0) return null;
    const drone = this.drones[Math.floor(Math.random() * this.drones.length)];
    return this.droneX(drone.slot);
  }

  private damageDrone(drone: DroneUnit, dmg: number) {
    if (drone.hp <= 0) return;
    drone.hp -= dmg;
    drone.flashTimer = 0.12;
    const p = this.project(this.droneX(drone.slot), 0.9);
    this.spawnParticles(p.x, p.y - 22, '#34D399', 4);
    if (drone.hp <= 0) {
      this.drones = this.drones.filter((d) => d.id !== drone.id);
      this.spawnParticles(p.x, p.y - 22, '#34D399', 18);
      this.spawnParticles(p.x, p.y - 22, '#FDE047', 8);
      this.spawnShockwave(p.x, p.y - 22, '#34D399', 70);
      this.spawnFloatingText(p.x, p.y - 46, 'DRONE NEER!', '#6EE7B7', 1.15);
      sound.playDroneDown();
      sound.playExplosion();
      if (!this.reducedMotion) this.shakeIntensity = Math.min(7, this.shakeIntensity + 3);
      this.pushHud();
    } else {
      sound.playHit();
    }
  }

  private updateDrones(dt: number) {
    for (const d of this.drones) {
      if (d.flashTimer > 0) d.flashTimer = Math.max(0, d.flashTimer - dt);
    }
  }

  private updateDroneShooting(dt: number) {
    if (this.droneCount <= 0) return;
    this.droneCooldown -= dt;
    if (this.droneCooldown > 0) return;
    this.droneCooldown = this.hyperTimer > 0 ? 0.22 : 0.34;

    const dmg =
      8.5 *
      getFirepowerMultiplier(this.upgrades) *
      this.tempDamageBonus *
      getPlayerWeaponScale(this.stage);
    for (const drone of this.drones) {
      const dx = this.droneX(drone.slot);
      this.bullets.push({
        x: dx,
        z: 0.9,
        prevX: dx,
        prevZ: 0.9,
        vx: 0,
        vz: -1.7,
        damage: dmg,
        isRocket: false,
        isDroneLaser: true,
        pierceLeft: 1,
        hitIds: new Set<number>(),
        aoeRadius: 0,
        color: '#22D3EE',
      });
    }
  }

  private updateMissiles(dt: number) {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.yOffset -= m.fallSpeed * dt;
      if (m.yOffset <= 0) {
        const proj = this.project(m.x, m.z);
        this.spawnParticles(proj.x, proj.y, '#FB7185', 18);
        this.spawnParticles(proj.x, proj.y, '#FDE047', 10);
        this.spawnShockwave(proj.x, proj.y, '#FB7185', 95);
        sound.playExplosion();
        if (!this.reducedMotion) this.shakeIntensity = Math.min(10, this.shakeIntensity + 4);

        for (const barrel of this.barrels) {
          if (!barrel.destroyed && Math.hypot(barrel.x - m.x, (barrel.z - m.z) * 1.6) < 0.42) {
            this.damageBarrel(barrel, m.damage);
          }
        }
        for (const br of this.barriers) {
          if (!br.destroyed && Math.abs(br.z - m.z) < 0.28 && Math.abs(br.x - m.x) < br.width * 0.65) {
            this.damageBarrier(br, m.damage);
          }
        }
        for (const group of this.enemies) {
          if (group.count > 0 && Math.hypot(group.x - m.x, (group.z - m.z) * 1.6) < 0.48) {
            this.damageEnemyGroup(group, m.damage);
          }
        }
        if (this.boss && Math.hypot(this.boss.x - m.x, (this.boss.z - m.z) * 1.4) < 0.52) {
          this.damageBoss(m.damage);
        }
        this.missiles.splice(i, 1);
      }
    }
  }

  private updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.prevX = b.x;
      b.prevZ = b.z;
      b.x += b.vx * dt;
      b.z += b.vz * dt;

      if (b.z < 0.01 || Math.abs(b.x) > 1.05) {
        this.bullets.splice(i, 1);
        continue;
      }

      let removeBullet = false;

      for (const barrel of this.barrels) {
        if (barrel.destroyed || b.hitIds.has(barrel.id)) continue;
        if (Math.abs(b.z - barrel.z) < 0.055 && Math.abs(b.x - barrel.x) < barrel.radius) {
          b.hitIds.add(barrel.id);
          this.damageBarrel(barrel, b.damage);
          if (b.isRocket) {
            this.triggerAoeBlast(b.x, b.z, b.damage * 1.4, b.aoeRadius, '#FB923C');
          }
          b.pierceLeft -= 1;
          if (b.pierceLeft <= 0) {
            removeBullet = true;
            break;
          }
        }
      }
      if (removeBullet) {
        this.bullets.splice(i, 1);
        continue;
      }

      for (const br of this.barriers) {
        if (br.destroyed || b.hitIds.has(br.id)) continue;
        if (Math.abs(b.z - br.z) < 0.045 && Math.abs(b.x - br.x) < br.width * 0.5) {
          b.hitIds.add(br.id);
          this.damageBarrier(br, b.damage);
          if (b.isRocket) {
            this.triggerAoeBlast(b.x, b.z, b.damage * 1.3, b.aoeRadius, '#FB923C');
          }
          b.pierceLeft -= 1;
          if (b.pierceLeft <= 0) {
            removeBullet = true;
            break;
          }
        }
      }
      if (removeBullet) {
        this.bullets.splice(i, 1);
        continue;
      }

      for (const group of this.enemies) {
        if (group.count <= 0 || b.hitIds.has(group.id)) continue;
        if (group.kind === 'JUMPER' && (group.jumpTimer ?? 0) > 0.12) continue;
        if (Math.abs(b.z - group.z) < 0.065 && Math.abs(b.x - group.x) < 0.24) {
          b.hitIds.add(group.id);
          this.damageEnemyGroup(group, b.damage);
          if (b.isRocket) {
            this.triggerAoeBlast(b.x, b.z, b.damage * 1.35, b.aoeRadius, '#FB923C');
          }
          b.pierceLeft -= 1;
          if (b.pierceLeft <= 0) {
            removeBullet = true;
            break;
          }
        }
      }
      if (removeBullet) {
        this.bullets.splice(i, 1);
        continue;
      }

      if (this.boss && !b.hitIds.has(this.boss.id) && Math.abs(b.z - this.boss.z) < 0.095 && Math.abs(b.x - this.boss.x) < 0.28) {
        b.hitIds.add(this.boss.id);
        this.damageBoss(b.damage);
        if (b.isRocket) {
          this.triggerAoeBlast(b.x, b.z, b.damage * 0.65, b.aoeRadius, '#FB923C');
        }
        this.bullets.splice(i, 1);
        continue;
      }

      for (const gate of this.gates) {
        if (gate.triggered || !gate.shootable) continue;
        if (Math.abs(b.z - gate.z) < 0.032 && Math.abs(b.x - gate.x) < gate.width * 0.5) {
          gate.hitProgress += 1;
          gate.flashTimer = 0.08;
          if (gate.hitProgress >= gate.shotsPerStep) {
            gate.hitProgress = 0;
            gate.value += 1;
            const proj = this.project(gate.x, gate.z);
            this.spawnParticles(proj.x, proj.y, gate.value >= 0 ? '#38BDF8' : '#F87171', 3);
          }
          this.bullets.splice(i, 1);
          break;
        }
      }
    }
  }

  private triggerAoeBlast(x: number, z: number, aoeDmg: number, radius: number, color: string) {
    const proj = this.project(x, z);
    this.spawnParticles(proj.x, proj.y, color, 16);
    this.spawnParticles(proj.x, proj.y, '#FDE047', 10);
    this.spawnShockwave(proj.x, proj.y, color, radius > 0.4 ? 125 : 74);
    if (!this.reducedMotion) {
      this.shakeIntensity = Math.min(9, this.shakeIntensity + (radius > 0.4 ? 6 : 3));
    }
    sound.playExplosion();

    for (const barrel of this.barrels) {
      if (!barrel.destroyed && Math.hypot(barrel.x - x, (barrel.z - z) * 1.8) < radius) {
        this.damageBarrel(barrel, aoeDmg);
      }
    }
    for (const br of this.barriers) {
      if (!br.destroyed && Math.abs(br.z - z) < radius * 0.7 && Math.abs(br.x - x) < br.width * 0.6 + radius * 0.5) {
        this.damageBarrier(br, aoeDmg);
      }
    }
    for (const group of this.enemies) {
      if (group.count > 0 && Math.hypot(group.x - x, (group.z - z) * 1.8) < radius) {
        this.damageEnemyGroup(group, aoeDmg);
      }
    }
    if (this.boss && Math.hypot(this.boss.x - x, (this.boss.z - z) * 1.5) < radius) {
      this.damageBoss(aoeDmg * 0.6);
    }
  }

  private triggerTeslaBlast(origin: { x: number; z: number }, damage: number, chains: number) {
    const targets = this.enemies
      .filter((g) => g.count > 0 && Math.hypot(g.x - origin.x, (g.z - origin.z) * 1.6) < 1.15)
      .sort(
        (a, b) =>
          Math.hypot(a.x - origin.x, (a.z - origin.z) * 1.6) -
          Math.hypot(b.x - origin.x, (b.z - origin.z) * 1.6),
      )
      .slice(0, chains);

    const originProj = this.project(origin.x, origin.z);
    this.spawnShockwave(originProj.x, originProj.y, '#C084FC', 110);
    this.spawnParticles(originProj.x, originProj.y, '#C084FC', 18);
    sound.playExplosion();

    let prev = originProj;
    for (const g of targets) {
      const p = this.project(g.x, g.z);
      const segments = 5;
      for (let s = 0; s <= segments; s++) {
        const t = s / segments;
        const jitterX = (Math.random() - 0.5) * 16 * (1 - Math.abs(t - 0.5));
        const jitterY = (Math.random() - 0.5) * 10;
        this.spawnParticles(
          prev.x + (p.x - prev.x) * t + jitterX,
          prev.y + (p.y - prev.y) * t + jitterY,
          '#C084FC',
          1,
        );
      }
      this.damageEnemyGroup(g, damage);
      this.spawnShockwave(p.x, p.y, '#A855F7', 55);
      prev = p;
    }
    if (this.boss && Math.hypot(this.boss.x - origin.x, (this.boss.z - origin.z) * 1.4) < 1.15) {
      this.damageBoss(damage * 0.8);
      const bp = this.project(this.boss.x, this.boss.z);
      this.spawnShockwave(bp.x, bp.y, '#A855F7', 70);
    }
  }

  private damageBarrier(br: BridgeBarrier, dmg: number) {
    if (br.destroyed) return;
    br.hp -= dmg;
    br.flashTimer = 0.08;
    sound.playHit();
    if (br.hp <= 0) {
      br.destroyed = true;
      br.hp = 0;
      const proj = this.project(br.x, br.z);
      sound.playCrateBreak(false);
      this.spawnParticles(proj.x, proj.y, '#F87171', 14);
      this.spawnShockwave(proj.x, proj.y, '#EF4444', 60);
      const earned = this.awardGold(18, proj.x, proj.y);
      this.spawnFloatingText(proj.x, proj.y - 18, `BARRIÈRE DOORBROKEN +${earned}`, '#FBBF24', 1.15);
    }
  }

  private damageBarrel(barrel: BarrelEntity, dmg: number) {
    if (barrel.destroyed) return;
    barrel.hp -= dmg;
    barrel.flashTimer = 0.08;
    sound.playHit();
    const proj = this.project(barrel.x, barrel.z);
    if (Math.random() < 0.4) {
      this.spawnParticles(proj.x, proj.y, barrel.kind === 'WEAPON_CRATE' ? '#FBBF24' : '#A16207', 2);
    }
    if (barrel.hp <= 0) {
      barrel.destroyed = true;
      barrel.hp = 0;
      const isSpecial = barrel.reward.type !== 'GOLD';
      sound.playCrateBreak(isSpecial);
      this.spawnParticles(proj.x, proj.y, isSpecial ? '#FACC15' : '#F59E0B', 14);
      this.spawnShockwave(proj.x, proj.y, isSpecial ? '#FDE047' : '#F59E0B', 52);
      this.addHyperCharge(14);
      this.registerComboHit(1);

      if (barrel.reward.type === 'GOLD') {
        const earned = this.awardGold(barrel.reward.amount, proj.x, proj.y);
        sound.playCoin();
        this.spawnFloatingText(proj.x, proj.y - 16, `+${earned} Goud`, '#FBBF24', 1.0);
      } else if (barrel.reward.type === 'SQUAD') {
        this.addSquad(barrel.reward.amount);
        this.spawnFloatingText(proj.x, proj.y - 16, `+${barrel.reward.amount} Soldaten!`, '#38BDF8', 1.2);
      } else if (barrel.reward.type === 'WEAPON') {
        this.upgradeWeapon(barrel.reward.tier);
        this.spawnFloatingText(proj.x, proj.y - 20, `WAPEN: ${WEAPON_LABELS[barrel.reward.tier].toUpperCase()}`, '#FDE047', 1.25);
      } else if (barrel.reward.type === 'SHIELD') {
        this.shieldCharges = Math.min(5, this.shieldCharges + barrel.reward.charges);
        this.spawnFloatingText(proj.x, proj.y - 20, 'ENERGIESCHILD ACTIEF!', '#22D3EE', 1.2);
      } else if (barrel.reward.type === 'DRONE') {
        this.addDrones(barrel.reward.count);
        this.spawnFloatingText(proj.x, proj.y - 20, '+1 AANVALSDRONE!', '#34D399', 1.2);
      } else if (barrel.reward.type === 'CRYO') {
        this.cryoTimer = Math.max(this.cryoTimer, barrel.reward.duration);
        sound.playCryoFreeze();
        this.spawnShockwave(proj.x, proj.y, '#22D3EE', 95);
        this.spawnFloatingText(proj.x, proj.y - 22, 'CRYO! Vijanden traag', '#67E8F9', 1.2);
      } else if (barrel.reward.type === 'HYPER') {
        this.addHyperCharge(barrel.reward.charge);
        sound.playHyperCrate();
        this.spawnFloatingText(proj.x, proj.y - 20, `+${barrel.reward.charge}% HYPERVUUR`, '#FDE047', 1.2);
      } else if (barrel.reward.type === 'TESLA') {
        sound.playTeslaZap();
        this.triggerTeslaBlast(barrel, barrel.reward.damage, barrel.reward.chains);
        this.spawnFloatingText(proj.x, proj.y - 22, 'TESLA-KETEN!', '#C084FC', 1.25);
      } else if (barrel.reward.type === 'TNT') {
        this.spawnFloatingText(proj.x, proj.y - 24, 'TNT BOEM!', '#EF4444', 1.35);
        this.triggerAoeBlast(barrel.x, barrel.z, barrel.reward.damage, barrel.reward.radius, '#EF4444');
      }
    }
  }

  private upgradeWeapon(tier: WeaponTier) {
    const order: WeaponTier[] = ['RIFLE', 'DOUBLE', 'SPREAD', 'ROCKET', 'LASER'];
    const currentIdx = order.indexOf(this.weaponTier);
    const nextIdx = order.indexOf(tier);
    if (nextIdx > currentIdx) {
      this.weaponTier = tier;
    } else {
      this.tempFireRateBonus = Math.min(2.3, this.tempFireRateBonus + 0.15);
    }
  }

  private damageEnemyGroup(group: EnemyGroup, dmg: number) {
    group.flashTimer = 0.07;
    sound.playHit();
    let remaining = dmg;
    const proj = this.project(group.x, group.z);

    // SHIELD_UNIT: het energieschild absorbeert alle schade tot het breekt.
    if ((group.shieldHp ?? 0) > 0 && remaining > 0) {
      const absorbed = Math.min(group.shieldHp ?? 0, remaining);
      group.shieldHp = (group.shieldHp ?? 0) - absorbed;
      remaining -= absorbed;
      this.spawnParticles(proj.x, proj.y - 18, '#38BDF8', 4);
      if ((group.shieldHp ?? 0) <= 0) {
        group.shieldHp = 0;
        this.spawnShockwave(proj.x, proj.y - 16, '#38BDF8', 64);
        this.spawnParticles(proj.x, proj.y - 16, '#7DD3FC', 14);
        this.spawnFloatingText(proj.x, proj.y - 40, 'SCHILD DOORBROKEN!', '#7DD3FC', 1.1);
        sound.playShieldBlock();
      } else {
        return;
      }
    }

    while (remaining > 0 && group.count > 0) {
      if (remaining >= group.currentFrontHp) {
        remaining -= group.currentFrontHp;
        group.count -= 1;
        this.kills += 1;
        this.registerComboHit(1);
        group.currentFrontHp = group.hpPerUnit;
        if (Math.random() < 0.65) {
          this.spawnParticles(proj.x, proj.y, '#EF4444', 3);
        }
        this.awardGold(
          group.kind === 'MEDIC'
            ? 5
            : group.kind === 'BRUTE' || group.kind === 'TURRET' || group.kind === 'SHIELD_UNIT' || group.kind === 'MORTAR'
              ? 4
              : group.kind === 'JUMPER'
                ? 3
                : 1,
          proj.x,
          proj.y,
        );
        this.addHyperCharge(group.kind === 'BRUTE' || group.kind === 'TURRET' ? 6 : 2.5);
      } else {
        group.currentFrontHp -= remaining;
        remaining = 0;
      }
    }
    this.syncEnemyUnits(group);
    if (group.kind === 'BOMBER' && group.count <= 0 && group.z < 0.88) {
      this.spawnFloatingText(proj.x, proj.y - 20, 'BOMBER BOEM!', '#FB923C', 1.15);
      const bomberBlast = Math.round(58 * Math.pow(1.36, this.stage - 1) * this.difficultyDmgMult);
      this.triggerAoeBlast(group.x, group.z, bomberBlast, 0.38, '#FB923C');
    }
    if (group.kind === 'SPLITTER' && group.count <= 0) {
      this.spawnSplitGroup(group);
    }
  }

  private spawnSplitGroup(parent: EnemyGroup) {
    const count = Math.max(2, Math.ceil(parent.maxCount * 0.35));
    const hp = Math.max(1, Math.round(parent.hpPerUnit * 0.55));
    const proj = this.project(parent.x, parent.z);
    for (const side of [-1, 1]) {
      const spriteCap = Math.min(18, count);
      const cols = Math.min(5, Math.ceil(Math.sqrt(spriteCap)));
      const units = Array.from({ length: spriteCap }, (_, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        return {
          offsetX: (col - (cols - 1) / 2) * 0.07 + (Math.random() - 0.5) * 0.015,
          offsetZ: -row * 0.024,
          alive: true,
        };
      });
      this.enemies.push({
        id: this.nextEntityId++,
        x: Math.max(-0.76, Math.min(0.76, parent.x + side * 0.07)),
        z: Math.min(1.04, parent.z + 0.02),
        speed: 0.52,
        count,
        maxCount: count,
        hpPerUnit: hp,
        currentFrontHp: hp,
        kind: 'RUSHER',
        fireTimer: 0,
        flashTimer: 0,
        units,
      });
    }
    this.spawnFloatingText(proj.x, proj.y - 18, 'SPLIT!', '#4ADE80', 1.1);
  }

  private syncEnemyUnits(group: EnemyGroup) {
    if (group.units.length === 0) return;
    const targetAlive =
      group.count <= 0
        ? 0
        : Math.min(group.units.length, Math.max(1, Math.ceil((group.count / Math.max(1, group.maxCount)) * group.units.length)));
    let aliveCount = 0;
    for (let idx = group.units.length - 1; idx >= 0; idx--) {
      if (aliveCount < targetAlive) {
        group.units[idx].alive = true;
        aliveCount++;
      } else {
        group.units[idx].alive = false;
      }
    }
  }

  private damageBoss(dmg: number) {
    if (!this.boss) return;
    this.boss.hp -= dmg;
    this.boss.flashTimer = 0.06;
    sound.playHit();
    this.addHyperCharge(0.65);
    const proj = this.project(this.boss.x, this.boss.z);
    if (Math.random() < 0.35) {
      this.spawnParticles(proj.x + (Math.random() - 0.5) * 40, proj.y, '#F97316', 2);
    }

    if (this.boss.hp <= 0) {
      const defeated = this.boss;
      this.boss = null;
      this.hazards = [];
      const earned = this.awardGold(defeated.goldReward, proj.x, proj.y);
      this.kills += 1;
      this.spawnParticles(proj.x, proj.y, '#FBBF24', 36);
      this.spawnParticles(proj.x, proj.y, '#EF4444', 24);
      this.spawnShockwave(proj.x, proj.y, '#FDE047', 150);
      sound.playExplosion();

      if (defeated.isMiniBoss) {
        sound.playCrateBreak(true);
        this.addSquad(4);
        this.spawnFloatingText(proj.x, proj.y - 24, `MINI-BAAS VERSLAGEN! +${earned} GOUD`, '#FDE047', 1.35);
        if (!this.reducedMotion) this.shakeIntensity = 7;
        return;
      }

      sound.playStageClear();
      if (!this.reducedMotion) {
        this.shakeIntensity = 10;
      }
      this.running = false;
      this.pushHud();
      this.callbacks.onStageClear({
        stage: this.stage,
        runGold: this.runGold,
        kills: this.kills,
        squadCount: this.squadCount,
      });
    }
  }

  private absorbOrDamageSquad(loss: number, label = '', respectIFrames = false) {
    if (respectIFrames && this.damageCooldown > 0) {
      return;
    }

    if (this.shieldCharges > 0) {
      this.shieldCharges -= 1;
      if (respectIFrames) this.damageCooldown = 0.25;
      sound.playShieldBlock();
      const proj = this.project(this.playerX, 0.92);
      this.spawnShockwave(proj.x, proj.y, '#22D3EE', 78);
      this.spawnFloatingText(proj.x, proj.y - 34, 'SCHILD GEBLOKT!', '#22D3EE', 1.2);
      return;
    }

    const before = this.squadCount;
    this.comboCount = 0;
    this.squadCount = Math.max(0, this.squadCount - loss);
    const actualLoss = before - this.squadCount;
    if (respectIFrames) {
      this.damageCooldown = 0.6;
    }
    this.damageFlashTimer = 0.36;

    sound.playNegativeGate();
    const proj = this.project(this.playerX, 0.94);
    this.spawnParticles(proj.x, proj.y, '#EF4444', 14);
    this.spawnShockwave(proj.x, proj.y, '#EF4444', 64);
    this.spawnFloatingText(proj.x, proj.y - 30, label || `-${actualLoss} Soldaten`, '#FCA5A5', 1.25);
    if (!this.reducedMotion) this.shakeIntensity = 6;
  }

  private updateGates(dt: number) {
    const zSpeed = 0.25 * this.speedMult;
    for (let i = this.gates.length - 1; i >= 0; i--) {
      const g = this.gates[i];
      g.z += zSpeed * dt;
      if (g.moveAmp > 0) {
        g.movePhase += dt * 2.1;
        g.x = g.baseX + Math.sin(g.movePhase) * g.moveAmp;
      }
      if (g.flashTimer > 0) g.flashTimer = Math.max(0, g.flashTimer - dt);

      if (!g.triggered && g.z >= 0.91 && g.z <= 0.99) {
        if (Math.abs(this.playerX - g.x) <= g.width * 0.5 + 0.06) {
          g.triggered = true;
          for (const other of this.gates) {
            if (other.id !== g.id && Math.abs(other.z - g.z) < 0.08) {
              other.triggered = true;
            }
          }
          this.applyGateEffect(g);
        }
      }

      if (g.z > 1.12) {
        this.gates.splice(i, 1);
      }
    }
  }

  private applyGateEffect(g: GateEntity) {
    const proj = this.project(this.playerX, 0.94);
    let label = '';

    if (g.op === 'ADD') {
      if (g.value >= 0) {
        this.addSquad(g.value);
        label = `+${g.value} Soldaten!`;
      } else {
        this.absorbOrDamageSquad(Math.abs(g.value), `${g.value} Soldaten`);
        return;
      }
    } else if (g.op === 'SUB') {
      this.absorbOrDamageSquad(g.value, `-${g.value} Soldaten`);
      return;
    } else if (g.op === 'MUL') {
      const before = this.squadCount;
      this.squadCount = this.clampSquad(this.squadCount * g.value);
      this.maxSquadReached = Math.max(this.maxSquadReached, this.squadCount);
      label = `×${g.value} (${this.squadCount - before}+)`;
    } else if (g.op === 'DIV') {
      const target = Math.max(1, Math.floor(this.squadCount / Math.max(2, g.value)));
      this.absorbOrDamageSquad(this.squadCount - target, `÷${g.value}`);
      return;
    } else if (g.op === 'RATE_UP') {
      this.tempFireRateBonus = Math.min(2.4, this.tempFireRateBonus + g.value / 100);
      label = `+${g.value}% Vuursnelheid`;
    } else if (g.op === 'DMG_UP') {
      this.tempDamageBonus = Math.min(2.8, this.tempDamageBonus + g.value / 100);
      label = `+${g.value}% Vuurkracht`;
    } else if (g.op === 'CAP_SET') {
      const targetCap = Math.min(ABSOLUTE_MAX_CAP, g.value);
      const prevCap = this.currentMaxSquad;
      const prevSquad = this.squadCount;
      this.currentMaxSquad = targetCap;
      if (this.squadCount > targetCap) {
        this.squadCount = targetCap;
      }
      const lost = prevSquad - this.squadCount;
      const lowered = prevCap === null || targetCap < prevCap;

      if (lowered) {
        sound.playNegativeGate();
        if (lost > 0) {
          this.comboCount = 0;
          this.spawnParticles(proj.x, proj.y, '#EF4444', 14);
          this.spawnFloatingText(proj.x, proj.y - 30, `MAX ${targetCap} (-${lost} Soldaten!)`, '#FB923C', 1.25);
          if (!this.reducedMotion) this.shakeIntensity = 6;
        } else {
          this.spawnParticles(proj.x, proj.y, '#C084FC', 10);
          this.spawnFloatingText(proj.x, proj.y - 30, `MAX LIMIET -> ${targetCap}`, '#E9D5FF', 1.2);
        }
        return;
      }

      if (prevCap === targetCap) {
        sound.playPositiveGate();
        this.spawnFloatingText(proj.x, proj.y - 30, `MAX BLIJFT ${targetCap}`, '#E9D5FF', 1.15);
        return;
      }

      sound.playPositiveGate();
      this.addHyperCharge(10);
      this.spawnParticles(proj.x, proj.y, '#C084FC', 14);
      this.spawnShockwave(proj.x, proj.y, '#A855F7', 68);
      this.spawnFloatingText(proj.x, proj.y - 34, `MAX LIMIET -> ${targetCap}!`, '#E9D5FF', 1.25);
      return;
    } else if (g.op === 'SHIELD_ADD') {
      const amount = Math.max(1, Math.round(g.value));
      this.shieldCharges = Math.min(5, this.shieldCharges + amount);
      label = `+${amount} Schild`;
    } else if (g.op === 'DRONE_ADD') {
      const amount = Math.max(1, Math.round(g.value));
      this.addDrones(amount);
      label = `+${amount} Drone`;
    } else if (g.op === 'GOLD_RUSH') {
      this.goldRushTimer = Math.max(this.goldRushTimer, 12);
      label = `+${g.value}% Goud (12s)`;
    } else if (g.op === 'MYSTERY') {
      sound.playMysteryGate();
      const roll = Math.random();
      if (roll < 0.3) {
        const bonus = 10 + this.stage * 2;
        this.addSquad(bonus);
        label = `+${bonus} Soldaten!`;
      } else if (roll < 0.52) {
        this.shieldCharges = Math.min(5, this.shieldCharges + 1);
        label = '+1 Schild!';
      } else if (roll < 0.72) {
        this.addDrones(1);
        label = '+1 Drone!';
      } else if (roll < 0.88) {
        this.addHyperCharge(40);
        label = '+40 Hypervuur!';
      } else {
        const bonus = this.awardGold(40 + this.stage * 10, proj.x, proj.y);
        label = `+${bonus} Goud!`;
      }
    } else if (g.op === 'FREEZE') {
      this.freezeTimer = Math.max(this.freezeTimer, g.value);
      label = `TIJDSTILST ${g.value}s`;
    } else if (g.op === 'MULTISHOT') {
      this.multishotTimer = Math.max(this.multishotTimer, 12);
      label = `+${g.value} EXTRA SCHOTEN`;
    } else if (g.op === 'PIERCE') {
      this.pierceTimer = Math.max(this.pierceTimer, 12);
      label = `DOORBOOR +${g.value}`;
    } else if (g.op === 'HEAL') {
      const amount = Math.max(4, Math.round((this.squadCount * g.value) / 100));
      this.addSquad(amount);
      label = `+${amount} HERSTEL`;
    } else if (g.op === 'TIMEWARP') {
      this.timewarpTimer = Math.max(this.timewarpTimer, g.value);
      label = `TIJDSVERSNELLING ${g.value}s`;
    } else if (g.op === 'FORTIFY') {
      this.fortifyTimer = Math.max(this.fortifyTimer, g.value);
      label = `FORTIFICATIE ${g.value}s`;
    } else if (g.op === 'BLITZ') {
      this.blitzTimer = Math.max(this.blitzTimer, g.value);
      label = `BLITZ ${g.value}s`;
    } else if (g.op === 'VAMP') {
      this.vampTimer = Math.max(this.vampTimer, g.value);
      label = `VAMPIRISME ${g.value}s`;
    }

    sound.playPositiveGate();
    this.addHyperCharge(10);
    this.spawnParticles(proj.x, proj.y, '#38BDF8', 14);
    this.spawnShockwave(proj.x, proj.y, '#38BDF8', 68);
    this.spawnFloatingText(proj.x, proj.y - 34, label, '#38BDF8', 1.25);
  }

  /**
   * Zachte rubber-band: vijanden en bazen schalen mee met de squad die de
   * speler bij het spawnen heeft. Een grote squad blijft sterk, maar knaagt
   * niet meer in één kogel een hele golf van 5-HP-soldaten weg.
   */
  private squadThreatFactor(exponent = 0.5, cap = 4.2): number {
    const ratio = Math.max(1, this.squadCount) / 6;
    return Math.min(cap, Math.max(1, Math.pow(ratio, exponent)));
  }

  /**
   * Eindbazen schaalden enkel mee met de squad-grootte, niet met het wapen.
   * Wie met een ROCKET/LASER en volop upgrades aankwam, sloeg de baas in
   * enkele seconden plat. Deze factor (sqrt, want een baas mag geen
   * kogelspons worden) compenseert het wapen, de vuurkracht/Vuursnelheid-
   * upgrades en tijdelijke poort-buffs op het moment van spawnen.
   */
  private miniBuildFactor(): number {
    const tierMult: Record<WeaponTier, number> = {
      RIFLE: 1,
      SPREAD: 1.14,
      DOUBLE: 1.22,
      ROCKET: 1.38,
      LASER: 1.55,
    };
    const upgradeMult = getFirepowerMultiplier(this.upgrades) * getFireRateMultiplier(this.upgrades);
    return Math.min(2.3, tierMult[this.weaponTier] * Math.pow(upgradeMult, 0.2));
  }

  private bossBuildFactor(): number {
    const tierBase: Record<WeaponTier, number> = {
      RIFLE: 0.92,
      SPREAD: 1.15,
      DOUBLE: 1.32,
      ROCKET: 1.85,
      LASER: 2.35,
    };
    const upgradeMult = getFirepowerMultiplier(this.upgrades) * getFireRateMultiplier(this.upgrades);
    const tempMult = Math.max(1, this.tempDamageBonus * this.tempFireRateBonus);
    const droneMult = 1 + this.drones.length * 0.05;
    return Math.min(4.0, Math.pow(tierBase[this.weaponTier] * upgradeMult * tempMult * droneMult, 0.45));
  }

  private clampSquad(value: number): number {
    return this.currentMaxSquad === null ? value : Math.min(this.currentMaxSquad, value);
  }

  private addSquad(amount: number) {
    this.squadCount = this.clampSquad(this.squadCount + amount);
    this.maxSquadReached = Math.max(this.maxSquadReached, this.squadCount);
  }

  private updateBarriers(dt: number) {
    const zSpeed = 0.25 * this.speedMult;
    for (let i = this.barriers.length - 1; i >= 0; i--) {
      const br = this.barriers[i];
      if (br.destroyed) {
        this.barriers.splice(i, 1);
        continue;
      }
      br.z += zSpeed * dt;
      if (br.flashTimer > 0) br.flashTimer = Math.max(0, br.flashTimer - dt);

      if (br.z >= 0.91 && br.z <= 0.99 && Math.abs(this.playerX - br.x) < br.width * 0.5 + 0.05) {
        br.destroyed = true;
        const loss = Math.min(br.damage, Math.max(2, Math.ceil(this.squadCount * 0.18)));
        this.absorbOrDamageSquad(loss, `-${loss} Barrière`, true);
      }

      if (br.z > 1.1) {
        this.barriers.splice(i, 1);
      }
    }
  }

  private updateBarrels(dt: number) {
    const zSpeed = 0.25 * this.speedMult;
    for (let i = this.barrels.length - 1; i >= 0; i--) {
      const b = this.barrels[i];
      if (b.destroyed) {
        this.barrels.splice(i, 1);
        continue;
      }
      b.z += zSpeed * dt;
      if (b.flashTimer > 0) b.flashTimer = Math.max(0, b.flashTimer - dt);

      if (b.z >= 0.9 && b.z <= 0.99 && Math.abs(this.playerX - b.x) < b.radius + 0.08) {
        if (b.kind === 'TNT_BARREL') {
          b.destroyed = true;
          this.absorbOrDamageSquad(
            Math.max(2, Math.min(10, Math.ceil(this.squadCount * 0.15))),
            'TNT BOEM!',
            true,
          );
          this.triggerAoeBlast(b.x, b.z, 70, 0.45, '#EF4444');
        } else {
          const loss = Math.max(2, Math.min(8, Math.ceil(b.hp / 22)));
          b.destroyed = true;
          this.absorbOrDamageSquad(loss, `-${loss} Botsing`, true);
        }
      }

      if (b.z > 1.1) {
        this.barrels.splice(i, 1);
      }
    }
  }

  private updateEnemies(dt: number) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const g = this.enemies[i];
      if (g.count <= 0) {
        this.enemies.splice(i, 1);
        continue;
      }

      const slow = this.cryoTimer > 0 ? 0.45 : 1;
      const frozen = this.freezeTimer > 0;
      const timewarp = this.timewarpTimer > 0 ? 1.35 : 1;
      const speedDt = dt * this.speedMult * slow * timewarp;
      if (!frozen) {
        g.z += g.speed * speedDt;
        if (g.kind === 'TURRET') {
          g.fireTimer -= speedDt;
          if (g.fireTimer <= 0 && g.z < 0.78) {
            const attackMode = g.attackMode ?? 0;
            g.fireTimer = Math.max(0.95, (attackMode === 1 ? 1.15 : 1.5) - this.stage * 0.05);
            const dmg = Math.max(1, Math.round((2 + Math.floor(this.stage * 0.5)) * this.difficultyDmgMult));
            const targetX = Math.random() < 0.35 ? (this.randomDroneX() ?? g.x) : g.x;
            if (attackMode === 1) {
              const spread = this.stage >= 5 ? 0.11 : 0.07;
              for (const dx of [-spread, 0, spread]) {
                this.hazards.push({
                  id: this.nextEntityId++,
                  x: Math.max(-0.78, Math.min(0.78, targetX + dx)),
                  z: g.z + 0.03,
                  speed: 0.5,
                  damage: dmg,
                  radius: 0.08,
                });
              }
            } else if (this.stage >= 3) {
              for (const dx of [-0.09, 0.09]) {
                this.hazards.push({
                  id: this.nextEntityId++,
                  x: Math.max(-0.78, Math.min(0.78, targetX + dx)),
                  z: g.z + 0.03,
                  speed: 0.48,
                  damage: dmg,
                  radius: 0.09,
                });
              }
            } else {
              this.hazards.push({
                id: this.nextEntityId++,
                x: targetX,
                z: g.z + 0.03,
                speed: 0.48,
                damage: dmg,
                radius: 0.1,
              });
            }
            if (g.modeTimer !== undefined) {
              g.modeTimer -= 1;
              if (g.modeTimer <= 0) {
                g.attackMode = attackMode === 1 ? 0 : 1;
                g.modeTimer = 3 + Math.random() * 3;
              }
            }
          }
        } else if (g.kind === 'RAIDER') {
          if (g.count >= 4 && g.z > 0.24 && g.z < 0.68) {
            g.fireTimer -= speedDt;
            if (g.fireTimer <= 0) {
              const attackMode = g.attackMode ?? 0;
              g.fireTimer = Math.max(1.3, (attackMode === 1 ? 1.8 : 2.4) - this.stage * 0.04);
              const targetX = Math.random() < 0.3 ? (this.randomDroneX() ?? g.x) : g.x;
              if (attackMode === 1) {
                for (const dx of [-0.06, 0.06]) {
                  this.hazards.push({
                    id: this.nextEntityId++,
                    x: Math.max(-0.78, Math.min(0.78, targetX + dx)),
                    z: g.z + 0.03,
                    speed: 0.48,
                    damage: Math.max(1, Math.round((1 + Math.floor(this.stage * 0.4)) * this.difficultyDmgMult)),
                    radius: 0.07,
                  });
                }
              } else {
                this.hazards.push({
                  id: this.nextEntityId++,
                  x: targetX,
                  z: g.z + 0.03,
                  speed: 0.45,
                  damage: Math.max(1, Math.round((1 + Math.floor(this.stage * 0.4)) * this.difficultyDmgMult)),
                  radius: 0.08,
                });
              }
              if (g.modeTimer !== undefined) {
                g.modeTimer -= 1;
                if (g.modeTimer <= 0) {
                  g.attackMode = attackMode === 1 ? 0 : 1;
                  g.modeTimer = 3 + Math.random() * 3;
                }
              }
            }
          }
          if (g.z > 0.52) {
            g.x += (this.playerX - g.x) * Math.min(1, dt * 1.0);
          }
        } else if (g.kind === 'RUSHER') {
          g.x += Math.sin(this.elapsedTime * 5.2 + g.id) * 0.34 * dt;
          if (g.z > 0.46) {
            g.x += (this.playerX - g.x) * Math.min(1, dt * 1.45);
          }
          g.x = Math.max(-0.76, Math.min(0.76, g.x));
        } else if (g.kind === 'BOMBER') {
          g.x += Math.sin(this.elapsedTime * 4.0 + g.id) * 0.22 * dt;
          if (g.z > 0.44) {
            g.x += (this.playerX - g.x) * Math.min(1, dt * 1.25);
          }
          g.x = Math.max(-0.76, Math.min(0.76, g.x));
        } else if (g.kind === 'SNIPER') {
          g.fireTimer -= speedDt;
          if (g.fireTimer <= 0 && g.z < 0.84) {
            const telegraph = Math.max(0.95, 1.9 - this.stage * 0.05);
            g.fireTimer = telegraph + 1.0;
            const lead = this.playerX + (Math.random() - 0.5) * 0.18;
            const aimed = Math.random() < 0.65;
            this.mortarStrikes.push({
              id: this.nextEntityId++,
              x: Math.max(-0.78, Math.min(0.78, lead)),
              z: 0.9,
              timer: telegraph,
              maxTimer: telegraph,
              radius: 0.07,
              damage: Math.max(2, Math.round((3 + Math.floor(this.stage * 0.7)) * this.difficultyDmgMult)),
              kind: 'LASER',
              droneDamage: aimed,
              aimed,
            });
            if (!aimed) {
              this.spawnFloatingText(this.width * 0.5, this.height * 0.16, 'SNIPER RICHT ZICH — BEWEEG!', '#E9D5FF', 0.95);
            }
            sound.playSniperShot();
          }
        } else if (g.kind === 'SPLITTER') {
          g.x += Math.sin(this.elapsedTime * 3.6 + g.id) * 0.24 * dt;
          if (g.z > 0.5) {
            g.x += (this.playerX - g.x) * Math.min(1, dt * 0.95);
          }
          g.x = Math.max(-0.76, Math.min(0.76, g.x));
        } else if (g.kind === 'JUMPER') {
          g.jumpCooldown = (g.jumpCooldown ?? 1.2) - speedDt;
          if ((g.jumpTimer ?? 0) > 0) {
            g.jumpTimer = Math.max(0, (g.jumpTimer ?? 0) - dt);
            if ((g.jumpTimer ?? 0) === 0) {
              const jp = this.project(g.x, g.z);
              this.spawnShockwave(jp.x, jp.y, '#FDBA74', 40);
            }
          } else if ((g.jumpCooldown ?? 0) <= 0 && g.z < 0.86) {
            g.jumpTimer = 0.55;
            g.jumpCooldown = 2.4;
            g.z = Math.min(0.99, g.z + 0.04);
          }
          if (g.z > 0.5) {
            g.x += (this.playerX - g.x) * Math.min(1, dt * 1.2);
          }
          g.x = Math.max(-0.76, Math.min(0.76, g.x));
        } else if (g.kind === 'MEDIC') {
          g.healTimer = (g.healTimer ?? 1.6) - speedDt;
          if ((g.healTimer ?? 0) <= 0 && g.z < 0.82) {
            g.healTimer = 2.4;
            this.healNearbyEnemies(g);
          }
          if (g.z > 0.5) {
            g.x += (this.playerX - g.x) * Math.min(1, dt * 0.5);
          }
        } else if (g.kind === 'MORTAR') {
          g.fireTimer -= speedDt;
          if (g.fireTimer <= 0 && g.z < 0.8) {
            const barrage = Math.random() < 0.3;
            g.fireTimer = Math.max(2.0, (barrage ? 3.2 : 2.6) - this.stage * 0.05);
            if (barrage) {
              const lead = this.playerX + (Math.random() - 0.5) * 0.2;
              for (const dx of [-0.24, 0, 0.24]) {
                this.mortarStrikes.push({
                  id: this.nextEntityId++,
                  x: Math.max(-0.74, Math.min(0.74, lead + dx)),
                  z: 0.9,
                  timer: 1.35,
                  maxTimer: 1.35,
                  radius: 0.14,
                  damage: Math.max(2, Math.round((2 + Math.floor(this.stage * 0.45)) * this.difficultyDmgMult * 0.85)),
                  kind: 'BARRAGE',
                  droneDamage: false,
                });
              }
            } else {
              const lead = this.playerX + (Math.random() - 0.5) * 0.16;
              this.mortarStrikes.push({
                id: this.nextEntityId++,
                x: Math.max(-0.74, Math.min(0.74, lead)),
                z: 0.9,
                timer: 1.15,
                maxTimer: 1.15,
                radius: 0.18,
                damage: Math.max(2, Math.round((2 + Math.floor(this.stage * 0.5)) * this.difficultyDmgMult)),
                kind: 'MORTAR',
                droneDamage: false,
              });
            }
            sound.playMortarShot();
          }
        } else if (g.kind === 'SHIELD_UNIT') {
          if (g.z > 0.45) {
            g.x += (this.playerX - g.x) * Math.min(1, dt * 0.6);
          }
          g.x = Math.max(-0.76, Math.min(0.76, g.x));
        } else if (g.kind === 'BERSERKER') {
          g.chargeTimer = (g.chargeTimer ?? 0) - speedDt;
          if ((g.chargeTimer ?? 0) <= 0 && g.z < 0.8) {
            g.chargeTimer = 3.2;
            g.z = Math.min(0.98, g.z + 0.08);
            const jp = this.project(g.x, g.z);
            this.spawnShockwave(jp.x, jp.y, '#F87171', 45);
          }
          if (g.z > 0.4) {
            g.x += (this.playerX - g.x) * Math.min(1, dt * 1.7);
          }
          g.x = Math.max(-0.76, Math.min(0.76, g.x));
        } else if (g.z > 0.55) {
          g.x += (this.playerX - g.x) * Math.min(1, dt * 0.85);
        }
      }

      if (g.flashTimer > 0) g.flashTimer = Math.max(0, g.flashTimer - dt);

      const airborne = g.kind === 'JUMPER' && (g.jumpTimer ?? 0) > 0.12;
      if (!airborne && g.z >= 0.91 && g.z <= 1.02 && Math.abs(this.playerX - g.x) < 0.28) {
        if (this.damageCooldown > 0) continue;
        const maxSingleHit = Math.max(1, Math.ceil(this.squadCount * 0.15));
        const baseLoss = g.kind === 'BOMBER' ? Math.max(3, g.count * 2) : g.kind === 'BERSERKER' ? Math.max(3, g.count + 2) : g.count;
        const loss = Math.min(maxSingleHit, baseLoss);
        if (g.kind === 'BOMBER') {
          g.count = 0;
          const proj = this.project(g.x, g.z);
          this.spawnParticles(proj.x, proj.y, '#FB923C', 16);
          this.spawnShockwave(proj.x, proj.y, '#EF4444', 82);
          sound.playExplosion();
        } else {
          g.count -= Math.min(g.count, loss);
        }
        this.syncEnemyUnits(g);
        if (g.count <= 0) {
          this.enemies.splice(i, 1);
        } else {
          g.z -= g.kind === 'BRUTE' ? 0.16 : 0.24;
          g.flashTimer = 0.12;
        }
        this.absorbOrDamageSquad(loss, g.kind === 'BOMBER' ? `-${loss} Bomber-Knall!` : g.kind === 'BERSERKER' ? `-${loss} Berserker!` : `-${loss} Tegenaanval`, true);
        if (Math.random() < 0.3) {
          const drone = this.drones.find((d) => Math.abs(this.droneX(d.slot) - g.x) < 0.35);
          if (drone) this.damageDrone(drone, 1);
        }
        continue;
      }

      if (g.z > 1.12) {
        this.enemies.splice(i, 1);
      }
    }
  }

  private spawnBossReinforcements(boss: BossEntity) {
    const escortCount = Math.max(6, Math.min(28, 6 + this.stage * 2));
    const unitHp = Math.round(
      5.5 * getStageCurve(this.stage, 1.32, 1.12) * this.difficultyDmgMult * this.squadThreatFactor(),
    );
    for (const sideX of [-0.52, 0.52]) {
      const spriteCap = Math.min(24, escortCount);
      const cols = Math.min(5, Math.ceil(Math.sqrt(spriteCap)));
      const units = Array.from({ length: spriteCap }, (_, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        return {
          offsetX: (col - (cols - 1) / 2) * 0.07 + (Math.random() - 0.5) * 0.015,
          offsetZ: -row * 0.024,
          alive: true,
        };
      });
      this.enemies.push({
        id: this.nextEntityId++,
        x: sideX,
        z: boss.z + 0.06,
        speed: 0.34,
        count: escortCount,
        maxCount: escortCount,
        hpPerUnit: unitHp,
        currentFrontHp: unitHp,
        kind: sideX < 0 ? 'RUSHER' : 'RAIDER',
        fireTimer: 1.2,
        flashTimer: 0,
        units,
      });
    }
    this.spawnFloatingText(this.width * 0.5, this.height * 0.24, 'VERSTERKINGEN INGESCHAKELD!', '#FBBF24', 1.25);
  }

  private updateBoss(dt: number) {
    if (!this.boss) return;
    const boss = this.boss;
    const enraged = !boss.isMiniBoss && boss.hp < boss.maxHp * 0.55;
    boss.rotorAngle += dt * (enraged ? 24 : 16);

    if (!boss.isMiniBoss && !boss.summonedReinforcements && boss.hp < boss.maxHp * 0.65) {
      boss.summonedReinforcements = true;
      this.spawnBossReinforcements(boss);
    }

    if (this.freezeTimer <= 0) {
      if (boss.z < boss.targetZ) {
        boss.z = Math.min(boss.targetZ, boss.z + 0.16 * dt);
      } else {
        const speedMult =
          (enraged ? 1.45 : 1) * (boss.kind === 'HELI' ? 1.25 : boss.kind === 'CARRIER' ? 1.05 : 1);
        boss.x += boss.vx * speedMult * dt;
        if (boss.x > 0.55) {
          boss.x = 0.55;
          boss.vx = -Math.abs(boss.vx);
        } else if (boss.x < -0.55) {
          boss.x = -0.55;
          boss.vx = Math.abs(boss.vx);
        }

        if (boss.telegraphLanes.length > 0) {
          boss.telegraphTimer -= dt * this.speedMult;
          if (boss.telegraphTimer <= 0) {
            const bossTypeDmgMult = boss.isMiniBoss ? this.miniBossDmgMult : this.bossDmgMult;
            for (const laneX of boss.telegraphLanes) {
              this.hazards.push({
                id: this.nextEntityId++,
                x: laneX,
                z: boss.z + 0.05,
                speed: enraged ? 0.56 : 0.49,
                damage: Math.max(1, Math.round(((boss.isMiniBoss ? 2 : 3) + this.stage) * this.difficultyDmgMult * bossTypeDmgMult)),
                radius: 0.13,
              });
            }
            boss.telegraphLanes = [];
          }
        } else {
          boss.attackTimer -= dt * this.speedMult;
          if (boss.attackTimer <= 0) {
            const bossTypeDmgMult = boss.isMiniBoss ? this.miniBossDmgMult : this.bossDmgMult;
            const paceMult = bossTypeDmgMult > 1 ? 1.15 : bossTypeDmgMult < 1 ? 0.88 : 1;
            const baseInterval = boss.isMiniBoss ? 1.65 : enraged ? 1.15 : boss.kind === 'CARRIER' ? 1.3 : 1.45;
            const minInterval = boss.kind === 'CARRIER' ? 0.56 : 0.68;
            boss.attackTimer = Math.max(minInterval, (baseInterval - this.stage * 0.07) / paceMult);
            const primary = Math.max(-0.68, Math.min(0.68, this.playerX + (Math.random() - 0.5) * 0.18));

            if (boss.kind === 'CARRIER') {
              boss.patternStep = (boss.patternStep ?? 0) + 1;
              const spread = BOSS_LANE_GAP;
              if (boss.patternStep % 2 === 0) {
                // Bommenwerpers plus een spervuur op de flank: niet enkel een
                // passieve golf die je doodschiet terwijl de baas stilstaat.
                this.spawnCarrierBombers(boss);
                boss.telegraphLanes = [
                  Math.max(-0.72, primary - spread),
                  Math.min(0.72, primary + spread),
                ];
              } else {
                boss.telegraphLanes = [
                  Math.max(-0.72, primary - spread),
                  primary,
                  Math.min(0.72, primary + spread),
                ];
              }
            } else if (enraged) {
              const leftLane = Math.max(-0.72, primary - BOSS_LANE_GAP);
              const rightLane = Math.min(0.72, primary + BOSS_LANE_GAP);
              boss.telegraphLanes =
                boss.kind === 'TANK'
                  ? [-0.52, primary, 0.52]
                  : [leftLane, primary, rightLane];
            } else if (!boss.isMiniBoss || boss.kind === 'TANK') {
              const offset = primary > 0 ? -BOSS_LANE_GAP : BOSS_LANE_GAP;
              boss.telegraphLanes = [primary, Math.max(-0.7, Math.min(0.7, primary + offset))];
            } else {
              boss.telegraphLanes = [primary];
            }
            const droneLane = Math.random() < 0.5 ? this.randomDroneX() : null;
            if (droneLane !== null && boss.telegraphLanes.length < 3) {
              boss.telegraphLanes.push(droneLane);
            }
            boss.telegraphTimer = enraged ? 0.62 : 0.72;
          }
        }
      }
    }
    if (boss.flashTimer > 0) boss.flashTimer = Math.max(0, boss.flashTimer - dt);
  }

  private spawnCarrierBombers(boss: BossEntity) {
    const count = Math.max(3, Math.min(12, 4 + Math.floor(this.stage / 2)));
    const hp = Math.max(
      2,
      Math.round(8 * getStageCurve(this.stage, 1.28, 1.1) * this.difficultyDmgMult * this.squadThreatFactor()),
    );
    for (const sideX of [-0.4, 0, 0.4]) {
      const spriteCap = Math.min(10, count);
      const cols = Math.min(4, Math.ceil(Math.sqrt(spriteCap)));
      const units = Array.from({ length: spriteCap }, (_, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        return {
          offsetX: (col - (cols - 1) / 2) * 0.08,
          offsetZ: -row * 0.026,
          alive: true,
        };
      });
      this.enemies.push({
        id: this.nextEntityId++,
        x: Math.max(-0.7, Math.min(0.7, sideX)),
        z: Math.min(0.9, boss.z + 0.12),
        speed: 0.48,
        count,
        maxCount: count,
        hpPerUnit: hp,
        currentFrontHp: hp,
        kind: 'BOMBER',
        fireTimer: 0,
        flashTimer: 0,
        units,
      });
    }
    this.spawnFloatingText(this.width * 0.5, this.height * 0.26, 'CARRIER LANCEERT BOMMENWERPERS!', '#F87171', 1.15);
    sound.playBossAlert();
  }

  private updateHazards(dt: number) {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.z += h.speed * this.speedMult * dt;
      if (h.z >= 0.9 && h.z <= 0.99 && Math.abs(h.x - this.playerX) < h.radius + 0.1) {
        this.hazards.splice(i, 1);
        this.absorbOrDamageSquad(h.damage, `-${h.damage} Treffer`, true);
        continue;
      }
      if (h.z >= 0.8 && h.z <= 0.99) {
        const drone = this.drones.find(
          (d) => Math.abs(h.x - this.droneX(d.slot)) < h.radius + 0.11,
        );
        if (drone) {
          this.hazards.splice(i, 1);
          this.damageDrone(drone, h.damage);
          continue;
        }
      }
      if (h.z > 1.08) {
        this.hazards.splice(i, 1);
      }
    }
  }

  private updateSpecialEnvironment(dt: number) {
    const settings = this.settings;
    if (!settings || this.boss) return;
    const chance = Math.max(0, Math.min(100, settings.specialSituations)) / 100;
    if (chance <= 0 || this.stage < 2) return;

    this.specialEnvTimer -= dt;
    if (this.specialEnvTimer > 0) return;

    const baseInterval = 18 - chance * 6;
    this.specialEnvTimer = Math.max(10, baseInterval) * (0.9 + Math.random() * 0.4);

    const lanes = [-0.55, -0.28, 0, 0.28, 0.55];
    const count = Math.random() < 0.35 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const x = lanes[Math.floor(Math.random() * lanes.length)];
      this.mortarStrikes.push({
        id: this.nextEntityId++,
        x,
        z: 0.9,
        timer: 1.15,
        maxTimer: 1.15,
        radius: 0.08,
        damage: Math.max(2, Math.round((3 + this.stage) * this.difficultyDmgMult * 0.8)),
        kind: 'LASER',
        droneDamage: true,
        aimed: false,
      });
    }
    this.spawnFloatingText(this.width * 0.5, this.height * 0.2, 'DOELWITLASER — ONTWIJK!', '#F87171', 1.1);
  }

  private updatePickups(dt: number) {
    const zSpeed = 0.25 * this.speedMult;
    const magnetActive = this.magnetTimer > 0;

    if (magnetActive) {
      for (const barrel of this.barrels) {
        if (!barrel.destroyed && barrel.z < 0.8) {
          barrel.x += (this.playerX - barrel.x) * Math.min(1, dt * 0.6);
        }
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (p.collected) {
        this.pickups.splice(i, 1);
        continue;
      }
      p.z += zSpeed * dt;

      if (p.z >= 0.9 && p.z <= 1.02 && Math.abs(this.playerX - p.x) < 0.3) {
        p.collected = true;
        this.collectPickup(p);
        this.pickups.splice(i, 1);
        continue;
      }
      if (p.z > 1.1) {
        this.pickups.splice(i, 1);
      }
    }
  }

  private collectPickup(p: FieldPickup) {
    const proj = this.project(p.x, 0.92);
    sound.playPickup();
    this.addHyperCharge(8);

    if (p.kind === 'MAGNET') {
      this.magnetTimer = Math.max(this.magnetTimer, 10);
      this.spawnShockwave(proj.x, proj.y, '#22D3EE', 74);
      this.spawnFloatingText(proj.x, proj.y - 30, 'MAGNETISCH VELD! TONNEN AANTREKKEN', '#67E8F9', 1.1);
    } else if (p.kind === 'FRENZY') {
      this.frenzyTimer = Math.max(this.frenzyTimer, 8);
      this.spawnShockwave(proj.x, proj.y, '#FB923C', 74);
      this.spawnFloatingText(proj.x, proj.y - 30, 'FRENZY! 2× VUURSNELHEID', '#FDBA74', 1.15);
    } else if (p.kind === 'NUKE') {
      this.detonateNuke();
      this.spawnFloatingText(proj.x, proj.y - 30, 'NUKE! VELD GESCHETEN', '#FDE047', 1.3);
    } else {
      this.addSquad(p.value);
      this.spawnShockwave(proj.x, proj.y, '#38BDF8', 68);
      this.spawnFloatingText(proj.x, proj.y - 30, `+${p.value} SOLDATEN!`, '#7DD3FC', 1.15);
    }
  }

  private detonateNuke() {
    sound.playExplosion();
    sound.playShockwave();
    this.shakeIntensity = Math.min(12, this.shakeIntensity + 9);
    const proj = this.project(this.playerX, 0.55);
    this.spawnShockwave(proj.x, proj.y, '#FDE047', 230);
    this.spawnParticles(proj.x, proj.y, '#FDE047', 30);
    this.spawnParticles(proj.x, proj.y, '#F97316', 24);

    const dmg = Math.round(420 * Math.pow(1.32, this.stage - 1) * this.difficultyDmgMult);
    for (const group of this.enemies) {
      if (group.count > 0) this.damageEnemyGroup(group, dmg);
    }
    if (this.boss) this.damageBoss(dmg * 0.55);
    for (const barrel of this.barrels) {
      if (!barrel.destroyed) this.damageBarrel(barrel, dmg);
    }
    for (const br of this.barriers) {
      if (!br.destroyed) this.damageBarrier(br, dmg);
    }
    this.hazards = [];
    this.mortarStrikes = [];
  }

  private updateMortarStrikes(dt: number) {
    const frozen = this.freezeTimer > 0;
    for (let i = this.mortarStrikes.length - 1; i >= 0; i--) {
      const s = this.mortarStrikes[i];
      if (!frozen) s.timer -= dt;
      if (s.timer > 0) continue;

      this.mortarStrikes.splice(i, 1);
      const proj = this.project(s.x, 0.92);

      if (s.kind === 'LASER') {
        this.beams.push({ x: s.x, life: 0.28, maxLife: 0.28, color: s.aimed ? '#E9D5FF' : '#F87171', width: 0.11 });
        this.spawnParticles(proj.x, proj.y, s.aimed ? '#E9D5FF' : '#F87171', 16);
        this.spawnShockwave(proj.x, proj.y, s.aimed ? '#A855F7' : '#EF4444', 78);
        sound.playLaser();
      } else {
        this.spawnParticles(proj.x, proj.y, '#FB923C', 22);
        this.spawnParticles(proj.x, proj.y, '#FDE047', 10);
        this.spawnShockwave(proj.x, proj.y, '#F97316', 96);
        sound.playExplosion();
        if (!this.reducedMotion) this.shakeIntensity = Math.min(9, this.shakeIntensity + 3);
      }

      if (Math.abs(this.playerX - s.x) < s.radius + 0.1) {
        const label = s.kind === 'LASER' ? (s.aimed ? `-${s.damage} Sniper` : `-${s.damage} Laser`) : s.kind === 'BARRAGE' ? `-${s.damage} Barrage` : `-${s.damage} Mortier`;
        this.absorbOrDamageSquad(s.damage, label, true);
      }
      if (s.droneDamage) {
        const drone = this.drones.find((d) => Math.abs(this.droneX(d.slot) - s.x) < s.radius + 0.12);
        if (drone) this.damageDrone(drone, s.damage);
      }
    }
  }

  private updateBeams(dt: number) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      if (b.life <= 0) this.beams.splice(i, 1);
    }
  }

  private healNearbyEnemies(medic: EnemyGroup) {
    const mp = this.project(medic.x, medic.z);
    this.spawnShockwave(mp.x, mp.y - 12, '#4ADE80', 52);
    this.spawnParticles(mp.x, mp.y - 14, '#86EFAC', 10);
    let healed = false;

    for (const other of this.enemies) {
      if (other.id === medic.id || other.count <= 0) continue;
      if (Math.abs(other.x - medic.x) > 0.5 || Math.abs(other.z - medic.z) > 0.4) continue;
      if (other.currentFrontHp < other.hpPerUnit) {
        other.currentFrontHp = other.hpPerUnit;
        healed = true;
        const op = this.project(other.x, other.z);
        this.spawnParticles(op.x, op.y - 16, '#4ADE80', 4);
      }
      if (other.shieldHp !== undefined && other.shieldHp > 0 && other.shieldHp < (other.maxShieldHp ?? 0)) {
        other.shieldHp = Math.min(other.maxShieldHp ?? 0, other.shieldHp + other.hpPerUnit * 1.5);
        healed = true;
      }
    }
    if (medic.currentFrontHp < medic.hpPerUnit) {
      medic.currentFrontHp = medic.hpPerUnit;
      healed = true;
    }
    if (healed) {
      this.spawnFloatingText(mp.x, mp.y - 34, 'GENEZEN', '#86EFAC', 1.0);
      sound.playHealPulse();
    }
  }

  private spawnParticles(x: number, y: number, color: string, count: number) {
    const cap = this.reducedMotion ? Math.min(3, count) : count;
    for (let i = 0; i < cap; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 45 + Math.random() * 145;
      const life = 0.25 + Math.random() * 0.3;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 35,
        size: 2.5 + Math.random() * 3.5,
        color,
        alpha: 1,
        life,
        maxLife: life,
      });
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 240 * dt;
      p.alpha = p.life / p.maxLife;
    }
  }

  private spawnShockwave(x: number, y: number, color: string, maxRadius: number) {
    if (this.reducedMotion) return;
    this.shockwaves.push({
      x,
      y,
      radius: 8,
      maxRadius,
      color,
      life: 0.32,
      maxLife: 0.32,
    });
  }

  private updateShockwaves(dt: number) {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      const t = 1 - s.life / s.maxLife;
      s.radius = 8 + (s.maxRadius - 8) * (1 - Math.pow(1 - t, 2));
    }
  }

  private updateCoins(dt: number) {
    const squadTarget = this.project(this.playerX, 0.94);
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.coins.splice(i, 1);
        continue;
      }
      if (c.life > c.maxLife * 0.6) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.vy += 280 * dt;
      } else {
        c.x += (squadTarget.x - c.x) * Math.min(1, dt * 11);
        c.y += (squadTarget.y - c.y) * Math.min(1, dt * 11);
      }
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string, scale = 1) {
    this.texts.push({
      x,
      y,
      text,
      color,
      life: 0.92,
      maxLife: 0.92,
      scale,
    });
  }

  private updateTexts(dt: number) {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= 36 * dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
      }
    }
  }

  private pushHud() {
    const spec = WEAPON_STATS[this.weaponTier];
    const hyperMult = this.hyperTimer > 0 ? 1.55 : 1;
    const effectiveRate = getFireRateMultiplier(this.upgrades) * this.tempFireRateBonus * hyperMult;
    const shotsPerSec = effectiveRate / spec.fireInterval;
    const effectiveSquadPower = Math.pow(this.squadCount, 0.6);
    const dmgPerVolley =
      effectiveSquadPower *
      spec.damage *
      getFirepowerMultiplier(this.upgrades) *
      this.tempDamageBonus *
      getPlayerWeaponScale(this.stage) *
      0.48 *
      (this.hyperTimer > 0 ? 1.2 : 1);
    const droneDps =
      this.droneCount *
      8.5 *
      getFirepowerMultiplier(this.upgrades) *
      this.tempDamageBonus *
      getPlayerWeaponScale(this.stage) *
      (1 / 0.34);
    const dps = Math.round(shotsPerSec * dmgPerVolley + droneDps);

    this.callbacks.onHudUpdate({
      squadCount: this.squadCount,
      maxSquadReached: this.maxSquadReached,
      maxSquadLimit: this.currentMaxSquad,
      weaponTier: this.weaponTier,
      shieldCharges: this.shieldCharges,
      droneCount: this.droneCount,
      hyperCharge: this.hyperTimer > 0 ? Math.round((this.hyperTimer / 5.5) * 100) : Math.round(this.hyperCharge),
      hyperActive: this.hyperTimer > 0,
      airstrikeCharge: Math.round(this.airstrikeCharge),
      shockwaveCharge: 0,
      formation: 'WIDE',
      magnetActive: this.magnetTimer > 0,
      frenzyActive: this.frenzyTimer > 0,
      cryoActive: this.cryoTimer > 0,
      freezeActive: this.freezeTimer > 0,
      timewarpActive: this.timewarpTimer > 0,
      fortifyActive: this.fortifyTimer > 0,
      blitzActive: this.blitzTimer > 0,
      vampActive: this.vampTimer > 0,
      comboCount: this.comboCount,
      biomeName: this.biome.name,
      stage: this.stage,
      stageProgress: Math.min(1, this.distance / this.stageLengthUnits),
      runGold: this.runGold,
      kills: this.kills,
      dps,
      bossHp: this.boss ? Math.max(0, Math.ceil(this.boss.hp)) : null,
      bossMaxHp: this.boss ? this.boss.maxHp : null,
      bossName: this.boss ? this.boss.name : null,
      bossEnraged: this.boss ? !this.boss.isMiniBoss && this.boss.hp < this.boss.maxHp * 0.55 : false,
      bossIsMini: this.boss ? this.boss.isMiniBoss : false,
    });
  }

  private render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.save();
    if (this.shakeIntensity > 0.2) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity;
      const sy = (Math.random() - 0.5) * this.shakeIntensity;
      ctx.translate(sx, sy);
    }

    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, this.biome.skyTop);
    skyGrad.addColorStop(0.25, this.biome.skyMid);
    skyGrad.addColorStop(1, this.biome.skyBot);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    const horizonY = h * 0.12;
    const glowGrad = ctx.createRadialGradient(w * 0.5, horizonY, 10, w * 0.5, horizonY, w * 0.58);
    glowGrad.addColorStop(0, this.hyperTimer > 0 ? 'rgba(250, 204, 21, 0.22)' : this.biome.horizonGlow);
    glowGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h * 0.45);

    const topLeft = this.project(-1, 0);
    const topRight = this.project(1, 0);
    const botLeft = this.project(-1, 1.08);
    const botRight = this.project(1, 1.08);

    const deckGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    deckGrad.addColorStop(0, this.biome.deckTop);
    deckGrad.addColorStop(0.5, this.biome.deckMid);
    deckGrad.addColorStop(1, this.biome.deckBot);
    ctx.fillStyle = deckGrad;
    ctx.beginPath();
    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.lineTo(topRight.x, topRight.y);
    ctx.lineTo(botRight.x, botRight.y);
    ctx.lineTo(botLeft.x, botLeft.y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.lineTo(botLeft.x, botLeft.y);
    ctx.moveTo(topRight.x, topRight.y);
    ctx.lineTo(botRight.x, botRight.y);
    ctx.stroke();

    ctx.strokeStyle = this.hyperTimer > 0 ? 'rgba(250, 204, 21, 0.48)' : this.biome.curb;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(topLeft.x + 2, topLeft.y);
    ctx.lineTo(botLeft.x + 4, botLeft.y);
    ctx.moveTo(topRight.x - 2, topRight.y);
    ctx.lineTo(botRight.x - 4, botRight.y);
    ctx.stroke();

    const numSegments = 10;
    for (let i = 0; i < numSegments; i++) {
      const z1 = ((i + this.roadScroll) / numSegments) % 1;
      const z2 = Math.min(1.06, z1 + 0.045);
      if (z2 <= z1) continue;
      const p1 = this.project(0, z1);
      const p2 = this.project(0, z2);
      ctx.strokeStyle = `rgba(148, 163, 184, ${0.15 + z1 * 0.28})`;
      ctx.lineWidth = 1.5 + z1 * 2.5;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    if (this.boss && this.boss.telegraphLanes.length > 0) {
      const pulse = 0.24 + 0.16 * Math.sin(this.elapsedTime * 24);
      ctx.strokeStyle = `rgba(239, 68, 68, ${pulse})`;
      ctx.lineWidth = 28;
      for (const laneX of this.boss.telegraphLanes) {
        const warnTop = this.project(laneX, this.boss.z);
        const warnBot = this.project(laneX, 1.02);
        ctx.beginPath();
        ctx.moveTo(warnTop.x, warnTop.y);
        ctx.lineTo(warnBot.x, warnBot.y);
        ctx.stroke();
      }
    }

    type DrawItem = { z: number; draw: () => void };
    const drawQueue: DrawItem[] = [];

    for (const g of this.gates) {
      if (!g.triggered) drawQueue.push({ z: g.z, draw: () => this.drawGate(g) });
    }
    for (const br of this.barriers) {
      if (!br.destroyed) drawQueue.push({ z: br.z, draw: () => this.drawBarrier(br) });
    }
    for (const b of this.barrels) {
      if (!b.destroyed) drawQueue.push({ z: b.z, draw: () => this.drawBarrel(b) });
    }
    for (const e of this.enemies) {
      if (e.count > 0) drawQueue.push({ z: e.z, draw: () => this.drawEnemyGroup(e) });
    }
    for (const p of this.pickups) {
      if (!p.collected) drawQueue.push({ z: p.z, draw: () => this.drawPickup(p) });
    }
    for (const s of this.mortarStrikes) {
      drawQueue.push({ z: s.z, draw: () => this.drawStrikeZone(s) });
    }
    if (this.boss) {
      const bossRef = this.boss;
      drawQueue.push({ z: bossRef.z, draw: () => this.drawBoss(bossRef) });
    }
    for (const hItem of this.hazards) {
      drawQueue.push({ z: hItem.z, draw: () => this.drawHazard(hItem) });
    }

    drawQueue.sort((a, b) => a.z - b.z);
    for (const item of drawQueue) {
      item.draw();
    }

    for (const b of this.bullets) {
      const p = this.project(b.x, b.z);
      const prevP = this.project(b.prevX, b.prevZ);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = (b.isRocket ? 4.5 : b.isLaser ? 4.2 : b.isDroneLaser ? 2.8 : 2.2) * p.scale;
      ctx.beginPath();
      ctx.moveTo(prevP.x, prevP.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      const r = (b.isRocket ? 5.2 : b.isLaser ? 4 : 2.8) * p.scale;
      ctx.fillStyle = b.isRocket ? '#FEF08A' : b.isLaser ? '#F5D0FE' : b.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const m of this.missiles) {
      const target = this.project(m.x, m.z);
      ctx.strokeStyle = 'rgba(251, 113, 133, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(target.x, target.y, 18, 8, 0, 0, Math.PI * 2);
      ctx.stroke();

      const my = target.y - m.yOffset;
      ctx.fillStyle = '#FB7185';
      ctx.fillRect(target.x - 3, my - 18, 6, 18);
      ctx.fillStyle = '#FDE047';
      ctx.beginPath();
      ctx.arc(target.x, my - 20, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawPlayerSquad();

    for (const b of this.beams) {
      const alpha = Math.max(0, b.life / b.maxLife);
      const top = this.project(b.x, 0);
      const bottom = this.project(b.x, 1.05);
      const beamW = Math.max(6, this.width * b.width);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = b.color;
      ctx.fillRect(top.x - beamW / 2, top.y, beamW, bottom.y - top.y);
      ctx.globalAlpha = Math.min(1, alpha * 1.4);
      ctx.fillStyle = '#FEE2E2';
      ctx.fillRect(top.x - beamW * 0.18, top.y, beamW * 0.36, bottom.y - top.y);
    }
    ctx.globalAlpha = 1;

    for (const s of this.shockwaves) {
      const alpha = Math.max(0, s.life / s.maxLife);
      ctx.globalAlpha = alpha * 0.75;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3 * alpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const c of this.coins) {
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FEF08A';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const t of this.texts) {
      const alpha = Math.min(1, (t.life / t.maxLife) * 1.4);
      ctx.globalAlpha = alpha;
      ctx.font = `800 ${Math.round(20 * t.scale)}px "Barlow Condensed", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#090D16';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    if (this.damageFlashTimer > 0) {
      const alpha = Math.min(0.45, this.damageFlashTimer * 1.35);
      ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
      ctx.lineWidth = 14;
      ctx.strokeRect(0, 0, w, h);
    }

    ctx.restore();
  }

  private drawBarrier(br: BridgeBarrier) {
    const ctx = this.ctx;
    const p = this.project(br.x, br.z);
    const barW = br.width * p.halfW;
    const barH = 26 * p.scale;
    const leftX = p.x - barW / 2;
    const topY = p.y - barH;

    // Electric hazard strip
    ctx.fillStyle = br.flashTimer > 0 ? '#FFFFFF' : 'rgba(239, 68, 68, 0.32)';
    ctx.fillRect(leftX, topY, barW, barH);

    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = Math.max(2, 3 * p.scale);
    ctx.strokeRect(leftX, topY, barW, barH);

    // Side pylons
    const pylonW = 10 * p.scale;
    ctx.fillStyle = '#334155';
    ctx.fillRect(leftX, topY - 8 * p.scale, pylonW, barH + 8 * p.scale);
    ctx.fillRect(leftX + barW - pylonW, topY - 8 * p.scale, pylonW, barH + 8 * p.scale);

    // HP label
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.max(11, Math.round(14 * p.scale))}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`ONTWIJK · ${Math.ceil(br.hp)}`, p.x, topY + barH * 0.5);
  }

  private drawGate(g: GateEntity) {
    const ctx = this.ctx;
    const p = this.project(g.x, g.z);
    const gateW = g.width * p.halfW;
    const gateH = 66 * p.scale;
    const leftX = p.x - gateW / 2;
    const topY = p.y - gateH;

    const isCapGate = g.op === 'CAP_SET';
    const isPositive =
      g.op === 'MUL' ||
      g.op === 'RATE_UP' ||
      g.op === 'DMG_UP' ||
      g.op === 'SHIELD_ADD' ||
      g.op === 'DRONE_ADD' ||
      g.op === 'GOLD_RUSH' ||
      g.op === 'MYSTERY' ||
      g.op === 'FREEZE' ||
      g.op === 'MULTISHOT' ||
      g.op === 'PIERCE' ||
      g.op === 'HEAL' ||
      g.op === 'TIMEWARP' ||
      g.op === 'FORTIFY' ||
      g.op === 'BLITZ' ||
      g.op === 'VAMP' ||
      (g.op === 'ADD' && g.value >= 0);

    const baseColor = isCapGate ? '#A855F7' : isPositive ? '#0EA5E9' : '#EF4444';
    const lightColor = isCapGate ? '#E9D5FF' : isPositive ? '#7DD3FC' : '#FCA5A5';
    const bgFill =
      g.flashTimer > 0
        ? 'rgba(255, 255, 255, 0.35)'
        : isCapGate
        ? 'rgba(168, 85, 247, 0.26)'
        : isPositive
        ? 'rgba(14, 165, 233, 0.24)'
        : 'rgba(239, 68, 68, 0.24)';

    ctx.fillStyle = bgFill;
    ctx.fillRect(leftX, topY, gateW, gateH);

    ctx.fillStyle = baseColor;
    const pillarW = Math.max(4, 7 * p.scale);
    ctx.fillRect(leftX, topY, pillarW, gateH);
    ctx.fillRect(leftX + gateW - pillarW, topY, pillarW, gateH);
    ctx.fillRect(leftX, topY, gateW, Math.max(4, 6 * p.scale));

    let label = '';
    if (g.op === 'ADD') label = g.value >= 0 ? `+${g.value}` : `${g.value}`;
    else if (g.op === 'SUB') label = `-${g.value}`;
    else if (g.op === 'MUL') label = `×${g.value}`;
    else if (g.op === 'DIV') label = `÷${g.value}`;
    else if (g.op === 'RATE_UP') label = `+${g.value}% SNEL`;
    else if (g.op === 'DMG_UP') label = `+${g.value}% KRACHT`;
    else if (g.op === 'CAP_SET') label = `MAX ${g.value}`;
    else if (g.op === 'SHIELD_ADD') label = `+${g.value} SCHILD`;
    else if (g.op === 'DRONE_ADD') label = `+${g.value} DRONE`;
    else if (g.op === 'GOLD_RUSH') label = `+${g.value}% GOUD`;
    else if (g.op === 'MYSTERY') label = '? MYSTERY';
    else if (g.op === 'FREEZE') label = `TIJDSTIL ${g.value}s`;
    else if (g.op === 'MULTISHOT') label = `+${g.value} SCHOT`;
    else if (g.op === 'PIERCE') label = 'DOORBOOR';
    else if (g.op === 'HEAL') label = 'HERSTEL';
    else if (g.op === 'TIMEWARP') label = `SNEL ${g.value}s`;
    else if (g.op === 'FORTIFY') label = `FORT ${g.value}s`;
    else if (g.op === 'BLITZ') label = `BLITZ ${g.value}s`;
    else if (g.op === 'VAMP') label = `VAMP ${g.value}s`;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const smallLabel =
      g.op === 'RATE_UP' ||
      g.op === 'DMG_UP' ||
      g.op === 'CAP_SET' ||
      g.op === 'SHIELD_ADD' ||
      g.op === 'DRONE_ADD' ||
      g.op === 'GOLD_RUSH' ||
      g.op === 'MYSTERY' ||
      g.op === 'FREEZE' ||
      g.op === 'MULTISHOT' ||
      g.op === 'PIERCE' ||
      g.op === 'HEAL' ||
      g.op === 'TIMEWARP' ||
      g.op === 'FORTIFY' ||
      g.op === 'BLITZ' ||
      g.op === 'VAMP';
    const fontSize = Math.max(14, Math.round((smallLabel ? 21 : 28) * p.scale));
    ctx.font = `800 ${fontSize}px "Barlow Condensed", sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(9, 13, 22, 0.9)';
    ctx.strokeText(label, p.x, topY + gateH * (isCapGate ? 0.44 : 0.46));
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, p.x, topY + gateH * (isCapGate ? 0.44 : 0.46));

    if (isCapGate) {
      const subFont = Math.max(9, Math.round(10 * p.scale));
      ctx.font = `700 ${subFont}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = '#E9D5FF';
      ctx.fillText('LIMIET', p.x, topY + gateH * 0.8);
    }

    if (g.shootable) {
      const subFont = Math.max(10, Math.round(11 * p.scale));
      ctx.font = `700 ${subFont}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = lightColor;
      ctx.fillText('SCHIET +', p.x, topY + gateH * 0.82);

      const progW = gateW * 0.6;
      const progH = Math.max(3, 4 * p.scale);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(p.x - progW / 2, topY - progH - 3, progW, progH);
      ctx.fillStyle = '#FDE047';
      ctx.fillRect(p.x - progW / 2, topY - progH - 3, progW * (g.hitProgress / g.shotsPerStep), progH);
    }
  }

  private drawBarrel(b: BarrelEntity) {
    const ctx = this.ctx;
    const p = this.project(b.x, b.z);
    const size = 44 * p.scale;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 3 * p.scale, size * 0.56, size * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    let bodyColor = '#B45309';
    let rimColor = '#78350F';
    let badgeText = '';

    if (b.kind === 'STEEL') {
      bodyColor = '#475569';
      rimColor = '#94A3B8';
    } else if (b.kind === 'TNT_BARREL') {
      bodyColor = '#DC2626';
      rimColor = '#FDE047';
      badgeText = 'TNT';
    } else if (b.kind === 'WEAPON_CRATE') {
      bodyColor = '#D97706';
      rimColor = '#FDE047';
      badgeText = b.reward.type === 'WEAPON' ? WEAPON_LABELS[b.reward.tier].split(' ')[0].toUpperCase() : 'WAPEN';
    } else if (b.kind === 'SQUAD_CRATE') {
      bodyColor = '#0284C7';
      rimColor = '#7DD3FC';
      badgeText = b.reward.type === 'SQUAD' ? `+${b.reward.amount}` : '+SQUAD';
    } else if (b.kind === 'SHIELD_CRATE') {
      bodyColor = '#0891B2';
      rimColor = '#67E8F9';
      badgeText = 'SCHILD';
    } else if (b.kind === 'DRONE_CRATE') {
      bodyColor = '#059669';
      rimColor = '#6EE7B7';
      badgeText = '+DRONE';
    } else if (b.kind === 'GOLD_SAFE') {
      bodyColor = '#A16207';
      rimColor = '#FDE047';
      badgeText = 'GOUD';
    } else if (b.kind === 'CRYO_CRATE') {
      bodyColor = '#0E7490';
      rimColor = '#A5F3FC';
      badgeText = 'CRYO';
    } else if (b.kind === 'HYPER_CRATE') {
      bodyColor = '#CA8A04';
      rimColor = '#FEF08A';
      badgeText = 'HYPER';
    } else if (b.kind === 'TESLA_CRATE') {
      bodyColor = '#7E22CE';
      rimColor = '#E9D5FF';
      badgeText = 'TESLA';
    }

    if (b.flashTimer > 0) bodyColor = '#FFFFFF';

    const bx = p.x - size * 0.45;
    const by = p.y - size * 0.92;
    const bw = size * 0.9;
    const bh = size * 0.92;

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6 * p.scale);
    ctx.fill();
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = Math.max(2, 3 * p.scale);
    ctx.stroke();

    ctx.fillStyle = rimColor;
    ctx.fillRect(bx + 2, by + bh * 0.22, bw - 4, Math.max(2, 3 * p.scale));
    ctx.fillRect(bx + 2, by + bh * 0.72, bw - 4, Math.max(2, 3 * p.scale));

    const hpRatio = b.hp / b.maxHp;
    if (hpRatio < 0.65 && b.flashTimer <= 0) {
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.lineWidth = Math.max(1.2, 2 * p.scale);
      ctx.beginPath();
      ctx.moveTo(bx + bw * 0.25, by + bh * 0.25);
      ctx.lineTo(bx + bw * 0.48, by + bh * 0.52);
      if (hpRatio < 0.35) {
        ctx.lineTo(bx + bw * 0.75, by + bh * 0.68);
      }
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const hpFont = Math.max(11, Math.round(16 * p.scale));
    ctx.font = `700 ${hpFont}px "JetBrains Mono", monospace`;
    ctx.fillStyle = b.flashTimer > 0 ? '#0F172A' : '#FFFFFF';
    ctx.fillText(String(Math.max(1, Math.ceil(b.hp))), p.x, by + bh * 0.5);

    if (badgeText) {
      const bob = Math.sin(this.elapsedTime * 5 + b.id) * 2.5;
      ctx.font = `800 ${Math.max(10, Math.round(12 * p.scale))}px "Barlow Condensed", sans-serif`;
      ctx.fillStyle = b.kind === 'TNT_BARREL' ? '#FCA5A5' : '#FEF08A';
      ctx.strokeStyle = '#090D16';
      ctx.lineWidth = 3;
      ctx.strokeText(badgeText, p.x, by - 10 * p.scale + bob);
      ctx.fillText(badgeText, p.x, by - 10 * p.scale + bob);
    }
  }

  private drawEnemyGroup(g: EnemyGroup) {
    const ctx = this.ctx;
    const baseProj = this.project(g.x, g.z);
    const isBrute = g.kind === 'BRUTE';
    const isRusher = g.kind === 'RUSHER';
    const isTurret = g.kind === 'TURRET';
    const isBomber = g.kind === 'BOMBER';
    const isSniper = g.kind === 'SNIPER';
    const isSplitter = g.kind === 'SPLITTER';
    const isJumper = g.kind === 'JUMPER';
    const isMedic = g.kind === 'MEDIC';
    const isMortar = g.kind === 'MORTAR';
    const isShieldUnit = g.kind === 'SHIELD_UNIT';
    const isBerserker = g.kind === 'BERSERKER';

    const visibleUnits = Math.min(g.count, g.units.length);
    let drawn = 0;
    for (const u of g.units) {
      if (!u.alive || drawn >= visibleUnits) continue;
      drawn++;
      const up = this.project(g.x + u.offsetX, g.z + u.offsetZ);

      if (isTurret) {
        const s = 15 * up.scale;
        ctx.fillStyle = g.flashTimer > 0 ? '#FFFFFF' : '#475569';
        ctx.beginPath();
        ctx.roundRect(up.x - s, up.y - s * 1.4, s * 2, s * 1.4, 4 * up.scale);
        ctx.fill();
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#EF4444';
        ctx.fillRect(up.x - 3 * up.scale, up.y - s * 0.5, 6 * up.scale, s * 0.9);
        continue;
      }

      if (isSniper) {
        const s = 10 * up.scale;
        ctx.fillStyle = g.flashTimer > 0 ? '#FFFFFF' : '#7E22CE';
        ctx.beginPath();
        ctx.roundRect(up.x - s * 0.55, up.y - s * 1.7, s * 1.1, s * 1.7, 3 * up.scale);
        ctx.fill();
        ctx.strokeStyle = '#E9D5FF';
        ctx.lineWidth = Math.max(1.2, 1.8 * up.scale);
        ctx.stroke();

        ctx.strokeStyle = '#DDD6FE';
        ctx.lineWidth = Math.max(1.5, 2.2 * up.scale);
        ctx.beginPath();
        ctx.moveTo(up.x, up.y - s * 1.2);
        ctx.lineTo(up.x, up.y - s * 2.6);
        ctx.stroke();

        ctx.fillStyle = '#F5D0FE';
        ctx.beginPath();
        ctx.arc(up.x, up.y - s * 1.95 + Math.sin(this.elapsedTime * 10 + drawn) * 1.2 * up.scale, s * 0.42, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      if (isJumper) {
        const jumpT = (g.jumpTimer ?? 0) / 0.55;
        const lift = jumpT > 0 ? Math.sin((1 - jumpT) * Math.PI) * 26 * up.scale : 0;
        const s = 8 * up.scale;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(up.x, up.y + 2, s * 0.85, s * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FDBA74';
        ctx.lineWidth = Math.max(1.5, 2 * up.scale);
        ctx.beginPath();
        ctx.moveTo(up.x - s * 0.5, up.y - 2);
        ctx.lineTo(up.x - s * 0.72, up.y + 2);
        ctx.moveTo(up.x + s * 0.5, up.y - 2);
        ctx.lineTo(up.x + s * 0.72, up.y + 2);
        ctx.stroke();
        ctx.fillStyle = g.flashTimer > 0 ? '#FFFFFF' : '#EA580C';
        ctx.beginPath();
        ctx.roundRect(up.x - s * 0.7, up.y - s * 1.5 - lift, s * 1.4, s * 1.5, 4 * up.scale);
        ctx.fill();
        ctx.fillStyle = '#FDBA74';
        ctx.beginPath();
        ctx.arc(up.x, up.y - s * 1.7 - lift, s * 0.5, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      if (isMedic) {
        const s = 9 * up.scale;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(up.x, up.y + 2, s * 0.85, s * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = g.flashTimer > 0 ? '#FFFFFF' : '#F8FAFC';
        ctx.beginPath();
        ctx.roundRect(up.x - s * 0.7, up.y - s * 1.5, s * 1.4, s * 1.5, 4 * up.scale);
        ctx.fill();
        ctx.strokeStyle = '#22C55E';
        ctx.lineWidth = Math.max(1.5, 2 * up.scale);
        ctx.stroke();
        ctx.fillStyle = '#22C55E';
        ctx.fillRect(up.x - s * 0.16, up.y - s * 1.28, s * 0.32, s * 0.9);
        ctx.fillRect(up.x - s * 0.42, up.y - s * 1.02, s * 0.84, s * 0.32);
        ctx.beginPath();
        ctx.arc(up.x, up.y - s * 1.7, s * 0.45, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      if (isMortar) {
        const s = 11 * up.scale;
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.beginPath();
        ctx.ellipse(up.x, up.y + 3, s * 1.0, s * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = g.flashTimer > 0 ? '#FFFFFF' : '#57534E';
        ctx.beginPath();
        ctx.roundRect(up.x - s * 0.85, up.y - s * 1.2, s * 1.7, s * 1.2, 4 * up.scale);
        ctx.fill();
        ctx.strokeStyle = '#A8A29E';
        ctx.lineWidth = Math.max(1.4, 2 * up.scale);
        ctx.stroke();
        ctx.save();
        ctx.translate(up.x, up.y - s * 1.15);
        ctx.rotate(-0.5);
        ctx.fillStyle = '#292524';
        ctx.fillRect(-s * 0.22, -s * 1.1, s * 0.44, s * 1.1);
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = Math.max(1, 1.6 * up.scale);
        ctx.strokeRect(-s * 0.22, -s * 1.1, s * 0.44, s * 1.1);
        ctx.restore();
        ctx.fillStyle = '#FBBF24';
        ctx.beginPath();
        ctx.arc(up.x, up.y - s * 1.55, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      if (isBerserker) {
        const s = 10 * up.scale;
        const chargeT = g.chargeTimer ?? 3.2;
        const pulse = chargeT < 0.6 ? 1.3 : 1.0;
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.beginPath();
        ctx.ellipse(up.x, up.y + 3, s * 0.9, s * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = g.flashTimer > 0 ? '#FFFFFF' : '#7F1D1D';
        ctx.beginPath();
        ctx.roundRect(up.x - s * 0.7 * pulse, up.y - s * 1.5, s * 1.4 * pulse, s * 1.5, 4 * up.scale);
        ctx.fill();
        ctx.strokeStyle = '#F87171';
        ctx.lineWidth = Math.max(1.5, 2 * up.scale);
        ctx.stroke();
        ctx.fillStyle = '#FCA5A5';
        ctx.beginPath();
        ctx.arc(up.x, up.y - s * 1.7, s * 0.5 * pulse, 0, Math.PI * 2);
        ctx.fill();
        if (chargeT < 0.6) {
          ctx.strokeStyle = `rgba(254, 202, 202, ${0.5 + 0.3 * Math.sin(this.elapsedTime * 20)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(up.x, up.y - s * 0.9, s * 1.4, 0, Math.PI * 2);
          ctx.stroke();
        }
        continue;
      }

      const r = (isBrute ? 12 : isBomber ? 9 : isSplitter ? 10 : isRusher ? 7.5 : 8) * up.scale;
      const stride = Math.sin(this.elapsedTime * (isRusher || isBomber ? 18 : 10) + drawn) * 1.6 * up.scale;

      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(up.x, up.y + r * 0.3, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      if (isBomber) {
        const pulse = 0.55 + 0.45 * Math.sin(this.elapsedTime * 14 + drawn);
        ctx.fillStyle = g.flashTimer > 0 ? '#FFFFFF' : `rgba(249, 115, 22, ${0.85 + 0.15 * pulse})`;
        ctx.beginPath();
        ctx.roundRect(up.x - r * 0.78, up.y - r * 1.45 + stride, r * 1.56, r * 1.45, 5 * up.scale);
        ctx.fill();
        ctx.strokeStyle = '#FDE047';
        ctx.lineWidth = Math.max(1.2, 1.8 * up.scale);
        ctx.stroke();

        ctx.fillStyle = pulse > 0.7 ? '#FEF08A' : '#EF4444';
        ctx.beginPath();
        ctx.arc(up.x, up.y - r * 1.65 + stride, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      ctx.fillStyle =
        g.flashTimer > 0
          ? '#FFFFFF'
          : isBrute
          ? '#991B1B'
          : isSplitter
          ? '#15803D'
          : isShieldUnit
          ? '#1D4ED8'
          : isRusher
          ? '#EA580C'
          : '#DC2626';
      ctx.beginPath();
      ctx.roundRect(up.x - r * 0.75, up.y - r * 1.5 + stride, r * 1.5, r * 1.5, 4 * up.scale);
      ctx.fill();

      if (isBrute && g.flashTimer <= 0) {
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = Math.max(1.5, 2.2 * up.scale);
        ctx.stroke();
      }

      ctx.fillStyle =
        g.flashTimer > 0
          ? '#FFFFFF'
          : isBrute
          ? '#F87171'
          : isSplitter
          ? '#86EFAC'
          : isShieldUnit
          ? '#93C5FD'
          : isRusher
          ? '#FDBA74'
          : '#FCA5A5';
      ctx.beginPath();
      ctx.arc(up.x, up.y - r * 1.65 + stride, r * 0.58, 0, Math.PI * 2);
      ctx.fill();

      if (isShieldUnit && (g.shieldHp ?? 0) > 0) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
        ctx.lineWidth = Math.max(2, 3 * up.scale);
        ctx.beginPath();
        ctx.arc(up.x, up.y - r * 0.9, r * 1.35, Math.PI * 0.15, Math.PI * 0.85);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(up.x, up.y - r * 0.9, r * 1.35, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
    }

    const tagY = baseProj.y - (isBrute || isTurret || isMortar || isBerserker ? 36 : 28) * baseProj.scale;
    ctx.font = `800 ${Math.max(12, Math.round(16 * baseProj.scale))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#090D16';
    const label = isTurret
      ? `TURRET ${g.count}`
      : isBomber
      ? `BOM ${g.count}`
      : isSniper
      ? `SNIPER ${g.count}`
      : isSplitter
      ? `SPLIT ${g.count}`
      : isJumper
      ? `SPRING ${g.count}`
      : isMedic
      ? `MEDIC ${g.count}`
      : isMortar
      ? `MORTAR ${g.count}`
      : isShieldUnit
      ? `SCHILD ${g.count}`
      : isBerserker
      ? `BERSERKER ${g.count}`
      : `${g.count}`;
    ctx.strokeText(label, baseProj.x, tagY);
    ctx.fillStyle = isBomber
      ? '#FDE047'
      : isSniper
      ? '#E9D5FF'
      : isSplitter
      ? '#86EFAC'
      : isJumper
      ? '#FDBA74'
      : isMedic
      ? '#86EFAC'
      : isMortar
      ? '#FCD34D'
      : isShieldUnit
      ? '#93C5FD'
      : isBerserker
      ? '#FCA5A5'
      : isRusher
      ? '#FDBA74'
      : '#FCA5A5';
    ctx.fillText(label, baseProj.x, tagY);
  }

  private drawBoss(boss: BossEntity) {
    const ctx = this.ctx;
    const p = this.project(boss.x, boss.z);
    const scaleFactor = boss.isMiniBoss ? 0.82 : 1;
    const w = 136 * p.scale * scaleFactor;
    const h = 88 * p.scale * scaleFactor;
    const left = p.x - w / 2;
    const top = p.y - h;
    const flash = boss.flashTimer > 0;
    const enraged = !boss.isMiniBoss && boss.hp < boss.maxHp * 0.55;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + (boss.kind === 'HELI' ? 16 : 6) * p.scale, w * 0.55, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    if (boss.kind === 'HELI') {
      const hoverY = Math.sin(this.elapsedTime * 6) * 5 * p.scale;
      ctx.fillStyle = flash ? '#FFFFFF' : '#475569';
      ctx.fillRect(left - 12 * p.scale, top + h * 0.38 + hoverY, w + 24 * p.scale, 14 * p.scale);

      ctx.fillStyle = flash ? '#FFFFFF' : enraged ? '#DC2626' : '#991B1B';
      ctx.beginPath();
      ctx.ellipse(p.x, top + h * 0.48 + hoverY, w * 0.36, h * 0.46, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = enraged ? '#FDE047' : '#38BDF8';
      ctx.beginPath();
      ctx.ellipse(p.x, top + h * 0.62 + hoverY, w * 0.2, h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(p.x, top + h * 0.35 + hoverY);
      ctx.rotate(boss.rotorAngle);
      ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
      ctx.fillRect(-w * 0.65, -3 * p.scale, w * 1.3, 6 * p.scale);
      ctx.fillRect(-3 * p.scale, -w * 0.65, 6 * p.scale, w * 1.3);
      ctx.restore();
    } else if (boss.kind === 'MECH') {
      const stomp = Math.sin(this.elapsedTime * 7) * 4 * p.scale;
      ctx.fillStyle = flash ? '#FFFFFF' : '#334155';
      ctx.fillRect(left - 8 * p.scale, top + h * 0.15, 22 * p.scale, h * 0.55);
      ctx.fillRect(left + w - 14 * p.scale, top + h * 0.15, 22 * p.scale, h * 0.55);
      ctx.fillRect(p.x - 30 * p.scale, p.y - 22 * p.scale + stomp, 18 * p.scale, 26 * p.scale);
      ctx.fillRect(p.x + 12 * p.scale, p.y - 22 * p.scale - stomp, 18 * p.scale, 26 * p.scale);

      ctx.fillStyle = flash ? '#FFFFFF' : enraged ? '#B91C1C' : '#7F1D1D';
      ctx.beginPath();
      ctx.roundRect(left + 10 * p.scale, top, w - 20 * p.scale, h * 0.78, 10 * p.scale);
      ctx.fill();
      ctx.strokeStyle = enraged ? '#FACC15' : '#FCA5A5';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = enraged ? '#EF4444' : '#FACC15';
      ctx.beginPath();
      ctx.arc(p.x, top + h * 0.4, 15 * p.scale, 0, Math.PI * 2);
      ctx.fill();
    } else if (boss.kind === 'CARRIER') {
      const hoverY = Math.sin(this.elapsedTime * 3.2) * 4 * p.scale;
      ctx.fillStyle = flash ? '#FFFFFF' : '#334155';
      ctx.beginPath();
      ctx.roundRect(left - 10 * p.scale, top + h * 0.42 + hoverY, w + 20 * p.scale, h * 0.34, 8 * p.scale);
      ctx.fill();
      ctx.strokeStyle = enraged ? '#F87171' : '#94A3B8';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(226, 232, 240, 0.6)';
      ctx.lineWidth = Math.max(1.5, 2 * p.scale);
      ctx.setLineDash([10 * p.scale, 8 * p.scale]);
      ctx.beginPath();
      ctx.moveTo(left + 6 * p.scale, top + h * 0.59 + hoverY);
      ctx.lineTo(left + w - 6 * p.scale, top + h * 0.59 + hoverY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = flash ? '#FFFFFF' : enraged ? '#991B1B' : '#7F1D1D';
      ctx.beginPath();
      ctx.roundRect(left + 6 * p.scale, top + h * 0.3 + hoverY, w - 12 * p.scale, h * 0.4, 10 * p.scale);
      ctx.fill();

      ctx.fillStyle = flash ? '#FFFFFF' : '#1E293B';
      ctx.fillRect(left + w * 0.72, top + h * 0.08 + hoverY, w * 0.16, h * 0.4);
      ctx.fillStyle = enraged ? '#FDE047' : '#38BDF8';
      ctx.fillRect(left + w * 0.74, top + h * 0.14 + hoverY, w * 0.12, h * 0.08);

      ctx.fillStyle = '#CBD5E1';
      for (let i = 0; i < 3; i++) {
        const ax = left + w * (0.25 + i * 0.16);
        const ay = top + h * 0.52 + hoverY;
        ctx.beginPath();
        ctx.moveTo(ax, ay - 4 * p.scale);
        ctx.lineTo(ax + 3 * p.scale, ay + 3 * p.scale);
        ctx.lineTo(ax - 3 * p.scale, ay + 3 * p.scale);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillStyle = flash ? '#FFFFFF' : '#334155';
      ctx.fillRect(left - 8 * p.scale, top + h * 0.22, 16 * p.scale, h * 0.74);
      ctx.fillRect(left + w - 8 * p.scale, top + h * 0.22, 16 * p.scale, h * 0.74);

      ctx.fillStyle = flash ? '#FFFFFF' : enraged ? '#DC2626' : '#B91C1C';
      ctx.beginPath();
      ctx.roundRect(left, top, w, h, 10 * p.scale);
      ctx.fill();
      ctx.strokeStyle = enraged ? '#FACC15' : '#FCA5A5';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#1E293B';
      ctx.fillRect(p.x - 16 * p.scale, p.y - h * 0.22, 9 * p.scale, 28 * p.scale);
      ctx.fillRect(p.x + 7 * p.scale, p.y - h * 0.22, 9 * p.scale, 28 * p.scale);

      ctx.fillStyle = enraged ? '#FEF08A' : '#FBBF24';
      ctx.beginPath();
      ctx.arc(p.x, top + h * 0.45, 14 * p.scale, 0, Math.PI * 2);
      ctx.fill();
    }

    const barW = w * 1.15;
    const barH = 10 * p.scale;
    const barX = p.x - barW / 2;
    const barY = top - 22 * p.scale;
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = boss.isMiniBoss ? '#FBBF24' : enraged ? '#F59E0B' : '#EF4444';
    ctx.fillRect(barX + 1, barY + 1, Math.max(0, (barW - 2) * (boss.hp / boss.maxHp)), barH - 2);
  }

  private drawHazard(hItem: EnemyHazard) {
    const ctx = this.ctx;
    const p = this.project(hItem.x, hItem.z);
    const r = 13 * p.scale;
    ctx.fillStyle = '#F97316';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FEF08A';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  private drawPickup(p: FieldPickup) {
    const ctx = this.ctx;
    const proj = this.project(p.x, p.z);
    const bob = Math.sin(this.elapsedTime * 4 + p.id) * 3 * proj.scale;
    const x = proj.x;
    const y = proj.y - 26 * proj.scale + bob;
    const r = 15 * proj.scale;
    const color =
      p.kind === 'MAGNET'
        ? '#22D3EE'
        : p.kind === 'FRENZY'
          ? '#FB923C'
          : p.kind === 'NUKE'
            ? '#FDE047'
            : '#38BDF8';
    const label =
      p.kind === 'MAGNET' ? 'MAGNEET' : p.kind === 'FRENZY' ? 'FRENZY' : p.kind === 'NUKE' ? 'NUKE' : `+${p.value}`;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, proj.y + 3, r * 0.9, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, 3 * proj.scale);
    ctx.beginPath();
    ctx.roundRect(-r, -r, r * 2, r * 2, 5 * proj.scale);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.max(10, Math.round(12 * proj.scale))}px "Barlow Condensed", sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#090D16';
    ctx.strokeText(label, x, y - r - 8 * proj.scale);
    ctx.fillStyle = color;
    ctx.fillText(label, x, y - r - 8 * proj.scale);
  }

  private drawStrikeZone(s: MortarStrike) {
    const ctx = this.ctx;
    const proj = this.project(s.x, 0.92);
    const t = 1 - Math.max(0, s.timer) / s.maxTimer;

    if (s.kind === 'LASER') {
      const top = this.project(s.x, 0);
      const bottom = this.project(s.x, 1.05);
      const beamW = Math.max(8, (s.radius + 0.06) * 2 * proj.halfW);
      const pulse = 0.22 + 0.32 * Math.abs(Math.sin(this.elapsedTime * 14));
      const color = s.aimed ? '233, 213, 255' : '248, 113, 113';
      ctx.strokeStyle = `rgba(${color}, ${pulse})`;
      ctx.lineWidth = beamW;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(bottom.x, bottom.y);
      ctx.stroke();
      ctx.strokeStyle = s.aimed ? 'rgba(245, 208, 254, 0.85)' : 'rgba(254, 226, 226, 0.8)';
      ctx.lineWidth = Math.max(1.5, beamW * 0.22);
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(bottom.x, bottom.y);
      ctx.stroke();
      return;
    }

    const fullR = (s.radius + 0.1) * proj.halfW;
    const fillR = fullR * (0.25 + 0.75 * t);
    const pulse = 0.32 + 0.3 * Math.abs(Math.sin(this.elapsedTime * 12));
    const isBarrage = s.kind === 'BARRAGE';
    const color = isBarrage ? '251, 146, 60' : '248, 113, 113';
    ctx.strokeStyle = `rgba(${color}, ${pulse})`;
    ctx.lineWidth = isBarrage ? 3 : 2.5;
    ctx.beginPath();
    ctx.ellipse(proj.x, proj.y, fullR, fullR * 0.38, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(${color}, ${0.08 + 0.18 * t})`;
    ctx.beginPath();
    ctx.ellipse(proj.x, proj.y, fillR, fillR * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    const shellY = proj.y - (140 * (1 - t) + 12) * proj.scale;
    ctx.fillStyle = isBarrage ? '#F97316' : '#FB923C';
    ctx.beginPath();
    ctx.arc(proj.x, shellY, isBarrage ? 5.5 * proj.scale : 4.5 * proj.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${color}, 0.6)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(proj.x, shellY);
    ctx.lineTo(proj.x, shellY + 12 * proj.scale);
    ctx.stroke();
  }

  private drawPlayerSquad() {
    const ctx = this.ctx;
    const maxDrawn = Math.min(48, this.squadCount);
    const cols = Math.min(9, Math.max(1, Math.ceil(Math.sqrt(maxDrawn * 1.8))));

    const center = this.project(this.playerX, 0.94);
    if (this.hyperTimer > 0) {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.18)';
      ctx.beginPath();
      ctx.ellipse(center.x, center.y + 8, 74, 24, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = maxDrawn - 1; i >= 0; i--) {
      const row = Math.floor(i / cols);
      const rowCount = row === Math.floor((maxDrawn - 1) / cols) ? ((maxDrawn - 1) % cols) + 1 : cols;
      const col = i % cols;
      const offsetX = (col - (rowCount - 1) / 2) * 0.042;
      const offsetZ = row * 0.018;
      const p = this.project(this.playerX + offsetX, 0.94 + offsetZ);
      const r = 8.5 * p.scale;
      const stride = Math.sin(this.elapsedTime * 13 + i) * 1.4;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 3, r * 0.85, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      const hurtFlash = this.damageFlashTimer > 0;
      ctx.fillStyle = hurtFlash
        ? '#DC2626'
        : this.hyperTimer > 0
        ? '#D97706'
        : this.weaponTier === 'LASER'
        ? '#7E22CE'
        : '#0284C7';
      ctx.beginPath();
      ctx.roundRect(p.x - r * 0.72, p.y - r * 1.4 + stride, r * 1.44, r * 1.4, 4);
      ctx.fill();

      ctx.fillStyle = this.weaponTier === 'LASER' ? '#E9D5FF' : '#E2E8F0';
      if (this.weaponTier === 'ROCKET') {
        ctx.fillRect(p.x + r * 0.45, p.y - r * 1.8 + stride, 4.5, r * 1.2);
      } else if (this.weaponTier === 'DOUBLE') {
        ctx.fillRect(p.x - r * 0.85, p.y - r * 1.7 + stride, 2.5, r * 0.8);
        ctx.fillRect(p.x + r * 0.65, p.y - r * 1.7 + stride, 2.5, r * 0.8);
      } else {
        ctx.fillRect(p.x + r * 0.55, p.y - r * 1.75 + stride, 3, r * 0.9);
      }

      ctx.fillStyle = hurtFlash
        ? '#FCA5A5'
        : this.hyperTimer > 0
        ? '#FEF08A'
        : this.weaponTier === 'LASER'
        ? '#D8B4FE'
        : '#7DD3FC';
      ctx.beginPath();
      ctx.arc(p.x, p.y - r * 1.58 + stride, r * 0.58, 0, Math.PI * 2);
      ctx.fill();

      if (row === 0 && this.muzzleFlash > 0.25) {
        ctx.fillStyle = this.hyperTimer > 0 ? '#FDE047' : WEAPON_STATS[this.weaponTier].color;
        ctx.beginPath();
        ctx.arc(p.x, p.y - r * 2.1, r * 0.45 * this.muzzleFlash, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const drone of this.drones) {
      const hover = Math.sin(this.elapsedTime * 6 + drone.slot) * 4;
      const dp = this.project(this.droneX(drone.slot), 0.9);
      const dy = dp.y - 22 + hover;
      const flash = drone.flashTimer > 0;

      ctx.fillStyle = flash ? '#FFFFFF' : '#0F172A';
      ctx.beginPath();
      ctx.arc(dp.x, dy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = flash ? '#FFFFFF' : drone.hp <= 1 ? '#F87171' : '#34D399';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = flash ? '#FFFFFF' : '#6EE7B7';
      ctx.beginPath();
      ctx.arc(dp.x, dy, 3.5, 0, Math.PI * 2);
      ctx.fill();

      if (drone.hp < drone.maxHp) {
        const barW = 20;
        const barH = 3;
        const barX = dp.x - barW / 2;
        const barY = dy - 16;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = drone.hp <= 1 ? '#F87171' : '#34D399';
        ctx.fillRect(barX, barY, barW * (drone.hp / drone.maxHp), barH);
      }
    }

    if (this.shieldCharges > 0) {
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(center.x, center.y - 6, 56, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }

    const atCap = this.currentMaxSquad !== null && this.squadCount >= this.currentMaxSquad;
    const hurtPill = this.damageFlashTimer > 0;
    const pillLabel =
      this.currentMaxSquad !== null ? `${this.squadCount}/${this.currentMaxSquad}` : `${this.squadCount}/∞`;
    const pillW = Math.max(66, pillLabel.length * 10 + 18);
    const pillH = 24;
    const pillX = center.x - pillW / 2;
    const pillY = center.y - 48;

    ctx.fillStyle = hurtPill ? 'rgba(127, 29, 29, 0.94)' : 'rgba(9, 13, 22, 0.9)';
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 6);
    ctx.fill();
    ctx.strokeStyle = hurtPill ? '#EF4444' : this.hyperTimer > 0 ? '#FACC15' : atCap ? '#F59E0B' : '#38BDF8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hurtPill ? '#FECACA' : atCap ? '#FDE68A' : '#F8FAFC';
    ctx.fillText(pillLabel, center.x, pillY + pillH / 2 + 0.5);
  }
}

import {
  BarrelSpec,
  BarrierSpec,
  EnemySpec,
  GateSpec,
  STAGE_LENGTH_CONFIG,
  generateStageEvents,
  getFireRateMultiplier,
  getFirepowerMultiplier,
  getGoldMultiplier,
  getStartSquadCount,
} from './stages';
import { sound } from './sound';
import {
  AirstrikeMissile,
  BarrelEntity,
  BossEntity,
  BridgeBarrier,
  Bullet,
  CoinDrop,
  EnemyGroup,
  EnemyHazard,
  FloatingText,
  GateEntity,
  HudSnapshot,
  Particle,
  Shockwave,
  StageLengthMode,
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
  private maxSquadReached = 8;
  private weaponTier: WeaponTier = 'RIFLE';
  private shieldCharges = 0;
  private droneCount = 0;
  private droneCooldown = 0;
  private hyperCharge = 0;
  private hyperTimer = 0;
  private airstrikeCharge = 50;
  private comboCount = 0;
  private comboTimer = 0;
  private tempFireRateBonus = 1;
  private tempDamageBonus = 1;
  private upgrades: UpgradeLevels = { startSquad: 0, firepower: 0, fireRate: 0, goldBonus: 0 };

  // Stage state
  private stage = 1;
  private stageLengthUnits = 190;
  private biome: BiomeTheme = BIOMES[0];
  private distance = 0;
  private scrollSpeed = 7.6;
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

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = context;
    this.callbacks = callbacks;
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

  startStage(stage: number, upgrades: UpgradeLevels, lengthMode: StageLengthMode = 'NORMAL') {
    this.stage = stage;
    this.stageLengthUnits = STAGE_LENGTH_CONFIG[lengthMode].units;
    this.biome = BIOMES[(stage - 1) % BIOMES.length];
    this.upgrades = { ...upgrades };
    this.playerX = 0;
    this.targetX = 0;
    this.keyboardDir = 0;
    this.squadCount = getStartSquadCount(upgrades);
    this.maxSquadReached = this.squadCount;
    this.weaponTier = 'RIFLE';
    this.shieldCharges = 0;
    this.droneCount = 0;
    this.droneCooldown = 0;
    this.hyperCharge = 0;
    this.hyperTimer = 0;
    this.airstrikeCharge = 55;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.tempFireRateBonus = 1;
    this.tempDamageBonus = 1;

    this.distance = 0;
    this.scrollSpeed = 7.6 + Math.min(2.6, (stage - 1) * 0.35);
    this.events = generateStageEvents(stage, lengthMode);
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

    this.elapsedTime = 0;
    this.fireCooldown = 0;
    this.shakeIntensity = 0;
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

    const baseDamage = (65 + this.squadCount * 3.5) * getFirepowerMultiplier(this.upgrades);
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
      this.roadScroll = (this.roadScroll + dt * 1.48) % 1;
    } else {
      this.roadScroll = (this.roadScroll + dt * 0.35) % 1;
    }

    while (this.nextEventIndex < this.events.length && this.distance >= this.events[this.nextEventIndex].atDistance) {
      this.spawnEvent(this.events[this.nextEventIndex]);
      this.nextEventIndex++;
    }

    this.updateShooting(dt);
    this.updateDroneShooting(dt);
    this.updateMissiles(dt);
    this.updateBullets(dt);
    this.updateGates(dt);
    this.updateBarrels(dt);
    this.updateBarriers(dt);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateHazards(dt);
    this.updateParticles(dt);
    this.updateShockwaves(dt);
    this.updateCoins(dt);
    this.updateTexts(dt);

    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 28);
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
    const earned = Math.max(1, Math.round(baseAmount * getGoldMultiplier(this.upgrades) * hyperMult));
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
    if (ev.type === 'GATE_PAIR') {
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
            : b.kind === 'TNT_BARREL'
            ? { type: 'TNT' as const, radius: 0.55, damage: Math.round(90 * Math.pow(1.36, this.stage - 1)) }
            : { type: 'GOLD' as const, amount: b.goldAmount ?? 12 };

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
        const units = Array.from({ length: Math.min(24, e.count) }, (_, i) => {
          const cols = Math.min(5, Math.ceil(Math.sqrt(e.count)));
          const row = Math.floor(i / cols);
          const col = i % cols;
          return {
            offsetX: (col - (cols - 1) / 2) * 0.075 + (Math.random() - 0.5) * 0.015,
            offsetZ: -row * 0.026,
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
          hpPerUnit: e.hpPerUnit,
          currentFrontHp: e.hpPerUnit,
          kind: e.kind,
          fireTimer: e.kind === 'TURRET' ? 1.15 : 0,
          flashTimer: 0,
          units,
        });
      }
    } else if (ev.type === 'MINIBOSS' || ev.type === 'BOSS') {
      const isMini = ev.type === 'MINIBOSS';
      const payload = ev.payload as { kind: BossEntity['kind']; name: string; hp: number; goldReward: number };
      if (!isMini) this.bossSpawned = true;
      this.boss = {
        id: this.nextEntityId++,
        name: payload.name,
        isMiniBoss: isMini,
        kind: payload.kind,
        x: 0,
        z: 0.02,
        targetZ: isMini ? 0.36 : 0.34,
        vx: isMini ? 0.22 : 0.28,
        hp: payload.hp,
        maxHp: payload.hp,
        flashTimer: 0,
        goldReward: payload.goldReward,
        attackTimer: isMini ? 2.1 : 1.6,
        rotorAngle: 0,
        telegraphLanes: [],
        telegraphTimer: 0,
      };
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
    const effectiveRate = getFireRateMultiplier(this.upgrades) * this.tempFireRateBonus * hyperMult;
    const interval = spec.fireInterval / effectiveRate;

    this.fireCooldown -= dt;
    if (this.fireCooldown > 0) return;
    this.fireCooldown = interval;

    const activeShooters = Math.min(7, Math.max(1, Math.ceil(this.squadCount / 4)));
    const dmgScale = (this.squadCount / activeShooters) * getFirepowerMultiplier(this.upgrades) * this.tempDamageBonus;
    const critChance = Math.min(0.4, this.comboCount * 0.012);
    const isCrit = Math.random() < critChance;
    const bulletDamage = spec.damage * dmgScale * 0.45 * (this.hyperTimer > 0 ? 1.2 : 1) * (isCrit ? 1.75 : 1);

    this.muzzleFlash = 1;
    sound.playShot(spec.isRocket, this.hyperTimer > 0, spec.isLaser);

    for (let s = 0; s < activeShooters; s++) {
      const spreadIdx = activeShooters === 1 ? 0 : s - (activeShooters - 1) / 2;
      const originX = this.playerX + spreadIdx * 0.042;
      const originZ = 0.94;

      for (let p = 0; p < spec.pellets; p++) {
        const pelletOffset = spec.pellets === 1 ? 0 : (p - (spec.pellets - 1) / 2) * spec.spread;
        const bx = originX + pelletOffset * 0.06;
        this.bullets.push({
          x: bx,
          z: originZ,
          prevX: bx,
          prevZ: originZ,
          vx: pelletOffset * 0.72,
          vz: spec.isLaser ? -1.85 : -1.48,
          damage: bulletDamage / spec.pellets,
          isRocket: spec.isRocket,
          isLaser: spec.isLaser,
          pierceLeft: spec.pierce,
          hitIds: new Set<number>(),
          aoeRadius: spec.aoe,
          color: this.hyperTimer > 0 && !spec.isRocket && !spec.isLaser ? '#FDE047' : spec.color,
        });
      }
    }
  }

  private updateDroneShooting(dt: number) {
    if (this.droneCount <= 0) return;
    this.droneCooldown -= dt;
    if (this.droneCooldown > 0) return;
    this.droneCooldown = this.hyperTimer > 0 ? 0.22 : 0.34;

    const dmg = 8.5 * getFirepowerMultiplier(this.upgrades) * this.tempDamageBonus;
    for (let i = 0; i < this.droneCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const tierOffset = Math.floor(i / 2) * 0.08;
      const dx = this.playerX + side * (0.24 + tierOffset);
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
        this.shieldCharges = Math.min(3, this.shieldCharges + barrel.reward.charges);
        this.spawnFloatingText(proj.x, proj.y - 20, 'ENERGIESCHILD ACTIEF!', '#22D3EE', 1.2);
      } else if (barrel.reward.type === 'DRONE') {
        this.droneCount = Math.min(4, this.droneCount + barrel.reward.count);
        this.spawnFloatingText(proj.x, proj.y - 20, '+1 AANVALSDRONE!', '#34D399', 1.2);
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

    while (remaining > 0 && group.count > 0) {
      if (remaining >= group.currentFrontHp) {
        remaining -= group.currentFrontHp;
        group.count -= 1;
        this.kills += 1;
        this.registerComboHit(1);
        this.awardGold(group.kind === 'BRUTE' || group.kind === 'TURRET' ? 5 : 2, proj.x, proj.y);
        this.addHyperCharge(group.kind === 'BRUTE' || group.kind === 'TURRET' ? 6 : 2.5);
        group.currentFrontHp = group.hpPerUnit;
        const aliveUnit = group.units.find((u) => u.alive);
        if (aliveUnit) aliveUnit.alive = false;
        if (Math.random() < 0.65) {
          this.spawnParticles(proj.x, proj.y, '#EF4444', 3);
        }
      } else {
        group.currentFrontHp -= remaining;
        remaining = 0;
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

  private absorbOrDamageSquad(loss: number, label = '') {
    if (this.shieldCharges > 0) {
      this.shieldCharges -= 1;
      sound.playShieldBlock();
      const proj = this.project(this.playerX, 0.92);
      this.spawnShockwave(proj.x, proj.y, '#22D3EE', 78);
      this.spawnFloatingText(proj.x, proj.y - 34, 'SCHILD GEBLOKT!', '#22D3EE', 1.2);
      return;
    }

    this.comboCount = 0;
    this.squadCount = Math.max(0, this.squadCount - loss);
    sound.playNegativeGate();
    const proj = this.project(this.playerX, 0.94);
    this.spawnParticles(proj.x, proj.y, '#EF4444', 12);
    this.spawnFloatingText(proj.x, proj.y - 28, label || `-${loss}`, '#F87171', 1.18);
    if (!this.reducedMotion) this.shakeIntensity = 6;
  }

  private updateGates(dt: number) {
    const zSpeed = 0.25;
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
      this.squadCount = Math.min(550, this.squadCount * g.value);
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
    }

    sound.playPositiveGate();
    this.addHyperCharge(10);
    this.spawnParticles(proj.x, proj.y, '#38BDF8', 14);
    this.spawnShockwave(proj.x, proj.y, '#38BDF8', 68);
    this.spawnFloatingText(proj.x, proj.y - 34, label, '#38BDF8', 1.25);
  }

  private addSquad(amount: number) {
    this.squadCount = Math.min(550, this.squadCount + amount);
    this.maxSquadReached = Math.max(this.maxSquadReached, this.squadCount);
  }

  private updateBarriers(dt: number) {
    const zSpeed = 0.25;
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
        this.absorbOrDamageSquad(br.damage, `-${br.damage} Barrière`);
      }

      if (br.z > 1.1) {
        this.barriers.splice(i, 1);
      }
    }
  }

  private updateBarrels(dt: number) {
    const zSpeed = 0.25;
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
          this.absorbOrDamageSquad(5, 'TNT BOEM!');
          this.triggerAoeBlast(b.x, b.z, 70, 0.45, '#EF4444');
        } else {
          const loss = Math.max(2, Math.ceil(b.hp / 16));
          b.destroyed = true;
          this.absorbOrDamageSquad(loss);
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

      g.z += g.speed * dt;
      if (g.kind === 'TURRET') {
        g.fireTimer -= dt;
        if (g.fireTimer <= 0 && g.z < 0.8) {
          g.fireTimer = Math.max(1.25, 1.85 - this.stage * 0.08);
          this.hazards.push({
            id: this.nextEntityId++,
            x: g.x,
            z: g.z + 0.03,
            speed: 0.46,
            damage: 2 + Math.floor(this.stage * 0.5),
            radius: 0.1,
          });
        }
      } else if (g.z > 0.55) {
        g.x += (this.playerX - g.x) * Math.min(1, dt * (g.kind === 'RUSHER' ? 1.3 : 0.9));
      }
      if (g.flashTimer > 0) g.flashTimer = Math.max(0, g.flashTimer - dt);

      if (g.z >= 0.91 && g.z <= 1.02 && Math.abs(this.playerX - g.x) < 0.28) {
        const loss = g.count;
        g.count = 0;
        this.enemies.splice(i, 1);
        this.absorbOrDamageSquad(loss, `-${loss} Botsing`);
        continue;
      }

      if (g.z > 1.12) {
        this.enemies.splice(i, 1);
      }
    }
  }

  private updateBoss(dt: number) {
    if (!this.boss) return;
    const boss = this.boss;
    const enraged = !boss.isMiniBoss && boss.hp < boss.maxHp * 0.5;
    boss.rotorAngle += dt * (enraged ? 22 : 16);

    if (boss.z < boss.targetZ) {
      boss.z = Math.min(boss.targetZ, boss.z + 0.16 * dt);
    } else {
      const speedMult = enraged ? 1.4 : 1;
      boss.x += boss.vx * speedMult * dt;
      if (boss.x > 0.55) {
        boss.x = 0.55;
        boss.vx = -Math.abs(boss.vx);
      } else if (boss.x < -0.55) {
        boss.x = -0.55;
        boss.vx = Math.abs(boss.vx);
      }

      if (boss.telegraphLanes.length > 0) {
        boss.telegraphTimer -= dt;
        if (boss.telegraphTimer <= 0) {
          for (const laneX of boss.telegraphLanes) {
            this.hazards.push({
              id: this.nextEntityId++,
              x: laneX,
              z: boss.z + 0.05,
              speed: enraged ? 0.54 : 0.48,
              damage: (boss.isMiniBoss ? 2 : 3) + this.stage,
              radius: 0.13,
            });
          }
          boss.telegraphLanes = [];
        }
      } else {
        boss.attackTimer -= dt;
        if (boss.attackTimer <= 0) {
          boss.attackTimer = Math.max(0.85, (boss.isMiniBoss ? 2.1 : enraged ? 1.35 : 1.75) - this.stage * 0.08);
          const primary = Math.max(-0.68, Math.min(0.68, this.playerX + (Math.random() - 0.5) * 0.2));
          if (enraged) {
            const offset = primary > 0 ? -0.46 : 0.46;
            boss.telegraphLanes = [primary, Math.max(-0.7, Math.min(0.7, primary + offset))];
          } else {
            boss.telegraphLanes = [primary];
          }
          boss.telegraphTimer = enraged ? 0.68 : 0.76;
        }
      }
    }
    if (boss.flashTimer > 0) boss.flashTimer = Math.max(0, boss.flashTimer - dt);
  }

  private updateHazards(dt: number) {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.z += h.speed * dt;
      if (h.z >= 0.9 && h.z <= 0.99 && Math.abs(h.x - this.playerX) < h.radius + 0.1) {
        this.hazards.splice(i, 1);
        this.absorbOrDamageSquad(h.damage);
        continue;
      }
      if (h.z > 1.08) {
        this.hazards.splice(i, 1);
      }
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
    const dmgPerVolley =
      this.squadCount * spec.damage * getFirepowerMultiplier(this.upgrades) * this.tempDamageBonus * 0.45 * (this.hyperTimer > 0 ? 1.2 : 1);
    const droneDps = this.droneCount * 8.5 * getFirepowerMultiplier(this.upgrades) * this.tempDamageBonus * (1 / 0.34);
    const dps = Math.round(shotsPerSec * dmgPerVolley + droneDps);

    this.callbacks.onHudUpdate({
      squadCount: this.squadCount,
      weaponTier: this.weaponTier,
      shieldCharges: this.shieldCharges,
      droneCount: this.droneCount,
      hyperCharge: this.hyperTimer > 0 ? Math.round((this.hyperTimer / 5.5) * 100) : Math.round(this.hyperCharge),
      hyperActive: this.hyperTimer > 0,
      airstrikeCharge: Math.round(this.airstrikeCharge),
      comboCount: this.comboCount,
      biomeName: this.biome.name,
      stage: this.stage,
      stageProgress: this.bossSpawned ? 1 : Math.min(1, this.distance / this.stageLengthUnits),
      runGold: this.runGold,
      kills: this.kills,
      dps,
      bossHp: this.boss ? Math.max(0, Math.ceil(this.boss.hp)) : null,
      bossMaxHp: this.boss ? this.boss.maxHp : null,
      bossName: this.boss ? this.boss.name : null,
      bossEnraged: this.boss ? !this.boss.isMiniBoss && this.boss.hp < this.boss.maxHp * 0.5 : false,
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

    const isPositive =
      g.op === 'MUL' || g.op === 'RATE_UP' || g.op === 'DMG_UP' || (g.op === 'ADD' && g.value >= 0);

    const baseColor = isPositive ? '#0EA5E9' : '#EF4444';
    const lightColor = isPositive ? '#7DD3FC' : '#FCA5A5';
    const bgFill =
      g.flashTimer > 0
        ? 'rgba(255, 255, 255, 0.35)'
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

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = Math.max(14, Math.round((g.op === 'RATE_UP' || g.op === 'DMG_UP' ? 20 : 28) * p.scale));
    ctx.font = `800 ${fontSize}px "Barlow Condensed", sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(9, 13, 22, 0.9)';
    ctx.strokeText(label, p.x, topY + gateH * 0.46);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, p.x, topY + gateH * 0.46);

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

      const r = (isBrute ? 12 : isRusher ? 7.5 : 8) * up.scale;
      const stride = Math.sin(this.elapsedTime * (isRusher ? 18 : 10) + drawn) * 1.6 * up.scale;

      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(up.x, up.y + r * 0.3, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = g.flashTimer > 0 ? '#FFFFFF' : isBrute ? '#991B1B' : isRusher ? '#EA580C' : '#DC2626';
      ctx.beginPath();
      ctx.roundRect(up.x - r * 0.75, up.y - r * 1.5 + stride, r * 1.5, r * 1.5, 4 * up.scale);
      ctx.fill();

      ctx.fillStyle = g.flashTimer > 0 ? '#FFFFFF' : isBrute ? '#F87171' : isRusher ? '#FDBA74' : '#FCA5A5';
      ctx.beginPath();
      ctx.arc(up.x, up.y - r * 1.65 + stride, r * 0.58, 0, Math.PI * 2);
      ctx.fill();
    }

    const tagY = baseProj.y - (isBrute || isTurret ? 36 : 28) * baseProj.scale;
    ctx.font = `800 ${Math.max(12, Math.round(16 * baseProj.scale))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#090D16';
    const label = isTurret ? `TURRET ${g.count}` : `${g.count}`;
    ctx.strokeText(label, baseProj.x, tagY);
    ctx.fillStyle = isRusher ? '#FDBA74' : '#FCA5A5';
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
    const enraged = !boss.isMiniBoss && boss.hp < boss.maxHp * 0.5;

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

      ctx.fillStyle = this.hyperTimer > 0 ? '#D97706' : this.weaponTier === 'LASER' ? '#7E22CE' : '#0284C7';
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

      ctx.fillStyle = this.hyperTimer > 0 ? '#FEF08A' : this.weaponTier === 'LASER' ? '#D8B4FE' : '#7DD3FC';
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

    for (let d = 0; d < this.droneCount; d++) {
      const side = d % 2 === 0 ? -1 : 1;
      const tierOffset = Math.floor(d / 2) * 0.08;
      const hover = Math.sin(this.elapsedTime * 6 + d) * 4;
      const dp = this.project(this.playerX + side * (0.24 + tierOffset), 0.9);

      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(dp.x, dp.y - 22 + hover, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#34D399';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#6EE7B7';
      ctx.beginPath();
      ctx.arc(dp.x, dp.y - 22 + hover, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.shieldCharges > 0) {
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(center.x, center.y - 6, 56, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }

    const pillW = 56;
    const pillH = 24;
    const pillX = center.x - pillW / 2;
    const pillY = center.y - 48;

    ctx.fillStyle = 'rgba(9, 13, 22, 0.9)';
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 6);
    ctx.fill();
    ctx.strokeStyle = this.hyperTimer > 0 ? '#FACC15' : '#38BDF8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = '700 15px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(String(this.squadCount), center.x, pillY + pillH / 2 + 0.5);
  }
}

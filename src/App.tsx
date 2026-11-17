import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Crosshair, HelpCircle, Home, Pause, Play, RotateCcw, Save, Shield, SlidersHorizontal, Square, Volume2, VolumeX, X } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { SaveSlotsModal } from './components/SaveSlotsModal';
import { UpgradePanel } from './components/UpgradePanel';
import { GameEngine, WEAPON_LABELS } from './game/engine';
import { sound } from './game/sound';
import {
  ABSOLUTE_MAX_CAP,
  DEFAULT_GAMEPLAY_SETTINGS,
  DEFAULT_UPGRADE_WEIGHTS,
  GAME_SPEED_CALIBRATION,
  GAME_SPEED_MAX,
  GAME_SPEED_MIN,
  MAX_UPGRADE_LEVEL,
  STAGE_LENGTH_BASE_BLOCKS,
  STAGE_LENGTH_MAX,
  STAGE_LENGTH_MIN,
  STAGE_LENGTH_PRESETS,
  getStageLengthMetrics,
  getStartSquadCount,
  getUpgradeCost,
  splitGold,
} from './game/stages';
import {
  GameState,
  GameplaySettings,
  HudSnapshot,
  PersistentProgress,
  SaveSlots,
  UpgradeLevels,
} from './game/types';

const STORAGE_KEY = 'poortrush_progress_v1';
const SLOTS_KEY = 'poortrush_slots_v1';
const SLOT_COUNT = 3;

const CURRENT_SETTINGS_VERSION = 11;

const DEFAULT_PROGRESS: PersistentProgress = {
  gold: 0,
  highestStage: 1,
  bestSquad: 10,
  totalKills: 0,
  upgrades: {
    startSquad: 0,
    firepower: 0,
    fireRate: 0,
    goldBonus: 0,
  },
  upgradeSplit: { ...DEFAULT_UPGRADE_WEIGHTS },
  muted: false,
  settings: DEFAULT_GAMEPLAY_SETTINGS,
  settingsVersion: CURRENT_SETTINGS_VERSION,
};

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || Number.isNaN(val)) return fallback;
  return Math.max(min, Math.min(max, val));
}

function recalibrateLegacyGameSpeed(legacySpeed: number): number {
  const scaled = Math.round((legacySpeed / GAME_SPEED_CALIBRATION) * 20) / 20;
  return clampNum(scaled, GAME_SPEED_MIN, GAME_SPEED_MAX, DEFAULT_GAMEPLAY_SETTINGS.gameSpeed);
}

function recalibrateLegacyStageLength(legacyFactor: number): number {
  const legacyBlocks = Math.max(1, Math.round(1 + (legacyFactor - 1) * 2.2));
  const scaled = Math.round((legacyBlocks / STAGE_LENGTH_BASE_BLOCKS) * 10) / 10;
  return clampNum(scaled, STAGE_LENGTH_MIN, STAGE_LENGTH_MAX, DEFAULT_GAMEPLAY_SETTINGS.stageLengthFactor);
}

/** Compacte HP-notatie: 1282430 -> 1,28M, 24500 -> 25k. */
function fmtHp(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace('.', ',')}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  return `${value}`;
}

function coerceUpgradeSplit(raw: Partial<UpgradeLevels> | undefined): UpgradeLevels {
  return {
    startSquad: clampNum(raw?.startSquad, 0, 100, DEFAULT_UPGRADE_WEIGHTS.startSquad),
    firepower: clampNum(raw?.firepower, 0, 100, DEFAULT_UPGRADE_WEIGHTS.firepower),
    fireRate: clampNum(raw?.fireRate, 0, 100, DEFAULT_UPGRADE_WEIGHTS.fireRate),
    goldBonus: clampNum(raw?.goldBonus, 0, 100, DEFAULT_UPGRADE_WEIGHTS.goldBonus),
  };
}

function loadProgress(): PersistentProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<PersistentProgress> & {
      stageLength?: string;
      settings?: Partial<GameplaySettings> & Record<string, unknown>;
    };
    const saved = (parsed.settings ?? {}) as Partial<GameplaySettings> & Record<string, unknown>;
    const legacyLenMap: Record<string, number> = { NORMAL: 1, LONG: 2, MARATHON: 3.5, ULTRA: 6 };
    const legacySpeedMap: Record<string, number> = { SLOW: 0.78, NORMAL: 1, TURBO: 1.35 };
    const legacyBossMap: Record<string, number> = { WEAK: 0.6, NORMAL: 1, STRONG: 1.75, TITAN: 2.8 };

    const savedVersion = parsed.settingsVersion ?? 1;
    let hasSavedStageLength =
      typeof saved.stageLengthFactor === 'number' ||
      (typeof saved.stageLength === 'string' && saved.stageLength in legacyLenMap) ||
      (typeof parsed.stageLength === 'string' && parsed.stageLength in legacyLenMap);

    let stageLengthFactor = DEFAULT_GAMEPLAY_SETTINGS.stageLengthFactor;
    if (typeof saved.stageLengthFactor === 'number') {
      stageLengthFactor =
        savedVersion < 11
          ? clampNum(saved.stageLengthFactor, 1, 6, 6)
          : clampNum(
              saved.stageLengthFactor,
              STAGE_LENGTH_MIN,
              STAGE_LENGTH_MAX,
              DEFAULT_GAMEPLAY_SETTINGS.stageLengthFactor,
            );
    } else if (typeof saved.stageLength === 'string' && saved.stageLength in legacyLenMap) {
      stageLengthFactor = legacyLenMap[saved.stageLength];
    } else if (typeof parsed.stageLength === 'string' && parsed.stageLength in legacyLenMap) {
      stageLengthFactor = legacyLenMap[parsed.stageLength];
    }

    let hasSavedSpeed =
      typeof saved.gameSpeed === 'number' ||
      (typeof saved.gameSpeed === 'string' && saved.gameSpeed in legacySpeedMap);

    let gameSpeed = DEFAULT_GAMEPLAY_SETTINGS.gameSpeed;
    if (typeof saved.gameSpeed === 'number') {
      gameSpeed =
        savedVersion < 10
          ? clampNum(saved.gameSpeed, 0.6, 1.6, 0.8)
          : clampNum(saved.gameSpeed, GAME_SPEED_MIN, GAME_SPEED_MAX, DEFAULT_GAMEPLAY_SETTINGS.gameSpeed);
    } else if (typeof saved.gameSpeed === 'string' && saved.gameSpeed in legacySpeedMap) {
      gameSpeed = legacySpeedMap[saved.gameSpeed];
    }

    let enemyHpMult = DEFAULT_GAMEPLAY_SETTINGS.enemyHpMult;
    let goldMult = DEFAULT_GAMEPLAY_SETTINGS.goldMult;
    if (typeof saved.enemyHpMult === 'number') {
      enemyHpMult = clampNum(saved.enemyHpMult, 0.5, 2.5, 1);
    } else if (saved.difficulty === 'CHILL') {
      enemyHpMult = 0.75;
    } else if (saved.difficulty === 'CHAOS') {
      enemyHpMult = 1.45;
    }
    if (typeof saved.goldMult === 'number') {
      goldMult = clampNum(saved.goldMult, 0.5, 3.0, 1);
    } else if (saved.difficulty === 'CHILL') {
      goldMult = 0.85;
    } else if (saved.difficulty === 'CHAOS') {
      goldMult = 1.45;
    }

    let enemyCountMult = DEFAULT_GAMEPLAY_SETTINGS.enemyCountMult;
    if (typeof saved.enemyCountMult === 'number') {
      enemyCountMult = clampNum(saved.enemyCountMult, 0.5, 2.5, 1);
    } else if (saved.waveDensity === 'BUSY') {
      enemyCountMult = 1.35;
    } else if (saved.waveDensity === 'EXTREME') {
      enemyCountMult = 1.75;
    }

    let maxSquadCap: number | null = DEFAULT_GAMEPLAY_SETTINGS.maxSquadCap;
    const rawCap: unknown = saved.maxSquadCap;
    if (rawCap === null || rawCap === 'UNLIMITED') {
      maxSquadCap = null;
    } else if (typeof rawCap === 'number') {
      maxSquadCap = clampNum(rawCap, 50, ABSOLUTE_MAX_CAP, 550);
    } else if (typeof rawCap === 'string') {
      const n = parseInt(rawCap, 10);
      if (!Number.isNaN(n)) maxSquadCap = clampNum(n, 50, ABSOLUTE_MAX_CAP, 550);
    }

    let purpleGateFreq = DEFAULT_GAMEPLAY_SETTINGS.purpleGateFreq;
    if (typeof saved.purpleGateFreq === 'number') {
      purpleGateFreq = clampNum(saved.purpleGateFreq, 0, 100, DEFAULT_GAMEPLAY_SETTINGS.purpleGateFreq);
    } else if (saved.dynamicSquadCap === false) {
      purpleGateFreq = 0;
    }
    if ((parsed.settingsVersion ?? 1) < 3 && purpleGateFreq === 50) {
      purpleGateFreq = DEFAULT_GAMEPLAY_SETTINGS.purpleGateFreq;
    }

    let purpleDoubleChance = clampNum(
      saved.purpleDoubleChance,
      0,
      100,
      DEFAULT_GAMEPLAY_SETTINGS.purpleDoubleChance,
    );

    let purpleGateMin = clampNum(saved.purpleGateMin, 50, 1000, DEFAULT_GAMEPLAY_SETTINGS.purpleGateMin);
    let purpleGateMax = Math.max(
      purpleGateMin,
      clampNum(saved.purpleGateMax, 100, ABSOLUTE_MAX_CAP, DEFAULT_GAMEPLAY_SETTINGS.purpleGateMax),
    );
    if ((parsed.settingsVersion ?? 1) < 2 && purpleGateMin === 150 && purpleGateMax === 1000) {
      purpleGateMin = DEFAULT_GAMEPLAY_SETTINGS.purpleGateMin;
      purpleGateMax = DEFAULT_GAMEPLAY_SETTINGS.purpleGateMax;
    }

    const enemyMaxGroupSizeRaw = clampNum(
      saved.enemyMaxGroupSize,
      15,
      250,
      DEFAULT_GAMEPLAY_SETTINGS.enemyMaxGroupSize,
    );

    let miniBossMult =
      typeof saved.miniBossMult === 'number'
        ? clampNum(saved.miniBossMult, 0.4, 4.0, DEFAULT_GAMEPLAY_SETTINGS.miniBossMult)
        : typeof saved.miniBossStrength === 'string' && saved.miniBossStrength in legacyBossMap
          ? legacyBossMap[saved.miniBossStrength]
          : DEFAULT_GAMEPLAY_SETTINGS.miniBossMult;

    let bossMult =
      typeof saved.bossMult === 'number'
        ? clampNum(saved.bossMult, 0.4, 4.0, DEFAULT_GAMEPLAY_SETTINGS.bossMult)
        : typeof saved.bossStrength === 'string' && saved.bossStrength in legacyBossMap
          ? legacyBossMap[saved.bossStrength]
          : DEFAULT_GAMEPLAY_SETTINGS.bossMult;

    const specialSituations = clampNum(
      saved.specialSituations,
      0,
      100,
      DEFAULT_GAMEPLAY_SETTINGS.specialSituations,
    );

    let enemyMaxGroupSize = enemyMaxGroupSizeRaw;
    if (
      (parsed.settingsVersion ?? 1) < 4 &&
      gameSpeed === 1 &&
      enemyHpMult === 1 &&
      enemyCountMult === 1 &&
      goldMult === 1 &&
      miniBossMult === 1 &&
      bossMult === 1
    ) {
      gameSpeed = DEFAULT_GAMEPLAY_SETTINGS.gameSpeed;
      hasSavedSpeed = false;
      enemyHpMult = DEFAULT_GAMEPLAY_SETTINGS.enemyHpMult;
      enemyCountMult = DEFAULT_GAMEPLAY_SETTINGS.enemyCountMult;
      enemyMaxGroupSize = DEFAULT_GAMEPLAY_SETTINGS.enemyMaxGroupSize;
      goldMult = DEFAULT_GAMEPLAY_SETTINGS.goldMult;
      miniBossMult = DEFAULT_GAMEPLAY_SETTINGS.miniBossMult;
      bossMult = DEFAULT_GAMEPLAY_SETTINGS.bossMult;
    }

    // v5: nieuwe balans. Alleen waarden die nog op de oude standaard stonden
    // worden meegetrokken; een bewuste eigen instelling blijft behouden.
    if ((parsed.settingsVersion ?? 1) < 5) {
      if (maxSquadCap === 550) maxSquadCap = DEFAULT_GAMEPLAY_SETTINGS.maxSquadCap;
      if (purpleGateFreq === 25) purpleGateFreq = DEFAULT_GAMEPLAY_SETTINGS.purpleGateFreq;
      if (purpleGateMin === 100) purpleGateMin = DEFAULT_GAMEPLAY_SETTINGS.purpleGateMin;
      if (purpleGateMax === 500) purpleGateMax = DEFAULT_GAMEPLAY_SETTINGS.purpleGateMax;
      if (enemyCountMult === 1.2) enemyCountMult = DEFAULT_GAMEPLAY_SETTINGS.enemyCountMult;
      if (enemyMaxGroupSize === 100) enemyMaxGroupSize = DEFAULT_GAMEPLAY_SETTINGS.enemyMaxGroupSize;
      if (enemyHpMult === 1.35) enemyHpMult = DEFAULT_GAMEPLAY_SETTINGS.enemyHpMult;
      if (goldMult === 1.15) goldMult = DEFAULT_GAMEPLAY_SETTINGS.goldMult;
    }

    // v6: 100% tempo was de toenmalige standaard (0.9 op de oude schaal).
    if (savedVersion < 6) {
      if (gameSpeed === 0.9 || gameSpeed === 1.1) gameSpeed = 0.9;
    }

    // v7: dubbele paarse poortjes zijn ongewenst; standaard 15% i.p.v. 55%.
    if (savedVersion < 7) {
      if (purpleDoubleChance === 55) purpleDoubleChance = DEFAULT_GAMEPLAY_SETTINGS.purpleDoubleChance;
    }

    // v8: rustiger basis-tempo, lange stages en een vlakkere power-curve.
    if (savedVersion < 8) {
      if (gameSpeed === 1.0 || gameSpeed === 1.1) gameSpeed = 0.9;
      if (stageLengthFactor === 1) stageLengthFactor = 3;
      if (maxSquadCap === 300) maxSquadCap = DEFAULT_GAMEPLAY_SETTINGS.maxSquadCap;
      if (purpleGateMin === 75) purpleGateMin = DEFAULT_GAMEPLAY_SETTINGS.purpleGateMin;
      if (purpleGateMax === 300) purpleGateMax = DEFAULT_GAMEPLAY_SETTINGS.purpleGateMax;
      if (enemyCountMult === 1.35) enemyCountMult = DEFAULT_GAMEPLAY_SETTINGS.enemyCountMult;
      if (enemyMaxGroupSize === 140) enemyMaxGroupSize = DEFAULT_GAMEPLAY_SETTINGS.enemyMaxGroupSize;
    }

    // v10: herijking spelsnelheid — de vroegere 80% (0.80) is nu 100% (1.00).
    if (savedVersion < 10 && hasSavedSpeed) {
      gameSpeed = recalibrateLegacyGameSpeed(gameSpeed);
    }

    // v11: herijking stage-lengte — de vroegere 6,0× (12 blokken) is nu 1,0× (midden & standaard).
    if (savedVersion < 11 && hasSavedStageLength) {
      stageLengthFactor = recalibrateLegacyStageLength(stageLengthFactor);
    }

    return {
      gold: typeof parsed.gold === 'number' ? parsed.gold : 0,
      highestStage: typeof parsed.highestStage === 'number' ? Math.max(1, parsed.highestStage) : 1,
      bestSquad: typeof parsed.bestSquad === 'number' ? Math.max(10, parsed.bestSquad) : 10,
      totalKills: typeof parsed.totalKills === 'number' ? parsed.totalKills : 0,
      upgrades: {
        startSquad: parsed.upgrades?.startSquad ?? 0,
        firepower: parsed.upgrades?.firepower ?? 0,
        fireRate: parsed.upgrades?.fireRate ?? 0,
        goldBonus: parsed.upgrades?.goldBonus ?? 0,
      },
      upgradeSplit: coerceUpgradeSplit(parsed.upgradeSplit),
      muted: Boolean(parsed.muted),
      settings: {
        stageLengthFactor,
        gameSpeed,
        enemyHpMult,
        enemyCountMult,
        enemyMaxGroupSize,
        goldMult,
        startWeapon: saved.startWeapon ?? DEFAULT_GAMEPLAY_SETTINGS.startWeapon,
        startShield: clampNum(saved.startShield, 0, 5, DEFAULT_GAMEPLAY_SETTINGS.startShield),
        startDrones: clampNum(saved.startDrones, 0, 6, DEFAULT_GAMEPLAY_SETTINGS.startDrones),
        biomeChoice: saved.biomeChoice ?? DEFAULT_GAMEPLAY_SETTINGS.biomeChoice,
        maxSquadCap,
        purpleGateFreq,
        purpleDoubleChance,
        purpleGateMin,
        purpleGateMax,
        miniBossMult,
        bossMult,
        specialSituations,
      },
      settingsVersion: CURRENT_SETTINGS_VERSION,
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

/** Een verse, volledig losgekoppelde kopie van de beginstatus. */
function freshDefaultProgress(muted = false): PersistentProgress {
  return {
    ...DEFAULT_PROGRESS,
    upgrades: { ...DEFAULT_PROGRESS.upgrades },
    upgradeSplit: { ...DEFAULT_PROGRESS.upgradeSplit },
    settings: { ...DEFAULT_GAMEPLAY_SETTINGS },
    muted,
    settingsVersion: DEFAULT_PROGRESS.settingsVersion,
  };
}

/** Normaliseert een ruwe slot-status naar een geldige PersistentProgress. */
function coerceSlotProgress(raw: unknown): PersistentProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<PersistentProgress> & { settings?: Partial<GameplaySettings> };
  const saved = (p.settings ?? {}) as Partial<GameplaySettings>;
  const slotVersion = p.settingsVersion ?? 1;
  let slotGameSpeed = DEFAULT_GAMEPLAY_SETTINGS.gameSpeed;
  if (typeof saved.gameSpeed === 'number') {
    slotGameSpeed =
      slotVersion < 10
        ? recalibrateLegacyGameSpeed(clampNum(saved.gameSpeed, 0.6, 1.6, 0.8))
        : clampNum(saved.gameSpeed, GAME_SPEED_MIN, GAME_SPEED_MAX, DEFAULT_GAMEPLAY_SETTINGS.gameSpeed);
  }
  let slotStageLengthFactor = DEFAULT_GAMEPLAY_SETTINGS.stageLengthFactor;
  if (typeof saved.stageLengthFactor === 'number') {
    slotStageLengthFactor =
      slotVersion < 11
        ? recalibrateLegacyStageLength(clampNum(saved.stageLengthFactor, 1, 6, 6))
        : clampNum(
            saved.stageLengthFactor,
            STAGE_LENGTH_MIN,
            STAGE_LENGTH_MAX,
            DEFAULT_GAMEPLAY_SETTINGS.stageLengthFactor,
          );
  }
  return {
    gold: Math.max(0, clampNum(p.gold, 0, Number.MAX_SAFE_INTEGER, 0)),
    highestStage: Math.max(1, Math.round(clampNum(p.highestStage, 1, 9999, 1))),
    bestSquad: Math.max(0, Math.round(clampNum(p.bestSquad, 0, 1_000_000_000, 0))),
    totalKills: Math.max(0, Math.round(clampNum(p.totalKills, 0, 1_000_000_000_000, 0))),
    upgrades: {
      startSquad: clampNum(p.upgrades?.startSquad, 0, MAX_UPGRADE_LEVEL, 0),
      firepower: clampNum(p.upgrades?.firepower, 0, MAX_UPGRADE_LEVEL, 0),
      fireRate: clampNum(p.upgrades?.fireRate, 0, MAX_UPGRADE_LEVEL, 0),
      goldBonus: clampNum(p.upgrades?.goldBonus, 0, MAX_UPGRADE_LEVEL, 0),
    },
    upgradeSplit: coerceUpgradeSplit(p.upgradeSplit),
    muted: Boolean(p.muted),
    settings: {
      ...DEFAULT_GAMEPLAY_SETTINGS,
      ...saved,
      gameSpeed: slotGameSpeed,
      stageLengthFactor: slotStageLengthFactor,
    },
    settingsVersion: CURRENT_SETTINGS_VERSION,
  };
}

function loadSlots(): SaveSlots {
  const empty: SaveSlots = [null, null, null];
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return empty;
    return Array.from({ length: SLOT_COUNT }, (_, i) => {
      const entry = parsed[i] as { savedAt?: unknown; progress?: unknown } | null;
      if (!entry || typeof entry !== 'object') return null;
      const progress = coerceSlotProgress(entry.progress);
      if (!progress) return null;
      return { savedAt: typeof entry.savedAt === 'number' ? entry.savedAt : Date.now(), progress };
    }) as SaveSlots;
  } catch {
    return empty;
  }
}

export default function App() {
  const [progress, setProgress] = useState<PersistentProgress>(() => loadProgress());
  const [selectedStage, setSelectedStage] = useState<number>(() => loadProgress().highestStage);
  const [slots, setSlots] = useState<SaveSlots>(() => loadSlots());
  const [showSaves, setShowSaves] = useState(false);
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(() => {
    try {
      return localStorage.getItem('poortrush_help_seen') !== '1';
    } catch {
      return true;
    }
  });
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showControlHint, setShowControlHint] = useState(false);
  const [squadFlash, setSquadFlash] = useState<'up' | 'down' | null>(null);
  const [runSummary, setRunSummary] = useState<{
    stage: number;
    runGold: number;
    kills: number;
    squadCount: number;
  } | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(() => {
    const initial = loadProgress();
    return {
      squadCount: getStartSquadCount(initial.upgrades),
      maxSquadReached: getStartSquadCount(initial.upgrades),
      maxSquadLimit: initial.settings.maxSquadCap,
      weaponTier: 'RIFLE',
    shieldCharges: 0,
    droneCount: 0,
    hyperCharge: 0,
    hyperActive: false,
    airstrikeCharge: 55,
    shockwaveCharge: 0,
    formation: 'WIDE',
    magnetActive: false,
    frenzyActive: false,
    cryoActive: false,
    freezeActive: false,
    timewarpActive: false,
    fortifyActive: false,
    blitzActive: false,
    vampActive: false,
    comboCount: 0,
    biomeName: 'Kustbrug',
    stage: 1,
    stageProgress: 0,
    runGold: 0,
    kills: 0,
    dps: 0,
    bossHp: null,
    bossMaxHp: null,
    bossName: null,
    bossEnraged: false,
    bossIsMini: false,
  };
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const isPointerDownRef = useRef(false);
  const keysPressedRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const prevSquadRef = useRef(hud.squadCount);

  useEffect(() => {
    sound.setMuted(progress.muted);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // Ignore storage quota errors
    }
  }, [progress]);

  useEffect(() => {
    try {
      localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
    } catch {
      // Ignore storage quota errors
    }
  }, [slots]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const engine = new GameEngine(canvas, {
      onHudUpdate: (nextHud) => setHud(nextHud),
      onStageClear: (summary) => {
        setRunSummary(summary);
        setProgress((prev) => ({
          ...prev,
          gold: prev.gold + summary.runGold,
          highestStage: Math.max(prev.highestStage, summary.stage + 1),
          bestSquad: Math.max(prev.bestSquad, summary.squadCount),
          totalKills: prev.totalKills + summary.kills,
        }));
        setSelectedStage(summary.stage + 1);
        setGameState('STAGE_CLEAR');
      },
      onGameOver: (summary) => {
        setRunSummary({
          stage: summary.stage,
          runGold: summary.runGold,
          kills: summary.kills,
          squadCount: summary.maxSquad,
        });
        setProgress((prev) => ({
          ...prev,
          gold: prev.gold + summary.runGold,
          bestSquad: Math.max(prev.bestSquad, summary.maxSquad),
          totalKills: prev.totalKills + summary.kills,
        }));
        setGameState('GAME_OVER');
      },
    });

    engineRef.current = engine;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      engine.resize(rect.width, rect.height);
    };

    handleResize();
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    return () => {
      ro.disconnect();
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (gameState !== 'TITLE_MENU') return;
    let frameId = 0;
    const tick = () => {
      engineRef.current?.renderIdleBackdrop();
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [gameState]);

  const goToTitleMenu = useCallback(() => {
    engineRef.current?.stop();
    setShowSettings(false);
    setRunSummary(null);
    setGameState('TITLE_MENU');
  }, []);

  const handleSaveSlot = useCallback(
    (index: number) => {
      if (index < 0 || index >= SLOT_COUNT) return;
      sound.unlock();
      const snapshot: PersistentProgress = {
        ...progress,
        upgrades: { ...progress.upgrades },
        settings: { ...progress.settings },
      };
      setSlots((prev) => {
        const next = [...prev] as SaveSlots;
        next[index] = { savedAt: Date.now(), progress: snapshot };
        return next;
      });
    },
    [progress],
  );

  const handleLoadSlot = useCallback(
    (index: number) => {
      const slot = slots[index];
      if (!slot) return;
      sound.unlock();
      setProgress({
        ...slot.progress,
        upgrades: { ...slot.progress.upgrades },
        settings: { ...slot.progress.settings },
      });
      setSelectedStage(slot.progress.highestStage);
      goToTitleMenu();
      setShowSaves(false);
    },
    [slots, goToTitleMenu],
  );

  const handleDeleteSlot = useCallback((index: number) => {
    setSlots((prev) => {
      const next = [...prev] as SaveSlots;
      next[index] = null;
      return next;
    });
  }, []);

  const handleCleanSlate = useCallback(() => {
    sound.unlock();
    setProgress(freshDefaultProgress(progress.muted));
    setSelectedStage(1);
    goToTitleMenu();
    setShowSaves(false);
  }, [progress.muted, goToTitleMenu]);

  const dismissHelp = useCallback(() => {
    setShowHelp(false);
    try {
      localStorage.setItem('poortrush_help_seen', '1');
    } catch {
      // Ignore storage errors
    }
  }, []);

  const bankRunAndExit = useCallback(() => {
    if (gameState === 'PLAYING' || gameState === 'PAUSED') {
      setProgress((prev) => ({
        ...prev,
        gold: prev.gold + hud.runGold,
        bestSquad: Math.max(prev.bestSquad, hud.maxSquadReached),
        totalKills: prev.totalKills + hud.kills,
      }));
    }
    setShowStopConfirm(false);
    engineRef.current?.stop();
    setShowSettings(false);
    setRunSummary(null);
    setGameState('TITLE_MENU');
  }, [gameState, hud.runGold, hud.kills, hud.maxSquadReached]);

  const requestStop = useCallback(() => {
    if (gameState !== 'PLAYING' && gameState !== 'PAUSED') {
      goToTitleMenu();
      return;
    }
    if (gameState === 'PLAYING') {
      engineRef.current?.setPaused(true);
    }
    setShowStopConfirm(true);
  }, [gameState, goToTitleMenu]);

  const cancelStop = useCallback(() => {
    setShowStopConfirm(false);
    if (gameState === 'PLAYING') {
      engineRef.current?.setPaused(false);
    }
  }, [gameState]);

  useEffect(() => {
    const prev = prevSquadRef.current;
    if (hud.squadCount === prev) return;
    prevSquadRef.current = hud.squadCount;
    setSquadFlash(hud.squadCount > prev ? 'up' : 'down');
    const timer = setTimeout(() => setSquadFlash(null), 400);
    return () => clearTimeout(timer);
  }, [hud.squadCount]);

  useEffect(() => {
    if (!showControlHint) return;
    const timer = setTimeout(() => setShowControlHint(false), 9000);
    return () => clearTimeout(timer);
  }, [showControlHint]);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) return;
      setGameState((curr) => {
        if (curr === 'PLAYING') {
          engineRef.current?.setPaused(true);
          return 'PAUSED';
        }
        return curr;
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const updateDir = () => {
      const { left, right } = keysPressedRef.current;
      const dir = (right ? 1 : 0) - (left ? 1 : 0);
      engineRef.current?.setKeyboardDir(dir);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (showSaves) {
        if (e.key === 'Escape') setShowSaves(false);
        return;
      }
      if (showHelp) {
        if (e.key === 'Escape') dismissHelp();
        return;
      }
      if (showStopConfirm) {
        if (e.key === 'Escape') cancelStop();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keysPressedRef.current.left = true;
        updateDir();
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keysPressedRef.current.right = true;
        updateDir();
      } else if (e.code === 'Space') {
        if (gameState === 'PLAYING') {
          e.preventDefault();
          sound.unlock();
          engineRef.current?.triggerAirstrike();
        }
      } else if (e.key === 'q' || e.key === 'Q' || e.key === 'Backspace') {
        if (!showSettings && (gameState === 'PLAYING' || gameState === 'PAUSED')) {
          e.preventDefault();
          requestStop();
        }
      } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (showSettings) {
          setShowSettings(false);
          return;
        }
        setGameState((curr) => {
          if (curr === 'PLAYING') {
            engineRef.current?.setPaused(true);
            return 'PAUSED';
          }
          if (curr === 'PAUSED') {
            engineRef.current?.setPaused(false);
            return 'PLAYING';
          }
          return curr;
        });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keysPressedRef.current.left = false;
        updateDir();
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keysPressedRef.current.right = false;
        updateDir();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [gameState, showSettings, showHelp, showSaves, showStopConfirm, dismissHelp, cancelStop, requestStop]);

  const startStage = useCallback(
    (stageToPlay: number) => {
      sound.unlock();
      setShowSettings(false);
      setShowStopConfirm(false);
      setSelectedStage(stageToPlay);
      setRunSummary(null);
      setShowControlHint(true);
      setGameState('PLAYING');
      engineRef.current?.startStage(stageToPlay, progress.upgrades, progress.settings);
    },
    [progress.upgrades, progress.settings],
  );

  const updateSettings = useCallback((nextSettings: GameplaySettings) => {
    setProgress((prev) => ({ ...prev, settings: nextSettings }));
  }, []);

  const setStageLengthFactor = useCallback((factor: number) => {
    setProgress((prev) => ({
      ...prev,
      settings: { ...prev.settings, stageLengthFactor: factor },
    }));
  }, []);

  const togglePause = useCallback(() => {
    if (gameState === 'PLAYING') {
      engineRef.current?.setPaused(true);
      setGameState('PAUSED');
    } else if (gameState === 'PAUSED') {
      engineRef.current?.setPaused(false);
      setGameState('PLAYING');
    }
  }, [gameState]);

  const handleUpgrade = useCallback((key: keyof UpgradeLevels) => {
    sound.unlock();
    setProgress((prev) => {
      const level = prev.upgrades[key];
      const cost = getUpgradeCost(key, level);
      if (prev.gold < cost) return prev;
      sound.playUpgrade();
      return {
        ...prev,
        gold: prev.gold - cost,
        upgrades: {
          ...prev.upgrades,
          [key]: level + 1,
        },
      };
    });
  }, []);

  const handleSplitGold = useCallback(() => {
    sound.unlock();
    setProgress((prev) => {
      const result = splitGold(prev.gold, prev.upgrades, prev.upgradeSplit);
      if (result.spent <= 0) return prev;
      sound.playUpgrade();
      return { ...prev, gold: result.gold, upgrades: result.upgrades };
    });
  }, []);

  const handleUpgradeWeight = useCallback((key: keyof UpgradeLevels, value: number) => {
    setProgress((prev) => ({
      ...prev,
      upgradeSplit: { ...prev.upgradeSplit, [key]: value },
    }));
  }, []);

  const resetUpgradeWeights = useCallback(() => {
    setProgress((prev) => ({ ...prev, upgradeSplit: { ...DEFAULT_UPGRADE_WEIGHTS } }));
  }, []);

  const steerFromPointer = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || gameState !== 'PLAYING') return;
    const rect = canvas.getBoundingClientRect();
    const rel = (clientX - rect.left) / rect.width;
    const normX = (rel - 0.5) * 2.15;
    engineRef.current?.setTargetXNormalized(normX);
  };

  const airstrikeReady = hud.airstrikeCharge >= 100;
  const s = progress.settings;
  const stageLenMetrics = getStageLengthMetrics(s.stageLengthFactor);
  const stageLenLabel = `${stageLenMetrics.factor.toFixed(1).replace('.', ',')}×`;
  const maxSquadLabel = s.maxSquadCap === null ? '∞' : `Max ${s.maxSquadCap}`;
  const settingsSummary = `${Math.round(s.gameSpeed * 100)}% tempo · ${maxSquadLabel} · MAX-poort ${s.purpleGateFreq}% · ${WEAPON_LABELS[s.startWeapon].split(' ')[0]}`;

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-[#090D16] text-slate-100 select-none">
      {/* Compact Top Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-800/90 bg-slate-950/90 px-4 sm:px-6">
        <div className="flex items-center gap-6 min-w-0">
          <button
            type="button"
            onClick={requestStop}
            className="font-display text-2xl font-extrabold tracking-tight text-white hover:text-sky-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            PoortRush
          </button>

          <div className="hidden sm:flex items-center gap-2.5 text-xs text-slate-400 whitespace-nowrap">
            <span>
              Stage <strong className="font-mono-num text-slate-100">{gameState === 'PLAYING' || gameState === 'PAUSED' ? hud.stage : selectedStage}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Goud <strong className="font-mono-num text-amber-400">{progress.gold + (gameState === 'PLAYING' ? hud.runGold : 0)}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Record <strong className="font-mono-num text-sky-400">{progress.bestSquad} soldaten</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {gameState !== 'PLAYING' && gameState !== 'PAUSED' && (
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:border-sky-500/60 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-sky-400" />
              <span className="hidden sm:inline">Parameters</span>
            </button>
          )}

          {gameState !== 'PLAYING' && gameState !== 'PAUSED' && (
            <button
              type="button"
              onClick={() => setShowSaves(true)}
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:border-emerald-500/60 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <Save className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Opslag</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setProgress((prev) => ({ ...prev, muted: !prev.muted }))}
            aria-label={progress.muted ? 'Geluid aanzetten' : 'Geluid dempen'}
            className="flex h-9 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            {progress.muted ? <VolumeX className="h-4 w-4 text-slate-400" /> : <Volume2 className="h-4 w-4 text-sky-400" />}
            <span className="hidden sm:inline">{progress.muted ? 'Gedempt' : 'Geluid'}</span>
          </button>

          {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
            <>
              <button
                type="button"
                onClick={togglePause}
                title={gameState === 'PAUSED' ? 'Hervatten (P / Esc)' : 'Pauzeren (P / Esc)'}
                className="flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                {gameState === 'PAUSED' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                <span>{gameState === 'PAUSED' ? 'Hervatten' : 'Pauzeren'}</span>
              </button>
              <button
                type="button"
                onClick={requestStop}
                title="Run stoppen (Q of Backspace)"
                className="flex h-9 items-center gap-1.5 rounded-lg border border-red-900/70 bg-red-950/60 px-3 text-xs font-semibold text-red-200 hover:bg-red-900/80 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Stop</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Game Workspace */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col lg:flex-row gap-4 p-2 sm:p-4 min-h-0">
        {/* Mobile Slim HUD Strip */}
        <div className="flex lg:hidden flex-col gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-slate-400 whitespace-nowrap">
                Squad{' '}
                <strong
                  className={`font-mono-num text-sm transition-colors ${
                    squadFlash === 'up'
                      ? 'text-emerald-300'
                      : squadFlash === 'down'
                      ? 'text-red-400'
                      : 'text-sky-400'
                  }`}
                >
                  {hud.squadCount}
                </strong>
                <span className="font-mono-num text-slate-500">/{hud.maxSquadLimit ?? '∞'}</span>
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-slate-200 font-medium truncate">{WEAPON_LABELS[hud.weaponTier]}</span>
              {hud.comboCount >= 5 && (
                <>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-yellow-300 font-mono-num font-bold whitespace-nowrap">{hud.comboCount}×</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className={`font-mono-num font-semibold ${hud.hyperActive ? 'text-yellow-300' : 'text-amber-400'}`}>
                {hud.hyperActive ? '2× HYPER' : `+${hud.runGold}`}
              </span>
              <span className="font-mono-num text-slate-400">
                {hud.bossHp !== null ? 'EINDBAAS' : `${Math.round(hud.stageProgress * 100)}%`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3 text-cyan-300" /> {hud.shieldCharges}
            </span>
            <span className="flex items-center gap-1">
              <Bot className="h-3 w-3 text-emerald-300" /> {hud.droneCount}
            </span>
            <span className="ml-auto font-mono-num">Luchtaanval {hud.airstrikeCharge}%</span>
          </div>
          {(hud.freezeActive || hud.magnetActive || hud.frenzyActive || hud.cryoActive || hud.timewarpActive || hud.fortifyActive || hud.blitzActive || hud.vampActive) && (
            <div className="flex flex-wrap gap-2 text-[10px] font-bold">
              {hud.freezeActive && <span className="text-cyan-300">TIJDSTIL</span>}
              {hud.magnetActive && <span className="text-cyan-300">MAGNEET</span>}
              {hud.frenzyActive && <span className="text-orange-300">FRENZY</span>}
              {hud.cryoActive && <span className="text-sky-300">CRYO</span>}
              {hud.timewarpActive && <span className="text-emerald-300">SNEL</span>}
              {hud.fortifyActive && <span className="text-blue-300">FORT</span>}
              {hud.blitzActive && <span className="text-yellow-300">BLITZ</span>}
              {hud.vampActive && <span className="text-rose-300">VAMP</span>}
            </div>
          )}
        </div>

        {/* Dominant Arena Viewport */}
        <div className="relative flex-1 min-h-0 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl">
          <div
            ref={containerRef}
            className="h-full w-full touch-none cursor-crosshair"
            onPointerDown={(e) => {
              isPointerDownRef.current = true;
              sound.unlock();
              steerFromPointer(e.clientX);
            }}
            onPointerMove={(e) => {
              if (isPointerDownRef.current || e.pointerType === 'mouse') {
                steerFromPointer(e.clientX);
              }
            }}
            onPointerUp={() => {
              isPointerDownRef.current = false;
            }}
            onPointerCancel={() => {
              isPointerDownRef.current = false;
            }}
          >
            <canvas ref={canvasRef} className="block h-full w-full" />
          </div>

          {gameState === 'PLAYING' && showControlHint && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md border border-slate-700/70 bg-slate-950/80 px-2.5 py-1.5 text-[11px] text-slate-300 shadow-lg">
              <span className="hidden sm:inline">
                <span className="font-semibold text-slate-100">A/D</span> of muis ·{' '}
                <span className="font-semibold text-slate-100">Spatie</span> = luchtaanval
              </span>
              <span className="sm:hidden">
                Schuif met je vinger · tik op <span className="font-semibold text-slate-100">Luchtaanval</span>
              </span>
            </div>
          )}

          {gameState === 'PLAYING' &&
            hud.squadCount > 0 &&
            hud.squadCount <= Math.max(5, Math.round((hud.maxSquadLimit ?? 40) * 0.15)) && (
              <div
                className="pointer-events-none absolute inset-0 z-10 animate-pulse rounded-xl"
                style={{ boxShadow: 'inset 0 0 70px rgba(239, 68, 68, 0.38)' }}
              />
            )}

          {/* Mobile Touch Airstrike Button */}
          {gameState === 'PLAYING' && (
            <button
              type="button"
              onClick={() => {
                sound.unlock();
                engineRef.current?.triggerAirstrike();
              }}
              disabled={!airstrikeReady}
              className={`lg:hidden absolute bottom-3 right-3 flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-bold shadow-lg transition-colors whitespace-nowrap ${
                airstrikeReady
                  ? 'bg-rose-500 text-white hover:bg-rose-400 cursor-pointer'
                  : 'bg-slate-900/90 text-slate-400 border border-slate-700 cursor-not-allowed'
              }`}
            >
              <Crosshair className="h-4 w-4" />
              <span>{airstrikeReady ? 'Luchtaanval!' : `${hud.airstrikeCharge}%`}</span>
            </button>
          )}

          {/* Boss Alert Bar */}
          {gameState === 'PLAYING' && hud.bossHp !== null && hud.bossMaxHp !== null && (
            <div
              className={`pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 w-[88%] max-w-md rounded-lg border bg-slate-950/90 px-3.5 py-2 ${
                hud.bossIsMini ? 'border-amber-500/40' : 'border-red-500/40'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold mb-1">
                <span className={hud.bossIsMini ? 'text-amber-400' : hud.bossEnraged ? 'text-amber-400' : 'text-red-400'}>
                  {hud.bossIsMini ? `Mini-Baas · ${hud.bossName}` : hud.bossName}
                  {hud.bossEnraged ? ' · Woede-Fase' : ''}
                </span>
                <span className="font-mono-num text-slate-200">
                  {fmtHp(hud.bossHp)} / {fmtHp(hud.bossMaxHp)} HP
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full transition-[width] duration-75 ${
                    hud.bossIsMini || hud.bossEnraged ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, (hud.bossHp / hud.bossMaxHp) * 100))}%` }}
                />
              </div>
            </div>
          )}

          {/* TITLE MENU OVERLAY */}
          {gameState === 'TITLE_MENU' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900/95 p-5 sm:p-6 shadow-2xl space-y-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-sky-400">Pure Arcade · Nul Wachttijden</p>
                  <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-white text-balance leading-none">
                    Schuif, Schiet &amp; Vermenigvuldig
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Kies rekenpoortjes, blaas TNT-vaten op, pak wapenkisten en stel je eigen speelstijl in.
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <button
                      type="button"
                      onClick={() => setShowHelp(true)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                      <span>Zo speel je</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSaves(true)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>Opslag &amp; clean slate</span>
                    </button>
                  </div>
                </div>

                {/* Stage-lengte & Parameters Bar */}
                <div className="space-y-2 border-t border-b border-slate-800 py-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-lg bg-slate-950/80 p-1 border border-slate-800">
                    {STAGE_LENGTH_PRESETS.map((preset) => {
                      const active = Math.abs(s.stageLengthFactor - preset.factor) < 0.05;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setStageLengthFactor(preset.factor)}
                          className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                            active
                              ? 'bg-sky-500 text-slate-950'
                              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          {preset.label} ({preset.shortLabel})
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowSettings(true)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs hover:border-sky-500/60 hover:bg-slate-800/70 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2 font-semibold text-slate-200 whitespace-nowrap">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-sky-400" />
                      <span>Spelparameters aanpassen</span>
                    </span>
                    <span className="text-slate-400 truncate">{settingsSummary}</span>
                  </button>
                </div>

                {progress.highestStage > 1 && (
                  <div className="space-y-1.5">
                    <label htmlFor="stage-select" className="block text-xs font-medium text-slate-400">
                      Kies Stage (vrijgespeeld t/m {progress.highestStage})
                    </label>
                    <div id="stage-select" className="flex flex-wrap gap-1.5">
                      {Array.from({ length: progress.highestStage }, (_, i) => i + 1).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setSelectedStage(st)}
                          className={`min-w-[40px] h-9 px-2.5 rounded-md text-xs font-mono-num font-bold transition-colors cursor-pointer ${
                            selectedStage === st
                              ? 'bg-sky-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <UpgradePanel
                  gold={progress.gold}
                  upgrades={progress.upgrades}
                  weights={progress.upgradeSplit}
                  onUpgrade={handleUpgrade}
                  onSplitGold={handleSplitGold}
                  onWeightChange={handleUpgradeWeight}
                  onResetWeights={resetUpgradeWeights}
                />

                <button
                  type="button"
                  onClick={() => startStage(selectedStage)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-5 py-3 text-base font-bold text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>Start Stage {selectedStage}</span>
                </button>
              </div>
            </div>
          )}

          {/* PAUSED OVERLAY */}
          {gameState === 'PAUSED' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4 text-center">
                <h2 className="font-display text-3xl font-extrabold text-white">Spel Gepauzeerd</h2>
                <p className="text-sm text-slate-400">
                  Stage {hud.stage} · {hud.squadCount} soldaten actief
                </p>
                <div className="flex flex-col gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={togglePause}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>Hervatten</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startStage(hud.stage)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Opnieuw Spelen</span>
                  </button>
                  <button
                    type="button"
                    onClick={requestStop}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-950/80 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:border-slate-700 hover:text-white transition-colors cursor-pointer"
                  >
                    <Home className="h-4 w-4" />
                    <span>Terug naar Start</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STAGE CLEAR OVERLAY */}
          {gameState === 'STAGE_CLEAR' && runSummary && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-emerald-400">Eindbaas Verslagen</p>
                  <h2 className="font-display text-4xl font-extrabold text-white">Stage {runSummary.stage} Gehaald</h2>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-center">
                  <div>
                    <div className="text-xs text-slate-400">Verdiend</div>
                    <div className="font-mono-num text-lg font-bold text-amber-400">+{runSummary.runGold}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Eind-Squad</div>
                    <div className="font-mono-num text-lg font-bold text-sky-400">{runSummary.squadCount}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Vijanden</div>
                    <div className="font-mono-num text-lg font-bold text-slate-100">{runSummary.kills}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs hover:border-sky-500/60 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-semibold text-slate-200 whitespace-nowrap">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-sky-400" />
                    <span>Spelparameters</span>
                  </span>
                  <span className="text-slate-400 truncate">
                    Lengte {stageLenLabel} · {settingsSummary}
                  </span>
                </button>

                <UpgradePanel
                  gold={progress.gold}
                  upgrades={progress.upgrades}
                  weights={progress.upgradeSplit}
                  onUpgrade={handleUpgrade}
                  onSplitGold={handleSplitGold}
                  onWeightChange={handleUpgradeWeight}
                  onResetWeights={resetUpgradeWeights}
                />

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={goToTitleMenu}
                    className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Home className="h-4 w-4" />
                    <span>Startmenu</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startStage(runSummary.stage + 1)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>Volgende Stage ({runSummary.stage + 1})</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* GAME OVER OVERLAY */}
          {gameState === 'GAME_OVER' && runSummary && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="w-full max-w-lg rounded-xl border border-red-900/60 bg-slate-900 p-6 shadow-2xl space-y-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-red-400">Squad Uitgeschakeld</p>
                  <h2 className="font-display text-4xl font-extrabold text-white">Geen Soldaten Meer</h2>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-center">
                  <div>
                    <div className="text-xs text-slate-400">Goud Behouden</div>
                    <div className="font-mono-num text-lg font-bold text-amber-400">+{runSummary.runGold}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Max Squad</div>
                    <div className="font-mono-num text-lg font-bold text-sky-400">{runSummary.squadCount}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Vijanden</div>
                    <div className="font-mono-num text-lg font-bold text-slate-100">{runSummary.kills}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs hover:border-sky-500/60 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-semibold text-slate-200 whitespace-nowrap">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-sky-400" />
                    <span>Spelparameters</span>
                  </span>
                  <span className="text-slate-400 truncate">
                    Lengte {stageLenLabel} · {settingsSummary}
                  </span>
                </button>

                <UpgradePanel
                  gold={progress.gold}
                  upgrades={progress.upgrades}
                  weights={progress.upgradeSplit}
                  onUpgrade={handleUpgrade}
                  onSplitGold={handleSplitGold}
                  onWeightChange={handleUpgradeWeight}
                  onResetWeights={resetUpgradeWeights}
                />

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={goToTitleMenu}
                    className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Home className="h-4 w-4" />
                    <span>Terug naar Start</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startStage(runSummary.stage)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Opnieuw Spelen</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* HELP MODAL */}
          {showHelp && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
              <div className="w-full max-w-md max-h-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-sky-400">Snelstart</p>
                    <h2 className="font-display text-2xl font-extrabold text-white leading-tight">
                      Zo speel je PoortRush
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={dismissHelp}
                    aria-label="Uitleg sluiten"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3 text-sm text-slate-300">
                  <div className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-500/15 font-mono-num text-xs font-bold text-sky-300">
                      1
                    </span>
                    <p>
                      <strong className="text-slate-100">Schuif</strong> met muis, touch of{' '}
                      <strong className="text-slate-100">A/D</strong>. Je squad vuurt automatisch.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-500/15 font-mono-num text-xs font-bold text-sky-300">
                      2
                    </span>
                    <p>
                      <strong className="text-slate-100">Poortjes</strong>: kies + of × voor je leger.
                      Schiet rode negatieve poortjes kapot voor een boost.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-500/15 font-mono-num text-xs font-bold text-sky-300">
                      3
                    </span>
                    <p>
                      <strong className="text-slate-100">Luchtaanval</strong> met{' '}
                      <strong className="text-slate-100">Spatie</strong> of de tik-knop zodra de balk vol is.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-500/15 font-mono-num text-xs font-bold text-sky-300">
                      4
                    </span>
                    <p>
                      <strong className="text-slate-100">Drones</strong> schieten mee, maar vijandelijk vuur
                      kan ze raken en vernietigen.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 font-mono-num text-xs font-bold text-emerald-300">
                      5
                    </span>
                    <p>
                      <strong className="text-slate-100">Nieuwe situaties</strong>: rijd over zwevende
                      pickups (MAGNEET, FRENZY, NUKE, soldaten) en let op JUMPER-, MEDIC-, MORTAR- en
                      SCHILD-eenheden. Nieuwe MAX-poorten kunnen tijd bevriezen, extra schoten geven of je leger herstellen.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={dismissHelp}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>Begrepen</span>
                </button>
              </div>
            </div>
          )}

          {/* STOP CONFIRM MODAL */}
          {showStopConfirm && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-xl border border-red-900/60 bg-slate-900 p-6 shadow-2xl space-y-4">
                <h2 className="font-display text-2xl font-extrabold text-white">Run stoppen?</h2>
                <p className="text-sm text-slate-300">
                  {hud.runGold > 0 ? (
                    <>
                      Je behoudt <strong className="text-amber-400">{hud.runGold} goud</strong> en gaat terug
                      naar het startmenu. De huidige stage wordt niet afgerekend.
                    </>
                  ) : (
                    <>Je gaat terug naar het startmenu. De huidige stage wordt niet afgerekend.</>
                  )}
                </p>
                <div className="flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={cancelStop}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>Doorgaan</span>
                  </button>
                  <button
                    type="button"
                    onClick={bankRunAndExit}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-900/70 bg-red-950/60 px-4 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-900/80 hover:text-white transition-colors cursor-pointer"
                  >
                    <Square className="h-3 w-3 fill-current" />
                    <span>
                      {hud.runGold > 0 ? `Stop & behoud ${hud.runGold} goud` : 'Stop & ga naar startmenu'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS MODAL */}
          {showSettings && (
            <SettingsModal
              settings={s}
              currentStage={gameState === 'PLAYING' || gameState === 'PAUSED' ? hud.stage : selectedStage}
              onChange={updateSettings}
              onClose={() => setShowSettings(false)}
            />
          )}

          {showSaves && (
            <SaveSlotsModal
              progress={progress}
              slots={slots}
              onSave={handleSaveSlot}
              onLoad={handleLoadSlot}
              onDelete={handleDeleteSlot}
              onCleanSlate={handleCleanSlate}
              onClose={() => setShowSaves(false)}
            />
          )}
        </div>

        {/* Desktop Tactical Command Panel */}
        <aside className="hidden lg:flex w-80 shrink-0 flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/75 p-5">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium text-slate-400">
                {hud.biomeName} · Lengte {stageLenLabel}
                {hud.timewarpActive && <span className="ml-2 text-emerald-300">SNEL</span>}
                {hud.fortifyActive && <span className="ml-2 text-blue-300">FORT</span>}
                {hud.blitzActive && <span className="ml-2 text-yellow-300">BLITZ</span>}
                {hud.vampActive && <span className="ml-2 text-rose-300">VAMP</span>}
              </div>
              <div className="mt-0.5 flex items-baseline justify-between">
                <span className="font-display text-3xl font-extrabold text-white">Stage {hud.stage}</span>
                <span className="font-mono-num text-xs text-slate-400">
                  {hud.bossHp !== null ? 'EINDBAAS' : `${Math.round(hud.stageProgress * 100)}%`}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-sky-500 transition-[width] duration-150"
                  style={{ width: `${Math.round(hud.stageProgress * 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className={hud.hyperActive ? 'font-bold text-yellow-300' : 'text-slate-400'}>
                  {hud.hyperActive ? 'Hypervuur Actief (2× Goud)' : 'Hypervuur Lading'}
                </span>
                <span className="font-mono-num text-slate-300">{hud.hyperCharge}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full transition-[width] duration-100 ${hud.hyperActive ? 'bg-yellow-400' : 'bg-amber-500'}`}
                  style={{ width: `${hud.hyperCharge}%` }}
                />
              </div>
            </div>

            {(hud.freezeActive || hud.magnetActive || hud.frenzyActive || hud.cryoActive || hud.timewarpActive || hud.fortifyActive || hud.blitzActive || hud.vampActive) && (
              <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                {hud.freezeActive && (
                  <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-cyan-200">TIJDSTIL</span>
                )}
                {hud.magnetActive && (
                  <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-cyan-200">MAGNEET</span>
                )}
                {hud.frenzyActive && (
                  <span className="rounded bg-orange-500/20 px-2 py-0.5 text-orange-200">FRENZY</span>
                )}
                {hud.cryoActive && (
                  <span className="rounded bg-sky-500/20 px-2 py-0.5 text-sky-200">CRYO</span>
                )}
                {hud.timewarpActive && (
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-200">SNEL</span>
                )}
                {hud.fortifyActive && (
                  <span className="rounded bg-blue-500/20 px-2 py-0.5 text-blue-200">FORT</span>
                )}
                {hud.blitzActive && (
                  <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-yellow-200">BLITZ</span>
                )}
                {hud.vampActive && (
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 text-rose-200">VAMP</span>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                sound.unlock();
                engineRef.current?.triggerAirstrike();
              }}
              disabled={gameState !== 'PLAYING' || !airstrikeReady}
              className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-xs font-bold transition-colors whitespace-nowrap ${
                gameState === 'PLAYING' && airstrikeReady
                  ? 'border-rose-400/70 bg-rose-500 text-white hover:bg-rose-400 cursor-pointer'
                  : 'border-slate-800 bg-slate-950/60 text-slate-400 cursor-not-allowed'
              }`}
            >
              <span className="flex items-center gap-2">
                <Crosshair className="h-4 w-4" />
                <span>Luchtaanval (Spatie)</span>
              </span>
              <span className="font-mono-num">{airstrikeReady ? 'KLAAR' : `${hud.airstrikeCharge}%`}</span>
            </button>

            <div className="space-y-2 border-t border-slate-800 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Soldaten</span>
                <span className="font-mono-num text-right">
                  <strong
                    className={`text-2xl font-bold transition-colors ${
                      squadFlash === 'up'
                        ? 'text-emerald-300'
                        : squadFlash === 'down'
                        ? 'text-red-400'
                        : hud.maxSquadLimit !== null && hud.squadCount >= hud.maxSquadLimit
                        ? 'text-amber-300'
                        : 'text-sky-400'
                    }`}
                  >
                    {hud.squadCount}
                  </strong>
                  <span className="text-xs text-slate-500 ml-1">/ {hud.maxSquadLimit ?? '∞'}</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Wapen</span>
                <span className="text-sm font-semibold text-amber-300">{WEAPON_LABELS[hud.weaponTier]}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Combo-Streak</span>
                <span className="font-mono-num text-sm font-semibold text-yellow-300">{hud.comboCount}×</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Energieschild</span>
                <span className="font-mono-num text-sm font-semibold text-cyan-300">{hud.shieldCharges}×</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Aanvalsdrones</span>
                <span className="font-mono-num text-sm font-semibold text-emerald-300">{hud.droneCount}×</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Vuurkracht</span>
                <span className="font-mono-num text-sm font-semibold text-slate-200">{hud.dps} DPS</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Run Goud</span>
                <span className="font-mono-num text-sm font-semibold text-amber-400">+{hud.runGold}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-800 pt-3.5 text-xs text-slate-400">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-300">Actieve Instellingen</span>
              <span className="font-mono-num text-slate-500">HP {Math.round(s.enemyHpMult * 100)}%</span>
            </div>
            <p className="leading-relaxed">
              {Math.round(s.gameSpeed * 100)}% tempo · {Math.round(s.enemyCountMult * 100)}% hordes (max {s.enemyMaxGroupSize}) ·{' '}
              {maxSquadLabel} · MAX-poorten {s.purpleGateFreq}% ({s.purpleDoubleChance}% dubbel) ·{' '}
              Mini {s.miniBossMult.toFixed(1).replace('.', ',')}× · Baas {s.bossMult.toFixed(1).replace('.', ',')}× ·{' '}
              Speciale situaties {s.specialSituations}% · {WEAPON_LABELS[s.startWeapon]}
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

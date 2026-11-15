import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Home, Pause, Play, RotateCcw, SlidersHorizontal, Square, Volume2, VolumeX } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { UpgradePanel } from './components/UpgradePanel';
import { GameEngine, WEAPON_LABELS } from './game/engine';
import { sound } from './game/sound';
import {
  BOSS_STRENGTH_CONFIG,
  DEFAULT_GAMEPLAY_SETTINGS,
  DENSITY_CONFIG,
  DIFFICULTY_CONFIG,
  MAX_SQUAD_CONFIG,
  SPEED_CONFIG,
  STAGE_LENGTH_CONFIG,
  getStartSquadCount,
  getUpgradeCost,
} from './game/stages';
import {
  GameState,
  GameplaySettings,
  HudSnapshot,
  PersistentProgress,
  StageLengthMode,
  UpgradeLevels,
} from './game/types';

const STORAGE_KEY = 'poortrush_progress_v1';

const DEFAULT_PROGRESS: PersistentProgress = {
  gold: 0,
  highestStage: 1,
  bestSquad: 6,
  totalKills: 0,
  upgrades: {
    startSquad: 0,
    firepower: 0,
    fireRate: 0,
    goldBonus: 0,
  },
  muted: false,
  settings: DEFAULT_GAMEPLAY_SETTINGS,
};

function loadProgress(): PersistentProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<PersistentProgress> & { stageLength?: StageLengthMode };
    const savedSettings = parsed.settings;
    const legacyLength = parsed.stageLength;
    return {
      gold: typeof parsed.gold === 'number' ? parsed.gold : 0,
      highestStage: typeof parsed.highestStage === 'number' ? Math.max(1, parsed.highestStage) : 1,
      bestSquad: typeof parsed.bestSquad === 'number' ? Math.max(6, parsed.bestSquad) : 6,
      totalKills: typeof parsed.totalKills === 'number' ? parsed.totalKills : 0,
      upgrades: {
        startSquad: parsed.upgrades?.startSquad ?? 0,
        firepower: parsed.upgrades?.firepower ?? 0,
        fireRate: parsed.upgrades?.fireRate ?? 0,
        goldBonus: parsed.upgrades?.goldBonus ?? 0,
      },
      muted: Boolean(parsed.muted),
      settings: {
        stageLength: savedSettings?.stageLength ?? legacyLength ?? DEFAULT_GAMEPLAY_SETTINGS.stageLength,
        difficulty: savedSettings?.difficulty ?? DEFAULT_GAMEPLAY_SETTINGS.difficulty,
        gameSpeed: savedSettings?.gameSpeed ?? DEFAULT_GAMEPLAY_SETTINGS.gameSpeed,
        waveDensity: savedSettings?.waveDensity ?? DEFAULT_GAMEPLAY_SETTINGS.waveDensity,
        startWeapon: savedSettings?.startWeapon ?? DEFAULT_GAMEPLAY_SETTINGS.startWeapon,
        startShield: typeof savedSettings?.startShield === 'number' ? savedSettings.startShield : DEFAULT_GAMEPLAY_SETTINGS.startShield,
        startDrones: typeof savedSettings?.startDrones === 'number' ? savedSettings.startDrones : DEFAULT_GAMEPLAY_SETTINGS.startDrones,
        biomeChoice: savedSettings?.biomeChoice ?? DEFAULT_GAMEPLAY_SETTINGS.biomeChoice,
        maxSquadCap:
          savedSettings?.maxSquadCap && savedSettings.maxSquadCap in MAX_SQUAD_CONFIG
            ? savedSettings.maxSquadCap
            : DEFAULT_GAMEPLAY_SETTINGS.maxSquadCap,
        dynamicSquadCap:
          typeof savedSettings?.dynamicSquadCap === 'boolean'
            ? savedSettings.dynamicSquadCap
            : DEFAULT_GAMEPLAY_SETTINGS.dynamicSquadCap,
        miniBossStrength:
          savedSettings?.miniBossStrength && savedSettings.miniBossStrength in BOSS_STRENGTH_CONFIG
            ? savedSettings.miniBossStrength
            : DEFAULT_GAMEPLAY_SETTINGS.miniBossStrength,
        bossStrength:
          savedSettings?.bossStrength && savedSettings.bossStrength in BOSS_STRENGTH_CONFIG
            ? savedSettings.bossStrength
            : DEFAULT_GAMEPLAY_SETTINGS.bossStrength,
      },
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export default function App() {
  const [progress, setProgress] = useState<PersistentProgress>(() => loadProgress());
  const [selectedStage, setSelectedStage] = useState<number>(() => loadProgress().highestStage);
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [showSettings, setShowSettings] = useState(false);
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
      maxSquadLimit: MAX_SQUAD_CONFIG[initial.settings.maxSquadCap].cap,
      weaponTier: 'RIFLE',
    shieldCharges: 0,
    droneCount: 0,
    hyperCharge: 0,
    hyperActive: false,
    airstrikeCharge: 55,
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

  useEffect(() => {
    sound.setMuted(progress.muted);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // Ignore storage quota errors
    }
  }, [progress]);

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

  useEffect(() => {
    const updateDir = () => {
      const { left, right } = keysPressedRef.current;
      const dir = (right ? 1 : 0) - (left ? 1 : 0);
      engineRef.current?.setKeyboardDir(dir);
    };

    const onKeyDown = (e: KeyboardEvent) => {
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
          goToTitleMenu();
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
  }, [gameState, showSettings, goToTitleMenu]);

  const startStage = useCallback(
    (stageToPlay: number) => {
      sound.unlock();
      setShowSettings(false);
      setSelectedStage(stageToPlay);
      setRunSummary(null);
      setGameState('PLAYING');
      engineRef.current?.startStage(stageToPlay, progress.upgrades, progress.settings);
    },
    [progress.upgrades, progress.settings],
  );

  const updateSettings = useCallback((nextSettings: GameplaySettings) => {
    setProgress((prev) => ({ ...prev, settings: nextSettings }));
  }, []);

  const setStageLength = useCallback((mode: StageLengthMode) => {
    setProgress((prev) => ({
      ...prev,
      settings: { ...prev.settings, stageLength: mode },
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
  const settingsSummary = `${DIFFICULTY_CONFIG[s.difficulty].label} · ${SPEED_CONFIG[s.gameSpeed].label} · ${MAX_SQUAD_CONFIG[s.maxSquadCap].shortLabel} · ${WEAPON_LABELS[s.startWeapon].split(' ')[0]}`;

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-[#090D16] text-slate-100 select-none">
      {/* Compact Top Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-800/90 bg-slate-950/90 px-4 sm:px-6">
        <div className="flex items-center gap-6 min-w-0">
          <button
            type="button"
            onClick={goToTitleMenu}
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
                onClick={goToTitleMenu}
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
        <div className="flex lg:hidden items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-slate-400 whitespace-nowrap">
              Squad <strong className="font-mono-num text-sky-400 text-sm">{hud.squadCount}</strong>
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
            <span className="font-mono-num text-slate-400">{Math.round(hud.stageProgress * 100)}%</span>
          </div>
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
                  {hud.bossHp} / {hud.bossMaxHp} HP
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
                </div>

                {/* Stage-lengte & Parameters Bar */}
                <div className="space-y-2 border-t border-b border-slate-800 py-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-lg bg-slate-950/80 p-1 border border-slate-800">
                    {(['NORMAL', 'LONG', 'MARATHON', 'ULTRA'] as StageLengthMode[]).map((mode) => {
                      const cfg = STAGE_LENGTH_CONFIG[mode];
                      const active = s.stageLength === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setStageLength(mode)}
                          className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                            active
                              ? 'bg-sky-500 text-slate-950'
                              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          {cfg.label} ({cfg.factorLabel})
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

                <UpgradePanel gold={progress.gold} upgrades={progress.upgrades} onUpgrade={handleUpgrade} />

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
                    onClick={goToTitleMenu}
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
                    {STAGE_LENGTH_CONFIG[s.stageLength].label} ({STAGE_LENGTH_CONFIG[s.stageLength].factorLabel}) · {settingsSummary}
                  </span>
                </button>

                <UpgradePanel gold={progress.gold} upgrades={progress.upgrades} onUpgrade={handleUpgrade} />

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
                    {STAGE_LENGTH_CONFIG[s.stageLength].label} ({STAGE_LENGTH_CONFIG[s.stageLength].factorLabel}) · {settingsSummary}
                  </span>
                </button>

                <UpgradePanel gold={progress.gold} upgrades={progress.upgrades} onUpgrade={handleUpgrade} />

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

          {/* SETTINGS MODAL */}
          {showSettings && (
            <SettingsModal settings={s} onChange={updateSettings} onClose={() => setShowSettings(false)} />
          )}
        </div>

        {/* Desktop Tactical Command Panel */}
        <aside className="hidden lg:flex w-80 shrink-0 flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/75 p-5">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium text-slate-400">
                {hud.biomeName} · {STAGE_LENGTH_CONFIG[s.stageLength].label} ({STAGE_LENGTH_CONFIG[s.stageLength].factorLabel})
              </div>
              <div className="mt-0.5 flex items-baseline justify-between">
                <span className="font-display text-3xl font-extrabold text-white">Stage {hud.stage}</span>
                <span className="font-mono-num text-xs text-slate-400">{Math.round(hud.stageProgress * 100)}%</span>
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
                    className={`text-2xl font-bold ${
                      hud.maxSquadLimit !== null && hud.squadCount >= hud.maxSquadLimit
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
              <span className="text-slate-500">{DIFFICULTY_CONFIG[s.difficulty].label}</span>
            </div>
            <p className="leading-relaxed">
              {SPEED_CONFIG[s.gameSpeed].label} tempo · {DENSITY_CONFIG[s.waveDensity].label} hordes ·{' '}
              {MAX_SQUAD_CONFIG[s.maxSquadCap].shortLabel} · {s.dynamicSquadCap ? 'MAX-poorten aan' : 'MAX-poorten uit'} ·{' '}
              Mini {BOSS_STRENGTH_CONFIG[s.miniBossStrength].factorLabel} · Baas {BOSS_STRENGTH_CONFIG[s.bossStrength].factorLabel} ·{' '}
              {WEAPON_LABELS[s.startWeapon]}
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

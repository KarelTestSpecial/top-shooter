import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { UpgradePanel } from './components/UpgradePanel';
import { GameEngine, WEAPON_LABELS } from './game/engine';
import { sound } from './game/sound';
import { getStartSquadCount, getUpgradeCost } from './game/stages';
import { GameState, HudSnapshot, PersistentProgress, UpgradeLevels } from './game/types';

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
};

function loadProgress(): PersistentProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<PersistentProgress>;
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
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export default function App() {
  const [progress, setProgress] = useState<PersistentProgress>(() => loadProgress());
  const [selectedStage, setSelectedStage] = useState<number>(() => loadProgress().highestStage);
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [runSummary, setRunSummary] = useState<{
    stage: number;
    runGold: number;
    kills: number;
    squadCount: number;
  } | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(() => ({
    squadCount: getStartSquadCount(loadProgress().upgrades),
    weaponTier: 'RIFLE',
    shieldCharges: 0,
    droneCount: 0,
    hyperCharge: 0,
    hyperActive: false,
    stage: 1,
    stageProgress: 0,
    runGold: 0,
    kills: 0,
    dps: 0,
    bossHp: null,
    bossMaxHp: null,
    bossName: null,
  }));

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
      } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
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
  }, []);

  const startStage = useCallback(
    (stageToPlay: number) => {
      sound.unlock();
      setSelectedStage(stageToPlay);
      setRunSummary(null);
      setGameState('PLAYING');
      engineRef.current?.startStage(stageToPlay, progress.upgrades);
    },
    [progress.upgrades],
  );

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

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-[#090D16] text-slate-100 select-none">
      {/* Compact Top Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-800/90 bg-slate-950/90 px-4 sm:px-6">
        <div className="flex items-center gap-6 min-w-0">
          <button
            type="button"
            onClick={() => {
              engineRef.current?.stop();
              setGameState('TITLE_MENU');
            }}
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
            <button
              type="button"
              onClick={togglePause}
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {gameState === 'PAUSED' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              <span>{gameState === 'PAUSED' ? 'Hervatten' : 'Pauzeren'}</span>
            </button>
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
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="text-slate-200 font-medium truncate">{WEAPON_LABELS[hud.weaponTier]}</span>
            {hud.shieldCharges > 0 && (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-cyan-300 font-mono-num whitespace-nowrap">Schild {hud.shieldCharges}</span>
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

          {/* Boss Alert Bar */}
          {gameState === 'PLAYING' && hud.bossHp !== null && hud.bossMaxHp !== null && (
            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 w-[88%] max-w-md rounded-lg border border-red-500/40 bg-slate-950/90 px-3.5 py-2">
              <div className="flex items-center justify-between text-xs font-semibold mb-1">
                <span className="text-red-400">{hud.bossName}</span>
                <span className="font-mono-num text-slate-200">
                  {hud.bossHp} / {hud.bossMaxHp} HP
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-red-500 transition-[width] duration-75"
                  style={{ width: `${Math.max(0, Math.min(100, (hud.bossHp / hud.bossMaxHp) * 100))}%` }}
                />
              </div>
            </div>
          )}

          {/* TITLE MENU OVERLAY */}
          {gameState === 'TITLE_MENU' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl space-y-5">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-sky-400">Pure Arcade · Nul Wachttijden</p>
                  <h1 className="font-display text-4xl font-extrabold tracking-tight text-white text-balance leading-none">
                    Schuif, Schiet &amp; Vermenigvuldig
                  </h1>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Kies de juiste rekenpoortjes, breek wapenkisten, verzamel schilden en drones, en laad Hypervuur op voor 2× goud.
                  </p>
                </div>

                <div className="space-y-1.5 text-xs text-slate-300 border-t border-b border-slate-800 py-3">
                  <div className="flex items-center justify-between">
                    <span>Besturing</span>
                    <span className="font-mono-num text-slate-200">Sleep muis/vinger of A / D</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Slimme Truc</span>
                    <span className="text-sky-300">Schiet op rode poortjes om ze positief te maken</span>
                  </div>
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
                </div>
              </div>
            </div>
          )}

          {/* STAGE CLEAR OVERLAY */}
          {gameState === 'STAGE_CLEAR' && runSummary && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-5">
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

                <UpgradePanel gold={progress.gold} upgrades={progress.upgrades} onUpgrade={handleUpgrade} />

                <div className="flex gap-2.5">
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
              <div className="w-full max-w-lg rounded-xl border border-red-900/60 bg-slate-900 p-6 shadow-2xl space-y-5">
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

                <UpgradePanel gold={progress.gold} upgrades={progress.upgrades} onUpgrade={handleUpgrade} />

                <div className="flex gap-2.5">
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
        </div>

        {/* Desktop Tactical Command Panel */}
        <aside className="hidden lg:flex w-80 shrink-0 flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/75 p-5">
          <div className="space-y-5">
            <div>
              <div className="text-xs font-medium text-slate-400">Actieve Stage</div>
              <div className="mt-1 flex items-baseline justify-between">
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
              <div className="flex items-center justify-between text-xs mb-1.5">
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

            <div className="space-y-2.5 border-t border-slate-800 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Soldaten</span>
                <span className="font-mono-num text-2xl font-bold text-sky-400">{hud.squadCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Wapen</span>
                <span className="text-sm font-semibold text-amber-300">{WEAPON_LABELS[hud.weaponTier]}</span>
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
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Uitgeschakeld</span>
                <span className="font-mono-num text-sm font-semibold text-slate-200">{hud.kills}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 border-t border-slate-800 pt-4 text-xs text-slate-400">
            <div className="font-medium text-slate-300">Besturing &amp; Kratten</div>
            <p className="leading-relaxed">
              Beweeg met muis/vinger of <strong className="text-slate-200">A / D</strong>. Breek gouden{' '}
              <strong className="text-amber-300">Wapenkisten</strong>, cyaan{' '}
              <strong className="text-cyan-300">Schilden</strong> en groene{' '}
              <strong className="text-emerald-300">Drones</strong>.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

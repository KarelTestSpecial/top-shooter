import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, X } from 'lucide-react';
import { WEAPON_LABELS } from '../game/engine';
import {
  BOSS_STRENGTH_CONFIG,
  DEFAULT_GAMEPLAY_SETTINGS,
  DENSITY_CONFIG,
  DIFFICULTY_CONFIG,
  MAX_SQUAD_CONFIG,
  SPEED_CONFIG,
  STAGE_LENGTH_CONFIG,
} from '../game/stages';
import {
  BiomeChoice,
  BossStrengthMode,
  DensityMode,
  DifficultyMode,
  GameplaySettings,
  MaxSquadMode,
  SpeedMode,
  StageLengthMode,
  WeaponTier,
} from '../game/types';

interface SettingsModalProps {
  settings: GameplaySettings;
  onChange: (next: GameplaySettings) => void;
  onClose: () => void;
}

const PRESETS: Array<{ label: string; desc: string; values: GameplaySettings }> = [
  {
    label: 'Standaard Arcade',
    desc: 'Gebalanceerde actie',
    values: DEFAULT_GAMEPLAY_SETTINGS,
  },
  {
    label: 'Snelle Chaos',
    desc: 'Turbo · Sterke Bazen · Max 1500',
    values: {
      stageLength: 'NORMAL',
      difficulty: 'CHAOS',
      gameSpeed: 'TURBO',
      waveDensity: 'BUSY',
      startWeapon: 'DOUBLE',
      startShield: 1,
      startDrones: 1,
      biomeChoice: 'AUTO',
      maxSquadCap: '1500',
      dynamicSquadCap: true,
      miniBossStrength: 'STRONG',
      bossStrength: 'STRONG',
    },
  },
  {
    label: 'Oppermacht Sandbox',
    desc: 'Plasmakanon · ∞ Soldaten · 4 Drones',
    values: {
      stageLength: 'LONG',
      difficulty: 'CHILL',
      gameSpeed: 'NORMAL',
      waveDensity: 'EXTREME',
      startWeapon: 'LASER',
      startShield: 3,
      startDrones: 4,
      biomeChoice: 'AUTO',
      maxSquadCap: 'UNLIMITED',
      dynamicSquadCap: false,
      miniBossStrength: 'NORMAL',
      bossStrength: 'NORMAL',
    },
  },
];

export function SettingsModal({ settings, onChange, onClose }: SettingsModalProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateScrollIndicators = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 8);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 8);
  }, []);

  useEffect(() => {
    updateScrollIndicators();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateScrollIndicators);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateScrollIndicators]);

  const scrollByAmount = (delta: number) => {
    scrollRef.current?.scrollBy({ top: delta, behavior: 'smooth' });
  };

  const update = <K extends keyof GameplaySettings>(key: K, value: GameplaySettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-3 sm:p-5">
      <div className="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5 shrink-0">
          <div>
            <h2 className="font-display text-2xl font-extrabold text-white leading-none">Spelparameters</h2>
            <p className="text-xs text-slate-400 mt-1">Pas tempo, wapens, hordes en omgeving naar wens aan</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content Wrapper with Floating Arrows */}
        <div className="relative flex flex-col flex-1 min-h-0">
          <div
            ref={scrollRef}
            onScroll={updateScrollIndicators}
            className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5"
          >
          {/* Quick Presets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Snelle Voorinstellingen</span>
              <button
                type="button"
                onClick={() => onChange(DEFAULT_GAMEPLAY_SETTINGS)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-sky-400 transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onChange(preset.values)}
                  className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-left hover:border-sky-500/60 hover:bg-slate-800/70 transition-colors cursor-pointer"
                >
                  <div className="text-xs font-bold text-slate-100">{preset.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{preset.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 1. Stage-lengte */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">Stage-lengte</span>
              <span className="text-slate-400">{STAGE_LENGTH_CONFIG[settings.stageLength].bonusLabel}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-lg bg-slate-950/80 p-1 border border-slate-800">
              {(['NORMAL', 'LONG', 'MARATHON', 'ULTRA'] as StageLengthMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => update('stageLength', mode)}
                  className={`rounded-md px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    settings.stageLength === mode
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {STAGE_LENGTH_CONFIG[mode].label} ({STAGE_LENGTH_CONFIG[mode].factorLabel})
                </button>
              ))}
            </div>
          </div>

          {/* 2. Moeilijkheid & 3. Spelsnelheid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">Moeilijkheid</span>
                <span className="text-amber-400 font-mono-num">
                  {Math.round(DIFFICULTY_CONFIG[settings.difficulty].goldMult * 100)}% goud
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-950/80 p-1 border border-slate-800">
                {(['CHILL', 'NORMAL', 'CHAOS'] as DifficultyMode[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => update('difficulty', d)}
                    className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      settings.difficulty === d ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {DIFFICULTY_CONFIG[d].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">Spelsnelheid</span>
                <span className="text-slate-400 font-mono-num">{SPEED_CONFIG[settings.gameSpeed].mult}×</span>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-950/80 p-1 border border-slate-800">
                {(['SLOW', 'NORMAL', 'TURBO'] as SpeedMode[]).map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => update('gameSpeed', sp)}
                    className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      settings.gameSpeed === sp ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {SPEED_CONFIG[sp].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Golven-dichtheid & 5. Biome */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">Hordes &amp; Kratten</span>
                <span className="text-slate-400 font-mono-num">
                  {Math.round(DENSITY_CONFIG[settings.waveDensity].enemyMult * 100)}% vijanden
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-950/80 p-1 border border-slate-800">
                {(['STANDARD', 'BUSY', 'EXTREME'] as DensityMode[]).map((dn) => (
                  <button
                    key={dn}
                    type="button"
                    onClick={() => update('waveDensity', dn)}
                    className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      settings.waveDensity === dn ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {DENSITY_CONFIG[dn].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">Arena / Biome</span>
              </div>
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-950/80 p-1 border border-slate-800">
                {(
                  [
                    { id: 'AUTO', label: 'Auto' },
                    { id: 'COAST', label: 'Kust' },
                    { id: 'DESERT', label: 'Kloof' },
                    { id: 'REACTOR', label: 'Reactor' },
                  ] satisfies Array<{ id: BiomeChoice; label: string }>
                ).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => update('biomeChoice', b.id)}
                    className={`rounded-md px-1.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      settings.biomeChoice === b.id ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 6. Startwapen */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">Startwapen</span>
              <span className="text-amber-300">{WEAPON_LABELS[settings.startWeapon]}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 rounded-lg bg-slate-950/80 p-1 border border-slate-800">
              {(['RIFLE', 'DOUBLE', 'SPREAD', 'ROCKET', 'LASER'] as WeaponTier[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => update('startWeapon', w)}
                  className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    settings.startWeapon === w ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {WEAPON_LABELS[w].split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* 7. Start-Schild & 8. Start-Drones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">Start-Schild</span>
                <span className="font-mono-num text-cyan-300">{settings.startShield}×</span>
              </div>
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-950/80 p-1 border border-slate-800">
                {[0, 1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => update('startShield', n)}
                    className={`rounded-md py-1.5 text-xs font-mono-num font-bold transition-colors cursor-pointer ${
                      settings.startShield === n ? 'bg-cyan-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">Start-Drones</span>
                <span className="font-mono-num text-emerald-300">{settings.startDrones}×</span>
              </div>
              <div className="grid grid-cols-5 gap-1 rounded-lg bg-slate-950/80 p-1 border border-slate-800">
                {[0, 1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => update('startDrones', n)}
                    className={`rounded-md py-1.5 text-xs font-mono-num font-bold transition-colors cursor-pointer ${
                      settings.startDrones === n ? 'bg-emerald-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 9. Max. Soldaten & 10. Dynamische Limiet-elementen */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">Max. Soldaten</span>
                <span className="font-mono-num text-purple-300">{MAX_SQUAD_CONFIG[settings.maxSquadCap].shortLabel}</span>
              </div>
              <div className="grid grid-cols-5 gap-1 rounded-lg bg-slate-950/80 p-1 border border-slate-800">
                {(['150', '300', '550', '1500', 'UNLIMITED'] as MaxSquadMode[]).map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => update('maxSquadCap', cap)}
                    className={`rounded-md py-1.5 text-xs font-mono-num font-bold transition-colors whitespace-nowrap cursor-pointer ${
                      settings.maxSquadCap === cap ? 'bg-purple-500 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {MAX_SQUAD_CONFIG[cap].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">Paarse MAX-poortjes</span>
                <span className="text-slate-400">{settings.dynamicSquadCap ? 'Actief in run' : 'Uitgeschakeld'}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-950/80 p-1 border border-slate-800">
                <button
                  type="button"
                  onClick={() => update('dynamicSquadCap', true)}
                  className={`rounded-md py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    settings.dynamicSquadCap ? 'bg-purple-500 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Aan (Vast MAX)
                </button>
                <button
                  type="button"
                  onClick={() => update('dynamicSquadCap', false)}
                  className={`rounded-md py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    !settings.dynamicSquadCap ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Uit
                </button>
              </div>
            </div>
          </div>

          {/* 11. Mini-bazen & 12. Eindbazen sterkte */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">Mini-bazen</span>
                <span className="font-mono-num text-amber-300">
                  {BOSS_STRENGTH_CONFIG[settings.miniBossStrength].factorLabel} HP
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-950/80 p-1 border border-slate-800">
                {(['WEAK', 'NORMAL', 'STRONG', 'TITAN'] as BossStrengthMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update('miniBossStrength', mode)}
                    className={`rounded-md px-1.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      settings.miniBossStrength === mode
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {BOSS_STRENGTH_CONFIG[mode].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">Eindbazen</span>
                <span className="font-mono-num text-rose-300">
                  {BOSS_STRENGTH_CONFIG[settings.bossStrength].factorLabel} HP
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-950/80 p-1 border border-slate-800">
                {(['WEAK', 'NORMAL', 'STRONG', 'TITAN'] as BossStrengthMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update('bossStrength', mode)}
                    className={`rounded-md px-1.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      settings.bossStrength === mode
                        ? 'bg-rose-500 text-white'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {BOSS_STRENGTH_CONFIG[mode].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          </div>

          {canScrollUp && (
            <>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-slate-900/95 to-transparent" />
              <button
                type="button"
                onClick={() => scrollByAmount(-200)}
                aria-label="Scroll omhoog"
                className="absolute top-2 left-1/2 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-sky-400/50 bg-slate-900/95 text-sky-300 shadow-lg hover:bg-sky-500 hover:text-slate-950 transition-colors cursor-pointer animate-bounce"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            </>
          )}

          {canScrollDown && (
            <>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-slate-900/95 to-transparent" />
              <button
                type="button"
                onClick={() => scrollByAmount(200)}
                aria-label="Scroll omlaag"
                className="absolute bottom-2 left-1/2 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-sky-400/50 bg-slate-900/95 text-sky-300 shadow-lg hover:bg-sky-500 hover:text-slate-950 transition-colors cursor-pointer animate-bounce"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 px-5 py-3.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-sky-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer"
          >
            Toepassen &amp; Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}

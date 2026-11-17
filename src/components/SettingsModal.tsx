import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, X } from 'lucide-react';
import { WEAPON_LABELS } from '../game/engine';
import {
  ABSOLUTE_MAX_CAP,
  BOSS_MULT_MAX,
  BOSS_MULT_MIN,
  BOSS_MULT_STEP,
  DEFAULT_GAMEPLAY_SETTINGS,
  GAME_SPEED_MAX,
  GAME_SPEED_MIN,
  GAME_SPEED_STEP,
  STAGE_LENGTH_MAX,
  STAGE_LENGTH_MIN,
  STAGE_LENGTH_STEP,
  getPurpleGateRange,
  getStageLengthMetrics,
} from '../game/stages';
import { BiomeChoice, GameplaySettings, WeaponTier } from '../game/types';

interface SettingsModalProps {
  settings: GameplaySettings;
  currentStage?: number;
  onChange: (next: GameplaySettings) => void;
  onClose: () => void;
}

const PRESETS: Array<{ label: string; desc: string; values: GameplaySettings }> = [
  {
    label: 'Standaard Arcade',
    desc: '100% tempo · 1,0× stages · 130% HP · 115% vijanden',
    values: DEFAULT_GAMEPLAY_SETTINGS,
  },
  {
    label: 'Snelle Chaos',
    desc: '175% tempo · 175% HP · 2,6× Bazen',
    values: {
      stageLengthFactor: 0.2,
      gameSpeed: 1.75,
      enemyHpMult: 1.75,
      enemyCountMult: 1.7,
      enemyMaxGroupSize: 150,
      goldMult: 1.6,
      startWeapon: 'DOUBLE',
      startShield: 1,
      startDrones: 1,
      biomeChoice: 'AUTO',
      maxSquadCap: 1250,
      purpleGateFreq: 40,
      purpleDoubleChance: 65,
      purpleGateMin: 125,
      purpleGateMax: 750,
      miniBossMult: 2.0,
      bossMult: 2.6,
      specialSituations: 100,
    },
  },
  {
    label: 'Oppermacht Sandbox',
    desc: 'Plasmakanon · ∞ Soldaten · 5 Drones',
    values: {
      stageLengthFactor: 0.3,
      gameSpeed: 1.25,
      enemyHpMult: 0.9,
      enemyCountMult: 2.0,
      enemyMaxGroupSize: 180,
      goldMult: 2.0,
      startWeapon: 'LASER',
      startShield: 4,
      startDrones: 5,
      biomeChoice: 'AUTO',
      maxSquadCap: null,
      purpleGateFreq: 0,
      purpleDoubleChance: 50,
      purpleGateMin: 100,
      purpleGateMax: 500,
      miniBossMult: 1.2,
      bossMult: 1.2,
      specialSituations: 100,
    },
  },
];

interface SliderRowProps {
  id: string;
  label: string;
  valueText: string;
  value: number;
  min: number;
  max: number;
  step: number;
  accentClass?: string;
  valueColorClass?: string;
  disabled?: boolean;
  onChange: (val: number) => void;
}

function SliderRow({
  id,
  label,
  valueText,
  value,
  min,
  max,
  step,
  accentClass = 'accent-sky-400',
  valueColorClass = 'text-sky-300',
  disabled = false,
  onChange,
}: SliderRowProps) {
  return (
    <div className={`space-y-1 ${disabled ? 'opacity-45' : ''}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor={id} className="font-semibold text-slate-200">
          {label}
        </label>
        <span className={`font-mono-num font-semibold whitespace-nowrap ${valueColorClass}`}>{valueText}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`h-2 w-full rounded-lg bg-slate-800 cursor-pointer disabled:cursor-not-allowed ${accentClass}`}
      />
    </div>
  );
}

function fmtFactor(n: number): string {
  return n.toFixed(1).replace('.', ',');
}

export function SettingsModal({ settings, currentStage = 1, onChange, onClose }: SettingsModalProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [lastNumericCap, setLastNumericCap] = useState<number>(settings.maxSquadCap ?? 550);

  useEffect(() => {
    if (settings.maxSquadCap !== null) {
      setLastNumericCap(settings.maxSquadCap);
    }
  }, [settings.maxSquadCap]);

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

  const stageMetrics = getStageLengthMetrics(settings.stageLengthFactor, currentStage);
  const purpleDisabled = settings.purpleGateFreq <= 0;
  const stageStartRange = getPurpleGateRange(currentStage, 0.12, settings);
  const stageEndRange = getPurpleGateRange(currentStage, 0.92, settings);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-3 sm:p-5">
      <div className="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5 shrink-0">
          <div>
            <h2 className="font-display text-2xl font-extrabold text-white leading-none">Spelparameters</h2>
            <p className="text-xs text-slate-400 mt-1">Stel tempo, golven, paarse poortjes en baas-sterkte fijnmazig af</p>
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

            {/* 1. Tempo & Stage-lengte */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tempo &amp; Lengte</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SliderRow
                  id="slider-stage-length"
                  label="Stage-lengte"
                  valueText={`${fmtFactor(stageMetrics.factor)}× (${stageMetrics.units}u)`}
                  value={settings.stageLengthFactor}
                  min={STAGE_LENGTH_MIN}
                  max={STAGE_LENGTH_MAX}
                  step={STAGE_LENGTH_STEP}
                  onChange={(v) => update('stageLengthFactor', v)}
                />
                <SliderRow
                  id="slider-game-speed"
                  label="Spelsnelheid"
                  valueText={`${Math.round(settings.gameSpeed * 100)}%`}
                  value={settings.gameSpeed}
                  min={GAME_SPEED_MIN}
                  max={GAME_SPEED_MAX}
                  step={GAME_SPEED_STEP}
                  onChange={(v) => update('gameSpeed', v)}
                />
              </div>
            </div>

            {/* 2. Vijanden, Bazen & Beloning */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Vijanden, Bazen &amp; Beloning
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SliderRow
                  id="slider-enemy-hp"
                  label="Vijand-HP"
                  valueText={`${Math.round(settings.enemyHpMult * 100)}%`}
                  value={settings.enemyHpMult}
                  min={0.5}
                  max={2.5}
                  step={0.1}
                  accentClass="accent-amber-400"
                  valueColorClass="text-amber-300"
                  onChange={(v) => update('enemyHpMult', v)}
                />
                <SliderRow
                  id="slider-enemy-count"
                  label="Horde-dichtheid (schaal)"
                  valueText={`${Math.round(settings.enemyCountMult * 100)}%`}
                  value={settings.enemyCountMult}
                  min={0.5}
                  max={2.5}
                  step={0.1}
                  accentClass="accent-amber-400"
                  valueColorClass="text-amber-300"
                  onChange={(v) => update('enemyCountMult', v)}
                />
                <SliderRow
                  id="slider-enemy-max"
                  label="Max. Vijand-leger (per golf)"
                  valueText={`max ${settings.enemyMaxGroupSize}`}
                  value={settings.enemyMaxGroupSize}
                  min={15}
                  max={250}
                  step={5}
                  accentClass="accent-orange-400"
                  valueColorClass="text-orange-300"
                  onChange={(v) => update('enemyMaxGroupSize', Math.round(v))}
                />
                <SliderRow
                  id="slider-gold-mult"
                  label="Goud-bonus"
                  valueText={`${Math.round(settings.goldMult * 100)}%`}
                  value={settings.goldMult}
                  min={0.5}
                  max={3.0}
                  step={0.1}
                  accentClass="accent-yellow-400"
                  valueColorClass="text-yellow-300"
                  onChange={(v) => update('goldMult', v)}
                />
                <SliderRow
                  id="slider-miniboss"
                  label="Mini-bazen sterkte"
                  valueText={`${fmtFactor(settings.miniBossMult)}× HP`}
                  value={settings.miniBossMult}
                  min={0.4}
                  max={4.0}
                  step={0.2}
                  accentClass="accent-amber-500"
                  valueColorClass="text-amber-300"
                  onChange={(v) => update('miniBossMult', v)}
                />
                <SliderRow
                  id="slider-boss"
                  label="Eindbazen sterkte"
                  valueText={`${fmtFactor(settings.bossMult)}× HP`}
                  value={settings.bossMult}
                  min={BOSS_MULT_MIN}
                  max={BOSS_MULT_MAX}
                  step={BOSS_MULT_STEP}
                  accentClass="accent-rose-500"
                  valueColorClass="text-rose-300"
                  onChange={(v) => update('bossMult', v)}
                />
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Legers variëren per golf (verkenners tot zwermen) en groeien mee met je stage, afgelegde weg én je eigen squad — tot het ingestelde maximum.
              </p>
            </div>

            {/* 3. Paarse MAX-poortjes (Frequentie, Enkel vs Dubbel, Min/Max Hoogte) */}
            <div className="rounded-lg border border-purple-500/30 bg-purple-950/15 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-300">
                  Paarse MAX-poortjes
                </span>
                <span className="text-[11px] text-purple-200/75">
                  {purpleDisabled ? 'Uitgeschakeld' : 'Tweerichtings-limiet actief'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SliderRow
                  id="slider-purple-freq"
                  label="Frequentie"
                  valueText={purpleDisabled ? 'Uit (0%)' : `${settings.purpleGateFreq}%`}
                  value={settings.purpleGateFreq}
                  min={0}
                  max={100}
                  step={10}
                  accentClass="accent-purple-400"
                  valueColorClass="text-purple-300"
                  onChange={(v) => update('purpleGateFreq', Math.round(v))}
                />
                <SliderRow
                  id="slider-purple-double"
                  label="Dubbel naast elkaar vs. Enkel"
                  valueText={`${settings.purpleDoubleChance}% dubbel · ${100 - settings.purpleDoubleChance}% enkel`}
                  value={settings.purpleDoubleChance}
                  min={0}
                  max={100}
                  step={10}
                  accentClass="accent-purple-400"
                  valueColorClass="text-purple-300"
                  disabled={purpleDisabled}
                  onChange={(v) => update('purpleDoubleChance', Math.round(v))}
                />
                <SliderRow
                  id="slider-purple-min"
                  label="Minimum hoogte (basis)"
                  valueText={`MAX ${settings.purpleGateMin}`}
                  value={settings.purpleGateMin}
                  min={50}
                  max={1000}
                  step={25}
                  accentClass="accent-purple-400"
                  valueColorClass="text-purple-300"
                  disabled={purpleDisabled}
                  onChange={(v) => {
                    const nextMin = Math.round(v);
                    onChange({
                      ...settings,
                      purpleGateMin: nextMin,
                      purpleGateMax: Math.max(nextMin, settings.purpleGateMax),
                    });
                  }}
                />
                <SliderRow
                  id="slider-purple-max"
                  label="Maximum hoogte (Stage 8 ref.)"
                  valueText={`MAX ${settings.purpleGateMax}`}
                  value={Math.min(ABSOLUTE_MAX_CAP, settings.purpleGateMax)}
                  min={100}
                  max={ABSOLUTE_MAX_CAP}
                  step={50}
                  accentClass="accent-purple-400"
                  valueColorClass="text-purple-300"
                  disabled={purpleDisabled}
                  onChange={(v) => {
                    const nextMax = Math.round(v);
                    onChange({
                      ...settings,
                      purpleGateMax: nextMax,
                      purpleGateMin: Math.min(nextMax, settings.purpleGateMin),
                    });
                  }}
                />
              </div>

              {!purpleDisabled && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-purple-500/20 bg-slate-950/60 px-2.5 py-1.5 text-[11px] text-purple-200/80">
                  <span>Schaalt mee met stage &amp; voortgang</span>
                  <span className="font-mono-num text-purple-300">
                    Stage {currentStage}: {stageStartRange.min}–{stageStartRange.max} → {stageEndRange.min}–{stageEndRange.max}
                  </span>
                </div>
              )}
            </div>

            {/* 3b. Innovatieve situaties */}
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/15 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                  Innovatieve situaties
                </span>
                <span className="text-[11px] text-emerald-200/75">
                  {settings.specialSituations <= 0 ? 'Uitgeschakeld' : `${settings.specialSituations}% frequentie`}
                </span>
              </div>
              <SliderRow
                id="slider-special-situations"
                label="Frequentie van veld-pickups, nieuwe vijanden, poorten & laser-scans"
                valueText={settings.specialSituations <= 0 ? 'Uit (0%)' : `${settings.specialSituations}%`}
                value={settings.specialSituations}
                min={0}
                max={100}
                step={10}
                accentClass="accent-emerald-400"
                valueColorClass="text-emerald-300"
                onChange={(v) => update('specialSituations', Math.round(v))}
              />
              <p className="text-[11px] text-slate-400 leading-snug">
                Op 0% speelt alles zoals v1.0. Hoger = meer MAGNEET/FRENZY/NUKE-pickups,
                JUMPER/MEDIC/MORTAR/SCHILD/BERSERKER-eenheden, nieuwe MAX-poorten (FREEZE, MULTISHOT, PIERCE, HEAL,
                TIMEWARP, FORTIFY, BLITZ, VAMP) en vijandelijke doelwitlaser-scans.
              </p>
            </div>

            {/* 4. Leger-limiet & Start-uitrusting */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Leger-limiet &amp; Start-uitrusting
                </span>
                <button
                  type="button"
                  onClick={() =>
                    update('maxSquadCap', settings.maxSquadCap === null ? lastNumericCap : null)
                  }
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    settings.maxSquadCap === null
                      ? 'bg-purple-500 text-white'
                      : 'border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  ∞ Onbeperkt {settings.maxSquadCap === null ? 'Aan' : 'Uit'}
                </button>
              </div>

              <SliderRow
                id="slider-max-squad"
                label="Max. Soldaten"
                valueText={settings.maxSquadCap === null ? '∞ Onbeperkt' : `${settings.maxSquadCap} soldaten`}
                value={Math.min(ABSOLUTE_MAX_CAP, settings.maxSquadCap ?? lastNumericCap)}
                min={50}
                max={ABSOLUTE_MAX_CAP}
                step={50}
                accentClass="accent-purple-400"
                valueColorClass="text-purple-300"
                onChange={(v) => {
                  const cap = Math.round(v);
                  setLastNumericCap(cap);
                  update('maxSquadCap', cap);
                }}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <SliderRow
                  id="slider-start-shield"
                  label="Start-Schild"
                  valueText={`${settings.startShield}×`}
                  value={settings.startShield}
                  min={0}
                  max={5}
                  step={1}
                  accentClass="accent-cyan-400"
                  valueColorClass="text-cyan-300"
                  onChange={(v) => update('startShield', Math.round(v))}
                />
                <SliderRow
                  id="slider-start-drones"
                  label="Start-Drones"
                  valueText={`${settings.startDrones}×`}
                  value={settings.startDrones}
                  min={0}
                  max={6}
                  step={1}
                  accentClass="accent-emerald-400"
                  valueColorClass="text-emerald-300"
                  onChange={(v) => update('startDrones', Math.round(v))}
                />
              </div>
            </div>

            {/* 5. Startwapen */}
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

            {/* 6. Arena / Biome */}
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

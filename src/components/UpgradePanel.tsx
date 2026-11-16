import { useState } from 'react';
import { ChevronDown, ChevronUp, Coins, Crosshair, Flame, Sparkles, Users } from 'lucide-react';
import {
  getFireRateMultiplier,
  getFirepowerMultiplier,
  getGoldMultiplier,
  getStartSquadCount,
  getUpgradeCost,
  getUpgradeWeightPercents,
} from '../game/stages';
import { UpgradeLevels } from '../game/types';

interface UpgradePanelProps {
  gold: number;
  upgrades: UpgradeLevels;
  weights: UpgradeLevels;
  onUpgrade: (key: keyof UpgradeLevels) => void;
  onSplitGold: () => void;
  onWeightChange: (key: keyof UpgradeLevels, value: number) => void;
  onResetWeights: () => void;
}

const ITEMS: Array<{
  key: keyof UpgradeLevels;
  title: string;
  icon: typeof Users;
  accentClass: string;
  valueColorClass: string;
}> = [
  {
    key: 'startSquad',
    title: 'Start-Squad',
    icon: Users,
    accentClass: 'accent-sky-400',
    valueColorClass: 'text-sky-300',
  },
  {
    key: 'firepower',
    title: 'Vuurkracht',
    icon: Flame,
    accentClass: 'accent-orange-400',
    valueColorClass: 'text-orange-300',
  },
  {
    key: 'fireRate',
    title: 'Vuursnelheid',
    icon: Crosshair,
    accentClass: 'accent-rose-400',
    valueColorClass: 'text-rose-300',
  },
  {
    key: 'goldBonus',
    title: 'Goudbonus',
    icon: Coins,
    accentClass: 'accent-amber-400',
    valueColorClass: 'text-amber-300',
  },
];

export function UpgradePanel({
  gold,
  upgrades,
  weights,
  onUpgrade,
  onSplitGold,
  onWeightChange,
  onResetWeights,
}: UpgradePanelProps) {
  const [showKey, setShowKey] = useState(false);
  const percents = getUpgradeWeightPercents(weights);
  const keyLabel = ITEMS.map(({ key }) => Math.round(percents[key])).join('/');
  const canSplit = ITEMS.some(({ key }) => getUpgradeCost(key, upgrades[key]) <= gold);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-medium text-slate-300">Directe Upgrades</span>
        <span className="font-mono-num text-amber-400 font-semibold">{gold} Goud beschikbaar</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ITEMS.map(({ key, title, icon: Icon }) => {
          const level = upgrades[key];
          const cost = getUpgradeCost(key, level);
          const affordable = gold >= cost;
          const nextUpgrades: UpgradeLevels = { ...upgrades, [key]: level + 1 };

          const currentValue =
            key === 'startSquad'
              ? getStartSquadCount(upgrades)
              : key === 'firepower'
              ? getFirepowerMultiplier(upgrades) * 100
              : key === 'fireRate'
              ? getFireRateMultiplier(upgrades) * 100
              : getGoldMultiplier(upgrades) * 100;

          const nextValue =
            key === 'startSquad'
              ? getStartSquadCount(nextUpgrades)
              : key === 'firepower'
              ? getFirepowerMultiplier(nextUpgrades) * 100
              : key === 'fireRate'
              ? getFireRateMultiplier(nextUpgrades) * 100
              : getGoldMultiplier(nextUpgrades) * 100;

          const stat =
            key === 'startSquad'
              ? `${Math.round(currentValue)} → ${Math.round(nextValue)} soldaten`
              : `${Math.round(currentValue)}% → ${Math.round(nextValue)}%`;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onUpgrade(key)}
              disabled={!affordable}
              title={affordable ? `${title}: ${stat} voor ${cost} goud` : `Nog ${cost - gold} goud nodig`}
              aria-label={`${title} upgraden naar niveau ${level + 1} voor ${cost} goud`}
              className={`flex items-center justify-between gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                affordable
                  ? 'border-slate-700 bg-slate-800/90 hover:border-sky-500/60 hover:bg-slate-800 cursor-pointer'
                  : 'border-slate-800 bg-slate-900/60 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-900 text-sky-400 border border-slate-700/80">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-100 truncate">
                    {title} <span className="font-mono-num text-slate-400">Niv.{level}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono-num truncate">{stat}</div>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-mono-num font-bold whitespace-nowrap ${
                  affordable ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {cost}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSplitGold}
            disabled={!canSplit}
            title={
              canSplit
                ? `Besteedt ${gold} goud volgens de sleutel (${keyLabel})`
                : 'Niet genoeg goud voor een upgrade'
            }
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-bold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
              canSplit
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Verdeel goud</span>
          </button>
          <button
            type="button"
            onClick={() => setShowKey((open) => !open)}
            aria-expanded={showKey}
            title="Verdeelsleutel aanpassen"
            className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-[11px] font-semibold text-slate-300 hover:border-sky-500/60 hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <span className="font-mono-num text-slate-400">{keyLabel}</span>
            {showKey ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {showKey && (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
              {ITEMS.map(({ key, title, accentClass, valueColorClass }) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <label htmlFor={`upgrade-weight-${key}`} className="font-semibold text-slate-300 truncate">
                      {title}
                    </label>
                    <span className={`font-mono-num font-semibold whitespace-nowrap ${valueColorClass}`}>
                      {weights[key]}
                    </span>
                  </div>
                  <input
                    id={`upgrade-weight-${key}`}
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={weights[key]}
                    onChange={(e) => onWeightChange(key, parseFloat(e.target.value))}
                    className={`h-1.5 w-full rounded-lg bg-slate-800 cursor-pointer ${accentClass}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>Relatieve gewichten · verdeling {keyLabel}</span>
              <button
                type="button"
                onClick={onResetWeights}
                className="font-semibold text-sky-400 hover:text-sky-300 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                Gelijk
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
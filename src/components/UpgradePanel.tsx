import { Coins, Crosshair, Flame, Users } from 'lucide-react';
import {
  getFireRateMultiplier,
  getFirepowerMultiplier,
  getGoldMultiplier,
  getStartSquadCount,
  getUpgradeCost,
} from '../game/stages';
import { UpgradeLevels } from '../game/types';

interface UpgradePanelProps {
  gold: number;
  upgrades: UpgradeLevels;
  onUpgrade: (key: keyof UpgradeLevels) => void;
}

export function UpgradePanel({ gold, upgrades, onUpgrade }: UpgradePanelProps) {
  const items: Array<{
    key: keyof UpgradeLevels;
    title: string;
    stat: string;
    icon: typeof Users;
  }> = [
    {
      key: 'startSquad',
      title: 'Start-Squad',
      stat: `${getStartSquadCount(upgrades)} soldaten (+2)`,
      icon: Users,
    },
    {
      key: 'firepower',
      title: 'Vuurkracht',
      stat: `${Math.round(getFirepowerMultiplier(upgrades) * 100)}% (+18%)`,
      icon: Flame,
    },
    {
      key: 'fireRate',
      title: 'Vuursnelheid',
      stat: `${Math.round(getFireRateMultiplier(upgrades) * 100)}% (+12%)`,
      icon: Crosshair,
    },
    {
      key: 'goldBonus',
      title: 'Goudbonus',
      stat: `${Math.round(getGoldMultiplier(upgrades) * 100)}% (+20%)`,
      icon: Coins,
    },
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-medium text-slate-300">Directe Upgrades</span>
        <span className="font-mono-num text-amber-400 font-semibold">{gold} Goud beschikbaar</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map(({ key, title, stat, icon: Icon }) => {
          const level = upgrades[key];
          const cost = getUpgradeCost(key, level);
          const affordable = gold >= cost;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onUpgrade(key)}
              disabled={!affordable}
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
                    {title} <span className="font-mono-num text-slate-400">Niv.{level + 1}</span>
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
    </div>
  );
}

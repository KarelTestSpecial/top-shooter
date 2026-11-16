import { useState } from 'react';
import {
  AlertTriangle,
  Coins,
  Database,
  Flag,
  FolderOpen,
  Save,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { PersistentProgress, SaveSlot, SaveSlots } from '../game/types';

interface SaveSlotsModalProps {
  progress: PersistentProgress;
  slots: SaveSlots;
  onSave: (index: number) => void;
  onLoad: (index: number) => void;
  onDelete: (index: number) => void;
  onCleanSlate: () => void;
  onClose: () => void;
}

type PendingAction = { kind: 'save' | 'load' | 'delete' | 'clean'; index?: number } | null;

const SLOT_LABELS = ['Slot 1', 'Slot 2', 'Slot 3'];

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString('nl-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function Stat({ icon: Icon, label, value }: { icon: typeof Coins; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 whitespace-nowrap">
      <Icon className="h-3 w-3 text-sky-400" />
      <span>{label}</span>
      <span className="font-mono-num font-semibold text-slate-200">{value}</span>
    </div>
  );
}

export function SaveSlotsModal({
  progress,
  slots,
  onSave,
  onLoad,
  onDelete,
  onCleanSlate,
  onClose,
}: SaveSlotsModalProps) {
  const [pending, setPending] = useState<PendingAction>(null);

  const requestSave = (index: number) => {
    if (slots[index]) {
      setPending({ kind: 'save', index });
    } else {
      onSave(index);
    }
  };

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === 'save' && pending.index !== undefined) onSave(pending.index);
    else if (pending.kind === 'load' && pending.index !== undefined) onLoad(pending.index);
    else if (pending.kind === 'delete' && pending.index !== undefined) onDelete(pending.index);
    else if (pending.kind === 'clean') onCleanSlate();
    setPending(null);
  };

  const pendingLabel = (() => {
    if (!pending) return '';
    if (pending.kind === 'save') return `${SLOT_LABELS[pending.index ?? 0]} overschrijven met je huidige status?`;
    if (pending.kind === 'load') return `${SLOT_LABELS[pending.index ?? 0]} laden? Je huidige status wordt vervangen.`;
    if (pending.kind === 'delete') return `${SLOT_LABELS[pending.index ?? 0]} wissen?`;
    return 'Clean slate: al je goud, upgrades en records wissen? De 3 opslag-slots blijven bewaard.';
  })();

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg max-h-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-sky-400">3 Slots · Clean Slate</p>
            <h2 className="font-display text-2xl font-extrabold text-white leading-tight">Spelersstatus &amp; Opslag</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Opslag sluiten"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Huidige status */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Database className="h-3.5 w-3.5 text-sky-400" />
            <span>Huidige status</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Stat icon={Coins} label="Goud" value={`${progress.gold}`} />
            <Stat icon={Trophy} label="Record" value={`${progress.bestSquad} soldaten`} />
            <Stat icon={Flag} label="Hoogste stage" value={`${progress.highestStage}`} />
            <Stat icon={Users} label="Totaal kills" value={`${progress.totalKills}`} />
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5 text-[10px] text-slate-400">
            <span className="rounded bg-slate-800/80 px-1.5 py-0.5">
              Start-Squad <span className="font-mono-num text-slate-200">Niv.{progress.upgrades.startSquad}</span>
            </span>
            <span className="rounded bg-slate-800/80 px-1.5 py-0.5">
              Vuurkracht <span className="font-mono-num text-slate-200">Niv.{progress.upgrades.firepower}</span>
            </span>
            <span className="rounded bg-slate-800/80 px-1.5 py-0.5">
              Vuursnelheid <span className="font-mono-num text-slate-200">Niv.{progress.upgrades.fireRate}</span>
            </span>
            <span className="rounded bg-slate-800/80 px-1.5 py-0.5">
              Goudbonus <span className="font-mono-num text-slate-200">Niv.{progress.upgrades.goldBonus}</span>
            </span>
          </div>
        </div>

        {/* Slots */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {slots.map((slot: SaveSlot | null, index: number) => (
            <div
              key={index}
              className={`flex flex-col gap-2 rounded-lg border p-2.5 ${
                slot ? 'border-slate-700 bg-slate-800/60' : 'border-dashed border-slate-700 bg-slate-950/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">{SLOT_LABELS[index]}</span>
                {slot && <span className="text-[10px] text-slate-500">{formatDate(slot.savedAt)}</span>}
              </div>

              {slot ? (
                <div className="space-y-1 text-[11px] text-slate-400">
                  <div className="flex items-center justify-between">
                    <span>Goud</span>
                    <span className="font-mono-num font-semibold text-amber-400">{slot.progress.gold}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Record</span>
                    <span className="font-mono-num font-semibold text-sky-400">{slot.progress.bestSquad}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Stage</span>
                    <span className="font-mono-num font-semibold text-slate-200">{slot.progress.highestStage}</span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 py-2">Leeg — nog geen status opgeslagen.</p>
              )}

              <div className="mt-auto flex flex-col gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => requestSave(index)}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-sky-500 px-2 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer"
                >
                  <Save className="h-3 w-3" />
                  <span>{slot ? 'Overschrijven' : 'Huidige status opslaan'}</span>
                </button>
                {slot && (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPending({ kind: 'load', index })}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      <FolderOpen className="h-3 w-3" />
                      <span>Laden</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPending({ kind: 'delete', index })}
                      aria-label={`${SLOT_LABELS[index]} wissen`}
                      className="flex items-center justify-center rounded-md border border-red-900/70 bg-red-950/50 px-2 py-1.5 text-red-300 hover:bg-red-900/70 hover:text-white transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Clean slate */}
        <div className="rounded-lg border border-red-900/50 bg-red-950/25 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-red-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Clean slate</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Begin opnieuw vanaf nul: goud, upgrades, record en hoogste stage worden gewist. Je 3 opslag-slots
            blijven bewaard.
          </p>
          <button
            type="button"
            onClick={() => setPending({ kind: 'clean' })}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-red-900/70 bg-red-950/60 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-900/80 hover:text-white transition-colors cursor-pointer"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Start met een clean slate</span>
          </button>
        </div>

      </div>

      {/* Bevestiging */}
      {pending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-2xl space-y-3">
            <h3 className="text-sm font-bold text-white">{pendingLabel}</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="flex flex-1 items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={confirm}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
                  pending.kind === 'clean' || pending.kind === 'delete'
                    ? 'bg-red-500 text-white hover:bg-red-400'
                    : 'bg-sky-500 text-slate-950 hover:bg-sky-400'
                }`}
              >
                {pending.kind === 'clean'
                  ? 'Ja, clean slate'
                  : pending.kind === 'delete'
                  ? 'Ja, wissen'
                  : pending.kind === 'load'
                  ? 'Ja, laden'
                  : 'Ja, overschrijven'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
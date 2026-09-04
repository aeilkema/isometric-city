'use client';

import React, { useState } from 'react';
import { Bot, ChevronDown, ChevronUp, Play, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAutoMode } from '@/games/isocity/ai/useAutoMode';
import { AutopilotStrategy } from '@/games/isocity/ai/types';

const STRATEGIES: { value: AutopilotStrategy; label: string }[] = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'conservative', label: 'Conservative' },
  { value: 'growth', label: 'Growth' },
  { value: 'transit-first', label: 'Transit First' },
  { value: 'green-city', label: 'Green City' },
  { value: 'dutch-urbanism', label: 'Dutch Urbanism' },
];

export function AutoModeControl({ compact = false }: { compact?: boolean }) {
  const autoMode = useAutoMode();
  const [expanded, setExpanded] = useState(false);
  const topAction = autoMode.plan?.actions[0] ?? null;

  if (compact) {
    return (
      <div className="absolute left-2 bottom-2 z-30 rounded-lg border border-border bg-background/95 shadow-xl backdrop-blur px-2 py-1.5 flex items-center gap-2">
        <Bot className="w-4 h-4" />
        <span className="text-xs font-medium">Auto</span>
        <Switch checked={autoMode.enabled} onCheckedChange={autoMode.setEnabled} />
      </div>
    );
  }

  return (
    <div className="absolute left-4 bottom-4 z-30 w-[330px] rounded-xl border border-border bg-background/95 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Bot className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold flex items-center gap-1.5">
            AutoMode
            {autoMode.enabled && <Sparkles className="w-3.5 h-3.5 text-primary" />}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {autoMode.enabled ? 'Bouwt rustig en volgens echte spelregels' : 'Zelfstandig stadsbestuur staat uit'}
          </div>
        </div>
        <Switch checked={autoMode.enabled} onCheckedChange={autoMode.setEnabled} />
        <button
          className="p-1 rounded hover:bg-muted"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? 'Collapse AutoMode' : 'Expand AutoMode'}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border px-3 py-3 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Strategy</div>
            <select
              value={autoMode.strategy}
              onChange={(event) => autoMode.setStrategy(event.target.value as AutopilotStrategy)}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {STRATEGIES.map((strategy) => (
                <option key={strategy.value} value={strategy.value}>{strategy.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-muted/50 p-2">
              <div className="text-muted-foreground">City health</div>
              <div className="text-lg font-semibold">{autoMode.plan?.healthScore ?? '—'}%</div>
            </div>
            <div className="rounded-md bg-muted/50 p-2">
              <div className="text-muted-foreground">Cash reserve target</div>
              <div className="text-sm font-semibold mt-1">
                ${Math.round(autoMode.plan?.reserveTarget ?? 0).toLocaleString()}
              </div>
            </div>
          </div>

          {topAction && (
            <div className="rounded-md border border-border p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Next priority</div>
              <div className="text-sm font-medium mt-1">{topAction.kind.replaceAll('-', ' ')}</div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{topAction.reason}</p>
            </div>
          )}

          {autoMode.plan && autoMode.plan.diagnostics.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Diagnostics</div>
              <div className="text-xs text-muted-foreground space-y-1">
                {autoMode.plan.diagnostics.slice(0, 3).map((diagnostic) => (
                  <div key={diagnostic}>• {diagnostic}</div>
                ))}
              </div>
            </div>
          )}

          <Button variant="outline" size="sm" className="w-full" onClick={autoMode.runNow}>
            <Play className="w-3.5 h-3.5 mr-1.5" />
            Run planning cycle now
          </Button>
        </div>
      )}
    </div>
  );
}

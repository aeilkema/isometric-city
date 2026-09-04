'use client';

import React, { useMemo, useState } from 'react';
import {
  Bike,
  Bot,
  Building2,
  Factory,
  Leaf,
  Loader2,
  MapPinned,
  Network,
  Sparkles,
  TrainFront,
  X,
} from 'lucide-react';
import { useGame } from '@/context/GameContext';
import { Tool, TOOL_INFO } from '@/types/game';
import { NEXT_GENERATION_BUILD_CATALOG } from '@/games/isocity/data/nextGenerationBuildCatalog';

export type SelectedTile = { x: number; y: number } | null;

type BlueprintStep = { dx: number; dy: number; tool: Tool };

type Blueprint = {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  steps: BlueprintStep[];
};

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function crossRoad(radius: number): BlueprintStep[] {
  const steps: BlueprintStep[] = [];
  for (let d = -radius; d <= radius; d += 1) {
    steps.push({ dx: d, dy: 0, tool: 'road' });
    if (d !== 0) steps.push({ dx: 0, dy: d, tool: 'road' });
  }
  return steps;
}

function ringRoad(radius: number): BlueprintStep[] {
  const steps: BlueprintStep[] = [];
  for (let d = -radius; d <= radius; d += 1) {
    steps.push({ dx: d, dy: -radius, tool: 'road' });
    steps.push({ dx: d, dy: radius, tool: 'road' });
    if (d > -radius && d < radius) {
      steps.push({ dx: -radius, dy: d, tool: 'road' });
      steps.push({ dx: radius, dy: d, tool: 'road' });
    }
  }
  return steps;
}

function zoneBlock(tool: Tool, radius: number, skip: Set<string> = new Set()): BlueprintStep[] {
  const steps: BlueprintStep[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 || dy === 0) continue;
      if (skip.has(`${dx},${dy}`)) continue;
      steps.push({ dx, dy, tool });
    }
  }
  return steps;
}

const WALKABLE_STEPS: BlueprintStep[] = [
  ...ringRoad(3),
  ...crossRoad(3),
  ...zoneBlock('zone_residential', 2, new Set(['-1,-1', '1,-1', '-1,1', '1,1'])),
  { dx: -1, dy: -1, tool: 'zone_commercial' },
  { dx: 1, dy: -1, tool: 'zone_commercial' },
  { dx: -1, dy: 1, tool: 'park' },
  { dx: 1, dy: 1, tool: 'park' },
  { dx: -2, dy: -2, tool: 'school' },
];

const GREEN_STEPS: BlueprintStep[] = [
  ...ringRoad(3),
  ...crossRoad(3),
  ...zoneBlock('zone_residential', 2, new Set(['-2,-2', '2,-2', '-2,2', '2,2', '-1,1', '1,-1'])),
  { dx: -2, dy: -2, tool: 'park' },
  { dx: 2, dy: -2, tool: 'community_garden' },
  { dx: -2, dy: 2, tool: 'pond_park' },
  { dx: 2, dy: 2, tool: 'greenhouse_garden' },
  { dx: -1, dy: 1, tool: 'tree' },
  { dx: 1, dy: -1, tool: 'tree' },
  { dx: 1, dy: 1, tool: 'tree' },
];

const TRANSIT_STEPS: BlueprintStep[] = [
  ...ringRoad(4),
  ...Array.from({ length: 9 }, (_, i) => ({ dx: i - 4, dy: 0, tool: 'rail' as Tool })),
  { dx: -1, dy: -1, tool: 'rail_station' },
  { dx: 1, dy: 1, tool: 'subway_station' },
  ...zoneBlock('zone_commercial', 2, new Set(['-1,-1', '1,1'])),
  ...[
    { dx: -3, dy: -2 }, { dx: -3, dy: 2 }, { dx: 3, dy: -2 }, { dx: 3, dy: 2 },
  ].map(({ dx, dy }) => ({ dx, dy, tool: 'zone_residential' as Tool })),
  { dx: 0, dy: -2, tool: 'park' },
];

const LOGISTICS_STEPS: BlueprintStep[] = [
  ...ringRoad(4),
  ...crossRoad(4),
  ...Array.from({ length: 9 }, (_, i) => ({ dx: i - 4, dy: 2, tool: 'rail' as Tool })),
  ...zoneBlock('zone_industrial', 3, new Set(['-2,-2', '2,-2', '-2,2', '2,2'])),
  { dx: -2, dy: -2, tool: 'fire_station' },
  { dx: 2, dy: -2, tool: 'water_tower' },
  { dx: -2, dy: 2, tool: 'rail_station' },
  { dx: 2, dy: 2, tool: 'power_plant' },
];

const BLUEPRINTS: Blueprint[] = [
  {
    id: 'walkable',
    name: 'Walkable neighbourhood',
    description: 'Compact 7×7 neighbourhood with a connected street grid, housing, local shops, parks and a school.',
    icon: Bike,
    accent: 'from-emerald-500/20 to-cyan-500/10',
    steps: WALKABLE_STEPS,
  },
  {
    id: 'green',
    name: 'Green neighbourhood',
    description: 'Residential district with a road ring, trees, community growing space, pond park and greenhouse.',
    icon: Leaf,
    accent: 'from-lime-500/20 to-emerald-500/10',
    steps: GREEN_STEPS,
  },
  {
    id: 'transit',
    name: 'Transit-oriented centre',
    description: 'Rail spine, station, subway access, dense commercial zoning and housing around a compact centre.',
    icon: TrainFront,
    accent: 'from-sky-500/20 to-indigo-500/10',
    steps: TRANSIT_STEPS,
  },
  {
    id: 'logistics',
    name: 'Industrial logistics park',
    description: 'Structured industrial district with ring road, rail access, utilities and fire protection.',
    icon: Factory,
    accent: 'from-amber-500/20 to-orange-500/10',
    steps: LOGISTICS_STEPS,
  },
];

function estimateBlueprintCost(steps: BlueprintStep[]): number {
  return steps.reduce((sum, step) => sum + (TOOL_INFO[step.tool]?.cost ?? 0), 0);
}

const CATEGORY_LABELS: Record<string, string> = {
  roads: 'Streets',
  transit: 'Transit',
  residential: 'Housing',
  commercial: 'Commerce',
  industry: 'Industry',
  services: 'Services',
  utilities: 'Utilities',
  recreation: 'Recreation',
  environment: 'Environment',
};

export function NextGenerationHub({ selectedTile, compact = false }: { selectedTile: SelectedTile; compact?: boolean }) {
  const { state, setTool, placeAtTile, addNotification } = useGame();
  const [open, setOpen] = useState(!compact);
  const [tab, setTab] = useState<'districts' | 'catalog'>('districts');
  const [building, setBuilding] = useState<string | null>(null);
  const [catalogCategory, setCatalogCategory] = useState('roads');

  const catalogItems = useMemo(
    () => NEXT_GENERATION_BUILD_CATALOG.filter((item) => item.category === catalogCategory),
    [catalogCategory],
  );

  async function buildBlueprint(blueprint: Blueprint) {
    if (!selectedTile || building) return;
    setBuilding(blueprint.id);

    let attempted = 0;
    try {
      for (const step of blueprint.steps) {
        const x = selectedTile.x + step.dx;
        const y = selectedTile.y + step.dy;
        if (x < 0 || y < 0 || x >= state.gridSize || y >= state.gridSize) continue;

        setTool(step.tool);
        await sleep(55);
        placeAtTile(x, y);
        attempted += 1;
        await sleep(35);
      }

      setTool('select');
      addNotification(
        'Next district planned',
        `${blueprint.name}: ${attempted} placement actions were sent through the normal IsoCity build rules.`,
        'sparkles',
      );
    } finally {
      setTool('select');
      setBuilding(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`absolute z-30 ${compact ? 'right-2 bottom-2' : 'right-4 top-4'} rounded-xl border border-cyan-400/30 bg-slate-950/90 px-3 py-2 text-white shadow-2xl backdrop-blur flex items-center gap-2`}
      >
        <Sparkles className="w-4 h-4 text-cyan-300" />
        <span className="text-xs font-semibold tracking-wide">IsoCity NEXT</span>
      </button>
    );
  }

  if (compact) {
    return (
      <div className="absolute right-2 top-2 z-30 rounded-xl border border-cyan-400/30 bg-slate-950/95 text-white shadow-2xl backdrop-blur p-3 w-[280px]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-300" />
          <div className="font-semibold text-sm">IsoCity NEXT</div>
          <button className="ml-auto p-1" onClick={() => setOpen(false)}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-400 mt-2">Desktop bevat de volledige Next Generation district planner.</p>
      </div>
    );
  }

  return (
    <div className="absolute right-4 top-4 z-30 w-[390px] max-h-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-cyan-400/25 bg-slate-950/94 text-slate-100 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      <div className="bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-violet-500/15 border-b border-white/10 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-400/10 border border-cyan-300/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-cyan-300" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold tracking-tight">IsoCity NEXT</h2>
              <span className="text-[9px] uppercase tracking-[0.18em] px-1.5 py-0.5 rounded border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">0.2 playable</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400 mt-0.5">District planning, city AI and the expanded real-world build catalog.</p>
          </div>
          <button className="p-1.5 rounded-lg hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close IsoCity NEXT">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="rounded-lg bg-white/[0.045] border border-white/[0.06] px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Population</div>
            <div className="text-sm font-semibold">{state.stats.population.toLocaleString()}</div>
          </div>
          <div className="rounded-lg bg-white/[0.045] border border-white/[0.06] px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Treasury</div>
            <div className="text-sm font-semibold">${Math.round(state.stats.money).toLocaleString()}</div>
          </div>
          <div className="rounded-lg bg-white/[0.045] border border-white/[0.06] px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Target tile</div>
            <div className="text-sm font-semibold">{selectedTile ? `${selectedTile.x}, ${selectedTile.y}` : 'Select one'}</div>
          </div>
        </div>
      </div>

      <div className="flex border-b border-white/10 px-3 pt-2">
        <button
          onClick={() => setTab('districts')}
          className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 ${tab === 'districts' ? 'border-cyan-300 text-cyan-200' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          <MapPinned className="w-3.5 h-3.5 inline mr-1.5" />Districts
        </button>
        <button
          onClick={() => setTab('catalog')}
          className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 ${tab === 'catalog' ? 'border-cyan-300 text-cyan-200' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          <Building2 className="w-3.5 h-3.5 inline mr-1.5" />Build catalog
        </button>
      </div>

      <div className="overflow-y-auto max-h-[540px] p-3">
        {tab === 'districts' ? (
          <>
            <div className={`mb-3 rounded-xl border px-3 py-2.5 ${selectedTile ? 'border-emerald-400/20 bg-emerald-400/5' : 'border-amber-400/20 bg-amber-400/5'}`}>
              <div className="flex items-center gap-2 text-xs font-medium">
                <Network className="w-3.5 h-3.5" />
                {selectedTile ? `Building around tile ${selectedTile.x}, ${selectedTile.y}` : 'First use Select and click a centre tile'}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Blueprints use normal placement, budget and terrain rules. Existing saves remain compatible.</p>
            </div>

            <div className="space-y-2">
              {BLUEPRINTS.map((blueprint) => {
                const Icon = blueprint.icon;
                const cost = estimateBlueprintCost(blueprint.steps);
                const active = building === blueprint.id;
                return (
                  <div key={blueprint.id} className={`rounded-xl border border-white/10 bg-gradient-to-br ${blueprint.accent} p-3`}>
                    <div className="flex gap-3">
                      <div className="w-9 h-9 shrink-0 rounded-lg bg-black/20 border border-white/10 flex items-center justify-center"><Icon className="w-4 h-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold">{blueprint.name}</h3>
                          <span className="text-[10px] text-slate-400">≈ ${cost.toLocaleString()}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed mt-1">{blueprint.description}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-slate-500">{blueprint.steps.length} build actions</span>
                          <button
                            disabled={!selectedTile || !!building}
                            onClick={() => buildBlueprint(blueprint)}
                            className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 hover:bg-cyan-300/15 disabled:opacity-35 disabled:cursor-not-allowed px-2.5 py-1.5 text-[11px] font-medium text-cyan-100 flex items-center gap-1.5"
                          >
                            {active ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            {active ? 'Planning…' : 'Build district'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 rounded-xl border border-violet-400/15 bg-violet-400/5 p-3 flex gap-2.5">
              <Bot className="w-4 h-4 text-violet-300 mt-0.5" />
              <div>
                <div className="text-xs font-medium">AutoMode works alongside blueprints</div>
                <p className="text-[10px] text-slate-500 mt-1">Use a blueprint for urban structure, then let AutoMode respond to demand, services and finances.</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-1.5 overflow-x-auto pb-2">
              {Object.keys(CATEGORY_LABELS).map((category) => (
                <button
                  key={category}
                  onClick={() => setCatalogCategory(category)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] border ${catalogCategory === category ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100' : 'border-white/10 text-slate-500 hover:text-slate-300'}`}
                >
                  {CATEGORY_LABELS[category]}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 mb-2 flex items-center gap-1.5">
              <Building2 className="w-3 h-3" /> {NEXT_GENERATION_BUILD_CATALOG.length} real-world build definitions in the expanded catalog
            </div>
            <div className="space-y-1.5">
              {catalogItems.map((item) => {
                const unlocked = state.stats.population >= item.unlockPopulation;
                return (
                  <div key={item.id} className={`rounded-lg border p-2.5 ${unlocked ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 bg-black/10 opacity-55'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-medium">{item.name}</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">{item.footprint.width}×{item.footprint.height} · ${item.buildCost.toLocaleString()} · upkeep ${item.monthlyUpkeep}/mo</div>
                      </div>
                      <span className={`text-[9px] rounded px-1.5 py-0.5 ${unlocked ? 'bg-emerald-400/10 text-emerald-300' : 'bg-slate-500/10 text-slate-500'}`}>
                        {unlocked ? 'unlocked' : `pop ${item.unlockPopulation.toLocaleString()}`}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed mt-1.5">{item.description}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {item.tags.slice(0, 4).map((tag) => <span key={tag} className="text-[8px] px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-500">{tag}</span>)}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

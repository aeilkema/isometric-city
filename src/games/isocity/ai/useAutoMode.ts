'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@/context/GameContext';
import { TOOL_INFO, Tool } from '@/types/game';
import { CityAutopilot } from './CityAutopilot';
import { countPlanningEntities, createPlanningSnapshot } from './planningMetrics';
import { AutopilotPlan, AutopilotStrategy, PlannedCityAction } from './types';

const ENABLED_KEY = 'isocity-automode-enabled';
const STRATEGY_KEY = 'isocity-automode-strategy';
const INTERVAL_MS = 12_000;

const EXECUTABLE_TOOLS: Partial<Record<PlannedCityAction['kind'], Tool>> = {
  'zone-residential': 'zone_residential',
  'zone-commercial': 'zone_commercial',
  'zone-industrial': 'zone_industrial',
  'build-school': 'school',
  'build-healthcare': 'hospital',
  'build-police': 'police_station',
  'build-fire-service': 'fire_station',
  'build-power': 'power_plant',
  'build-water': 'water_tower',
  'build-transit': 'rail_station',
  'build-green-space': 'park',
  'improve-road': 'road',
};

const STRATEGIES: AutopilotStrategy[] = [
  'conservative',
  'balanced',
  'transit-first',
  'green-city',
  'growth',
  'dutch-urbanism',
];

function readStrategy(): AutopilotStrategy {
  if (typeof window === 'undefined') return 'balanced';
  const value = localStorage.getItem(STRATEGY_KEY) as AutopilotStrategy | null;
  return value && STRATEGIES.includes(value) ? value : 'balanced';
}

export interface AutoModeStatus {
  enabled: boolean;
  strategy: AutopilotStrategy;
  plan: AutopilotPlan | null;
  lastAction: PlannedCityAction | null;
  lastActionAt: number | null;
  setEnabled: (enabled: boolean) => void;
  setStrategy: (strategy: AutopilotStrategy) => void;
  runNow: () => void;
}

export function useAutoMode(): AutoModeStatus {
  const { state, latestStateRef, setTool, placeAtTile, expandCity, addNotification } = useGame();
  const [enabled, setEnabledState] = useState(false);
  const [strategy, setStrategyState] = useState<AutopilotStrategy>('balanced');
  const [plan, setPlan] = useState<AutopilotPlan | null>(null);
  const [lastAction, setLastAction] = useState<PlannedCityAction | null>(null);
  const [lastActionAt, setLastActionAt] = useState<number | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setEnabledState(localStorage.getItem(ENABLED_KEY) === 'true');
    setStrategyState(readStrategy());
  }, []);

  const autopilot = useMemo(() => new CityAutopilot(strategy), [strategy]);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    if (typeof window !== 'undefined') localStorage.setItem(ENABLED_KEY, String(value));
  }, []);

  const setStrategy = useCallback((value: AutopilotStrategy) => {
    setStrategyState(value);
    if (typeof window !== 'undefined') localStorage.setItem(STRATEGY_KEY, value);
  }, []);

  const buildPlan = useCallback((): AutopilotPlan => {
    const current = latestStateRef.current;
    const nextPlan = autopilot.plan(createPlanningSnapshot(current, strategy));
    const counts = countPlanningEntities(current);

    if (counts.roads === 0) {
      nextPlan.actions = [
        {
          id: `autopilot-${current.tick}-bootstrap-road`,
          kind: 'improve-road',
          score: 100,
          estimatedCost: TOOL_INFO.road.cost,
          reason: 'De stad heeft nog geen wegennet. AutoMode legt eerst een centrale ontsluiting aan voordat er wordt gezoneerd.',
          tags: ['bootstrap', 'mobility'],
          constraints: ['Gebruik de normale bouwkosten en plaatsingsregels.'],
        },
        ...nextPlan.actions,
      ];
    }

    return nextPlan;
  }, [autopilot, latestStateRef, strategy]);

  const findPlacement = useCallback((tool: Tool): { x: number; y: number } | null => {
    const current = latestStateRef.current;
    const size = TOOL_INFO[tool]?.size ?? 1;
    const center = (current.gridSize - 1) / 2;
    let best: { x: number; y: number; score: number } | null = null;

    for (let y = 1; y < current.gridSize - size - 1; y += 1) {
      for (let x = 1; x < current.gridSize - size - 1; x += 1) {
        let valid = true;
        for (let oy = 0; oy < size && valid; oy += 1) {
          for (let ox = 0; ox < size; ox += 1) {
            const tile = current.grid[y + oy]?.[x + ox];
            if (!tile || !['grass', 'empty'].includes(tile.building.type)) {
              valid = false;
              break;
            }
          }
        }
        if (!valid) continue;

        let nearbyRoads = 0;
        let nearbyDevelopment = 0;
        for (let oy = -2; oy <= size + 1; oy += 1) {
          for (let ox = -2; ox <= size + 1; ox += 1) {
            const tile = current.grid[y + oy]?.[x + ox];
            if (!tile) continue;
            if (tile.building.type === 'road' || tile.building.type === 'bridge') nearbyRoads += 1;
            if (!['grass', 'empty', 'water'].includes(tile.building.type)) nearbyDevelopment += 1;
          }
        }

        if (nearbyRoads === 0 && current.stats.population > 20 && tool !== 'road') continue;
        const distance = Math.hypot(x - center, y - center) / Math.max(1, current.gridSize);
        const roadScore = tool === 'road' && nearbyRoads === 0 ? 8 : nearbyRoads * 15;
        const score = roadScore + nearbyDevelopment * 2 - distance * 12;
        if (!best || score > best.score) best = { x, y, score };
      }
    }

    return best ? { x: best.x, y: best.y } : null;
  }, [latestStateRef]);

  const execute = useCallback((action: PlannedCityAction): boolean => {
    if (action.kind === 'wait') return false;
    if (action.kind === 'expand-city') {
      expandCity();
      return true;
    }

    const tool = EXECUTABLE_TOOLS[action.kind];
    if (!tool) return false;
    const current = latestStateRef.current;
    const cost = TOOL_INFO[tool]?.cost ?? action.estimatedCost;
    if (current.stats.money < cost) return false;

    const placement = findPlacement(tool);
    if (!placement) return false;

    setTool(tool);
    window.setTimeout(() => {
      placeAtTile(placement.x, placement.y);
      window.setTimeout(() => setTool('select'), 0);
    }, 0);
    return true;
  }, [expandCity, findPlacement, latestStateRef, placeAtTile, setTool]);

  const runNow = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const nextPlan = buildPlan();
      setPlan(nextPlan);
      const executable = nextPlan.actions.find((action) => execute(action));
      if (executable) {
        setLastAction(executable);
        setLastActionAt(Date.now());
        addNotification('AutoMode', executable.reason, 'city-hall');
      }
    } finally {
      runningRef.current = false;
    }
  }, [addNotification, buildPlan, execute]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (latestStateRef.current.speed > 0) runNow();
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, latestStateRef, runNow]);

  useEffect(() => {
    setPlan(buildPlan());
  }, [buildPlan, state.stats.money, state.stats.population, state.stats.jobs, state.stats.happiness]);

  return { enabled, strategy, plan, lastAction, lastActionAt, setEnabled, setStrategy, runNow };
}

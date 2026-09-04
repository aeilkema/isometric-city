'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@/context/GameContext';
import { TOOL_INFO, Tool } from '@/types/game';
import { CityAutopilot } from './CityAutopilot';
import { AutopilotPlan, AutopilotStrategy, CityPlanningSnapshot, PlannedCityAction } from './types';

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
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function readStrategy(): AutopilotStrategy {
  if (typeof window === 'undefined') return 'balanced';
  const value = localStorage.getItem(STRATEGY_KEY) as AutopilotStrategy | null;
  return value && ['conservative', 'balanced', 'transit-first', 'green-city', 'growth', 'dutch-urbanism'].includes(value)
    ? value
    : 'balanced';
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

  const buildSnapshot = useCallback((): CityPlanningSnapshot => {
    const current = latestStateRef.current;
    let developed = 0;
    let zoned = 0;
    let poweredBuildings = 0;
    let wateredBuildings = 0;
    let buildingsNeedingUtilities = 0;
    let trafficSum = 0;
    let pollutedSum = 0;
    let crimeSum = 0;
    let landValueSum = 0;
    let severeTraffic = 0;
    let parkTiles = 0;

    for (const row of current.grid) {
      for (const tile of row) {
        const type = tile.building.type;
        if (type !== 'grass' && type !== 'empty' && type !== 'water') developed += 1;
        if (tile.zone !== 'none') zoned += 1;
        if (type === 'park' || type === 'park_large' || type === 'tree') parkTiles += 1;
        if (!['grass', 'empty', 'water', 'road', 'rail', 'bridge', 'tree'].includes(type)) {
          buildingsNeedingUtilities += 1;
          if (tile.building.powered) poweredBuildings += 1;
          if (tile.building.watered) wateredBuildings += 1;
        }
        trafficSum += tile.traffic ?? 0;
        pollutedSum += tile.pollution ?? 0;
        crimeSum += tile.crime ?? 0;
        landValueSum += tile.landValue ?? 0;
        if ((tile.traffic ?? 0) >= 70) severeTraffic += 1;
      }
    }

    const tileCount = Math.max(1, current.gridSize * current.gridSize);
    const utilityNeed = Math.max(1, buildingsNeedingUtilities);
    const powerCoverage = poweredBuildings / utilityNeed;
    const waterCoverage = wateredBuildings / utilityNeed;
    const population = current.stats.population;
    const jobs = current.stats.jobs;
    const unemployment = population > 0 ? Math.max(0, population - jobs) / population : 0;
    const averageTraffic = clamp01(trafficSum / tileCount / 100);

    return {
      tick: current.tick,
      year: current.year,
      month: current.month,
      metrics: {
        money: current.stats.money,
        monthlyIncome: current.stats.income,
        monthlyExpenses: current.stats.expenses,
        population,
        jobs,
        unemploymentRate: clamp01(unemployment),
        housingOccupancy: clamp01(0.62 + current.stats.demand.residential / 250),
        residentialDemand: clamp01((current.stats.demand.residential + 100) / 200),
        commercialDemand: clamp01((current.stats.demand.commercial + 100) / 200),
        industrialDemand: clamp01((current.stats.demand.industrial + 100) / 200),
        averageTraffic,
        severeCongestionShare: severeTraffic / tileCount,
        transitShare: clamp01(0.08 + zoned / tileCount * 0.12),
        bicycleShare: strategy === 'dutch-urbanism' ? 0.18 : 0.08,
        averagePollution: clamp01(pollutedSum / tileCount / 100),
        averageCrime: clamp01(crimeSum / tileCount / 100),
        averageLandValue: clamp01(landValueSum / tileCount / 100),
        powerUtilization: powerCoverage < 0.98 ? 1 : clamp01(0.55 + developed / tileCount * 0.5),
        waterUtilization: waterCoverage < 0.98 ? 1 : clamp01(0.5 + developed / tileCount * 0.5),
        schoolUtilization: clamp01(0.45 + (100 - current.stats.education) / 120),
        healthcareUtilization: clamp01(0.45 + (100 - current.stats.health) / 120),
        fireRisk: clamp01(0.35 + (100 - current.stats.safety) / 130),
        parkCoverage: clamp01(parkTiles / Math.max(1, developed + parkTiles) * 3),
        wasteUtilization: clamp01(0.45 + developed / tileCount * 0.6),
        developedLandShare: clamp01((developed + zoned) / tileCount),
      },
    };
  }, [latestStateRef, strategy]);

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

        if (nearbyRoads === 0 && current.stats.population > 20) continue;
        const distance = Math.hypot(x - center, y - center) / Math.max(1, current.gridSize);
        const score = nearbyRoads * 15 + nearbyDevelopment * 2 - distance * 12;
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
      const nextPlan = autopilot.plan(buildSnapshot());
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
  }, [addNotification, autopilot, buildSnapshot, execute]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (latestStateRef.current.speed > 0) runNow();
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, latestStateRef, runNow]);

  useEffect(() => {
    const nextPlan = autopilot.plan(buildSnapshot());
    setPlan(nextPlan);
  }, [autopilot, buildSnapshot, state.stats.money, state.stats.population, state.stats.jobs, state.stats.happiness]);

  return { enabled, strategy, plan, lastAction, lastActionAt, setEnabled, setStrategy, runNow };
}

import { GameState } from '@/types/game';
import { AutopilotStrategy, CityPlanningSnapshot } from './types';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export interface PlanningDerivedCounts {
  developed: number;
  zoned: number;
  roads: number;
  utilityBuildings: number;
  parks: number;
}

export function countPlanningEntities(state: GameState): PlanningDerivedCounts {
  let developed = 0;
  let zoned = 0;
  let roads = 0;
  let utilityBuildings = 0;
  let parks = 0;

  for (const row of state.grid) {
    for (const tile of row) {
      const type = tile.building.type;
      if (!['grass', 'empty', 'water'].includes(type)) developed += 1;
      if (tile.zone !== 'none') zoned += 1;
      if (type === 'road' || (type === 'bridge' && tile.building.bridgeTrackType !== 'rail')) roads += 1;
      if (type === 'park' || type === 'park_large' || type === 'tree') parks += 1;
      if (!['grass', 'empty', 'water', 'road', 'rail', 'bridge', 'tree'].includes(type)) utilityBuildings += 1;
    }
  }

  return { developed, zoned, roads, utilityBuildings, parks };
}

export function createPlanningSnapshot(
  state: GameState,
  strategy: AutopilotStrategy = 'balanced',
): CityPlanningSnapshot {
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

  for (const row of state.grid) {
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

  const tileCount = Math.max(1, state.gridSize * state.gridSize);
  const utilityNeed = Math.max(1, buildingsNeedingUtilities);
  const powerCoverage = buildingsNeedingUtilities === 0 ? 1 : poweredBuildings / utilityNeed;
  const waterCoverage = buildingsNeedingUtilities === 0 ? 1 : wateredBuildings / utilityNeed;
  const population = state.stats.population;
  const jobs = state.stats.jobs;
  const unemployment = population > 0 ? Math.max(0, population - jobs) / population : 0;
  const averageTraffic = clamp01(trafficSum / tileCount / 100);

  return {
    tick: state.tick,
    year: state.year,
    month: state.month,
    metrics: {
      money: state.stats.money,
      monthlyIncome: state.stats.income,
      monthlyExpenses: state.stats.expenses,
      population,
      jobs,
      unemploymentRate: clamp01(unemployment),
      housingOccupancy: clamp01(0.62 + state.stats.demand.residential / 250),
      residentialDemand: clamp01((state.stats.demand.residential + 100) / 200),
      commercialDemand: clamp01((state.stats.demand.commercial + 100) / 200),
      industrialDemand: clamp01((state.stats.demand.industrial + 100) / 200),
      averageTraffic,
      severeCongestionShare: severeTraffic / tileCount,
      transitShare: clamp01(0.08 + zoned / tileCount * 0.12),
      bicycleShare: strategy === 'dutch-urbanism' ? 0.18 : 0.08,
      averagePollution: clamp01(pollutedSum / tileCount / 100),
      averageCrime: clamp01(crimeSum / tileCount / 100),
      averageLandValue: clamp01(landValueSum / tileCount / 100),
      powerUtilization: powerCoverage < 0.98 ? 1 : clamp01(0.55 + developed / tileCount * 0.5),
      waterUtilization: waterCoverage < 0.98 ? 1 : clamp01(0.5 + developed / tileCount * 0.5),
      schoolUtilization: clamp01(0.45 + (100 - state.stats.education) / 120),
      healthcareUtilization: clamp01(0.45 + (100 - state.stats.health) / 120),
      fireRisk: clamp01(0.35 + (100 - state.stats.safety) / 130),
      parkCoverage: clamp01(parkTiles / Math.max(1, developed + parkTiles) * 3),
      wasteUtilization: clamp01(0.45 + developed / tileCount * 0.6),
      developedLandShare: clamp01((developed + zoned) / tileCount),
    },
  };
}

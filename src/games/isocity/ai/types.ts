export type AutopilotStrategy =
  | 'conservative'
  | 'balanced'
  | 'transit-first'
  | 'green-city'
  | 'growth'
  | 'dutch-urbanism';

export type PlanningActionKind =
  | 'zone-residential'
  | 'zone-commercial'
  | 'zone-industrial'
  | 'build-school'
  | 'build-healthcare'
  | 'build-police'
  | 'build-fire-service'
  | 'build-power'
  | 'build-water'
  | 'build-transit'
  | 'improve-road'
  | 'build-bike-network'
  | 'build-green-space'
  | 'build-waste-service'
  | 'expand-city'
  | 'wait';

export interface CityPlanningMetrics {
  money: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  population: number;
  jobs: number;
  unemploymentRate: number;
  housingOccupancy: number;
  residentialDemand: number;
  commercialDemand: number;
  industrialDemand: number;
  averageTraffic: number;
  severeCongestionShare: number;
  transitShare: number;
  bicycleShare: number;
  averagePollution: number;
  averageCrime: number;
  averageLandValue: number;
  powerUtilization: number;
  waterUtilization: number;
  schoolUtilization: number;
  healthcareUtilization: number;
  fireRisk: number;
  parkCoverage: number;
  wasteUtilization: number;
  developedLandShare: number;
}

export interface CityPlanningSnapshot {
  tick: number;
  year: number;
  month: number;
  metrics: CityPlanningMetrics;
}

export interface PlannedCityAction {
  id: string;
  kind: PlanningActionKind;
  score: number;
  estimatedCost: number;
  reason: string;
  tags: string[];
  constraints: string[];
}

export interface AutopilotPlan {
  strategy: AutopilotStrategy;
  generatedAtTick: number;
  healthScore: number;
  reserveTarget: number;
  diagnostics: string[];
  actions: PlannedCityAction[];
}

export interface StrategyProfile {
  strategy: AutopilotStrategy;
  reserveMonths: number;
  expansionBias: number;
  transitBias: number;
  bicycleBias: number;
  greenBias: number;
  roadExpansionBias: number;
  densityBias: number;
  serviceSafetyMargin: number;
  maxBudgetSharePerCycle: number;
}

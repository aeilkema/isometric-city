export type QualityTier = 'ultra' | 'high' | 'balanced' | 'performance' | 'minimal';

export interface PerformanceSample {
  frameMs: number;
  simulationMs?: number;
  timestamp?: number;
}

export interface PerformanceBudget {
  targetFrameMs: number;
  targetSimulationMs: number;
  downgradeWindow: number;
  upgradeWindow: number;
  downgradeThreshold: number;
  upgradeThreshold: number;
}

export interface RuntimeQualityProfile {
  tier: QualityTier;
  renderScale: number;
  maxVisibleVehicles: number;
  maxVisiblePedestrians: number;
  decorationDensity: number;
  animationDensity: number;
  lightingEnabled: boolean;
  weatherParticles: number;
  shadowDetail: 0 | 1 | 2 | 3;
  backgroundSimulationDivisor: number;
}

const DEFAULT_BUDGET: PerformanceBudget = {
  targetFrameMs: 16.67,
  targetSimulationMs: 8,
  downgradeWindow: 90,
  upgradeWindow: 420,
  downgradeThreshold: 1.2,
  upgradeThreshold: 0.78,
};

const QUALITY_ORDER: QualityTier[] = ['minimal', 'performance', 'balanced', 'high', 'ultra'];

export const QUALITY_PROFILES: Record<QualityTier, RuntimeQualityProfile> = {
  ultra: {
    tier: 'ultra',
    renderScale: 1,
    maxVisibleVehicles: 3000,
    maxVisiblePedestrians: 2500,
    decorationDensity: 1,
    animationDensity: 1,
    lightingEnabled: true,
    weatherParticles: 1,
    shadowDetail: 3,
    backgroundSimulationDivisor: 1,
  },
  high: {
    tier: 'high',
    renderScale: 1,
    maxVisibleVehicles: 2200,
    maxVisiblePedestrians: 1500,
    decorationDensity: 0.85,
    animationDensity: 0.9,
    lightingEnabled: true,
    weatherParticles: 0.75,
    shadowDetail: 2,
    backgroundSimulationDivisor: 1,
  },
  balanced: {
    tier: 'balanced',
    renderScale: 0.9,
    maxVisibleVehicles: 1400,
    maxVisiblePedestrians: 800,
    decorationDensity: 0.7,
    animationDensity: 0.75,
    lightingEnabled: true,
    weatherParticles: 0.5,
    shadowDetail: 2,
    backgroundSimulationDivisor: 2,
  },
  performance: {
    tier: 'performance',
    renderScale: 0.78,
    maxVisibleVehicles: 800,
    maxVisiblePedestrians: 350,
    decorationDensity: 0.45,
    animationDensity: 0.5,
    lightingEnabled: true,
    weatherParticles: 0.25,
    shadowDetail: 1,
    backgroundSimulationDivisor: 3,
  },
  minimal: {
    tier: 'minimal',
    renderScale: 0.65,
    maxVisibleVehicles: 350,
    maxVisiblePedestrians: 100,
    decorationDensity: 0.2,
    animationDensity: 0.25,
    lightingEnabled: false,
    weatherParticles: 0,
    shadowDetail: 0,
    backgroundSimulationDivisor: 4,
  },
};

export interface PerformanceGovernorSnapshot {
  tier: QualityTier;
  averageFrameMs: number;
  averageSimulationMs: number;
  fps: number;
  overloaded: boolean;
  sampleCount: number;
}

/**
 * Adaptive runtime governor for IsoCity.
 *
 * It deliberately changes visual fidelity before touching deterministic game
 * rules. That keeps the simulation result identical while allowing the browser
 * to remain responsive under load.
 */
export class PerformanceGovernor {
  private readonly budget: PerformanceBudget;
  private tier: QualityTier;
  private frameSamples: number[] = [];
  private simulationSamples: number[] = [];
  private goodFrames = 0;
  private badFrames = 0;

  constructor(initialTier: QualityTier = 'high', budget: Partial<PerformanceBudget> = {}) {
    this.tier = initialTier;
    this.budget = { ...DEFAULT_BUDGET, ...budget };
  }

  addSample(sample: PerformanceSample): RuntimeQualityProfile {
    this.pushSample(this.frameSamples, sample.frameMs, this.budget.upgradeWindow);
    if (typeof sample.simulationMs === 'number') {
      this.pushSample(this.simulationSamples, sample.simulationMs, this.budget.upgradeWindow);
    }

    const frameRatio = this.average(this.frameSamples) / this.budget.targetFrameMs;
    const simulationRatio = this.simulationSamples.length
      ? this.average(this.simulationSamples) / this.budget.targetSimulationMs
      : 0;
    const loadRatio = Math.max(frameRatio, simulationRatio);

    if (loadRatio >= this.budget.downgradeThreshold) {
      this.badFrames += 1;
      this.goodFrames = 0;
    } else if (loadRatio <= this.budget.upgradeThreshold) {
      this.goodFrames += 1;
      this.badFrames = 0;
    } else {
      this.badFrames = Math.max(0, this.badFrames - 1);
      this.goodFrames = Math.max(0, this.goodFrames - 1);
    }

    if (this.badFrames >= this.budget.downgradeWindow) {
      this.moveTier(-1);
      this.badFrames = 0;
      this.goodFrames = 0;
      this.trimSamples();
    } else if (this.goodFrames >= this.budget.upgradeWindow) {
      this.moveTier(1);
      this.badFrames = 0;
      this.goodFrames = 0;
      this.trimSamples();
    }

    return this.getProfile();
  }

  setTier(tier: QualityTier): RuntimeQualityProfile {
    this.tier = tier;
    this.badFrames = 0;
    this.goodFrames = 0;
    return this.getProfile();
  }

  getTier(): QualityTier {
    return this.tier;
  }

  getProfile(): RuntimeQualityProfile {
    return QUALITY_PROFILES[this.tier];
  }

  snapshot(): PerformanceGovernorSnapshot {
    const averageFrameMs = this.average(this.frameSamples);
    const averageSimulationMs = this.average(this.simulationSamples);
    const fps = averageFrameMs > 0 ? 1000 / averageFrameMs : 0;

    return {
      tier: this.tier,
      averageFrameMs,
      averageSimulationMs,
      fps,
      overloaded:
        averageFrameMs > this.budget.targetFrameMs * this.budget.downgradeThreshold ||
        averageSimulationMs > this.budget.targetSimulationMs * this.budget.downgradeThreshold,
      sampleCount: this.frameSamples.length,
    };
  }

  reset(): void {
    this.frameSamples = [];
    this.simulationSamples = [];
    this.goodFrames = 0;
    this.badFrames = 0;
  }

  private moveTier(direction: -1 | 1): void {
    const currentIndex = QUALITY_ORDER.indexOf(this.tier);
    const nextIndex = Math.max(0, Math.min(QUALITY_ORDER.length - 1, currentIndex + direction));
    this.tier = QUALITY_ORDER[nextIndex];
  }

  private pushSample(samples: number[], value: number, maxSamples: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    samples.push(value);
    if (samples.length > maxSamples) samples.shift();
  }

  private average(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private trimSamples(): void {
    const keep = Math.max(30, Math.floor(this.budget.downgradeWindow / 2));
    if (this.frameSamples.length > keep) this.frameSamples = this.frameSamples.slice(-keep);
    if (this.simulationSamples.length > keep) this.simulationSamples = this.simulationSamples.slice(-keep);
  }
}

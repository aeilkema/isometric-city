export type SimulationPriority = 'critical' | 'high' | 'normal' | 'background';

export interface SimulationTaskContext {
  simulationTimeMs: number;
  tick: number;
  speed: number;
}

export interface SimulationTask<TContext extends SimulationTaskContext = SimulationTaskContext> {
  id: string;
  frequencyHz: number;
  priority?: SimulationPriority;
  enabled?: boolean;
  maxCatchUpSteps?: number;
  run: (context: TContext, fixedDeltaMs: number) => void;
}

export interface SimulationTaskTiming {
  id: string;
  runs: number;
  elapsedMs: number;
}

export interface SimulationAdvanceResult {
  realDeltaMs: number;
  simulatedDeltaMs: number;
  simulationTimeMs: number;
  tick: number;
  taskTimings: SimulationTaskTiming[];
}

interface ScheduledTask<TContext extends SimulationTaskContext> {
  task: SimulationTask<TContext>;
  accumulatorMs: number;
}

const PRIORITY_ORDER: Record<SimulationPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  background: 3,
};

export const RECOMMENDED_SIMULATION_FREQUENCIES = {
  localTrafficHz: 10,
  pedestriansHz: 8,
  cityTrafficHz: 2,
  utilitiesHz: 2,
  buildingGrowthHz: 1,
  householdsHz: 0.5,
  economyHz: 0.25,
  cityAiHz: 0.5,
} as const;

/**
 * Deterministic multi-rate simulation scheduler.
 *
 * The scheduler keeps expensive subsystems off the render cadence. It can be
 * executed on the main thread initially and moved unchanged into a Web Worker
 * later. React should receive snapshots from the runtime, never own this clock.
 */
export class SimulationScheduler<TContext extends SimulationTaskContext = SimulationTaskContext> {
  private tasks = new Map<string, ScheduledTask<TContext>>();
  private speed = 1;
  private paused = false;
  private simulationTimeMs = 0;
  private tick = 0;
  private readonly maxRealDeltaMs: number;

  constructor(options: { maxRealDeltaMs?: number; initialSimulationTimeMs?: number } = {}) {
    this.maxRealDeltaMs = Math.max(16, options.maxRealDeltaMs ?? 250);
    this.simulationTimeMs = Math.max(0, options.initialSimulationTimeMs ?? 0);
  }

  register(task: SimulationTask<TContext>): void {
    if (!task.id.trim()) throw new Error('Simulation task id cannot be empty');
    if (!Number.isFinite(task.frequencyHz) || task.frequencyHz <= 0) {
      throw new Error(`Simulation task "${task.id}" requires frequencyHz > 0`);
    }

    this.tasks.set(task.id, {
      task: {
        ...task,
        priority: task.priority ?? 'normal',
        enabled: task.enabled ?? true,
        maxCatchUpSteps: Math.max(1, Math.floor(task.maxCatchUpSteps ?? 4)),
      },
      accumulatorMs: 0,
    });
  }

  unregister(id: string): void {
    this.tasks.delete(id);
  }

  has(id: string): boolean {
    return this.tasks.has(id);
  }

  setTaskEnabled(id: string, enabled: boolean): void {
    const scheduled = this.tasks.get(id);
    if (!scheduled) return;
    scheduled.task.enabled = enabled;
    if (!enabled) scheduled.accumulatorMs = 0;
  }

  setSpeed(multiplier: number): void {
    if (!Number.isFinite(multiplier) || multiplier < 0) {
      throw new Error('Simulation speed must be a finite value >= 0');
    }
    this.speed = multiplier;
    this.paused = multiplier === 0;
  }

  getSpeed(): number {
    return this.paused ? 0 : this.speed;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getSimulationTimeMs(): number {
    return this.simulationTimeMs;
  }

  getTick(): number {
    return this.tick;
  }

  reset(simulationTimeMs = 0): void {
    this.simulationTimeMs = Math.max(0, simulationTimeMs);
    this.tick = 0;
    for (const scheduled of this.tasks.values()) scheduled.accumulatorMs = 0;
  }

  /**
   * Advance using elapsed wall-clock time. The provided context is mutated only
   * for the three clock fields immediately before a task runs.
   */
  advance(realDeltaMs: number, context: TContext): SimulationAdvanceResult {
    const safeRealDeltaMs = Math.max(0, Math.min(this.maxRealDeltaMs, realDeltaMs));
    if (this.paused || this.speed === 0 || safeRealDeltaMs === 0) {
      this.writeClock(context);
      return {
        realDeltaMs: safeRealDeltaMs,
        simulatedDeltaMs: 0,
        simulationTimeMs: this.simulationTimeMs,
        tick: this.tick,
        taskTimings: [],
      };
    }

    const simulatedDeltaMs = safeRealDeltaMs * this.speed;
    this.simulationTimeMs += simulatedDeltaMs;
    this.tick += 1;

    const scheduledTasks = [...this.tasks.values()].sort((a, b) => {
      const priorityA = PRIORITY_ORDER[a.task.priority ?? 'normal'];
      const priorityB = PRIORITY_ORDER[b.task.priority ?? 'normal'];
      return priorityA - priorityB || a.task.id.localeCompare(b.task.id);
    });

    const taskTimings: SimulationTaskTiming[] = [];

    for (const scheduled of scheduledTasks) {
      const task = scheduled.task;
      if (task.enabled === false) continue;

      const fixedDeltaMs = 1000 / task.frequencyHz;
      scheduled.accumulatorMs += simulatedDeltaMs;
      const desiredSteps = Math.floor(scheduled.accumulatorMs / fixedDeltaMs);
      const steps = Math.min(desiredSteps, task.maxCatchUpSteps ?? 4);
      if (steps <= 0) continue;

      const started = this.now();
      for (let step = 0; step < steps; step += 1) {
        this.writeClock(context);
        task.run(context, fixedDeltaMs);
        scheduled.accumulatorMs -= fixedDeltaMs;
      }

      // Prevent an inactive tab or overloaded device from building an
      // unbounded backlog. Dropping background catch-up is preferable to a UI
      // freeze; deterministic persisted state still advances through fixed steps.
      const maximumBacklog = fixedDeltaMs * (task.maxCatchUpSteps ?? 4);
      if (scheduled.accumulatorMs > maximumBacklog) {
        scheduled.accumulatorMs = maximumBacklog;
      }

      taskTimings.push({
        id: task.id,
        runs: steps,
        elapsedMs: this.now() - started,
      });
    }

    this.writeClock(context);
    return {
      realDeltaMs: safeRealDeltaMs,
      simulatedDeltaMs,
      simulationTimeMs: this.simulationTimeMs,
      tick: this.tick,
      taskTimings,
    };
  }

  /** Run one exact step for debugging, tests or a paused single-step control. */
  stepTask(id: string, context: TContext): SimulationTaskTiming | null {
    const scheduled = this.tasks.get(id);
    if (!scheduled || scheduled.task.enabled === false) return null;

    const fixedDeltaMs = 1000 / scheduled.task.frequencyHz;
    this.simulationTimeMs += fixedDeltaMs;
    this.tick += 1;
    this.writeClock(context);

    const started = this.now();
    scheduled.task.run(context, fixedDeltaMs);
    return {
      id,
      runs: 1,
      elapsedMs: this.now() - started,
    };
  }

  private writeClock(context: TContext): void {
    context.simulationTimeMs = this.simulationTimeMs;
    context.tick = this.tick;
    context.speed = this.paused ? 0 : this.speed;
  }

  private now(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }
}

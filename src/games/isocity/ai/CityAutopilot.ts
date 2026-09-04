import {
  AutopilotPlan,
  AutopilotStrategy,
  CityPlanningMetrics,
  CityPlanningSnapshot,
  PlannedCityAction,
  PlanningActionKind,
  StrategyProfile,
} from './types';

export const AUTOPILOT_STRATEGIES: Record<AutopilotStrategy, StrategyProfile> = {
  conservative: {
    strategy: 'conservative',
    reserveMonths: 8,
    expansionBias: 0.55,
    transitBias: 0.85,
    bicycleBias: 0.8,
    greenBias: 0.9,
    roadExpansionBias: 0.65,
    densityBias: 0.8,
    serviceSafetyMargin: 0.18,
    maxBudgetSharePerCycle: 0.08,
  },
  balanced: {
    strategy: 'balanced',
    reserveMonths: 5,
    expansionBias: 1,
    transitBias: 1,
    bicycleBias: 1,
    greenBias: 1,
    roadExpansionBias: 1,
    densityBias: 1,
    serviceSafetyMargin: 0.14,
    maxBudgetSharePerCycle: 0.12,
  },
  'transit-first': {
    strategy: 'transit-first',
    reserveMonths: 5,
    expansionBias: 0.8,
    transitBias: 1.55,
    bicycleBias: 1.2,
    greenBias: 1,
    roadExpansionBias: 0.55,
    densityBias: 1.3,
    serviceSafetyMargin: 0.15,
    maxBudgetSharePerCycle: 0.13,
  },
  'green-city': {
    strategy: 'green-city',
    reserveMonths: 6,
    expansionBias: 0.7,
    transitBias: 1.35,
    bicycleBias: 1.45,
    greenBias: 1.7,
    roadExpansionBias: 0.45,
    densityBias: 1.2,
    serviceSafetyMargin: 0.16,
    maxBudgetSharePerCycle: 0.12,
  },
  growth: {
    strategy: 'growth',
    reserveMonths: 3,
    expansionBias: 1.45,
    transitBias: 1,
    bicycleBias: 0.8,
    greenBias: 0.75,
    roadExpansionBias: 1.25,
    densityBias: 1.15,
    serviceSafetyMargin: 0.1,
    maxBudgetSharePerCycle: 0.18,
  },
  'dutch-urbanism': {
    strategy: 'dutch-urbanism',
    reserveMonths: 5,
    expansionBias: 0.72,
    transitBias: 1.45,
    bicycleBias: 1.8,
    greenBias: 1.35,
    roadExpansionBias: 0.35,
    densityBias: 1.4,
    serviceSafetyMargin: 0.16,
    maxBudgetSharePerCycle: 0.13,
  },
};

interface Candidate {
  kind: PlanningActionKind;
  baseScore: number;
  estimatedCost: number;
  reason: string;
  tags?: string[];
  constraints?: string[];
}

/**
 * Explainable city planner used by AutoMode.
 *
 * This class intentionally does not mutate game state. It emits normal game
 * intents which must later pass through the same placement, cost and validation
 * rules as a human player's command.
 */
export class CityAutopilot {
  constructor(private strategy: AutopilotStrategy = 'balanced') {}

  setStrategy(strategy: AutopilotStrategy): void {
    this.strategy = strategy;
  }

  getStrategy(): AutopilotStrategy {
    return this.strategy;
  }

  plan(snapshot: CityPlanningSnapshot): AutopilotPlan {
    const profile = AUTOPILOT_STRATEGIES[this.strategy];
    const metrics = this.normalize(snapshot.metrics);
    const monthlyCosts = Math.max(1, metrics.monthlyExpenses);
    const reserveTarget = monthlyCosts * profile.reserveMonths;
    const budgetDeficit = metrics.monthlyIncome < metrics.monthlyExpenses;
    const discretionaryMoney = Math.max(0, metrics.money - reserveTarget);
    const cycleBudget = Math.max(0, discretionaryMoney * profile.maxBudgetSharePerCycle);

    const diagnostics = this.diagnose(metrics, reserveTarget);
    const candidates = this.generateCandidates(metrics, profile);

    if (budgetDeficit || metrics.money < reserveTarget) {
      candidates.push({
        kind: 'wait',
        baseScore: budgetDeficit ? 95 : 72,
        estimatedCost: 0,
        reason: budgetDeficit
          ? 'De maandbegroting is negatief; eerst financiële ruimte herstellen voordat nieuwe uitbreidingen starten.'
          : 'De kasreserve ligt onder de gekozen veiligheidsbuffer; alleen urgente voorzieningen mogen nu voorgaan.',
        tags: ['finance', 'guardrail'],
      });
    }

    const actions = candidates
      .map((candidate, index) => this.toAction(candidate, snapshot.tick, index, profile, metrics))
      .filter((action) => {
        if (action.kind === 'wait') return true;
        if (this.isCriticalServiceAction(action, metrics)) return action.estimatedCost <= Math.max(metrics.money, cycleBudget);
        return action.estimatedCost <= cycleBudget;
      })
      .sort((a, b) => b.score - a.score || a.estimatedCost - b.estimatedCost)
      .slice(0, 4);

    if (!actions.length) {
      actions.push({
        id: `autopilot-${snapshot.tick}-wait`,
        kind: 'wait',
        score: 50,
        estimatedCost: 0,
        reason: 'De stad heeft momenteel geen investering die tegelijk urgent, betaalbaar en logisch is.',
        tags: ['stability'],
        constraints: ['Herbeoordeel bij de volgende AI-planningscyclus.'],
      });
    }

    return {
      strategy: this.strategy,
      generatedAtTick: snapshot.tick,
      healthScore: this.calculateHealthScore(metrics),
      reserveTarget,
      diagnostics,
      actions,
    };
  }

  private generateCandidates(metrics: CityPlanningMetrics, profile: StrategyProfile): Candidate[] {
    const candidates: Candidate[] = [];
    const serviceLimit = 1 - profile.serviceSafetyMargin;

    if (metrics.powerUtilization > serviceLimit) {
      candidates.push({
        kind: 'build-power',
        baseScore: 88 + metrics.powerUtilization * 12,
        estimatedCost: 3200,
        reason: `Elektriciteitsgebruik is ${this.percent(metrics.powerUtilization)}; extra capaciteit voorkomt groeistilstand en uitval.`,
        tags: ['utility', 'critical'],
      });
    }

    if (metrics.waterUtilization > serviceLimit) {
      candidates.push({
        kind: 'build-water',
        baseScore: 87 + metrics.waterUtilization * 12,
        estimatedCost: 1700,
        reason: `Watercapaciteit is voor ${this.percent(metrics.waterUtilization)} benut; reserve voor nieuwe wijken wordt te klein.`,
        tags: ['utility', 'critical'],
      });
    }

    if (metrics.wasteUtilization > serviceLimit) {
      candidates.push({
        kind: 'build-waste-service',
        baseScore: 82 + metrics.wasteUtilization * 10,
        estimatedCost: 2200,
        reason: `Afvalverwerking zit op ${this.percent(metrics.wasteUtilization)} van de capaciteit.`,
        tags: ['utility', 'health'],
      });
    }

    if (metrics.schoolUtilization > serviceLimit) {
      candidates.push({
        kind: 'build-school',
        baseScore: 78 + metrics.schoolUtilization * 12,
        estimatedCost: 900,
        reason: `Onderwijscapaciteit is ${this.percent(metrics.schoolUtilization)} benut; bouw vóór nieuwe woninggroei een school waar de dekking het laagst is.`,
        tags: ['service', 'education'],
      });
    }

    if (metrics.healthcareUtilization > serviceLimit) {
      candidates.push({
        kind: 'build-healthcare',
        baseScore: 82 + metrics.healthcareUtilization * 12,
        estimatedCost: 1800,
        reason: `Zorgcapaciteit is ${this.percent(metrics.healthcareUtilization)} benut.`,
        tags: ['service', 'health'],
      });
    }

    if (metrics.averageCrime > 0.62) {
      candidates.push({
        kind: 'build-police',
        baseScore: 76 + metrics.averageCrime * 18,
        estimatedCost: 750,
        reason: `Het stedelijk misdaadniveau is verhoogd (${this.percent(metrics.averageCrime)}).`,
        tags: ['service', 'safety'],
      });
    }

    if (metrics.fireRisk > 0.62) {
      candidates.push({
        kind: 'build-fire-service',
        baseScore: 80 + metrics.fireRisk * 18,
        estimatedCost: 750,
        reason: `Het brandrisico is verhoogd (${this.percent(metrics.fireRisk)}); dekking moet meegroeien met de bebouwing.`,
        tags: ['service', 'safety'],
      });
    }

    if (metrics.housingOccupancy > 0.9 && metrics.residentialDemand > 0.55) {
      candidates.push({
        kind: 'zone-residential',
        baseScore: (68 + metrics.residentialDemand * 24) * profile.densityBias,
        estimatedCost: 650,
        reason: `Woningen zijn ${this.percent(metrics.housingOccupancy)} bezet en de woonvraag is hoog; voeg woningen bij voorkeur binnen bestaand stedelijk gebied toe.`,
        tags: ['housing', profile.densityBias > 1.1 ? 'densify' : 'growth'],
      });
    }

    if (metrics.unemploymentRate > 0.075 && metrics.commercialDemand > 0.42) {
      candidates.push({
        kind: 'zone-commercial',
        baseScore: 64 + metrics.unemploymentRate * 150 + metrics.commercialDemand * 18,
        estimatedCost: 600,
        reason: `Werkloosheid is ${this.percent(metrics.unemploymentRate)} en commerciële vraag is beschikbaar; creëer bereikbare banen nabij woongebieden en OV.`,
        tags: ['jobs', 'mixed-use'],
      });
    }

    if (metrics.unemploymentRate > 0.09 && metrics.industrialDemand > 0.5) {
      candidates.push({
        kind: 'zone-industrial',
        baseScore: 62 + metrics.unemploymentRate * 140 + metrics.industrialDemand * 20,
        estimatedCost: 800,
        reason: 'Er is zowel werkloosheid als industriële vraag; ontwikkel werkgelegenheid met goede vrachtontsluiting en afstand tot woonstraten.',
        tags: ['jobs', 'freight'],
      });
    }

    if (metrics.severeCongestionShare > 0.22 || metrics.averageTraffic > 0.68) {
      candidates.push({
        kind: 'build-transit',
        baseScore: (65 + metrics.severeCongestionShare * 70 + metrics.averageTraffic * 15) * profile.transitBias,
        estimatedCost: 1600,
        reason: `Structurele congestie treft ${this.percent(metrics.severeCongestionShare)} van het netwerk; verhoog eerst de vervoerscapaciteit zonder extra autoverkeer uit te lokken.`,
        tags: ['mobility', 'transit'],
      });

      candidates.push({
        kind: 'build-bike-network',
        baseScore: (52 + metrics.severeCongestionShare * 48) * profile.bicycleBias,
        estimatedCost: 650,
        reason: 'Korte autoritten kunnen naar een aaneengesloten fietsnetwerk verschuiven, wat capaciteit vrijmaakt op drukke straten.',
        tags: ['mobility', 'cycling'],
      });

      if (profile.roadExpansionBias >= 0.6) {
        candidates.push({
          kind: 'improve-road',
          baseScore: (50 + metrics.severeCongestionShare * 45) * profile.roadExpansionBias,
          estimatedCost: 1200,
          reason: 'Verbeter alleen aantoonbare netwerkknelpunten; voorkom het blind verbreden van wegen en daardoor opgewekte verkeersvraag.',
          tags: ['mobility', 'bottleneck'],
          constraints: ['Alleen uitvoeren als een alternatief traject of kruispuntcapaciteit aantoonbaar tekortschiet.'],
        });
      }
    }

    if (metrics.averagePollution > 0.5 || metrics.parkCoverage < 0.22) {
      candidates.push({
        kind: 'build-green-space',
        baseScore: (58 + metrics.averagePollution * 30 + (1 - metrics.parkCoverage) * 18) * profile.greenBias,
        estimatedCost: 450,
        reason: `Groendekking is ${this.percent(metrics.parkCoverage)} en vervuiling ${this.percent(metrics.averagePollution)}; voeg groen toe waar inwoners en hittebelasting het meest profiteren.`,
        tags: ['environment', 'land-value'],
      });
    }

    if (
      metrics.developedLandShare > 0.84 &&
      (metrics.residentialDemand > 0.7 || metrics.commercialDemand > 0.7 || metrics.industrialDemand > 0.7)
    ) {
      candidates.push({
        kind: 'expand-city',
        baseScore: (48 + metrics.developedLandShare * 30) * profile.expansionBias,
        estimatedCost: 5000,
        reason: `Bestaand stedelijk gebied is voor ${this.percent(metrics.developedLandShare)} ontwikkeld. Uitbreiden is pas logisch nadat verdichting en infrastructuur zijn benut.`,
        tags: ['expansion'],
        constraints: ['Nieuwe uitbreiding moet vooraf op hoofdontsluiting en nutsvoorzieningen zijn aangesloten.'],
      });
    }

    return candidates;
  }

  private toAction(
    candidate: Candidate,
    tick: number,
    index: number,
    profile: StrategyProfile,
    metrics: CityPlanningMetrics,
  ): PlannedCityAction {
    let score = candidate.baseScore;

    if (candidate.kind === 'build-transit') score *= profile.transitBias;
    if (candidate.kind === 'build-bike-network') score *= profile.bicycleBias;
    if (candidate.kind === 'build-green-space') score *= profile.greenBias;
    if (candidate.kind === 'expand-city') score *= profile.expansionBias;
    if (candidate.kind === 'improve-road') score *= profile.roadExpansionBias;

    // Favor actions that address a weak metric without letting huge scores grow
    // without bound. Stable ordering is useful for deterministic replays.
    score = Math.max(0, Math.min(100, score));

    return {
      id: `autopilot-${tick}-${index}-${candidate.kind}`,
      kind: candidate.kind,
      score: Math.round(score * 10) / 10,
      estimatedCost: candidate.estimatedCost,
      reason: candidate.reason,
      tags: candidate.tags ?? [],
      constraints: [
        'Gebruik dezelfde kosten-, plaatsings- en bereikbaarheidregels als handmatig bouwen.',
        'Sloop geen gelockte, historische of unieke gebouwen automatisch.',
        ...this.strategyConstraints(profile, metrics),
        ...(candidate.constraints ?? []),
      ],
    };
  }

  private strategyConstraints(profile: StrategyProfile, metrics: CityPlanningMetrics): string[] {
    const constraints = [
      `Behoud bij normale investeringen circa ${profile.reserveMonths} maanden exploitatiekosten als kasbuffer.`,
    ];

    if (this.strategy === 'dutch-urbanism') {
      constraints.push('Geef verdichting, lopen, fietsen en openbaar vervoer prioriteit boven nieuwe autowegcapaciteit.');
      constraints.push('Maak dagelijkse voorzieningen bij voorkeur op korte afstand van woongebieden.');
    }

    if (metrics.monthlyIncome < metrics.monthlyExpenses) {
      constraints.push('Geen niet-urgente kapitaalprojecten zolang de structurele begroting negatief is.');
    }

    return constraints;
  }

  private isCriticalServiceAction(action: PlannedCityAction, metrics: CityPlanningMetrics): boolean {
    return (
      (action.kind === 'build-power' && metrics.powerUtilization >= 0.97) ||
      (action.kind === 'build-water' && metrics.waterUtilization >= 0.97) ||
      (action.kind === 'build-healthcare' && metrics.healthcareUtilization >= 1) ||
      (action.kind === 'build-fire-service' && metrics.fireRisk >= 0.9)
    );
  }

  private diagnose(metrics: CityPlanningMetrics, reserveTarget: number): string[] {
    const diagnostics: string[] = [];
    if (metrics.money < reserveTarget) diagnostics.push('Kasreserve onder strategisch doel.');
    if (metrics.monthlyIncome < metrics.monthlyExpenses) diagnostics.push('Structureel begrotingstekort.');
    if (metrics.powerUtilization > 0.85) diagnostics.push('Elektriciteitsnet nadert capaciteitsgrens.');
    if (metrics.waterUtilization > 0.85) diagnostics.push('Waternet nadert capaciteitsgrens.');
    if (metrics.housingOccupancy > 0.9) diagnostics.push('Woningmarkt is krap.');
    if (metrics.unemploymentRate > 0.075) diagnostics.push('Werkloosheid ligt boven gewenst niveau.');
    if (metrics.severeCongestionShare > 0.2) diagnostics.push('Structurele verkeersknelpunten aanwezig.');
    if (metrics.averagePollution > 0.5) diagnostics.push('Milieudruk is verhoogd.');
    if (metrics.parkCoverage < 0.2) diagnostics.push('Groenvoorziening is laag.');
    if (!diagnostics.length) diagnostics.push('Geen grote stedelijke onbalans gedetecteerd.');
    return diagnostics;
  }

  private calculateHealthScore(metrics: CityPlanningMetrics): number {
    const budgetScore = metrics.monthlyIncome >= metrics.monthlyExpenses ? 1 : 0.45;
    const employmentScore = 1 - Math.min(1, metrics.unemploymentRate / 0.18);
    const trafficScore = 1 - metrics.severeCongestionShare;
    const environmentScore = 1 - metrics.averagePollution;
    const safetyScore = 1 - metrics.averageCrime;
    const utilityScore = 1 - Math.max(0, Math.max(metrics.powerUtilization, metrics.waterUtilization) - 0.8) / 0.2;
    const servicesScore = 1 - Math.max(0, Math.max(metrics.schoolUtilization, metrics.healthcareUtilization) - 0.85) / 0.3;

    const score =
      budgetScore * 0.16 +
      employmentScore * 0.14 +
      trafficScore * 0.14 +
      environmentScore * 0.12 +
      safetyScore * 0.12 +
      Math.max(0, utilityScore) * 0.16 +
      Math.max(0, servicesScore) * 0.16;

    return Math.round(Math.max(0, Math.min(1, score)) * 100);
  }

  private normalize(metrics: CityPlanningMetrics): CityPlanningMetrics {
    const unit = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    return {
      ...metrics,
      money: Math.max(0, Number.isFinite(metrics.money) ? metrics.money : 0),
      monthlyIncome: Math.max(0, Number.isFinite(metrics.monthlyIncome) ? metrics.monthlyIncome : 0),
      monthlyExpenses: Math.max(0, Number.isFinite(metrics.monthlyExpenses) ? metrics.monthlyExpenses : 0),
      population: Math.max(0, Math.floor(metrics.population || 0)),
      jobs: Math.max(0, Math.floor(metrics.jobs || 0)),
      unemploymentRate: unit(metrics.unemploymentRate),
      housingOccupancy: unit(metrics.housingOccupancy),
      residentialDemand: unit(metrics.residentialDemand),
      commercialDemand: unit(metrics.commercialDemand),
      industrialDemand: unit(metrics.industrialDemand),
      averageTraffic: unit(metrics.averageTraffic),
      severeCongestionShare: unit(metrics.severeCongestionShare),
      transitShare: unit(metrics.transitShare),
      bicycleShare: unit(metrics.bicycleShare),
      averagePollution: unit(metrics.averagePollution),
      averageCrime: unit(metrics.averageCrime),
      averageLandValue: unit(metrics.averageLandValue),
      powerUtilization: unit(metrics.powerUtilization),
      waterUtilization: unit(metrics.waterUtilization),
      schoolUtilization: unit(metrics.schoolUtilization),
      healthcareUtilization: unit(metrics.healthcareUtilization),
      fireRisk: unit(metrics.fireRisk),
      parkCoverage: unit(metrics.parkCoverage),
      wasteUtilization: unit(metrics.wasteUtilization),
      developedLandShare: unit(metrics.developedLandShare),
    };
  }

  private percent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }
}

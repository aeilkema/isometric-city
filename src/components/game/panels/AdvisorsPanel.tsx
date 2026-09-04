'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { msg, useMessages } from 'gt-next';
import { useGame } from '@/context/GameContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CityAutopilot } from '@/games/isocity/ai/CityAutopilot';
import { createPlanningSnapshot } from '@/games/isocity/ai/planningMetrics';
import { AutopilotPlan, AutopilotStrategy } from '@/games/isocity/ai/types';
import {
  AdvisorIcon,
  InfoIcon,
  PowerIcon,
  WaterIcon,
  MoneyIcon,
  SafetyIcon,
  HealthIcon,
  EducationIcon,
  EnvironmentIcon,
  JobsIcon,
} from '@/components/ui/Icons';

const UI_LABELS = {
  cityAdvisors: msg('City Advisors'),
  overallCityRating: msg('Overall City Rating'),
  ratingDescription: msg('Based on happiness, health, education, safety & environment'),
  noUrgentIssues: msg('No urgent issues to report!'),
  cityRunningSmoothly: msg('Your city is running smoothly.'),
};

const ADVISOR_ICON_MAP: Record<string, React.ReactNode> = {
  power: <PowerIcon size={18} />,
  water: <WaterIcon size={18} />,
  cash: <MoneyIcon size={18} />,
  shield: <SafetyIcon size={18} />,
  hospital: <HealthIcon size={18} />,
  education: <EducationIcon size={18} />,
  environment: <EnvironmentIcon size={18} />,
  planning: <AdvisorIcon size={18} />,
  jobs: <JobsIcon size={18} />,
};

function readStrategy(): AutopilotStrategy {
  if (typeof window === 'undefined') return 'balanced';
  const value = localStorage.getItem('isocity-automode-strategy') as AutopilotStrategy | null;
  return value && ['conservative', 'balanced', 'transit-first', 'green-city', 'growth', 'dutch-urbanism'].includes(value)
    ? value
    : 'balanced';
}

function actionIcon(kind: string): React.ReactNode {
  if (kind.includes('power')) return <PowerIcon size={18} />;
  if (kind.includes('water')) return <WaterIcon size={18} />;
  if (kind.includes('school')) return <EducationIcon size={18} />;
  if (kind.includes('health')) return <HealthIcon size={18} />;
  if (kind.includes('green')) return <EnvironmentIcon size={18} />;
  if (kind.includes('police') || kind.includes('fire')) return <SafetyIcon size={18} />;
  if (kind.includes('commercial') || kind.includes('industrial')) return <JobsIcon size={18} />;
  return <AdvisorIcon size={18} />;
}

export function AdvisorsPanel() {
  const { state, latestStateRef, setActivePanel } = useGame();
  const { advisorMessages, stats } = state;
  const m = useMessages();
  const [strategy] = useState<AutopilotStrategy>(() => readStrategy());
  const planner = useMemo(() => new CityAutopilot(strategy), [strategy]);
  const [plan, setPlan] = useState<AutopilotPlan>(() => planner.plan(createPlanningSnapshot(state, strategy)));

  useEffect(() => {
    const refresh = () => {
      setPlan(planner.plan(createPlanningSnapshot(latestStateRef.current, strategy)));
    };
    refresh();
    const timer = window.setInterval(refresh, 4000);
    return () => window.clearInterval(timer);
  }, [latestStateRef, planner, strategy]);

  const avgRating = (stats.happiness + stats.health + stats.education + stats.safety + stats.environment) / 5;
  const grade = avgRating >= 90 ? 'A+' : avgRating >= 80 ? 'A' : avgRating >= 70 ? 'B' : avgRating >= 60 ? 'C' : avgRating >= 50 ? 'D' : 'F';
  const gradeColor = avgRating >= 70 ? 'text-green-400' : avgRating >= 50 ? 'text-amber-400' : 'text-red-400';

  return (
    <Dialog open={true} onOpenChange={() => setActivePanel('none')}>
      <DialogContent className="max-w-[620px] max-h-[78vh]">
        <DialogHeader>
          <DialogTitle>{m(UI_LABELS.cityAdvisors)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 min-h-0">
          <div className="grid grid-cols-2 gap-3">
            <Card className="flex items-center gap-4 p-4 bg-primary/10 border-primary/30">
              <div className={`w-16 h-16 flex items-center justify-center text-3xl font-black rounded-md ${gradeColor} bg-primary/20`}>
                {grade}
              </div>
              <div>
                <div className="text-foreground font-semibold">{m(UI_LABELS.overallCityRating)}</div>
                <div className="text-muted-foreground text-xs">{m(UI_LABELS.ratingDescription)}</div>
              </div>
            </Card>

            <Card className="p-4 bg-primary/10 border-primary/30">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Planning health</div>
              <div className="flex items-end gap-2 mt-1">
                <div className={`text-3xl font-black ${plan.healthScore >= 75 ? 'text-green-400' : plan.healthScore >= 55 ? 'text-amber-400' : 'text-red-400'}`}>
                  {plan.healthScore}%
                </div>
                <Badge variant="secondary" className="mb-1 capitalize">{strategy.replaceAll('-', ' ')}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Reserve target: ${Math.round(plan.reserveTarget).toLocaleString()}
              </div>
            </Card>
          </div>

          <ScrollArea className="max-h-[460px] pr-2">
            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">AI diagnostics</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {plan.diagnostics.map((diagnostic) => (
                    <Card key={diagnostic} className="px-3 py-2 text-xs text-muted-foreground bg-muted/20">
                      {diagnostic}
                    </Card>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Recommended next investments</div>
                <div className="space-y-2">
                  {plan.actions.slice(0, 4).map((action, index) => (
                    <Card key={action.id} className="p-3 bg-primary/5 border-primary/20">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                          {actionIcon(action.kind)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium capitalize">{index + 1}. {action.kind.replaceAll('-', ' ')}</span>
                            <Badge variant="secondary" className="ml-auto text-[10px]">score {Math.round(action.score)}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed mt-1">{action.reason}</p>
                          {action.estimatedCost > 0 && (
                            <div className="text-[11px] text-muted-foreground mt-1.5">Estimated project cost: ${action.estimatedCost.toLocaleString()}</div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Simulation advisors</div>
                <div className="space-y-3">
                  {advisorMessages.length === 0 ? (
                    <Card className="text-center py-6 text-muted-foreground bg-primary/10 border-primary/30">
                      <AdvisorIcon size={28} className="mx-auto mb-2 opacity-50" />
                      <div className="text-sm">{m(UI_LABELS.noUrgentIssues)}</div>
                      <div className="text-xs mt-1">{m(UI_LABELS.cityRunningSmoothly)}</div>
                    </Card>
                  ) : (
                    advisorMessages.map((advisor, i) => (
                      <Card key={`${advisor.name}-${i}`} className={`p-3 bg-primary/10 border-primary/30 ${
                        advisor.priority === 'critical' ? 'border-l-2 border-l-red-500' :
                        advisor.priority === 'high' ? 'border-l-2 border-l-amber-500' :
                        advisor.priority === 'medium' ? 'border-l-2 border-l-yellow-500' : ''
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg text-muted-foreground">
                            {ADVISOR_ICON_MAP[advisor.icon] || <InfoIcon size={18} />}
                          </span>
                          <span className="text-foreground font-medium text-sm">{advisor.name}</span>
                          <Badge variant={advisor.priority === 'critical' || advisor.priority === 'high' ? 'destructive' : 'secondary'} className="ml-auto text-[10px]">
                            {advisor.priority}
                          </Badge>
                        </div>
                        {advisor.messages.map((message, j) => (
                          <div key={j} className="text-muted-foreground text-sm leading-relaxed">{message}</div>
                        ))}
                      </Card>
                    ))
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

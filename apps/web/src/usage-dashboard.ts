import type { UsageBucket, UsageRecord, UsageSummary } from '@hello-world/shared';
import { aggregateUsageByDay, aggregateUsageByModel, formatUsageSummary, summarizeUsage } from '@hello-world/core';

export type UsageDashboardViewModel = {
  total: UsageSummary;
  totalLabel: string;
  byModel: UsageBucket[];
  byDay: UsageBucket[];
};

export function createUsageDashboardViewModel(records: UsageRecord[]): UsageDashboardViewModel {
  const total = summarizeUsage(records);
  return {
    total,
    totalLabel: formatUsageSummary(total),
    byModel: aggregateUsageByModel(records),
    byDay: aggregateUsageByDay(records),
  };
}

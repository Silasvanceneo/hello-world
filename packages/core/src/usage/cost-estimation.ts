import type { TokenUsage, UsageBucket, UsageRecord } from '@hello-world/shared';

export type ModelPrice = {
  modelPattern: string;
  inputPerMillion: number;
  outputPerMillion: number;
  currency: 'USD' | 'CNY';
};

export type CostEstimate = {
  amount: number;
  currency: ModelPrice['currency'];
  price: ModelPrice;
};

export type BudgetSettings = {
  dailyLimit?: number;
  monthlyLimit?: number;
  currency: ModelPrice['currency'];
  now?: string;
};

export type BudgetReminder = {
  level: 'ok' | 'warning';
  message: string;
  dailyCost: number;
  monthlyCost: number;
};

export const defaultModelPrices: ModelPrice[] = [
  { modelPattern: 'gpt-4.1-mini', inputPerMillion: 0.2, outputPerMillion: 0.8, currency: 'USD' },
  { modelPattern: 'gpt-4.1', inputPerMillion: 3, outputPerMillion: 12, currency: 'USD' },
  { modelPattern: 'gpt-4o-mini', inputPerMillion: 0.15, outputPerMillion: 0.6, currency: 'USD' },
  { modelPattern: 'gpt-4o', inputPerMillion: 2.5, outputPerMillion: 10, currency: 'USD' },
  { modelPattern: 'claude', inputPerMillion: 3, outputPerMillion: 15, currency: 'USD' },
  { modelPattern: 'local-echo', inputPerMillion: 0, outputPerMillion: 0, currency: 'USD' },
  { modelPattern: 'ollama', inputPerMillion: 0, outputPerMillion: 0, currency: 'USD' },
  { modelPattern: 'llama', inputPerMillion: 0, outputPerMillion: 0, currency: 'USD' },
  { modelPattern: '*', inputPerMillion: 1, outputPerMillion: 3, currency: 'USD' },
];

export function findModelPrice(modelId = '', prices: ModelPrice[] = defaultModelPrices): ModelPrice | undefined {
  const name = modelId.toLowerCase();
  return prices.find((price) => price.modelPattern !== '*' && name.includes(price.modelPattern.toLowerCase()))
    ?? prices.find((price) => price.modelPattern === '*');
}

export function estimateUsageCost(
  usage: TokenUsage,
  modelId?: string,
  prices: ModelPrice[] = defaultModelPrices,
): CostEstimate {
  const price = findModelPrice(modelId, prices) ?? defaultModelPrices.at(-1)!;
  const amount = ((usage.promptTokens * price.inputPerMillion) + (usage.completionTokens * price.outputPerMillion)) / 1_000_000;
  return { amount, currency: price.currency, price };
}

export function applyEstimatedCosts(
  records: UsageRecord[],
  prices: ModelPrice[] = defaultModelPrices,
): UsageRecord[] {
  return records.map((record) => {
    const estimate = estimateUsageCost(record.usage, record.modelId, prices);
    return {
      ...record,
      usage: {
        ...record.usage,
        estimatedCost: estimate.amount,
        currency: estimate.currency,
      },
    };
  });
}

export function aggregateCostByPeriod(records: UsageRecord[], period: 'day' | 'month'): UsageBucket[] {
  const length = period === 'day' ? 10 : 7;
  const buckets = new Map<string, UsageBucket>();
  for (const record of records) {
    const key = record.createdAt.slice(0, length);
    const current = buckets.get(key) ?? { key, records: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 };
    buckets.set(key, {
      key,
      records: current.records + 1,
      promptTokens: current.promptTokens + record.usage.promptTokens,
      completionTokens: current.completionTokens + record.usage.completionTokens,
      totalTokens: current.totalTokens + record.usage.totalTokens,
      estimatedCost: (current.estimatedCost ?? 0) + (record.usage.estimatedCost ?? 0),
    });
  }
  return [...buckets.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function createBudgetReminder(records: UsageRecord[], settings: BudgetSettings): BudgetReminder {
  const now = settings.now ?? new Date().toISOString();
  const today = now.slice(0, 10);
  const month = now.slice(0, 7);
  const dailyCost = sumCost(records.filter((record) => record.createdAt.startsWith(today)));
  const monthlyCost = sumCost(records.filter((record) => record.createdAt.startsWith(month)));

  if (settings.monthlyLimit !== undefined && monthlyCost >= settings.monthlyLimit) {
    return { level: 'warning', dailyCost, monthlyCost, message: `Monthly budget reached: ${formatMoney(monthlyCost, settings.currency)} / ${formatMoney(settings.monthlyLimit, settings.currency)}.` };
  }
  if (settings.dailyLimit !== undefined && dailyCost >= settings.dailyLimit) {
    return { level: 'warning', dailyCost, monthlyCost, message: `Daily budget reached: ${formatMoney(dailyCost, settings.currency)} / ${formatMoney(settings.dailyLimit, settings.currency)}.` };
  }
  return { level: 'ok', dailyCost, monthlyCost, message: `Budget OK: today ${formatMoney(dailyCost, settings.currency)}, month ${formatMoney(monthlyCost, settings.currency)}.` };
}

export function formatMoney(amount: number, currency: ModelPrice['currency'] = 'USD'): string {
  const symbol = currency === 'USD' ? '$' : '¥';
  return `${symbol}${amount.toFixed(4)}`;
}

function sumCost(records: UsageRecord[]): number {
  return records.reduce((total, record) => total + (record.usage.estimatedCost ?? 0), 0);
}

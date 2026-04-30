const defaultPrices = [
  { pattern: 'gpt-4.1-mini', input: 0.2, output: 0.8 },
  { pattern: 'gpt-4.1', input: 3, output: 12 },
  { pattern: 'gpt-4o-mini', input: 0.15, output: 0.6 },
  { pattern: 'gpt-4o', input: 2.5, output: 10 },
  { pattern: 'claude', input: 3, output: 15 },
  { pattern: 'local-echo', input: 0, output: 0 },
  { pattern: 'ollama', input: 0, output: 0 },
  { pattern: 'llama', input: 0, output: 0 },
  { pattern: '*', input: 1, output: 3 },
];

export function createUsageRecordsFromWebState(state) {
  return state.sessions.flatMap((session) => session.messages
    .filter((message) => message.usage)
    .map((message) => ({
      id: `${session.id}:${message.id}`,
      sessionId: session.id,
      messageId: message.id,
      modelId: message.modelId ?? session.modelId,
      usage: message.usage,
      createdAt: message.updatedAt,
    })));
}

export function createCostDashboardViewModel(records, budget) {
  const priced = records.map(withEstimatedCost);
  const totalCost = priced.reduce((sum, record) => sum + (record.usage.estimatedCost ?? 0), 0);
  const byDay = aggregate(priced, 10);
  const byMonth = aggregate(priced, 7);
  const reminder = createBudgetReminder(priced, budget);
  return {
    totalCost,
    totalCostLabel: formatMoney(totalCost, budget.currency),
    byDay,
    byMonth,
    budgetLevel: reminder.level,
    budgetMessage: reminder.message,
  };
}

export function formatMoney(amount, currency = 'USD') {
  return `${currency === 'USD' ? '$' : '¥'}${amount.toFixed(4)}`;
}

function withEstimatedCost(record) {
  const price = findPrice(record.modelId);
  const estimatedCost = ((record.usage.promptTokens * price.input) + (record.usage.completionTokens * price.output)) / 1_000_000;
  return {
    ...record,
    usage: { ...record.usage, estimatedCost, currency: 'USD' },
  };
}

function findPrice(modelId = '') {
  const name = modelId.toLowerCase();
  return defaultPrices.find((price) => price.pattern !== '*' && name.includes(price.pattern)) ?? defaultPrices.at(-1);
}

function aggregate(records, keyLength) {
  const buckets = new Map();
  for (const record of records) {
    const key = record.createdAt.slice(0, keyLength);
    const current = buckets.get(key) ?? { key, records: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 };
    buckets.set(key, {
      key,
      records: current.records + 1,
      promptTokens: current.promptTokens + record.usage.promptTokens,
      completionTokens: current.completionTokens + record.usage.completionTokens,
      totalTokens: current.totalTokens + record.usage.totalTokens,
      estimatedCost: current.estimatedCost + (record.usage.estimatedCost ?? 0),
    });
  }
  return [...buckets.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function createBudgetReminder(records, budget) {
  const now = budget.now ?? new Date().toISOString();
  const dailyCost = sumCost(records.filter((record) => record.createdAt.startsWith(now.slice(0, 10))));
  const monthlyCost = sumCost(records.filter((record) => record.createdAt.startsWith(now.slice(0, 7))));
  if (budget.monthlyLimit !== undefined && monthlyCost >= budget.monthlyLimit) {
    return { level: 'warning', message: `Monthly budget reached: ${formatMoney(monthlyCost, budget.currency)} / ${formatMoney(budget.monthlyLimit, budget.currency)}.` };
  }
  if (budget.dailyLimit !== undefined && dailyCost >= budget.dailyLimit) {
    return { level: 'warning', message: `Daily budget reached: ${formatMoney(dailyCost, budget.currency)} / ${formatMoney(budget.dailyLimit, budget.currency)}.` };
  }
  return { level: 'ok', message: `Budget OK: today ${formatMoney(dailyCost, budget.currency)}, month ${formatMoney(monthlyCost, budget.currency)}.` };
}

function sumCost(records) {
  return records.reduce((sum, record) => sum + (record.usage.estimatedCost ?? 0), 0);
}

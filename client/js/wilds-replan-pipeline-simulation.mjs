import { processReplanBatch } from './wilds-replan-worker.mjs';
import { validateWorldRoute } from './wilds-route-validation.mjs';
import { getReplanDecision } from './wilds-replan-policy.mjs';

// Deterministic, renderer-free test pipeline. Costs are caller-supplied units,
// not wall-clock timings; no world/entity state is mutated.
export async function simulateReplanPipeline({
  queue = [],
  maxRequests = 8,
  planRoute,
  isBlocked,
  isOutsidePlayableArea = () => false,
  sampleSpacing = 0.75,
  maxSamples = 5000,
  nowMs,
  retryStateByEntity = {},
  cooldownMs = 1000,
  maxAttempts = 3,
  resetAfterMs = 10000,
  estimateCostUnits,
} = {}) {
  if (typeof isBlocked !== 'function' ||
      typeof isOutsidePlayableArea !== 'function' ||
      !Number.isFinite(nowMs) ||
      !retryStateByEntity || typeof retryStateByEntity !== 'object' ||
      Array.isArray(retryStateByEntity) ||
      (estimateCostUnits !== undefined && typeof estimateCostUnits !== 'function')) return null;

  const batch = await processReplanBatch(queue, { maxRequests, planRoute });
  if (!batch) return null;

  const outcomes = [];
  let estimatedCostUnits = 0;
  let validatedRoutes = 0;
  let invalidRoutes = 0;
  let plannerErrors = 0;
  let validationSamples = 0;

  for (const item of batch.outcomes) {
    const prior = retryStateByEntity[item.entityId] ?? { attempts: 0, lastAttemptMs: null };
    const priorAttempts = prior.attempts ?? 0;
    const priorLastAttemptMs = prior.lastAttemptMs ?? null;
    if (!Number.isInteger(priorAttempts) || priorAttempts < 0 ||
        (priorLastAttemptMs !== null && !Number.isFinite(priorLastAttemptMs))) return null;

    let costUnits = 0;
    try {
      const rawCost = estimateCostUnits
        ? estimateCostUnits(item)
        : item.result && Number.isFinite(item.result.costUnits) ? item.result.costUnits : 0;
      if (!Number.isFinite(rawCost) || rawCost < 0) {
        outcomes.push({ entityId: item.entityId, status: 'invalid-cost-estimate', costUnits: 0 });
        continue;
      }
      costUnits = rawCost;
    } catch (error) {
      outcomes.push({
        entityId: item.entityId,
        status: 'cost-estimator-error',
        error: error instanceof Error ? error.message : String(error),
        costUnits: 0,
      });
      continue;
    }
    estimatedCostUnits += costUnits;

    if (item.status === 'planner-error' || item.status === 'no-route-result') {
      plannerErrors += item.status === 'planner-error' ? 1 : 0;
      const decision = getReplanDecision({
        routeMissing: true, nowMs,
        lastAttemptMs: priorLastAttemptMs,
        attempts: priorAttempts,
        cooldownMs, maxAttempts, resetAfterMs,
      });
      outcomes.push({
        entityId: item.entityId,
        status: item.status,
        error: item.error,
        costUnits,
        retry: decision,
        nextRetryState: { attempts: priorAttempts + 1, lastAttemptMs: nowMs },
      });
      continue;
    }

    const route = item.result && Array.isArray(item.result.path) ? item.result.path : null;
    const validation = validateWorldRoute({
      path: route,
      isBlocked,
      isOutsidePlayableArea,
      sampleSpacing,
      maxSamples,
    });
    if (validation) validationSamples += validation.samplesChecked ?? 0;

    if (!validation || !validation.valid) {
      invalidRoutes++;
      const decision = getReplanDecision({
        blocked: true, nowMs,
        lastAttemptMs: priorLastAttemptMs,
        attempts: priorAttempts,
        cooldownMs, maxAttempts, resetAfterMs,
      });
      outcomes.push({
        entityId: item.entityId,
        status: 'route-invalid',
        validation: validation ?? { valid: false, reason: 'invalid-route-input' },
        costUnits,
        retry: decision,
        nextRetryState: { attempts: priorAttempts + 1, lastAttemptMs: nowMs },
      });
      continue;
    }

    validatedRoutes++;
    outcomes.push({
      entityId: item.entityId,
      status: 'route-validated',
      validation,
      costUnits,
      retry: { shouldReplan: false, reason: 'route-usable', attempts: priorAttempts, waitMs: 0 },
      nextRetryState: { attempts: 0, lastAttemptMs: priorLastAttemptMs },
    });
  }

  return {
    outcomes,
    remaining: batch.remaining,
    metrics: {
      requested: batch.processedCount,
      validatedRoutes,
      invalidRoutes,
      plannerErrors,
      validationSamples,
      estimatedCostUnits,
      costMetric: 'deterministic-estimated-units-not-wall-clock',
    },
    nowMs,
  };
}

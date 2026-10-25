/**
 * Bridges the research-only model catalog to the avatar build workflow.
 * This adapter creates plans only; it never treats a candidate as a runtime asset.
 */
export function createCandidateBuildPlan(catalog, candidateId, collectionKey) {
  if (!catalog || catalog.status !== 'research-only' || !Array.isArray(catalog.candidates)) {
    throw new TypeError('A research-only model candidate catalog is required');
  }
  const collectionAllowed = ['racc', '589', 'fk'].includes(collectionKey);
  if (!collectionAllowed) throw new RangeError('Unknown target collection: ' + String(collectionKey));
  const candidate = catalog.candidates.find(item => item.id === candidateId);
  if (!candidate) throw new RangeError('Unknown model candidate: ' + String(candidateId));
  if (candidate.intendedCollection !== collectionKey && candidate.intendedCollection !== 'shared-technical') {
    return {
      ok: false,
      status: 'blocked',
      collectionKey,
      candidateId,
      reason: 'collection-mismatch',
      message: 'Candidate is scoped to ' + candidate.intendedCollection + ', not ' + collectionKey
    };
  }
  return {
    ok: true,
    status: 'research-plan',
    collectionKey,
    candidateId: candidate.id,
    sourceUrl: candidate.sourceUrl || null,
    purpose: candidate.purpose,
    reportedLicense: candidate.reportedLicense,
    gates: {
      sourceArchiveCaptured: false,
      licenseEvidenceReviewed: false,
      rightsApproved: false,
      technicalImportPassed: false,
      rigCompatibilityPassed: false,
      collectionVisualQaPassed: false,
      performanceProfiled: false
    },
    runtimeEligible: false,
    warning: 'Research plan only. This record cannot be passed to the runtime adapter as an approved GLB.'
  };
}

export function candidatePlanCanShip(plan) {
  // Research plans are never shippable, even if a caller mutates gate booleans.
  // Shipping requires a separate, provenance-backed approval record and runtime adapter.
  return false;
}

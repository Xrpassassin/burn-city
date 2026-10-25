import { approvedLocalAvatarPath, loadApprovedAvatar } from './approved-avatar-loader.mjs';
// This accepts only a trusted, server-issued runtime record. It never derives ownership from URL parameters.
export async function bootstrapApprovedCrew({ runtime, loader, attach }) {
  if (!approvedLocalAvatarPath(runtime)) return { ok: false, reason: 'unapproved-asset-path' };
  if (typeof attach !== 'function') return { ok: false, reason: 'missing-attachment' };
  const loaded = await loadApprovedAvatar(runtime, loader);
  if (!loaded.ok) return loaded;
  const attached = attach(loaded.model, runtime);
  if (!attached?.ok) return { ok: false, reason: attached?.reason || 'attachment-failed' };
  return { ok: true, model: loaded.model, animations: loaded.animations };
}

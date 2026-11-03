// Abortable, bounded transport for Homefront's optional direct-input preview.
// This sends only player intent; game authority stays on the server.
export const HOMEFRONT_INPUT_TIMEOUT_MS = 1800;
export function createHomefrontMoveTransport({
  api,
  token,
  fetchImpl = globalThis.fetch,
  timeoutMs = HOMEFRONT_INPUT_TIMEOUT_MS
} = {}) {
  if (typeof api !== 'string' || !api.startsWith('/')) throw new Error('invalid_homefront_api_base');
  if (typeof token !== 'function' || typeof fetchImpl !== 'function') throw new Error('homefront_transport_dependencies_required');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 4000) throw new Error('invalid_homefront_movement_timeout');
  return async command => {
    const credential = token();
    if (typeof credential !== 'string' || !credential) throw new Error('sign_in_with_xaman');
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(api + '/api/homefront/world/move-input', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + credential,
          'content-type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify(command)
      });
      const data = await response.json();
      if (!response.ok || data?.error) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'continuous_input_failed');
      }
      if (!data?.inputAck || !Number.isSafeInteger(data.inputAck.sequence) ||
          !Number.isFinite(data.inputAck.x) || !Number.isFinite(data.inputAck.z)) {
        throw new Error('movement_ack_mismatch');
      }
      return data;
    } catch (error) {
      if (timedOut || controller.signal.aborted) throw new Error('movement_network_timeout');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

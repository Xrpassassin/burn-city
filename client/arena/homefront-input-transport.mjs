// Abortable, bounded transport for Homefront's optional direct-input preview.
// This sends only player intent; game authority stays on the server.
export const HOMEFRONT_INPUT_TIMEOUT_MS = 1800;
function createTransport({
  api,
  token,
  fetchImpl = globalThis.fetch,
  timeoutMs = HOMEFRONT_INPUT_TIMEOUT_MS
} = {}, resync = false) {
  const base = typeof api === 'string' ? api.replace(/\/+$/, '') : '';
  // Do not expose bearer tokens to insecure remote URLs supplied via ?api=.
  // A user-supplied ?api= URL must not redirect an existing bearer
  // token to an arbitrary HTTPS domain. Only this page's origin, the
  // production game host, localhost dev and relative same-origin routes
  // may receive authenticated movement packets.
  const currentOrigin = typeof globalThis.location?.origin === 'string'
    ? globalThis.location.origin : null;
  const trusted = new Set(['https://burn-city-game.fly.dev']);
  if (currentOrigin) trusted.add(currentOrigin);
  const safe = trusted.has(base) ||
    /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(base) ||
    (api === '/' || (base.startsWith('/') && !base.startsWith('//') && !/[?#]/.test(base)));
  if (!safe) throw new Error('invalid_homefront_api_base');
  if (typeof token !== 'function' || typeof fetchImpl !== 'function') throw new Error('homefront_transport_dependencies_required');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 4000) throw new Error('invalid_homefront_movement_timeout');
  return async command => {
    const credential = token();
    if (typeof credential !== 'string' || !credential) throw new Error('sign_in_with_xaman');
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(base + (resync?'/api/homefront/world':'/api/homefront/world/move-input'), {
        method: resync?'GET':'POST',
        headers: {
          authorization: 'Bearer ' + credential,
          'content-type': 'application/json'
        },
        signal: controller.signal,
        ...(resync?{}:{body:JSON.stringify(command)})
      });
      const data = await response.json();
      if(token()!==credential)throw Error('sign_in_with_xaman');
      if (!response.ok || data?.error) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'continuous_input_failed');
      }
      if(resync){
        if(typeof data?.inputProtocol?.enabled!=='boolean')throw Error('movement_resync_invalid');
        return data;
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

export const createHomefrontMoveTransport=options=>createTransport(options);
export const createHomefrontResyncTransport=options=>createTransport(options,true);

'use strict';
// One live authority for saved survivors and admitted, temporary visitors.
// Only the world file crosses this boundary; guest bases/RPG saves stay in RAM.
const WORLD_FILE = 'homefront-world.json';
const GUEST = /guest_[a-f0-9]{18,24}/;

function withoutGuests(value, remove = text => GUEST.test(text)) {
  if (typeof value === 'string') return remove(value) ? null : value;
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.filter(v => typeof v !== 'string' || !remove(v))
    .map(v => withoutGuests(v, remove));
  const result = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (!remove(key)) result[key] = withoutGuests(item, remove);
  }
  return result;
}

function createOverworld({ store }) {
  let live;
  const guests = new Set();
  const authority = {
    load(name, fallback) {
      if (name !== WORLD_FILE) return store.load(name, fallback);
      if (!live) live = structuredClone(store.load(name, fallback));
      return structuredClone(live);
    },
    save(name, value) {
      if (name !== WORLD_FILE) return store.save(name, value);
      // Persistence receives neither guest inventory, reservations, vehicles,
      // account-owned interior evidence nor resumable guest identities.
      store.save(name, withoutGuests(value));
      live = structuredClone(value);
    }
  };
  return {
    store: authority,
    admit(account, personal) {
      if (!/^guest_[a-f0-9]{24}$/.test(account) || guests.has(account)) throw Error('invalid_guest_admission');
      guests.add(account);
      return {
        load(name, fallback) {
          if (!guests.has(account)) throw Error('guest_session_expired');
          return (name === WORLD_FILE ? authority : personal).load(name, fallback);
        },
        save(name, value) {
          if (!guests.has(account)) throw Error('guest_session_expired');
          return (name === WORLD_FILE ? authority : personal).save(name, value);
        }
      };
    },
    release(account) {
      if (!guests.delete(account) || !live) return;
      // Reclaim temporary gates and all account-owned world state immediately,
      // including when another session replaces this tab or it idles out.
      live = withoutGuests(live, text => text.includes(account));
    }
  };
}

module.exports = { createOverworld };

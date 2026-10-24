// Homefront authored interior floorplans and room-state rules.
// Geometry is presentation-only; room search rewards must be granted by the server in a later API integration.
export const INTERIOR_VERSION = 1;

const room = (id, title, x, z, description, exits = []) => Object.freeze({
  id, title, x, z, width: 4.8, depth: 4.8, description, exits: Object.freeze(exits)
});
const target = (id, label, roomId, x, z, action, text, requires = []) => Object.freeze({
  id, label, roomId, x, z, action, text, requires: Object.freeze(requires)
});
const blueprint = (landmarkId, title, rooms, interactables, entryRoom = rooms[0].id) => Object.freeze({
  landmarkId, title, entryRoom, rooms: Object.freeze(rooms), interactables: Object.freeze(interactables)
});

export const INTERIORS = Object.freeze([
  blueprint('north_bus_depot', 'North Bus Depot — Dispatch Office', [
    room('dispatch', 'Dispatch Office', 0, 0, 'A smashed desk, route boards, and the last shift log.', [{ id: 'office_door', to: 'bus_bays', side: 'east', label: 'Bus-bay door' }]),
    room('bus_bays', 'Bus Bays', 5.4, 0, 'Two stranded coaches block the service lane.', [{ id: 'office_door', to: 'dispatch', side: 'west', label: 'Dispatch door' }])
  ], [
    target('dispatch_drawer', 'Dispatch drawer', 'dispatch', -1.1, -0.7, 'search', 'The drawer is jammed; a pry tool would make this faster.'),
    target('route_board', 'Evacuation route board', 'dispatch', 1.15, -1.1, 'clue', 'A hand-drawn route marks the River Checkpoint and a convoy turnoff.'),
    target('bus_luggage', 'Abandoned luggage', 'bus_bays', 6.1, 0.7, 'search', 'A torn bag and a child’s name tag lie under the seat.')
  ]),
  blueprint('collapsed_apartments', 'Collapsed Apartments — Upper Flat', [
    room('lobby', 'Ground-floor Lobby', 0, 0, 'The stairwell has pancaked; a fire escape is the only route up.', [{ id: 'fire_escape', to: 'upper_flat', side: 'north', label: 'Fire escape' }]),
    room('upper_flat', 'Upper Apartment', 0, -5.4, 'A distress light flashes through a cracked bedroom door.', [{ id: 'fire_escape', to: 'lobby', side: 'south', label: 'Fire escape ladder' }])
  ], [
    target('rubble_gap', 'Collapsed stairwell', 'lobby', -1.1, 0.9, 'inspect', 'Fresh scrape marks show that someone climbed through the rubble recently.'),
    target('distress_light', 'Distress light', 'upper_flat', 1.1, -6.1, 'clue', 'Three short flashes repeat: a survivor is signaling, not a random light.')
  ]),
  blueprint('exchange_market', 'Exchange Market — Staff Passage', [
    room('market_floor', 'Market Floor', 0, 0, 'Shelves are stripped bare; a security shutter rattles in the draft.', [{ id: 'stockroom_door', to: 'stockroom', side: 'east', label: 'Stockroom door' }]),
    room('stockroom', 'Stockroom', 5.4, 0, 'Boxes are stacked around a locked staff cabinet.', [{ id: 'stockroom_door', to: 'market_floor', side: 'west', label: 'Market floor door' }, { id: 'loading_dock', to: 'loading_dock', side: 'north', label: 'Loading-dock latch' }]),
    room('loading_dock', 'Loading Dock', 5.4, -5.4, 'A narrow service passage slips behind the market toward the cache office.', [{ id: 'loading_dock', to: 'stockroom', side: 'south', label: 'Stockroom latch' }])
  ], [
    target('rolling_shutter', 'Rolling shutter control', 'market_floor', -1.1, 0.7, 'toggle', 'The shutter motor grinds loudly; noise here could draw infected.'),
    target('stockroom_shelves', 'Stockroom shelves', 'stockroom', 6.2, 0.8, 'search', 'The shelves have been picked over, but a sealed case remains.'),
    target('loading_dock_latch', 'Loading-dock latch', 'loading_dock', 6.2, -6.2, 'unlock', 'A bent latch holds the service door shut.')
  ]),
  blueprint('mercy_hospital', 'St. Mercy — Emergency Wing', [
    room('emergency_lobby', 'Emergency Lobby', 0, 0, 'Triage signs point toward a dark ward and a manual generator switch.', [{ id: 'ward_door', to: 'ward_corridor', side: 'east', label: 'Ward door' }]),
    room('ward_corridor', 'Ward Corridor', 5.4, 0, 'Beds and oxygen bottles choke the corridor.', [{ id: 'ward_door', to: 'emergency_lobby', side: 'west', label: 'Lobby door' }, { id: 'pharmacy_door', to: 'pharmacy', side: 'north', label: 'Pharmacy door', requires: ['emergency_power'] }]),
    room('pharmacy', 'Pharmacy', 5.4, -5.4, 'A reinforced medicine cabinet sits behind a dead keypad.', [{ id: 'pharmacy_door', to: 'ward_corridor', side: 'south', label: 'Pharmacy door' }])
  ], [
    target('generator_switch', 'Emergency generator switch', 'emergency_lobby', -1.1, 0.7, 'power', 'The generator can restore power to the ward and pharmacy access controls.'),
    target('patient_chart', 'Patient transfer chart', 'ward_corridor', 6.1, 0.8, 'clue', 'The chart records a transfer to Blackglass Annex after the evacuation order.'),
    target('emergency_locker', 'Emergency medicine locker', 'pharmacy', 6.1, -6.2, 'search', 'The cabinet is intact; server-side loot is not granted by this inspection layer.', ['emergency_power'])
  ]),
  blueprint('ironworks', 'Ironworks — Maintenance Gantry', [
    room('yard_floor', 'Yard Floor', 0, 0, 'A gantry ladder climbs above a noisy conveyor line.', [{ id: 'gantry_ladder', to: 'gantry_catwalk', side: 'north', label: 'Gantry ladder' }]),
    room('gantry_catwalk', 'Gantry Catwalk', 0, -5.4, 'A narrow catwalk overlooks the tool cage and the live power bus.', [{ id: 'gantry_ladder', to: 'yard_floor', side: 'south', label: 'Gantry ladder' }, { id: 'tool_cage', to: 'maintenance_shed', side: 'east', label: 'Tool-cage gate', requires: ['power_cut'] }]),
    room('maintenance_shed', 'Maintenance Shed', 5.4, -5.4, 'A locked tool cage and a maintenance log are tucked behind the breaker cabinet.', [{ id: 'tool_cage', to: 'gantry_catwalk', side: 'west', label: 'Tool-cage gate' }])
  ], [
    target('power_isolator', 'Power isolator', 'yard_floor', -1.1, 0.7, 'power', 'Cutting the feed quiets the conveyor and releases the tool-cage lock.'),
    target('gantry_console', 'Gantry console', 'gantry_catwalk', 1.1, -6.2, 'clue', 'The maintenance log lists a second power cell moved to Blackglass.'),
    target('tool_crate', 'Sealed tool crate', 'maintenance_shed', 6.1, -6.2, 'search', 'A sealed crate is ready for a server-authoritative salvage action.', ['power_cut'])
  ]),
  blueprint('buried_subway', 'Buried Subway — Signal Rooms', [
    room('ticket_hall', 'Ticket Hall', 0, 0, 'Floodwater covers the turnstiles; a maintenance hatch opens toward the platform.', [{ id: 'platform_gate', to: 'platform', side: 'east', label: 'Platform gate' }]),
    room('platform', 'Buried Platform', 5.4, 0, 'A stalled train blocks half the platform and hides the far end.', [{ id: 'platform_gate', to: 'ticket_hall', side: 'west', label: 'Ticket-hall gate' }, { id: 'signal_door', to: 'signal_room', side: 'north', label: 'Signal-room door' }]),
    room('signal_room', 'Signal Room', 5.4, -5.4, 'A battery-backed console repeats the same platform number as the hospital transfer chart.', [{ id: 'signal_door', to: 'platform', side: 'south', label: 'Platform door' }])
  ], [
    target('ticket_gate', 'Turnstile release', 'ticket_hall', -1.1, 0.7, 'unlock', 'The emergency release lever bypasses the jammed turnstiles.'),
    target('signal_panel', 'Signal panel', 'signal_room', 6.1, -6.2, 'clue', 'The signal log confirms a sealed transfer route into Blackglass Annex.'),
    target('maintenance_hatch', 'Maintenance hatch', 'platform', 6.1, 0.8, 'unlock', 'The hatch is a risky alternate route back toward the surface.')
  ]),
  blueprint('research_annex', 'Blackglass Annex — Containment', [
    room('decon_lock', 'Decontamination Lock', 0, 0, 'The airlock is sealed; the emergency bus feeds the inner doors.', [{ id: 'containment_door', to: 'containment_hall', side: 'east', label: 'Containment door', requires: ['blackglass_power'] }]),
    room('containment_hall', 'Containment Hall', 5.4, 0, 'Reinforced glass is spiderwebbed from impacts on the other side.', [{ id: 'containment_door', to: 'decon_lock', side: 'west', label: 'Airlock door' }, { id: 'archive_door', to: 'archive_vault', side: 'north', label: 'Archive vault', requires: ['incident_clue'] }]),
    room('archive_vault', 'Archive Vault', 5.4, -5.4, 'The incident record is stored on a terminal behind a manual archive lock.', [{ id: 'archive_door', to: 'containment_hall', side: 'south', label: 'Archive door' }])
  ], [
    target('power_bus', 'Emergency power bus', 'decon_lock', -1.1, 0.7, 'power', 'A manual bypass restores power to the inner containment doors.'),
    target('containment_lock', 'Containment control', 'containment_hall', 6.1, 0.8, 'inspect', 'Something hit the glass from inside; the control log shows a manual override.'),
    target('terminal_archive', 'Incident archive terminal', 'archive_vault', 6.1, -6.2, 'clue', 'The Blackglass incident record connects the hospital transfer and the buried line.', ['incident_clue'])
  ])
]);

export function interiorForLandmark(landmarkId) {
  return INTERIORS.find(item => item.landmarkId === landmarkId) || null;
}
export function interiorRoom(interior, roomId) {
  return interior?.rooms.find(item => item.id === roomId) || null;
}
export function createInteriorState(landmarkId) {
  const interior = interiorForLandmark(landmarkId);
  if (!interior) return null;
  return { landmarkId, roomId: interior.entryRoom, flags: [], discovered: [], used: [], openedDoors: [], noise: 0 };
}
export function availableInteriorActions(interior, state) {
  if (!interior || !state || state.landmarkId !== interior.landmarkId) return [];
  return interior.interactables.filter(item => item.roomId === state.roomId && item.requires.every(flag => state.flags.includes(flag)) && !state.used.includes(item.id));
}
export function applyInteriorAction(interior, state, actionId) {
  if (!interior || !state || state.landmarkId !== interior.landmarkId) throw new Error('interior_state_mismatch');
  const item = interior.interactables.find(target => target.id === actionId);
  if (!item || item.roomId !== state.roomId || !item.requires.every(flag => state.flags.includes(flag))) throw new Error('interior_action_unavailable');
  const next = { ...state, flags: [...state.flags], discovered: [...state.discovered], used: [...state.used], openedDoors: [...(state.openedDoors || [])] };
  if (item.action === 'clue') {
    if (!next.discovered.includes(item.id)) next.discovered.push(item.id);
    if (item.id === 'patient_chart') next.flags.push('incident_clue');
    if (item.id === 'signal_panel') next.flags.push('incident_clue');
    if (item.id === 'route_board') next.flags.push('evacuation_route');
  } else if (item.action === 'power') {
    const flag = item.id === 'generator_switch' ? 'emergency_power' : item.id === 'power_isolator' ? 'power_cut' : 'blackglass_power';
    if (!next.flags.includes(flag)) next.flags.push(flag);
    next.used.push(item.id);
    next.noise = Math.min(100, next.noise + (item.id === 'rolling_shutter' ? 30 : 8));
  } else if (item.action === 'toggle') {
    next.used.push(item.id);
    next.noise = Math.min(100, next.noise + 35);
  } else if (item.action === 'unlock') {
    next.flags.push(item.id === 'loading_dock_latch' ? 'loading_dock_open' : item.id === 'tool_crate' ? 'tool_cage_open' : item.id + '_open');
    next.used.push(item.id);
    next.noise = Math.min(100, next.noise + 10);
  } else if (item.action === 'search') {
    next.used.push(item.id);
    next.noise = Math.min(100, next.noise + 5);
  } else if (item.action === 'inspect') {
    next.used.push(item.id);
  }
  next.flags = [...new Set(next.flags)];
  return { state: next, item, message: item.text, serverRewardRequired: item.action === 'search' };
}
export function traverseInteriorDoor(interior, state, doorId) {
  if (!interior || !state || state.landmarkId !== interior.landmarkId) throw new Error('interior_state_mismatch');
  const current = interiorRoom(interior, state.roomId);
  const exit = current?.exits.find(item => item.id === doorId);
  if (!exit) throw new Error('interior_door_unavailable');
  if (exit.requires && !exit.requires.every(flag => state.flags.includes(flag))) throw new Error('interior_door_locked');
  if (!interiorRoom(interior, exit.to)) throw new Error('interior_room_missing');
  return { ...state, roomId: exit.to, openedDoors: [...new Set([...(state.openedDoors || []), doorId])] };
}

// Open-roof, low-poly room shells let players read the interior layout in third person.
// Each room has a real floor, low walls, door gaps, and visible door/interactable props.
export function buildInteriorSetPiece(THREE, interior, origin = { x: 0, y: 0, z: 0 }) {
  if (!THREE || typeof THREE.Group !== 'function' || typeof THREE.Mesh !== 'function') throw new TypeError('Three.js namespace is required');
  if (!interior || !Array.isArray(interior.rooms)) throw new TypeError('valid interior blueprint is required');
  const root = new THREE.Group();
  root.name = 'homefront-interior:' + interior.landmarkId;
  root.position.set(origin.x, origin.y, origin.z);
  root.userData.interiorLandmarkId = interior.landmarkId;
  const material = color => new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const floorMat = material(0x4b4940), wallMat = material(0x5b554b), trimMat = material(0x7a5c42);
  const objectMat = material(0x393b37), clueMat = material(0x9e7944), powerMat = material(0x647d70), glassMat = material(0x405357);
  const box = (parent, size, position, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.position.set(...position); mesh.userData.interiorLandmarkId = interior.landmarkId; parent.add(mesh); return mesh;
  };
  const wall = (parent, room, side, gap = false) => {
    const { width: w, depth: d } = room, t = 0.16, h = 2.45;
    const alongX = side === 'north' || side === 'south';
    const length = alongX ? w : d;
    const z = side === 'north' ? -d / 2 : side === 'south' ? d / 2 : room.z;
    const x = side === 'west' ? room.x - w / 2 : side === 'east' ? room.x + w / 2 : room.x;
    const fixed = alongX ? z : x;
    const base = alongX ? room.x : room.z;
    const wallPosition = (offset, segment) => alongX ? [base + offset, h / 2, fixed] : [fixed, h / 2, base + offset];
    if (!gap) { box(parent, alongX ? [length, h, t] : [t, h, length], wallPosition(0), wallMat); return; }
    const gapWidth = 1.35, segment = (length - gapWidth) / 2;
    box(parent, alongX ? [segment, h, t] : [t, h, segment], wallPosition(-(gapWidth + segment) / 2), wallMat);
    box(parent, alongX ? [segment, h, t] : [t, h, segment], wallPosition((gapWidth + segment) / 2), wallMat);
  };
  const hasExit = (r, side) => r.exits.some(exit => exit.side === side);
  for (const r of interior.rooms) {
    box(root, [r.width, 0.16, r.depth], [r.x, -0.08, r.z], floorMat);
    for (const side of ['north','south','east','west']) wall(root, r, side, hasExit(r, side));
    // A small wall-mounted emergency light gives the roofless floorplan readable depth.
    box(root, [0.28, 0.12, 0.12], [r.x - r.width * 0.32, 1.75, r.z - r.depth / 2 + 0.16], clueMat);
    for (const exit of r.exits) {
      const door = new THREE.Group();
      const doorX = exit.side === 'east' ? r.x + r.width / 2 : exit.side === 'west' ? r.x - r.width / 2 : r.x;
      const doorZ = exit.side === 'north' ? r.z - r.depth / 2 : exit.side === 'south' ? r.z + r.depth / 2 : r.z;
      const doorPosition = exit.side === 'east' ? [doorX, 0, r.z] : exit.side === 'west' ? [doorX, 0, r.z] : [r.x, 0, doorZ];
      door.position.set(...doorPosition);
      if (exit.side === 'east' || exit.side === 'west') door.rotation.y = Math.PI / 2;
      door.userData.interiorTarget = { kind: 'door', landmarkId: interior.landmarkId, doorId: exit.id, label: exit.label, x: origin.x + doorX, z: origin.z + doorZ };
      box(door, [0.12, 2.1, 0.12], [-0.68, 1.05, 0], trimMat);
      box(door, [0.12, 2.1, 0.12], [0.68, 1.05, 0], trimMat);
      box(door, [1.48, 0.12, 0.12], [0, 2.1, 0], trimMat);
      const slab = box(door, [1.25, 1.95, 0.08], [0, 0.98, 0], glassMat);
      slab.userData.interiorDoorSlab = true;
      slab.userData.interiorDoorId = exit.id;
      root.add(door);
    }
  }
  for (const item of interior.interactables) {
    const roomData = interiorRoom(interior, item.roomId);
    const object = new THREE.Group();
    object.position.set(item.x, 0, item.z);
    object.userData.interiorTarget = { kind: 'action', landmarkId: interior.landmarkId, actionId: item.id, label: item.label, x: origin.x + item.x, z: origin.z + item.z };
    const color = item.action === 'power' ? powerMat : item.action === 'clue' ? clueMat : objectMat;
    if (item.action === 'search') {
      box(object, [0.9, 0.65, 0.55], [0, 0.33, 0], objectMat);
      box(object, [0.94, 0.08, 0.59], [0, 0.69, 0], trimMat);
    } else if (item.action === 'power' || item.action === 'toggle' || item.action === 'unlock') {
      box(object, [0.45, 0.72, 0.14], [0, 0.36, 0], color);
      box(object, [0.24, 0.12, 0.05], [0, 0.48, 0.1], clueMat);
    } else {
      box(object, [0.7, 0.08, 0.5], [0, 0.75, 0], trimMat);
      box(object, [0.08, 0.68, 0.08], [-0.27, 0.34, -0.16], objectMat);
      box(object, [0.08, 0.68, 0.08], [0.27, 0.34, -0.16], objectMat);
      box(object, [0.45, 0.04, 0.3], [0, 0.81, 0], color);
    }
    object.userData.interiorRoomId = roomData.id;
    root.add(object);
  }
  return root;
}

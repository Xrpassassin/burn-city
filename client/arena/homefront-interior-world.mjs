// Homefront authored interior floorplans and room-state rules.
// Geometry is presentation-only; room search rewards must be granted by the server in a later API integration.
export const INTERIOR_VERSION = 1;

const room = (id, title, x, z, description, exits = [], elevation = 0) => Object.freeze({
  id, title, x, z, elevation, width: 4.8, depth: 4.8, description, exits: Object.freeze(exits)
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
    room('bus_bays', 'Bus Bays', 4.8, 0, 'Two stranded coaches block the service lane.', [{ id: 'office_door', to: 'dispatch', side: 'west', label: 'Dispatch door' }])
  ], [
    target('dispatch_drawer', 'Dispatch drawer', 'dispatch', -1.1, -0.7, 'search', 'The drawer is jammed; a pry tool would make this faster.'),
    target('route_board', 'Evacuation route board', 'dispatch', 1.15, -1.1, 'clue', 'A hand-drawn route marks the River Checkpoint and a convoy turnoff.'),
    target('bus_luggage', 'Abandoned luggage', 'bus_bays', 6.1, 0.7, 'search', 'A torn bag and a child’s name tag lie under the seat.')
  ]),
  blueprint('collapsed_apartments', 'Collapsed Apartments — Upper Flat', [
    room('lobby', 'Ground-floor Lobby', 0, 0, 'The stairwell has pancaked; a fire escape is the only route up.', [{ id: 'fire_escape', to: 'upper_flat', side: 'north', label: 'Fire escape' }]),
    room('upper_flat', 'Upper Apartment', 0, -4.8, 'A distress light flashes through a cracked bedroom door.', [{ id: 'fire_escape', to: 'lobby', side: 'south', label: 'Fire escape ladder' }], 3.2)
  ], [
    target('rubble_gap', 'Collapsed stairwell', 'lobby', -1.1, 0.9, 'inspect', 'Fresh scrape marks show that someone climbed through the rubble recently.'),
    target('distress_light', 'Distress light', 'upper_flat', 1.1, -6.1, 'clue', 'Three short flashes repeat: a survivor is signaling, not a random light.')
  ]),
  blueprint('exchange_market', 'Exchange Market — Staff Passage', [
    room('market_floor', 'Market Floor', 0, 0, 'Shelves are stripped bare; a security shutter rattles in the draft.', [{ id: 'stockroom_door', to: 'stockroom', side: 'east', label: 'Stockroom door' }]),
    room('stockroom', 'Stockroom', 4.8, 0, 'Boxes are stacked around a locked staff cabinet.', [{ id: 'stockroom_door', to: 'market_floor', side: 'west', label: 'Market floor door' }, { id: 'loading_dock', to: 'loading_dock', side: 'north', label: 'Loading-dock latch' }]),
    room('loading_dock', 'Loading Dock', 4.8, -4.8, 'A narrow service passage slips behind the market toward the cache office.', [{ id: 'loading_dock', to: 'stockroom', side: 'south', label: 'Stockroom latch' }])
  ], [
    target('rolling_shutter', 'Rolling shutter control', 'market_floor', -1.1, 0.7, 'toggle', 'The shutter motor grinds loudly; noise here could draw infected.'),
    target('stockroom_shelves', 'Stockroom shelves', 'stockroom', 6.2, 0.8, 'search', 'The shelves have been picked over, but a sealed case remains.'),
    target('loading_dock_latch', 'Loading-dock latch', 'loading_dock', 6.2, -6.2, 'unlock', 'A bent latch holds the service door shut.')
  ]),
  blueprint('mercy_hospital', 'St. Mercy — Emergency Wing', [
    room('emergency_lobby', 'Emergency Lobby', 0, 0, 'Triage signs point toward a dark ward and a manual generator switch.', [{ id: 'ward_door', to: 'ward_corridor', side: 'east', label: 'Ward door' }]),
    room('ward_corridor', 'Ward Corridor', 4.8, 0, 'Beds and oxygen bottles choke the corridor.', [{ id: 'ward_door', to: 'emergency_lobby', side: 'west', label: 'Lobby door' }, { id: 'pharmacy_door', to: 'pharmacy', side: 'north', label: 'Pharmacy door', requires: ['emergency_power'] }]),
    room('pharmacy', 'Pharmacy', 4.8, -4.8, 'A reinforced medicine cabinet sits behind a dead keypad.', [{ id: 'pharmacy_door', to: 'ward_corridor', side: 'south', label: 'Pharmacy door' }])
  ], [
    target('generator_switch', 'Emergency generator switch', 'emergency_lobby', -1.1, 0.7, 'power', 'The generator can restore power to the ward and pharmacy access controls.'),
    target('patient_chart', 'Patient transfer chart', 'ward_corridor', 6.1, 0.8, 'clue', 'The chart records a transfer to Blackglass Annex after the evacuation order.'),
    target('emergency_locker', 'Emergency medicine locker', 'pharmacy', 6.1, -6.2, 'search', 'The cabinet is intact; server-side loot is not granted by this inspection layer.', ['emergency_power'])
  ]),
  blueprint('ironworks', 'Ironworks — Maintenance Gantry', [
    room('yard_floor', 'Yard Floor', 0, 0, 'A gantry ladder climbs above a noisy conveyor line.', [{ id: 'gantry_ladder', to: 'gantry_catwalk', side: 'north', label: 'Gantry ladder' }]),
    room('gantry_catwalk', 'Gantry Catwalk', 0, -4.8, 'A narrow catwalk overlooks the tool cage and the live power bus.', [{ id: 'gantry_ladder', to: 'yard_floor', side: 'south', label: 'Gantry ladder' }, { id: 'tool_cage', to: 'maintenance_shed', side: 'east', label: 'Tool-cage gate', requires: ['power_cut'] }], 4.2),
    room('maintenance_shed', 'Maintenance Shed', 4.8, -4.8, 'A locked tool cage and a maintenance log are tucked behind the breaker cabinet.', [{ id: 'tool_cage', to: 'gantry_catwalk', side: 'west', label: 'Tool-cage gate' }], 4.2)
  ], [
    target('power_isolator', 'Power isolator', 'yard_floor', -1.1, 0.7, 'power', 'Cutting the feed quiets the conveyor and releases the tool-cage lock.'),
    target('gantry_console', 'Gantry console', 'gantry_catwalk', 1.1, -6.2, 'clue', 'The maintenance log lists a second power cell moved to Blackglass.'),
    target('tool_crate', 'Sealed tool crate', 'maintenance_shed', 6.1, -6.2, 'search', 'A sealed crate is ready for a server-authoritative salvage action.', ['power_cut'])
  ]),
  blueprint('ashfall_station', 'Ashfall Power Station — Service Wing', [
    room('security_entrance', 'Security Vestibule', 0, 0,
      'The access corridor is lined with abandoned radiation badges and empty guard lockers.',
      [{ id: 'ashfall_turbine_door', to: 'turbine_gallery', side: 'east', label: 'Turbine hall door' }]),
    room('turbine_gallery', 'Turbine Gallery', 4.8, 0,
      'A dead overhead crane crosses a row of silent turbine casings; the switchgear feeds an elevated control room.',
      [{ id: 'ashfall_turbine_door', to: 'security_entrance', side: 'west', label: 'Security door' },
       { id: 'ashfall_control_stairs', to: 'control_room', side: 'north', label: 'Control-room stairs', requires: ['ashfall_grid'] }]),
    room('control_room', 'Reactor Control Room', 4.8, -4.8,
      'Broken gauges face the distant cooling towers. The last shift log mentions containment shutters and a missing crew.',
      [{ id: 'ashfall_control_stairs', to: 'turbine_gallery', side: 'south', label: 'Control-room stairs' },
       { id: 'ashfall_pump_gate', to: 'cooling_pumps', side: 'west', label: 'Cooling-pump gate', requires: ['ashfall_grid'] }], 3.2),
    room('cooling_pumps', 'Cooling Pump Bay', 0, -4.8,
      'Dry pumping channels disappear under corroded gratings; an emergency supply crate remains sealed.',
      [{ id: 'ashfall_pump_gate', to: 'control_room', side: 'east', label: 'Pump-room gate' }], 3.2)
  ], [
    target('ashfall_breaker', 'Main switchgear isolator', 'security_entrance', -1.1, 0.7,
      'power', 'The shared service-wing bus powers the control stairs and pump-room interlock.'),
    target('ashfall_turbine_manifest', 'Turbine inspection log', 'turbine_gallery', 6.1, 0.8,
      'clue', 'The turbines were shut down three days before the evacuation.'),
    target('ashfall_operations_log', 'Control room incident record', 'control_room', 6.1, -6.2,
      'clue', 'A final operator logged rising pump temperatures and redirected crews to the Ironworks.'),
    target('ashfall_service_crate', 'Emergency station supply locker', 'cooling_pumps', -1.1, -6.2,
      'search', 'A few usable tools survived in a sealed emergency supply cabinet.', ['ashfall_grid'])
  ]),
  blueprint('wrecked_depot', 'Wrecked Freight Depot — Loading Rooms', [
    room('loading_office', 'Freight Office', 0, 0,
      'A shipping schedule hangs above the freight desk.',
      [{ id: 'depot_loading_gate', to: 'warehouse', side: 'east', label: 'Loading bay gate' }]),
    room('warehouse', 'Warehouse Bay', 4.8, 0,
      'Spilled cargo and toppled steel shelving surround a battered tool cabinet.',
      [{ id: 'depot_loading_gate', to: 'loading_office', side: 'west', label: 'Office gate' }])
  ], [
    target('depot_shipping_manifest', 'Transfer manifest', 'loading_office', -1.1, .7,
      'clue', 'The manifest marks an urgent replacement shipment to Ashfall.'),
    target('depot_tool_cabinet', 'Depot tool cabinet', 'warehouse', 6.1, .8,
      'search', 'There may be serviceable tools left beneath the fallen shelving.')
  ]),
  blueprint('old_rail_yard', 'Old Rail Yard — Signal Cabin', [
    room('signal_cabin', 'Signal Cabin', 0, 0,
      'An old switch diagram identifies the route toward the power plant.',
      [{ id: 'railcar_door', to: 'freight_car', side: 'north', label: 'Freight car door' }]),
    room('freight_car', 'Open Freight Car', 0, -4.8,
      'A derailed maintenance wagon still contains spare wiring and an emergency cache.',
      [{ id: 'railcar_door', to: 'signal_cabin', side: 'south', label: 'Signal cabin door' }])
  ], [
    target('rail_switch_diagram', 'Rail switch diagram', 'signal_cabin', -1.1, .7,
      'clue', 'A maintenance siding leads toward the western industrial sector.'),
    target('rail_signal_crate', 'Signal maintenance box', 'freight_car', -1.1, -6.2,
      'search', 'An emergency maintenance box is tucked below the wagon bench.')
  ]),
  blueprint('quarantine_shelter', 'Quarantine Shelter — Triage Isolation', [
    room('triage_desk', 'Triage Desk', 0, 0,
      'A damaged infection-control checklist is pinned beside the entry curtain.',
      [{ id: 'isolation_door', to: 'isolation_ward', side: 'east', label: 'Isolation bay door' }]),
    room('isolation_ward', 'Isolation Ward', 4.8, 0,
      'Empty camp beds and an abandoned medical cabinet fill the decontamination bay.',
      [{ id: 'isolation_door', to: 'triage_desk', side: 'west', label: 'Triage bay door' }])
  ], [
    target('triage_case_log', 'Patient movement log', 'triage_desk', -1.1, .7,
      'clue', 'A handwritten note orders all stable patients toward St. Mercy.'),
    target('shelter_cabinet', 'Triage medical cabinet', 'isolation_ward', 6.1, .8,
      'search', 'Some of the medical supplies were left behind during evacuation.')
  ]),
  blueprint('buried_subway', 'Buried Subway — Signal Rooms', [
    room('ticket_hall', 'Ticket Hall', 0, 0, 'Floodwater covers the turnstiles; a maintenance hatch opens toward the platform.', [{ id: 'platform_gate', to: 'platform', side: 'east', label: 'Platform gate' }]),
    room('platform', 'Buried Platform', 4.8, 0, 'A stalled train blocks half the platform and hides the far end.', [{ id: 'platform_gate', to: 'ticket_hall', side: 'west', label: 'Ticket-hall gate' }, { id: 'signal_door', to: 'signal_room', side: 'north', label: 'Signal-room door' }]),
    room('signal_room', 'Signal Room', 4.8, -4.8, 'A battery-backed console repeats the same platform number as the hospital transfer chart.', [{ id: 'signal_door', to: 'platform', side: 'south', label: 'Platform door' }])
  ], [
    target('ticket_gate', 'Turnstile release', 'ticket_hall', -1.1, 0.7, 'unlock', 'The emergency release lever bypasses the jammed turnstiles.'),
    target('signal_panel', 'Signal panel', 'signal_room', 6.1, -6.2, 'clue', 'The signal log confirms a sealed transfer route into Blackglass Annex.'),
    target('maintenance_hatch', 'Maintenance hatch', 'platform', 6.1, 0.8, 'unlock', 'The hatch is a risky alternate route back toward the surface.')
  ]),
  blueprint('research_annex', 'Blackglass Annex — Containment', [
    room('decon_lock', 'Decontamination Lock', 0, 0, 'The airlock is sealed; the emergency bus feeds the inner doors.', [{ id: 'containment_door', to: 'containment_hall', side: 'east', label: 'Containment door', requires: ['blackglass_power'] }]),
    room('containment_hall', 'Containment Hall', 4.8, 0, 'Reinforced glass is spiderwebbed from impacts on the other side.', [{ id: 'containment_door', to: 'decon_lock', side: 'west', label: 'Airlock door' }, { id: 'archive_door', to: 'archive_vault', side: 'north', label: 'Archive vault', requires: ['incident_clue'] }]),
    room('archive_vault', 'Archive Vault', 4.8, -4.8, 'The incident record is stored on a terminal behind a manual archive lock.', [{ id: 'archive_door', to: 'containment_hall', side: 'south', label: 'Archive door' }])
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
    const flag = item.id === 'generator_switch' ? 'emergency_power' : item.id === 'power_isolator' ? 'power_cut' : item.id === 'ashfall_breaker' ? 'ashfall_grid' : 'blackglass_power';
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
    if (item.id === 'containment_lock') next.flags.push('incident_clue');
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

const alongDoorAxis = (side, x, z, offset) => side === 'east' || side === 'west' ? ({ x, z: z + offset }) : ({ x: x + offset, z });

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
  const rubbleMat = material(0x62594e);
  const grimeMat = new THREE.MeshStandardMaterial({ color: 0x282b29, roughness: 1, transparent: true, opacity: 0.32, depthWrite: false });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffbd78, emissive: 0xff742e, emissiveIntensity: 0.65, roughness: 0.7 });
  const detailHash = value => { let h = 2166136261; for (const ch of value) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
  const detailRandom = (seed, lane) => { const n = Math.sin(seed * 12.9898 + lane * 78.233) * 43758.5453; return n - Math.floor(n); };
  const box = (parent, size, position, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.position.set(...position); mesh.userData.interiorLandmarkId = interior.landmarkId; parent.add(mesh); return mesh;
  };
  const wall = (parent, room, side, gap = false) => {
    const { width: w, depth: d } = room, t = 0.16, h = 2.45;
    const alongX = side === 'north' || side === 'south';
    const length = alongX ? w : d;
    const z = side === 'north' ? room.z - d / 2 : side === 'south' ? room.z + d / 2 : room.z;
    const x = side === 'west' ? room.x - w / 2 : side === 'east' ? room.x + w / 2 : room.x;
    const fixed = alongX ? z : x;
    const base = alongX ? room.x : room.z;
    const wallPosition = (offset, segment) => alongX ? [base + offset, room.elevation + h / 2, fixed] : [fixed, room.elevation + h / 2, base + offset];
    const wallMesh = (size, position) => {
      const mesh = box(parent, size, position, wallMat);
      // Camera-only occlusion tagging. Physical collision is owned by the server
      // and never inferred from graphics or hidden wall state.
      mesh.userData.interiorCameraOccluder = true;
    };
    if (!gap) { wallMesh(alongX ? [length, h, t] : [t, h, length], wallPosition(0)); return; }
    const gapWidth = 1.8, segment = (length - gapWidth) / 2;
    wallMesh(alongX ? [segment, h, t] : [t, h, segment], wallPosition(-(gapWidth + segment) / 2));
    wallMesh(alongX ? [segment, h, t] : [t, h, segment], wallPosition((gapWidth + segment) / 2));
  };
  const hasExit = (r, side) => r.exits.some(exit => exit.side === side);
  // Open-roof rooms get small batches of floor rubble, wall grime, and emergency lamps.
  // Instancing keeps the added environmental storytelling inexpensive across all seven interiors.
  const detailCount = interior.rooms.length;
  const rubbleGeometry = new THREE.DodecahedronGeometry(0.22, 0);
  const grimeGeometry = new THREE.BoxGeometry(0.36, 0.62, 0.025);
  const lampGeometry = new THREE.BoxGeometry(0.58, 0.065, 0.06);
  const rubbleBatch = new THREE.InstancedMesh(rubbleGeometry, rubbleMat, detailCount * 4);
  const grimeBatch = new THREE.InstancedMesh(grimeGeometry, grimeMat, detailCount * 2);
  const lampBatch = new THREE.InstancedMesh(lampGeometry, lampMat, detailCount);
  const dummy = new THREE.Object3D();
  let rubbleIndex = 0, grimeIndex = 0, lampIndex = 0;
  for (const r of interior.rooms) {
    const seed = detailHash(interior.landmarkId + ':' + r.id);
    for (let i = 0; i < 4; i++) {
      const xOffset = (detailRandom(seed, i) - 0.5) * (r.width - 1.0);
      let zOffset = (detailRandom(seed, i + 11) - 0.5) * (r.depth - 1.0);
      if (Math.hypot(xOffset, zOffset) < 1.15) zOffset = (zOffset < 0 ? -1 : 1) * (r.depth * 0.36);
      const scale = 0.45 + detailRandom(seed, i + 21) * 0.85;
      dummy.position.set(r.x + xOffset, r.elevation + 0.11, r.z + zOffset);
      dummy.rotation.set(detailRandom(seed, i + 31), detailRandom(seed, i + 41) * Math.PI, detailRandom(seed, i + 51));
      dummy.scale.set(scale, scale * 0.55, scale);
      dummy.updateMatrix();
      rubbleBatch.setMatrixAt(rubbleIndex, dummy.matrix);
      if (rubbleBatch.setColorAt) {
        const tint = new THREE.Color(detailRandom(seed, i + 61) > 0.5 ? 0x62594e : 0x4d4b44);
        rubbleBatch.setColorAt(rubbleIndex, tint);
      }
      rubbleIndex++;
    }
    for (let i = 0; i < 2; i++) {
      dummy.position.set(r.x + (i ? 1.35 : -1.25), r.elevation + 0.85 + detailRandom(seed, i + 71) * 0.55, r.z + r.depth / 2 - 0.09);
      dummy.rotation.set(0, (detailRandom(seed, i + 81) - 0.5) * 0.12, (detailRandom(seed, i + 91) - 0.5) * 0.12);
      dummy.scale.setScalar(0.7 + detailRandom(seed, i + 101) * 0.8);
      dummy.updateMatrix();
      grimeBatch.setMatrixAt(grimeIndex++, dummy.matrix);
    }
    dummy.position.set(r.x - r.width * 0.32, r.elevation + 1.83, r.z - r.depth / 2 + 0.105);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    lampBatch.setMatrixAt(lampIndex++, dummy.matrix);
  }
  for (const batch of [rubbleBatch, grimeBatch, lampBatch]) {
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    if (batch.computeBoundingSphere) batch.computeBoundingSphere();
    batch.userData.interiorLandmarkId = interior.landmarkId;
    root.add(batch);
  }
  // Landmark-specific silhouettes make each location readable at a glance without imported assets.
  // Two instanced batches per interior keep draw-call growth independent of room count.
  const propProfiles = {
    north_bus_depot: { label: 'dispatch furniture', size: [1.15, 0.72, 0.52], accent: [0.98, 0.08, 0.42], height: 0.72, color: 0x6b5845 },
    collapsed_apartments: { label: 'apartment furniture', size: [1.35, 0.58, 0.72], accent: [1.12, 0.10, 0.58], height: 0.58, color: 0x625448 },
    exchange_market: { label: 'stock shelving', size: [1.05, 1.35, 0.34], accent: [0.96, 0.07, 0.38], height: 1.35, color: 0x77654d },
    mercy_hospital: { label: 'hospital beds', size: [1.45, 0.30, 0.68], accent: [1.28, 0.08, 0.56], height: 0.30, color: 0x8c9690 },
    ironworks: { label: 'industrial machinery', size: [0.95, 1.05, 0.82], accent: [0.76, 0.14, 0.66], height: 1.05, color: 0x59615e },
    buried_subway: { label: 'subway utility cabinets', size: [0.88, 1.08, 0.46], accent: [0.70, 0.07, 0.38], height: 1.08, color: 0x4f5b59 },
    research_annex: { label: 'research consoles', size: [1.18, 0.92, 0.56], accent: [0.92, 0.08, 0.42], height: 0.92, color: 0x647c7a }
  };
  const profile = propProfiles[interior.landmarkId] || propProfiles.north_bus_depot;
  const furnitureMat = material(profile.color);
  const accentMat = new THREE.MeshStandardMaterial({
    color: interior.landmarkId === 'mercy_hospital' ? 0xb6c7be : 0xb58b4f,
    emissive: interior.landmarkId === 'research_annex' ? 0x1c6b63 : 0x000000,
    emissiveIntensity: 0.22, roughness: 0.82
  });
  const furnitureBatch = new THREE.InstancedMesh(new THREE.BoxGeometry(...profile.size), furnitureMat, detailCount);
  const furnitureAccentBatch = new THREE.InstancedMesh(new THREE.BoxGeometry(...profile.accent), accentMat, detailCount);
  let furnitureIndex = 0;
  for (const r of interior.rooms) {
    const seed = detailHash(interior.landmarkId + ':' + r.id + ':furniture');
    // Keep the center lane open for third-person movement and place clutter against room edges.
    const xOffset = detailRandom(seed, 1) > 0.5 ? 1.22 : -1.22;
    const zOffset = detailRandom(seed, 2) > 0.5 ? 1.22 : -1.22;
    const x = r.x + xOffset;
    const z = r.z + zOffset;
    dummy.position.set(x, r.elevation + profile.height / 2, z);
    dummy.rotation.set(0, detailRandom(seed, 3) > 0.5 ? Math.PI / 2 : 0, 0);
    dummy.scale.setScalar(0.92 + detailRandom(seed, 4) * 0.16);
    dummy.updateMatrix();
    furnitureBatch.setMatrixAt(furnitureIndex, dummy.matrix);
    const accentY = interior.landmarkId === 'exchange_market' ? r.elevation + 0.48 : r.elevation + profile.height + 0.045;
    dummy.position.set(x, accentY, z);
    dummy.rotation.set(0, detailRandom(seed, 3) > 0.5 ? Math.PI / 2 : 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    furnitureAccentBatch.setMatrixAt(furnitureIndex, dummy.matrix);
    furnitureIndex++;
  }
  for (const batch of [furnitureBatch, furnitureAccentBatch]) {
    batch.instanceMatrix.needsUpdate = true;
    if (batch.computeBoundingSphere) batch.computeBoundingSphere();
    batch.userData.interiorLandmarkId = interior.landmarkId;
    batch.userData.environmentalSetDressing = profile.label;
    root.add(batch);
  }
  const renderedDoors = new Set();
  for (const r of interior.rooms) {
    box(root, [r.width, 0.16, r.depth], [r.x, r.elevation - 0.08, r.z], floorMat);
    for (const side of ['north','south','east','west']) wall(root, r, side, hasExit(r, side) || (r.id === interior.entryRoom && side === 'south'));
    // A small wall-mounted emergency light gives the roofless floorplan readable depth.
    box(root, [0.28, 0.12, 0.12], [r.x - r.width * 0.32, r.elevation + 1.75, r.z - r.depth / 2 + 0.16], clueMat);
    for (const exit of r.exits) {
      if (renderedDoors.has(exit.id)) continue;
      renderedDoors.add(exit.id);
      const door = new THREE.Group();
      const doorX = exit.side === 'east' ? r.x + r.width / 2 : exit.side === 'west' ? r.x - r.width / 2 : r.x;
      const doorZ = exit.side === 'north' ? r.z - r.depth / 2 : exit.side === 'south' ? r.z + r.depth / 2 : r.z;
      const doorPosition = exit.side === 'east' ? [doorX, r.elevation, r.z] : exit.side === 'west' ? [doorX, r.elevation, r.z] : [r.x, r.elevation, doorZ];
      door.position.set(...doorPosition);
      if (exit.side === 'east' || exit.side === 'west') door.rotation.y = Math.PI / 2;
      door.userData.interiorTarget = { kind: 'door', landmarkId: interior.landmarkId, doorId: exit.id, label: exit.label, x: origin.x + doorX, z: origin.z + doorZ };
      box(door, [0.12, 2.1, 0.12], [-0.68, 1.05, 0], trimMat);
      box(door, [0.12, 2.1, 0.12], [0.68, 1.05, 0], trimMat);
      box(door, [1.48, 0.12, 0.12], [0, 2.1, 0], trimMat);
      const slab = box(door, [1.25, 1.95, 0.08], [0, 0.98, 0], glassMat);
      slab.userData.interiorDoorSlab = true;
      slab.userData.interiorCameraOccluder = true;
      slab.userData.interiorDoorId = exit.id;
      root.add(door);
      const destinationRoom = interiorRoom(interior, exit.to);
      const destinationElevation = Number.isFinite(destinationRoom?.elevation) ? destinationRoom.elevation : 0;
      const rise = destinationElevation - (Number.isFinite(r.elevation) ? r.elevation : 0);
      if (Math.abs(rise) >= 0.75) {
        // A real, readable ladder connects the two authored floor heights at this transition.
        const lowY = Math.min(r.elevation || 0, destinationElevation);
        const height = Math.abs(rise);
        const railOffset = 0.48;
        const railA = alongDoorAxis(exit.side, doorX, doorZ, -railOffset);
        const railB = alongDoorAxis(exit.side, doorX, doorZ, railOffset);
        box(root, [0.1, height, 0.1], [railA.x, lowY + height / 2, railA.z], trimMat);
        box(root, [0.1, height, 0.1], [railB.x, lowY + height / 2, railB.z], trimMat);
        for (let rung = 1; rung <= Math.floor(height / 0.42); rung++) {
          const y = lowY + rung * height / (Math.floor(height / 0.42) + 1);
          box(root, exit.side === 'east' || exit.side === 'west' ? [0.1, 0.09, 0.96] : [0.96, 0.09, 0.1],
            [doorX, y, doorZ], trimMat);
        }
      }
    }
  }
  for (const item of interior.interactables) {
    const roomData = interiorRoom(interior, item.roomId);
    const object = new THREE.Group();
    object.position.set(item.x, roomData.elevation, item.z);
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
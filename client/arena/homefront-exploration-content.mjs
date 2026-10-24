// Authored expedition content for Homefront's existing Graveyard map.
// Presentation/mission metadata only: server/homefront-world.js remains authoritative
// for coordinates, movement, combat, loot, rescues, and reward ownership.
export const EXPLORATION_VERSION = 1;
export const WORLD_BOUNDS = Object.freeze({ minX: -100, maxX: 100, minZ: -100, maxZ: 100 });

export const DISTRICTS = Object.freeze({
  outskirts: Object.freeze({
    id: 'outskirts', title: 'The Ash Ring', risk: 1, recommendedGear: 'Melee weapon, one loaded firearm',
    atmosphere: 'Open roads, abandoned cars, windblown ash, and long sightlines.',
    traversal: ['road', 'wreckage', 'service lane'],
    hazards: ['roadside ambush', 'unstable vehicle', 'smoke-obscured sightline'],
    signatureLandmarks: ['evacuation convoy', 'bus depot', 'road checkpoint'],
    soundscape: ['loose sheet metal', 'distant siren', 'crows over the highway'],
    unlockHint: 'Follow road markings and emergency signage toward the denser districts.'
  }),
  residential: Object.freeze({
    id: 'residential', title: 'The Hollow Blocks', risk: 2, recommendedGear: 'Flashlight, sidearm, medical supplies',
    atmosphere: 'Crushed apartment fronts, narrow courtyards, broken stairwells, and rooftop silhouettes.',
    traversal: ['courtyard', 'stairwell', 'roof bridge', 'service alley'],
    hazards: ['glass and debris', 'blind doorway', 'collapsed floor'],
    signatureLandmarks: ['collapsed apartments', 'family shelter', 'roof-to-roof route'],
    soundscape: ['wind through window frames', 'distant banging behind doors', 'loose shutters'],
    unlockHint: 'Look for intact stairwells and ladders; rooftops can bypass blocked streets.'
  }),
  commercial: Object.freeze({
    id: 'commercial', title: 'Exchange Market', risk: 3, recommendedGear: 'Reliable firearm, spare ammunition, backpack capacity',
    atmosphere: 'A looted shopping strip around a market exchange, with tight alleys and shuttered storefronts.',
    traversal: ['shop floor', 'loading dock', 'alley', 'parking structure'],
    hazards: ['alarm-triggered noise', 'dark stockroom', 'crowd funnel'],
    signatureLandmarks: ['Exchange Market', 'underground loading bay', 'cash-office cache'],
    soundscape: ['swinging sign', 'glass crunch', 'intermittent alarm chirp'],
    unlockHint: 'Loading docks and staff corridors may connect buildings without crossing the street.'
  }),
  hospital: Object.freeze({
    id: 'hospital', title: 'St. Mercy Quarantine', risk: 3, recommendedGear: 'Medical supplies, ammunition, protective gear',
    atmosphere: 'Triage tents, ambulance lanes, sealed wards, and a hospital wing lost to quarantine.',
    traversal: ['triage bay', 'ward corridor', 'service elevator', 'roof helipad'],
    hazards: ['contaminated ward', 'power outage', 'blocked lift shaft'],
    signatureLandmarks: ['St. Mercy Hospital', 'emergency locker', 'quarantine shelter'],
    soundscape: ['backup generator', 'paging speaker loop', 'metal trolley rolling in the dark'],
    unlockHint: 'Restore or reroute power to open service doors and reveal alternate hospital routes.'
  }),
  industrial: Object.freeze({
    id: 'industrial', title: 'Ironworks Belt', risk: 4, recommendedGear: 'Heavy firearm, reserve ammunition, repair materials',
    atmosphere: 'Foundry sheds, freight containers, conveyor belts, and a yard of twisted steel.',
    traversal: ['container lane', 'catwalk', 'conveyor crossing', 'maintenance tunnel'],
    hazards: ['live electrical cabinet', 'unstable catwalk', 'industrial noise attracting infected'],
    signatureLandmarks: ['Ironworks Yard', 'secure tool cage', 'freight gantry'],
    soundscape: ['cooling metal pops', 'chain rattling', 'distant machinery cycling'],
    unlockHint: 'Use elevated catwalks to bypass ground-level choke points; noisy machinery can mask movement but attract threats.'
  }),
  subway: Object.freeze({
    id: 'subway', title: 'The Buried Line', risk: 5, recommendedGear: 'Heavy ammunition, flashlight, healing items, extraction reserve',
    atmosphere: 'Flooded platforms, stopped trains, signal rooms, and tunnels that swallow light.',
    traversal: ['platform', 'train car', 'maintenance tunnel', 'signal room'],
    hazards: ['deep water', 'tight tunnel ambush', 'darkness', 'one-way drop'],
    signatureLandmarks: ['Buried Subway', 'signal control room', 'sealed platform gate'],
    soundscape: ['water dripping on rails', 'distant rail groan', 'echoing movement'],
    unlockHint: 'Signal controls and maintenance passages create loops back toward the surface.'
  }),
  research_lab: Object.freeze({
    id: 'research_lab', title: 'Blackglass Annex', risk: 5, recommendedGear: 'Full ammunition reserve, medical supplies, room to carry evidence',
    atmosphere: 'A sealed research annex of reinforced glass, isolation chambers, and a failing emergency grid.',
    traversal: ['decontamination lock', 'observation gallery', 'containment hall', 'service duct'],
    hazards: ['sealed airlock', 'power-dependent door', 'containment breach'],
    signatureLandmarks: ['Sealed Research Annex', 'specimen vault', 'emergency control room'],
    soundscape: ['warning tone under static', 'ventilation cycling', 'heavy impacts behind reinforced doors'],
    unlockHint: 'Read terminal clues and restore local power before opening containment routes.'
  })
});

const poi = (id, title, district, x, z, risk, archetype, objective, story, interactables, lootProfile, routeTo, interior = [], flags = []) =>
  Object.freeze({ id, title, district, x, z, risk, archetype, objective, story, interactables: Object.freeze(interactables), lootProfile, routeTo: Object.freeze(routeTo), interior: Object.freeze(interior), flags: Object.freeze(flags) });

export const LANDMARKS = Object.freeze([
  poi('north_bus_depot', 'North Bus Depot', 'outskirts', -8, -65, 1, 'bus_depot', 'Search the stranded transit office', 'A driver left a hand-drawn evacuation route beneath the dispatch desk.', ['dispatch_drawer', 'bus_luggage', 'route_board'], 'food_tools', ['river_checkpoint', 'stranded_bus'], ['dispatch office', 'bus bays'], ['starter_route']),
  poi('river_checkpoint', 'River Checkpoint', 'outskirts', 62, -20, 1, 'road_checkpoint', 'Search the abandoned checkpoint', 'A final radio log mentions a convoy redirected inland.', ['guard_shack', 'roadblock_crate', 'radio_log'], 'ammo_supplies', ['north_bus_depot', 'east_checkpoint', 'exchange_market'], ['guard shack', 'road barrier'], ['radio_clue']),
  poi('wrecked_depot', 'Wrecked Depot', 'outskirts', 14, 72, 1, 'freight_depot', 'Salvage the depot without getting pinned', 'The loading ledger lists equipment moved to the Ironworks before the fall.', ['forklift_pallet', 'shipping_manifest', 'tool_locker'], 'scrap_tools', ['old_rail_yard', 'east_checkpoint'], ['loading bay', 'office mezzanine'], ['salvage']),
  poi('old_rail_yard', 'Old Rail Yard', 'outskirts', -73, 17, 1, 'rail_yard', 'Trace the freight line toward the city', 'One railcar has been opened from the inside; fresh drag marks lead west.', ['signal_box', 'railcar_cache', 'track_switch'], 'scrap_ammo', ['wrecked_depot', 'west_underpass', 'ironworks'], ['signal cabin', 'freight car'], ['route_clue']),
  poi('west_underpass', 'West Underpass', 'outskirts', -60, -55, 1, 'underpass', 'Cross the underpass and check the maintenance alcove', 'A painted arrow marks a dry route through the drainage tunnel.', ['maintenance_panel', 'roadside_bags', 'graffiti_marker'], 'food_meds', ['old_rail_yard', 'north_bus_depot', 'buried_subway'], ['maintenance alcove', 'drainage bypass'], ['shortcut']),
  poi('east_checkpoint', 'East Checkpoint', 'outskirts', 55, 55, 1, 'evacuation_gate', 'Recover the checkpoint roster', 'The roster names a survivor group last seen near the apartment blocks.', ['roster_board', 'supply_pallet', 'flare_box'], 'ammo_meds', ['river_checkpoint', 'wrecked_depot', 'collapsed_apartments'], ['gate booth', 'vehicle inspection lane'], ['rescue_lead']),
  poi('cache_exchange', 'Exchange Supply Cache', 'commercial', -32, 24, 2, 'reinforced_cache', 'Open the exchange cache', 'The cache is marked with the same symbol found on the market staff doors.', ['lockbox', 'keypad', 'supply_shelf'], 'rare_supplies', ['exchange_market', 'mercy_hospital'], ['cash office', 'service corridor'], ['cache']),
  poi('cache_hospital', 'Hospital Emergency Locker', 'hospital', 19, 25, 3, 'medical_cache', 'Reach the emergency locker', 'The emergency code is split between a triage clipboard and the nurse station.', ['triage_clipboard', 'nurse_station', 'emergency_locker'], 'medical', ['mercy_hospital', 'quarantine_shelter', 'research_annex'], ['triage bay', 'nurse station'], ['cache', 'medical']),
  poi('cache_ironworks', 'Ironworks Secure Crate', 'industrial', -12, 18, 4, 'industrial_cache', 'Recover the sealed tool crate', 'A maintenance note says the gantry power must be cut before the cage can be opened.', ['power_isolator', 'tool_crate', 'gantry_console'], 'heavy_tools', ['ironworks', 'old_rail_yard'], ['tool cage', 'gantry control'], ['cache', 'power_puzzle']),
  poi('stranded_bus', 'Stranded Bus Survivors', 'outskirts', 35, -42, 1, 'rescue_bus', 'Find and escort the passengers', 'A survivor is keeping the bus quiet while another passenger is trapped behind a jammed door.', ['jammed_bus_door', 'first_aid_kit', 'passenger_manifest'], 'rescue_supplies', ['north_bus_depot', 'river_checkpoint'], ['bus aisle', 'rear exit'], ['rescue', 'escort']),
  poi('collapsed_apartments', 'Collapsed Apartments', 'residential', -22, 48, 2, 'apartment_ruin', 'Reach the upper-floor distress signal', 'A hand-cranked light flashes from a room above a collapsed stairwell.', ['rubble_gap', 'fire_escape', 'distress_light'], 'food_meds', ['east_checkpoint', 'quarantine_shelter', 'exchange_market'], ['ground-floor lobby', 'fire escape', 'upper apartment'], ['rescue_lead', 'vertical_route']),
  poi('quarantine_shelter', 'Quarantine Shelter', 'hospital', 36, 38, 3, 'triage_shelter', 'Verify the shelter and bring survivors out', 'The shelter door is sealed from the inside; a working intercom may prevent a panic.', ['intercom', 'airlock_wheel', 'triage_board'], 'medical_rescue', ['collapsed_apartments', 'mercy_hospital', 'cache_hospital'], ['decontamination room', 'sleeping bay', 'exit airlock'], ['rescue', 'choice']),
  poi('mercy_hospital', 'St. Mercy Hospital', 'hospital', 24, 30, 3, 'hospital_complex', 'Restore access to the emergency wing', 'A ward recording hints that the research annex received a transfer after the evacuation order.', ['generator_switch', 'patient_chart', 'service_elevator'], 'medical_research_clues', ['cache_hospital', 'quarantine_shelter', 'research_annex'], ['emergency lobby', 'ward corridor', 'pharmacy', 'roof helipad'], ['power_puzzle', 'story_thread']),
  poi('exchange_market', 'Exchange Market', 'commercial', -38, 32, 3, 'market_ruin', 'Search the market and unlock a back route', 'A shopkeeper\u2019s chalk marks point to a staff passage beneath the loading dock.', ['rolling_shutter', 'stockroom_shelves', 'loading_dock_latch'], 'food_tools', ['cache_exchange', 'collapsed_apartments', 'river_checkpoint'], ['market floor', 'stockroom', 'loading dock'], ['interior', 'shortcut']),
  poi('ironworks', 'Ironworks Yard', 'industrial', -16, 22, 4, 'foundry_yard', 'Secure the maintenance gantry', 'The tool crate is part of a repair shipment; the manifest identifies a second power cell.', ['gantry_ladder', 'power_isolator', 'tool_cage'], 'heavy_tools', ['old_rail_yard', 'cache_ironworks', 'buried_subway'], ['yard floor', 'gantry catwalk', 'maintenance shed'], ['vertical_route', 'power_puzzle']),
  poi('buried_subway', 'Buried Subway', 'subway', 6, -8, 5, 'subway_entrance', 'Find the signal room and map a safe tunnel exit', 'The last station recording repeats a platform number that also appears in the hospital transfer log.', ['ticket_gate', 'signal_panel', 'maintenance_hatch'], 'high_risk_salvage', ['west_underpass', 'ironworks', 'research_annex'], ['ticket hall', 'platform', 'stalled train', 'signal room'], ['deep_expedition', 'story_thread']),
  poi('research_annex', 'Sealed Research Annex', 'research_lab', -4, 6, 5, 'research_facility', 'Recover the incident record and reach extraction', 'The transfer log connects St. Mercy, the buried line, and a containment failure; the full report remains behind a powered lock.', ['terminal_archive', 'power_bus', 'containment_lock'], 'endgame_evidence', ['mercy_hospital', 'buried_subway', 'cache_hospital'], ['decontamination lock', 'observation gallery', 'containment hall', 'archive vault'], ['deep_expedition', 'story_thread', 'endgame'])
]);

export const STORY_THREADS = Object.freeze([
  Object.freeze({ id: 'evacuation_route', title: 'The Last Convoy', startAt: 'north_bus_depot', clues: Object.freeze(['river_checkpoint', 'east_checkpoint']), payoffAt: 'stranded_bus', rewardIntent: 'unlock a safer rescue route', requires: Object.freeze([]) }),
  Object.freeze({ id: 'missing_patients', title: 'Transfer Order', startAt: 'mercy_hospital', clues: Object.freeze(['cache_hospital', 'buried_subway']), payoffAt: 'research_annex', rewardIntent: 'reveal the Blackglass incident record', requires: Object.freeze(['power_access']) }),
  Object.freeze({ id: 'ironworks_power', title: 'Cut the Feed', startAt: 'ironworks', clues: Object.freeze(['cache_ironworks']), payoffAt: 'research_annex', rewardIntent: 'open a service route and disable one hazard', requires: Object.freeze([]) })
]);

export const ROUTES = Object.freeze([
  Object.freeze({ id: 'outer_ring', title: 'Outer Ring Road', from: 'north_bus_depot', to: 'river_checkpoint', risk: 1, style: 'road', unlock: 'open', alternate: 'west_underpass' }),
  Object.freeze({ id: 'freight_cut', title: 'Freight Cut-Through', from: 'old_rail_yard', to: 'ironworks', risk: 3, style: 'rail', unlock: 'find_track_switch', alternate: 'wrecked_depot' }),
  Object.freeze({ id: 'market_service', title: 'Market Service Passage', from: 'exchange_market', to: 'cache_exchange', risk: 2, style: 'interior', unlock: 'open_loading_dock', alternate: 'collapsed_apartments' }),
  Object.freeze({ id: 'hospital_link', title: 'Emergency Service Link', from: 'mercy_hospital', to: 'cache_hospital', risk: 3, style: 'interior', unlock: 'restore_emergency_power', alternate: 'quarantine_shelter' }),
  Object.freeze({ id: 'buried_line', title: 'Buried Line', from: 'buried_subway', to: 'research_annex', risk: 5, style: 'tunnel', unlock: 'find_signal_room', alternate: 'mercy_hospital' })
]);

export function landmarkById(id) {
  return LANDMARKS.find(landmark => landmark.id === id) || null;
}

export function districtForLandmark(id) {
  const landmark = landmarkById(id);
  return landmark ? DISTRICTS[landmark.district] : null;
}

export function routeBetween(from, to) {
  return ROUTES.filter(route => (route.from === from && route.to === to) || (route.from === to && route.to === from));
}

export function landmarksInDistrict(districtId) {
  return LANDMARKS.filter(landmark => landmark.district === districtId);
}

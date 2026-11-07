'use strict';

// Arena melee reach and victim recovery, shared with Homefront contact attacks.
const ZOMBIE_MELEE_REACH = 1.1;
const ZOMBIE_MELEE_HEIGHT = 1.3;
const ZOMBIE_IFRAME_SECONDS = +(process.env.ZOMBIE_IFRAME || 1);

module.exports = { ZOMBIE_MELEE_REACH, ZOMBIE_MELEE_HEIGHT, ZOMBIE_IFRAME_SECONDS };

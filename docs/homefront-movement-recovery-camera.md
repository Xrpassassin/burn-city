# Homefront walking recovery and close-range camera

This pass follows merged PR #566. Production continuous-movement and vehicle
rollout settings remain unchanged.

## Walking

Previously, a failed movement request advanced the client's sequence before it
knew whether the server committed that input. A later sequence rejection or lost
acknowledgement could permanently disable walking until reload.

The world view now supplies a bounded, authenticated read-only resync transport.
While reconnecting, visual prediction returns to the last verified position and
no movement commands are sent. A fresh world GET supplies both position and the
next accepted sequence. This handles requests that committed and requests that
never reached the server without blindly replaying either. Failed reads back off
to at most one attempt per four seconds. Server disable, sign-out, credential
changes, leaving the expedition and stale responses retain their boundaries.

The in-world connection indicator reads "Reconnecting movement…" during this
state. Keyboard/touch inputs, server movement budgets, collision and cooldowns
retain their existing authority.

## Camera

The smoothed third-person arm now checks conservative living-infected volumes
and retracts to the player's side before the lens enters a nearby body. Normal
follow smoothing restores the arm after clearance. Off-axis enemies, dead actors,
and threats in front of the player do not change camera reach. The local body is
hidden if the lens becomes too close, and stays hidden while seated in a rover.
This changes presentation only; infected positions, damage, hit proxies and audio
remain intact.

## Verification

Unit regressions cover lost/committed commands, authoritative sequence recovery,
connection backoff, stale-session replies, server disable and credential rotation.
Camera geometry tests cover crowd obstruction, off-axis/front-facing threats and
unchanged actor state. Browser acceptance can drop a command before delivery or
abort its acknowledgement after the real server commits it; both paths must
continue walking, scavenge and finish the normal expedition. Physical iPhone
handling and WAN performance still require direct playtesting before rollout.

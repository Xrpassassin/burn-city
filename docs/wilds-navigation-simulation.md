# CinderWilds deterministic navigation simulation

A renderer-free simulation utility for checking the isolated planner/controller chain over repeatable synthetic scenarios.

- Module: `client/js/wilds-navigation-simulation.mjs`
- Test: `client/js/wilds-navigation-simulation.test.mjs`
- Run: `node client/js/wilds-navigation-simulation.test.mjs`

The simulation reports outcome status, ticks, distance travelled, rejected movement steps, route requests, visited search cells, route waypoint count, and maximum observed movement step. Scenarios include open paths, movement rejection, unreachable goals, and tick-budget exhaustion.

## Limits

This does not model Three.js, animation, terrain elevation, creature radius, network latency, or actual forest collision geometry. It plans once and reports when a new route is needed; it does not execute repeated replans. Synthetic success is not evidence that a real CinderWilds creature can safely navigate. Keep it separate from production runtime code.


## Route sampling audit

Before advancing simulated movement, the simulation now samples the planned route using `validateWorldRoute`. The same `isBlocked` callback is used for grid planning and intermediate route samples, with optional `isOutsidePlayableArea`, `routeValidationSpacing`, and `maxValidationSamples` inputs. If an intermediate sample fails, the simulation returns `status: 'route-invalid'` and does not advance any ticks. This helps catch narrow obstacles that fall between grid-cell centers.

This is still only as authoritative as the supplied callbacks and sample spacing. It is a diagnostic guard, not continuous collision detection; production movement must continue to use the game's own collision/ground systems.

# CinderWilds deterministic navigation simulation

A renderer-free simulation utility for checking the isolated planner/controller chain over repeatable synthetic scenarios.

- Module: `client/js/wilds-navigation-simulation.mjs`
- Test: `client/js/wilds-navigation-simulation.test.mjs`
- Run: `node client/js/wilds-navigation-simulation.test.mjs`

The simulation reports outcome status, ticks, distance travelled, rejected movement steps, route requests, visited search cells, route waypoint count, and maximum observed movement step. Scenarios include open paths, movement rejection, unreachable goals, and tick-budget exhaustion.

## Limits

This does not model Three.js, animation, terrain elevation, creature radius, network latency, or actual forest collision geometry. It plans once and reports when a new route is needed; it does not execute repeated replans. Synthetic success is not evidence that a real CinderWilds creature can safely navigate. Keep it separate from production runtime code.

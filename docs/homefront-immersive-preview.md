# Homefront direct-walking phone playtest

This branch combines the gameplay draft from PR #561 with the password-gated preview gateway. The gateway uses one synthetic player and keeps its world and saves in memory. Both Homefront clients send their requests back to the preview host. The direct-walking flag applies only inside the gateway process.

## Start a private preview

Open the `preview/homefront-direct-walking` branch in a GitHub Codespace. In its terminal, run:

```bash
npm ci --ignore-scripts
bash scripts/start-homefront-preview.sh
```

The launcher prompts for a preview password without echoing it. Forward port **8080** in the Codespace **Ports** panel and keep it **Private**. Open the forwarded HTTPS address on the phone using the same GitHub account and enter the preview password. Confirm the **PREVIEW · SYNTHETIC DATA · NO PAYMENTS** marker. Keep the Codespace running during the playtest.

## Compare on the same phone

1. Open [BURN City Zombies](https://burn-city-game.fly.dev/arena/) and play a short match. Note how the joystick starts and stops, how fast the camera turns, and how clearly you can locate infected by sound.
2. Open Homefront preview. Walk to the refuge gate and enter the Wastes. Repeat the same small stick motions, turns, and short sprints with the phone in the same orientation.
3. Approach the bus depot, aim or fire while changing direction, and listen for infected before and after they detect you. Enter the dispatch office, loot it, leave, and return to the refuge. Confirm the debrief and supplies.
4. Repeat the busiest part in landscape. Record the device and browser, then describe any delayed input, hard-to-reach controls, obstructed aim, or unclear sound direction.

The automated check uses the real password gate and server. It verifies authoritative direct movement with keyboard and simulated touch, construction, the Wastes round trip, and exit and re-entry. The depot expedition has its own browser check in PR #561. Physical-device handling and sound are assessed during the playtest.

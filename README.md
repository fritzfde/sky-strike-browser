# Sky Strike

Browser 3D air-combat game. Babylon.js 7, TypeScript and Vite.

Play it here: https://fritzfde.github.io/sky-strike-browser/

## Run it
```
npm install
npm run dev      # start the dev server
npm run build    # build to dist/ (base /sky-strike-browser/)
BASE=./ npx vite build   # build that runs from any folder
```

## How the code is laid out
- `core/Game.ts`: sets everything up and runs the systems in order each frame (input/AI → flight → weapons → camera → HUD/audio)
- `core/Input.ts`: keyboard (by `KeyboardEvent.code`), pointer-locked mouse and touch, turned into `Controls` axes
- `core/Pool.ts`: generic object pool, used for bullets, missiles and particle systems
- `entities/Aircraft.ts`: aircraft state. The player and the AI share it, and a controller writes `ctrl`.
- `entities/JetMesh.ts`: jet model built in code (extruded and lathed parts)
- `systems/`: flight model, weapons (guns, missiles, lock-on), pursuit AI, WebAudio sound, pooled effects and the HUD/radar
- `world/Terrain.ts`: terrain from a height function. `groundAt()` is the one source for collision.

## Planned extensions
- Ground infantry and vehicles: new entity types and systems, using `groundAt` for collision
- Multiplayer: a NetworkController that writes `Aircraft.ctrl` and syncs state

## Controls
- Throttle up / down: W or Shift / S or Ctrl
- Pitch and roll: mouse (pointer lock) or arrow keys
- Yaw: A/D or Q/E
- Guns: left click or Space
- Missile: right click or F. Lock on by keeping the target in the box for 1 second.
- Mute: M

All sounds are made in code with WebAudio. The game uses no outside asset files.

## Aircraft data (v0.7.0): F-16C Block 50
The player jet uses published F-16C Block 50 numbers. You can see the V-speeds the sim computes from its own model in the pause menu (P).

| Parameter | Value used in the sim | Published / typical | Source |
|---|---|---|---|
| Combat T/O weight | 26,500 lb (12,020 kg) | 26,500 lb "loaded"; 42,300 lb max T/O | Wikipedia, F-16 specs (Block 50/52) |
| Wing area | 300 ft² (27.87 m²) | 300 ft² | Wikipedia, F-16 specs |
| Engine | F110-GE-129: 17,155 lbf MIL / 29,500 lbf AB | same | Wikipedia, General Electric F110 (-129 section); GE |
| G limits | +9 / −3 (FLCS) | +9 | Wikipedia, F-16 specs |
| AoA limiter | 25° | 25° (FLCS) | Wikipedia, F-16 "Fly-by-wire" ("25° limit") |
| Max speed | Mach 2.05 at 40,000 ft; ~800 KIAS limit | M2.05 at 40,000 ft | Wikipedia, F-16 specs |
| Service ceiling | 50,000 ft | 50,000 ft | Wikipedia, F-16 specs |
| Takeoff (AB, ~26k lb) | rotate ~150 kt, lift off ~165–175 kt, roll ~1,500–2,500 ft | typical pilot / T.O. 1F-16C-1 figures (approximate) | pilot accounts; AF flight manual summaries |
| Approach | 13° AoA, ~135–145 kt | 13° AoA on-speed | T.O. 1F-16C-1 (approach at 11–13° AoA) |
| Corner speed | ~330–350 kt | ~330 kt | common F-16 EM figures |

Links: https://en.wikipedia.org/wiki/General_Dynamics_F-16_Fighting_Falcon · https://en.wikipedia.org/wiki/General_Electric_F110

How the model works:
- **Lift:** linear lift to 22° AoA (CLα 4.45/rad). Above that, vortex lift (LEX) gives CLmax 2.0 at 30° (the stall).
- **Thrust:** thrust drops with air density (ρ^0.75) and gains ram recovery with Mach (1 + 0.3·M²).
- **Wave drag:** peaks at M1.1.
- **FLCS:**
  - Commands +9 / −3 G and limits AoA to 25° in any attitude.
  - The AoA warning comes at 26°, i.e. only once the limiter has been exceeded.
  - Below ~160 kt the nose has enough authority to beat the limiter (up to ~32° at 130 kt). That is the slow-speed "edge of the stall" fight.
- **Pilot G tolerance (with G-suit and AGSM):**
  - G-stress builds up above 5.5 G.
  - At 9 G: greyout after ~2.5 s and blackout after ~6 s. At 7 G: greyout after ~9 s.
  - Below −2.5 G you get a redout.

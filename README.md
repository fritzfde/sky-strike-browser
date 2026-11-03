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

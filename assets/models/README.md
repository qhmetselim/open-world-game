# Blender → GLB → Three.js

Source of truth: `scripts/blender/street_lamp.py` and `core_assets.py`. Generated GLBs are committed
alongside its source, so running the game/build does **not** require Blender.

## Rebuild

```sh
npm ci
npm run assets:build
```

Default Blender binary: `/Applications/Blender.app/Contents/MacOS/Blender`.
Override on other machines with `BLENDER_BIN=/path/to/blender npm run assets:build`.
Verified with Blender **5.2.2 LTS**. Rebuild needs no MCP, add-on, external model or texture.
Stage 20 visual iteration uses the existing Blender MCP bridge; it is not a runtime dependency.
The command invokes factory-startup/background Blender, generates a staging GLB,
then uses glTF Transform dedup/prune/weld and the Khronos glTF validator. Export or
validation failure returns a nonzero exit status; only validated output is shipped.

## Asset contract

- **1 unit = 1 metre**. Source Blender Z-up; `export_yup=True` handles runtime Y-up.
- Street props: foot-centred origin `(0,0,0)`. Vehicle body: rigid-body centre.
- Wheel: axle-centred, runtime X axle. Pistol: bore mouth, runtime **-Z firing**.
- Source Blender `-Y` becomes runtime `+Z`; `core_assets.p()` authors explicit runtime coordinates.
- Stable names: `PROP_…`, `GEO_…`, `MAT_…`; stable content ID in GLB extras/catalog.
- Flat shaded, opaque PBR surfaces, shared materials, no textures or real lights.
- Current lamp: **4.89 m**, **216 triangles**, **3 material primitives/draw calls**,
  **13,328 bytes**. No compression extension/decoder required for this tiny asset.
- Build guard: fewer than 6,000 triangles and 400 KB per asset; zero validator errors/warnings.
- All models are visual only. Existing Rapier shapes/controllers remain authoritative.

## Stage 20 core family

| Model | Triangle budget used | Materials | Contract |
|---|---:|---:|---|
| Sedan body | 920 | 6 | 4.2m coachwork, hood/cabin/deck, cut wheel arches |
| Police body | 1,336 | 8 | same chassis; shield livery, lightbar, pushbar, antenna |
| Shared wheel | 476 | 3 | radius .36m, .18m rubber width, independent spinning rim |
| Pistol | 516 | 3 | muzzle `(0,0,0)`, slide/grip extend behind muzzle (+Z) |
| Signal structure | 808 | 2 | 3.2m housing centre, -Z approach-facing |
| Street lamp | 216 | 3 | 4.89m, +Z arm; Stage 19 model promoted to streamed props |
| Bench | 820 | 2 | 1.9m timber slats, metal frame/arms |
| Bin | 260 | 2 | foot-centred, tapered housing, opening/lid |

Vehicles reuse unmodified track 1.5m, wheelbase 2.5m, suspension, steering and spin state.
Only the player/development sedan and police sedan switch coachwork; ordinary traffic
retains its cheaper existing procedural model. Mirrors and bumpers are visual trim,
not collision extensions. Fender skirts fill the previous floating body/wheel gap.
MCP preview uses measured flat-ground rest suspension (.29376m); in-game wheels always
use actual per-wheel Rapier suspension, including travel over bumps.

`CoreModels` preloads eighteen bounded cache leases during Game initialization. Views borrow
independent static transforms while sharing GLB resources. Game disposes views first,
then the library. Environment props bake GLB PBR base colours into shared vertex-colour
templates; the existing **one instanced draw per chunk/prop type**, culling and unload
policy remain. Signal structure is one batch; existing state-driven lens and stop-line
batches are retained. No traffic rules or physics changes.

### Blender visual review

Run `preview_core.py` through MCP `blender_python_exec(script_path=..., args=...)` with
`source` = absolute path to `core_assets.py`, `kind` = sedan/police/pistol/signal/bench/bin,
and `output` = absolute PNG path. Then call MCP `blender_render_still`.
The script creates a separate review scene, preserving existing user scenes.
Render review drove wheel-arch/skirt proportions, reduced roof height, slimmer rim
spokes and surface-conforming bin ribs. Preview stage/lights are not exported.

`npm run dev` → `/asset-review.html` is a small development-only Three.js inspection
page using the actual runtime view adapters. It can switch sedan/police/pistol/street
kit, preview steering/spin, and cycle the existing signal lens states. This entry is
not included in the production build and has no access to gameplay state.

## Runtime

### Stage 21 city modules

`scripts/blender/city_assets.py` adds ten reusable metre-scale GLBs (about 99 KB total):
facade window (108 triangles), balcony (120), awning (76), entry sign (92), planter
(116), roof unit (172), broad tree (164), column tree (144), bush (60), utility box (172).
No textures, no whole-building GLBs, no individual window meshes. GLB material colours
are baked into shared vertex-colour geometry, then instanced once per module/chunk.
The extra facade/roof trims share existing box batches. All vegetation and street
furniture retains existing placements, clearances, culling and resource ownership.

Windows have a unit width/height, plane Z=0, outward direction -Z; depth remains in
metres when bays are scaled. Props have foot-centred pivots. Side facade instances
rotate to the outward normal. Ground-floor windows leave the actual entrance opening
clear, including sill overhang; no interior shell or collider changes. Commercial
buildings use tall glazed bays, repeated awnings and signage; residential buildings
use shallow balconies and entry canopies; mixed-use adds both and horizontal bands.
Existing building identity, footprint, floors and roof classification remain unchanged.
Large existing procedural footprints remain large: this pass does not rezone parcels.

Street surface shaders add subtle world-coordinate asphalt variation and antialiased
paving joints, without textures, displacement, graph changes or new geometry layers.
The original shared lamp/bench/bin assets are reused; bollards and road signs retain
their existing lightweight procedural representation.

Live Blender review: execute `preview_city.py` with `args.source` pointing to
`city_assets.py`, then render the dedicated `CityModuleReview` scene. User scenes are
preserved. `npm run dev` → `/city-review.html` uses the actual World, chunk loading,
building/interior shells, environment batches, lighting and street materials to review
origin/east/west regions. It is development-only and absent from the production entry.
No traffic/NPC simulation is run in this fixture; its FPS is not a gameplay benchmark.

`src/render/loaders/ModelCatalog.ts` maps stable IDs to Vite `?url` imports. Vite
copies the GLB into hashed `dist/assets/` output; do not hand-code `/assets/` URLs.

`ModelCache.acquire(url)` deduplicates pending GLTFLoader requests and returns a
lease with an independent scene hierarchy. Geometry/materials/textures are shared;
do not mutate them per instance. Skeletons are cloned independently for future
rigged assets; animation clips are exposed for a future per-instance mixer.
Call `release()` when a view/chunk unloads. The last reference evicts/disposes the
asset. `dispose()` detaches all outstanding views and also cleans late load
completions. Failed loads may retry. No simulation state lives in the GLB.

Development world proof: one lamp is displayed **4 m left / 7 m ahead of the
initial spawn**, rooted at the terrain surface. It is hidden beyond 100 m or when
its terrain chunk is unloaded; the one bounded demo lease is released on Game
dispose. Stage 20 additionally uses this lamp in the existing streamed environment batches.
Production does not instantiate the demo. Future streamed props should acquire
and release leases through their own existing chunk-view lifecycle.

## Stage 22 — shared character family

`scripts/blender/characters.py` builds `characters/human.glb`: one 112.9 kB
library (1,584 unique source triangles), not a separate download for each NPC.
Named joint-local modules include shaped head/face, three hair silhouettes,
three civilian tops, two trouser fits, sleeves/forearms, and a police uniform/cap.
The assembled model is approximately 2 m tall, feet at Y=0, local +Z forward.
PlayerView retains its existing -Z-forward outer transform and adapts the asset
with one child rotation. NPCs retain their existing centred corpse pivot and
height/width scaling; AI identity, health hit volumes and navigation are unchanged.

`CharacterResources` borrows the source from CoreModels/ModelCache, bakes palette
colours into merged rigid parts, and shares them between views. Nine meshes and
one shared opaque material per living character; colour/style keys come from the
existing finite palettes and deterministic appearance/clothing seeds. Corpse fading
clones only the dying view's material and disposes it with that view. Library-owned
merged geometry is released by the existing manager/Game disposal lifecycle.

Existing lightweight limb swings are retained. Player walking/running uses rendered
velocity; a view-only two-bone right-arm reach follows CombatView's actual pistol
grip, including recoil. Muzzle, aim ray, controller, camera and collider code are not
retuned. There is no new skeletal animation runtime or clothing gameplay.

Live Blender: execute `preview_characters.py` with `args.source` pointing to
`characters.py`. It creates a separate review scene, preserving existing scenes.
Runtime: `/character-review.html` is a development-only production-view fixture
for idle/walk/run/aim/death and the same visibility adapter used during driving.
It does not simulate vehicle interaction. The full gameplay smoke in the in-app
browser loaded the player and NPC library with no console errors; pointer-lock
automation did not allow a complete held-input aim/vehicle enter-exit tour.
Manually verify Q → RMB, walk/sprint, E enter → E exit in the game.

Checks: assets build/Khronos validation, typecheck, lint, build; real-GLB tests for
scale, feet pivot, palette sharing/disposal and pistol grip reach. Representative
gameplay spawn sample: about 116 FPS, 174 draws, 93k triangles (camera-dependent,
not a benchmark). Review scene: five characters + sedan, 64 draws / 9,746 triangles.

## Checks

```sh
npx vitest run src/render/loaders/ModelCache.test.ts src/render/loaders/CoreAssets.test.ts
npm run typecheck
npm run build
```

Tests parse the **real generated file** with GLTFLoader: scale/pivot/orientation,
material/triangle budgets, shared resource ownership, eviction/retry and loading
during disposal. Browser smoke: `npm run dev`, visit `/`, press F3 to hide debug
text; the new lamp is ahead-left of the player. Console reports `Blender GLB ready`.

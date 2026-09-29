# Blender → GLB → Three.js

Source of truth: `scripts/blender/street_lamp.py`. The generated GLB is committed
alongside its source, so running the game/build does **not** require Blender.

## Rebuild

```sh
npm ci
npm run assets:build
```

Default Blender binary: `/Applications/Blender.app/Contents/MacOS/Blender`.
Override on other machines with `BLENDER_BIN=/path/to/blender npm run assets:build`.
Verified with Blender **5.2.2 LTS**. No MCP, add-on, external model or texture.
The command invokes factory-startup/background Blender, generates a staging GLB,
then uses glTF Transform dedup/prune/weld and the Khronos glTF validator. Export or
validation failure returns a nonzero exit status; only validated output is shipped.

## Asset contract

- **1 unit = 1 metre**. Source Blender Z-up; `export_yup=True` handles runtime Y-up.
- Foot-centred origin `(0,0,0)`. Identity runtime scale; no compensating rotations.
- Source forward `-Y` becomes runtime forward `+Z`.
- Stable names: `PROP_…`, `GEO_…`, `MAT_…`; stable content ID in GLB extras/catalog.
- Flat shaded, opaque PBR surfaces, three shared materials, no textures or lights.
- Current lamp: **4.89 m**, **216 triangles**, **3 material primitives/draw calls**,
  **13,328 bytes**. No compression extension/decoder required for this tiny asset.
- Build guard: fewer than 1,000 triangles and 100 KB; zero validator errors/warnings.
- Visual only: this test intentionally has no physics/collision registration.

## Runtime

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
dispose. This is not a replacement of the procedural environment system.
Production does not instantiate the demo. Future streamed props should acquire
and release leases through their own existing chunk-view lifecycle.

## Checks

```sh
npx vitest run src/render/loaders/ModelCache.test.ts
npm run typecheck
npm run build
```

Tests parse the **real generated file** with GLTFLoader: scale/pivot/orientation,
material/triangle budgets, shared resource ownership, eviction/retry and loading
during disposal. Browser smoke: `npm run dev`, visit `/`, press F3 to hide debug
text; the new lamp is ahead-left of the player. Console reports `Blender GLB ready`.

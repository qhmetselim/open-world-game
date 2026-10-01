# Stage 25 — visual LOD and performance integration

Render-only integration over 9127300. No physics, AI, topology, streaming activation,
camera input, lighting or asset-source changes. No new gameplay UI.

## Policy (metres, horizontal camera distance)

`render/VisualLod.ts` owns the policy with a 10 m Schmitt hysteresis band:

| Content | Near | Mid | Far |
| --- | --- | --- | --- |
| Buildings | detailed GLB facade modules to 115 | opaque instanced window boxes and cornices to 245 | original facade volumes, roofs/parapets and foundations retained |
| Trees | original GLB to 180 | shared low-poly crowns/trunks to 285 | culled into existing fog |
| Street lamps | original GLB to 285 | no extra tier needed | culled |
| Bushes/small furniture/signs | original models to 120 | no replacement needed | culled |
| Vehicles | original models to 205 | active population already capped; no inferior body proxy | visual cull only |
| NPC/police characters | original models to 145 | existing active/background simulation untouched | visual cull only |

The nominal vehicle/character near thresholds are reserved for a future mid representation;
both currently retain full geometry until the far cutoff. Gameplay/player camera distances
remain well inside the full-quality zone. Explicit hidden/disabled vehicle views stay hidden,
including traffic takeover and parked vehicles outside loaded terrain.

Building windows switch complementary instance sets: detailed OR simple, never both.
Different facade bays transition locally, not all buildings in a 128 m chunk simultaneously.
Silhouette volume is never removed by render LOD. No extra distant world is generated.
Tree proxies preserve the authored broad/column crown centres and proportions.
Transitions use opaque geometry and hysteresis, not transparency, new shaders or postprocessing.
Small geometric changes may still be visible if deliberately inspecting the threshold.

## Resources and shadows

- Instance matrices and colours are compacted together only when the selected set changes.
  Static batches skip evaluation until the camera moves at least 1 m (Manhattan distance).
- Original conservative bounding volumes remain valid for all subsets; frustum culling stays on.
- The fixed GLB library still owns merged geometry. Environment views now borrow these templates
  instead of allocating redundant clones. Procedural proxy geometry remains World-owned.
- Chunk disposal releases instance buffers and unregisters scene-local callbacks. Entity disposal
  also unregisters callbacks; WeakMap scene indexing does not retain disposed worlds.
- Near shadow casters use an 80 m budget, with a conservative extent allowance for large building
  volumes. Far batches/characters/vehicles stop casting. Trees' distant proxies do not cast.
  Some near/far instances share a shadow-enabled batch; the existing shadow frustum clips it.
- Stage 24 lighting/materials, 2048² map and texel-snapped shadow camera are unchanged.

## Short QA and measurements

Existing `/qa.html` provides production World/traffic/NPC views. `?detail=full` is a development
fixture-only reference with all render detail enabled, not a gameplay option or an exact replay
of Stage 24's old chunk-distance prop culling. No new gameplay HUD was added. Fixture telemetry
reports GPU geometry/texture counts, fixed GLB library counts and LOD registrations.

Same origin panorama, 1280×720 browser viewport (moving traffic is not frame-identical):

| Rendering | FPS | Draws | Triangles |
| --- | ---: | ---: | ---: |
| Full-detail reference | 120 | 241 | 209,904 |
| LOD | 120 | 194 | 108,636 |

Approximately 48% fewer submitted triangles and 20% fewer draw calls in this view; FPS is
refresh-capped, not a claim of doubled frame rate. A denser region measured 120 FPS / 256 draws /
155,132 triangles; a sparse region 120 / 160 / 80,474. Streaming load intervals briefly sampled
104–112 FPS. These are smoke observations, not a benchmark guarantee.

Two short 8-chunk-out-and-return **programmatic focus streaming** cycles (not a physics driving
stress test) inspected origin, residential/dense and sparse areas:

- terrain/environment views: 25 → peak 30 → 25; 130 cumulative unloads after two cycles;
- props in resident chunks: 457 → peak 565 → 457; visible instances varied with camera/hysteresis;
- GLB source library: 21; merged templates: 15; textures: 4 throughout;
- LOD registrations: initial 41, sampled peak 46, return 41;
- physics bodies: initial 48, sampled peak 62, final 48; traffic ≤8 and NPC ≤20;
- GPU geometries: initial panorama 133, sampled peak 200, returns 172/175. This includes lazy
  uploads and bounded pre-existing character-part palette caches; it is not all chunk geometry.
  Revisited dense area stayed around 197–200. No distance-proportional accumulation observed in
  this short run; this is not a long-duration leak audit.

Browser screenshots inspected near pedestrians, a moving crossover, trees/lamps, building
facades and skylines. Console warning/error list empty. Near meshes/materials and shadows
remain intact. No pointer-lock driving or extended gameplay stress suite was required here.

Validation: typecheck, lint, build all passed; 23/23 targeted LOD, building lifecycle,
asset/cache, environment and vehicle takeover/manager tests passed (7 new tests). The existing
environment visibility assertion was updated from whole-chunk visibility to the new per-prop
distance rule, while retaining near visibility and disposal assertions. Full stress suite was
not rerun. Main game smoke measured 120 FPS / 113 draws / 33,960 triangles at spawn; this is a
different viewpoint from the panorama comparison. Existing ~3.67 MB JS bundle warning remains;
no bundler hacks or physics changes.

# Stage 24 — daylight rendering

Render-only pass, baseline `522f126`. No physics, controllers, AI, graph, streaming,
camera input/FOV, or GLB geometry changes. No LOD, weather, time cycle or post stack.

## Lighting and atmosphere

- One directional sun, unchanged direction `(-65, 95, 45)`, neutral warm white,
  intensity 3.2. Sky/ground hemisphere fill 0.95, ACES exposure 1.05, sRGB output.
- Generated 256×128 linear half-float environment texture, intensity 0.45. Three.js
  creates/caches a PMREM once; SceneManager owns the source and disposes it (which
  releases the renderer's cached PMREM). No reflection capture each frame.
- Procedural sky has a soft horizon, small sun disc and restrained halo. Its visible
  gradient is display-referred: Three.js applies fog after tone mapping, so the sky
  deliberately skips ACES to match the fog horizon rather than double-transform it.
- Fog 120–325 m; lower-horizon haze prevents the sky underside turning abruptly
  brown/green behind distant terrain. This softens distance transitions, not LOD.
- Existing PCF soft shadows and light-space texel snapping retained. 2048² map,
  ±54 m projection instead of ±65 m (about 20% more pixels/metre), bias -0.00008,
  normal bias 0.035. Small props retain their existing no-shadow policy; shadow
  caster frustum still bounds the sun pass. No extra shadow-casting lights.

## Material consistency

The GLB batching adapter previously retained colours but discarded authored
roughness/metalness, making facade glass, concrete and metal use one finish.
`surfaceFinish` now packs those two values into shared geometry. ModuleMaterial
reads them in one opaque draw, preserving existing batching. Building modules,
street furniture/vegetation and signal structures use this material; procedural
environment fallbacks provide the same attribute. Cloth stays matte. Vehicle
paint/glass keep authored materials and now benefit from the environment light.
Asphalt, concrete, curb and markings have a restrained neutral palette separation.

## Visual review and checks

Live Blender MCP: `preview_daylight.py` copies the active vehicle/character review
scene and applies a daylight rig without altering source scenes or exported assets.
Cycles/AgX is a material sanity check, not a pixel-equivalent ACES runtime reference.

Browser: three world areas (QA focus X=210, 722, 1234), panorama, traffic, walking
NPC, plus normal player spawn and police response fixture. Console clean in the
checked scenes. Normal spawn: about 123 FPS / 178 draws / 96,672 triangles; inspected
world views about 110–120 FPS, 72–236 draws / 116k–217k triangles. Different viewpoints
and moving traffic make these observations, not a controlled benchmark. Baseline
QA was ~120 FPS; no obvious collapse was observed. No large stress suite run.

Checks: typecheck, lint, build and 11 targeted render/asset tests (three new small
tests: deterministic finite environment, ownership/disposal, fixed shadow budget
and unchanged camera transform). Existing large bundle warning remains.

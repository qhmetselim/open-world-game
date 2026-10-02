# Stage 26 — visual and animation polish

## Reference assessment

The supplied images were used as direction, not as screenshots of this game.
Their largest advantages are layered/dense streets, natural articulated people,
readable storefront rhythm, and a closer rear-follow camera. The existing world
is still a sparse, flat procedural network with large building footprints. This
pass does not add the references' coast, hills, landmarks, sunset, or world layout.
It is not a claim of reference-image parity.

## Changes

- Retained the shared rigid-part GLB character rig; added knees and articulated
  feet, planted/swing phases, speed-driven cadence, idle breathing, upper-body
  weight shift, sprint blending and render-only yaw easing. Slightly narrowed
  shoulders/torso. Player sprint blending uses existing walk/sprint speed limits;
  it does not reinterpret ordinary movement as sprint or alter those limits.
- Pistol draw/holster travel through the hip over 0.38 seconds. Existing grip IK,
  muzzle/hitscan, flash and recoil remain authoritative. NPC death visually falls
  over 0.55 seconds before the existing corpse fade/cleanup.
- Added a 1.65-second render-only vehicle presentation: approach, reach, door
  swing, sideways duck/seat transfer, close; reversed for exit. Front/rear
  approaches go around the body. Physics takeover and validated safe exit remain
  atomic; controls are gated during presentation, with no duplicate player body.
- All four Blender car bodies export named front-hinge door skins, cut from the
  actual fixed shell, plus a 25 mm inner skin. Closed silhouette, common wheels,
  chassis sizes, physics tuning and control signs are retained.
- Rear building elevations now have windows/cornices/pier rhythm in existing
  shared instance batches and LOD. Modestly increased roadside prop spacing
  density and residential/urban vegetation, retaining caps and clearance checks.
  Tree canopy geometry is less coarse. Added inexpensive static sky cloud banks;
  no weather/time-of-day state, textures or post-processing.
- Third-person distance/target framing and vehicle height/look-ahead framing
  were adjusted. Mouse convention, collision and camera smoothing remain intact.

## Verification

- Blender MCP character and four-vehicle family reviews; reproducible sources
  and all GLBs regenerated with `npm run assets:build`. Asset validators reported
  zero errors/warnings. No new imported assets or unique per-entity materials.
- Typecheck, lint, build, existing regression suite and targeted render/vehicle/
  combat/environment tests passed: 243/243 total (6 added), 67/67 targeted.
  New checks cover door hinges, entry/exit
  endpoints and frame rates, avoiding the hood, feet grounding, draw/holster.
- Browser production Game: E enter, drive-right input, four wheel contacts,
  safe exit, movement and equip. Character review: walk/run, draw/aim/fire,
  holster, corpse fade, and reach/seat snapshots from multiple angles.
- Isolated production-adapter combat fixture: real hitscan damage 100→66→32→0,
  police arrival/ENGAGE, death/fade, money drop, and holster. These are simulated
  pointer commands, not proof of native pointer-lock input.
- Commercial, residential and mixed-use street views checked across three
  districts. Warm city-review samples: about 120–138 FPS, 123–140 draw calls,
  73k–116k triangles. Production gameplay views varied around 120 FPS,
  127–277 draws and 39k–73k triangles. Different camera/simulation contexts are
  not a controlled before/after benchmark. Console error/warning checks were
  empty in the inspected sessions. Existing Rapier/Vite large-bundle warning remains.

## Limits / manual feel check

This remains procedural rigid-part animation, not authored skeletal clips or
full terrain foot IK. Existing fast player movement speeds were not retuned;
extreme slopes and sharp strafing can still show foot sliding. Door reach is a
simple pose, not hand-to-handle contact IK. Safe exit is collision validated,
but the visual limb path is not a second character collision simulation.
The sparse world composition remains substantially below the dense references.

Manual pointer-lock feel check: walk/sprint/stop, Q draw, RMB aim/LMB fire,
Q holster, E enter/drive/exit, including near walls and on sloped parking spots.
No following stage or new gameplay feature was added.

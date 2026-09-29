import streetLampUrl from '../../../assets/models/props/street-lamp-test.glb?url';
import sedanUrl from '../../../assets/models/vehicles/sedan.glb?url';
import policeUrl from '../../../assets/models/vehicles/police.glb?url';
import wheelUrl from '../../../assets/models/vehicles/wheel.glb?url';
import pistolUrl from '../../../assets/models/weapons/pistol.glb?url';
import signalUrl from '../../../assets/models/props/signal.glb?url';
import benchUrl from '../../../assets/models/props/bench.glb?url';
import binUrl from '../../../assets/models/props/bin.glb?url';

/** Stable content IDs, Vite-resolved URLs (including non-root deployments). */
export const modelCatalog = {
  streetLampTest: { id: 'props/street-lamp-test', url: streetLampUrl, heightMetres: 4.89 },
  sedan: { id: 'vehicles/sedan', url: sedanUrl },
  police: { id: 'vehicles/police', url: policeUrl },
  wheel: { id: 'vehicles/wheel', url: wheelUrl },
  pistol: { id: 'weapons/pistol', url: pistolUrl },
  signal: { id: 'props/signal', url: signalUrl },
  bench: { id: 'props/bench', url: benchUrl },
  bin: { id: 'props/bin', url: binUrl }
} as const;

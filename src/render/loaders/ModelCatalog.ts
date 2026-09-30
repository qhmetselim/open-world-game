import streetLampUrl from '../../../assets/models/props/street-lamp-test.glb?url';
import sedanUrl from '../../../assets/models/vehicles/sedan.glb?url';
import policeUrl from '../../../assets/models/vehicles/police.glb?url';
import wheelUrl from '../../../assets/models/vehicles/wheel.glb?url';
import pistolUrl from '../../../assets/models/weapons/pistol.glb?url';
import signalUrl from '../../../assets/models/props/signal.glb?url';
import benchUrl from '../../../assets/models/props/bench.glb?url';
import binUrl from '../../../assets/models/props/bin.glb?url';
import windowUrl from '../../../assets/models/city/facade-window.glb?url';
import balconyUrl from '../../../assets/models/city/balcony.glb?url';
import awningUrl from '../../../assets/models/city/awning.glb?url';
import entrySignUrl from '../../../assets/models/city/entry-sign.glb?url';
import planterUrl from '../../../assets/models/city/planter.glb?url';
import roofUnitUrl from '../../../assets/models/city/roof-unit.glb?url';
import treeBroadUrl from '../../../assets/models/city/tree-broad.glb?url';
import treeColumnUrl from '../../../assets/models/city/tree-column.glb?url';
import bushUrl from '../../../assets/models/city/bush.glb?url';
import utilityBoxUrl from '../../../assets/models/city/utility-box.glb?url';

/** Stable content IDs, Vite-resolved URLs (including non-root deployments). */
export const modelCatalog = {
  streetLampTest: { id: 'props/street-lamp-test', url: streetLampUrl, heightMetres: 4.89 },
  sedan: { id: 'vehicles/sedan', url: sedanUrl },
  police: { id: 'vehicles/police', url: policeUrl },
  wheel: { id: 'vehicles/wheel', url: wheelUrl },
  pistol: { id: 'weapons/pistol', url: pistolUrl },
  signal: { id: 'props/signal', url: signalUrl },
  bench: { id: 'props/bench', url: benchUrl },
  bin: { id: 'props/bin', url: binUrl },
  facadeWindow: { id: 'city/facade-window', url: windowUrl },
  balcony: { id: 'city/balcony', url: balconyUrl },
  awning: { id: 'city/awning', url: awningUrl },
  entrySign: { id: 'city/entry-sign', url: entrySignUrl },
  planter: { id: 'city/planter', url: planterUrl },
  roofUnit: { id: 'city/roof-unit', url: roofUnitUrl },
  treeBroad: { id: 'city/tree-broad', url: treeBroadUrl },
  treeColumn: { id: 'city/tree-column', url: treeColumnUrl },
  bush: { id: 'city/bush', url: bushUrl },
  utilityBox: { id: 'city/utility-box', url: utilityBoxUrl }
} as const;

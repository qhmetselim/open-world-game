import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, weld } from '@gltf-transform/functions';
import validator from 'gltf-validator';

const root = fileURLToPath(new URL('../../', import.meta.url));
const blender = process.env.BLENDER_BIN ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const temporary = await mkdtemp(join(tmpdir(), 'open-world-blender-'));
try {
  const raw = join(temporary, 'street-lamp.glb');
  const result = spawnSync(blender, ['--background', '--factory-startup', '--python-exit-code', '1',
    '--python', resolve(root, 'scripts/blender/street_lamp.py'), '--', '--output', raw], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Blender exited with ${result.status}`);
  const core = spawnSync(blender, ['--background', '--factory-startup', '--python-exit-code', '1',
    '--python', resolve(root, 'scripts/blender/core_assets.py'), '--', '--output', temporary], { stdio: 'inherit' });
  if (core.error) throw core.error;
  if (core.status !== 0) throw new Error(`Core asset build exited with ${core.status}`);
  const city = spawnSync(blender, ['--background', '--factory-startup', '--python-exit-code', '1',
    '--python', resolve(root, 'scripts/blender/city_assets.py'), '--', '--output', temporary], { stdio: 'inherit' });
  if (city.error) throw city.error;
  if (city.status !== 0) throw new Error(`City asset build exited with ${city.status}`);
  const human = spawnSync(blender, ['--background', '--factory-startup', '--python-exit-code', '1',
    '--python', resolve(root, 'scripts/blender/characters.py'), '--', '--output', temporary], { stdio: 'inherit' });
  if (human.error) throw human.error;
  if (human.status !== 0) throw new Error(`Character build exited with ${human.status}`);
  const io = new NodeIO();
  const assets = [['street-lamp', 'props/street-lamp-test'], ['sedan', 'vehicles/sedan'],
    ['police', 'vehicles/police'], ['wheel', 'vehicles/wheel'], ['pistol', 'weapons/pistol'],
    ['signal', 'props/signal'], ['bench', 'props/bench'], ['bin', 'props/bin'], ['human', 'characters/human'],
    ...['facade-window', 'balcony', 'awning', 'entry-sign', 'planter', 'roof-unit', 'tree-broad', 'tree-column', 'bush', 'utility-box'].map(name => [name, `city/${name}`])];
  for (const [source, target] of assets) {
  const input = source === 'street-lamp' ? raw : join(temporary, `${source}.glb`);
  const document = await io.read(input);
  await document.transform(dedup(), prune(), weld());
  const bytes = await io.writeBinary(document);
  const report = await validator.validateBytes(bytes, { uri: `${source}.glb` });
  if (report.issues.numErrors || report.issues.numWarnings) throw new Error(JSON.stringify(report.issues));
  const primitives = document.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives());
  const triangles = primitives.reduce((total, primitive) => total + (primitive.getIndices()?.getCount() ?? 0) / 3, 0);
  if (triangles > 6000 || bytes.length > 400_000) throw new Error(`${source} exceeded its web budget`);
  const output = resolve(root, `assets/models/${target}.glb`);
  await mkdir(resolve(output, '..'), { recursive: true });
  await io.write(output, document);
  console.info({ output, rawBytes: (await readFile(input)).length, bytes: bytes.length,
    triangles, primitives: primitives.length, materials: document.getRoot().listMaterials().length,
    validationErrors: report.issues.numErrors, validationWarnings: report.issues.numWarnings });
  }
} finally {
  // This path is our unique mkdtemp staging directory, never project/user data.
  await rm(temporary, { recursive: true, force: true });
}

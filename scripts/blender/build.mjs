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
  const io = new NodeIO();
  const document = await io.read(raw);
  await document.transform(dedup(), prune(), weld());
  const bytes = await io.writeBinary(document);
  const report = await validator.validateBytes(bytes, { uri: 'street-lamp-test.glb' });
  if (report.issues.numErrors || report.issues.numWarnings) throw new Error(JSON.stringify(report.issues));
  const primitives = document.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives());
  const triangles = primitives.reduce((total, primitive) => total + (primitive.getIndices()?.getCount() ?? 0) / 3, 0);
  if (triangles > 1000 || bytes.length > 100_000) throw new Error('Test prop exceeded its web budget');
  const output = resolve(root, 'assets/models/props/street-lamp-test.glb');
  await mkdir(resolve(root, 'assets/models/props'), { recursive: true });
  await io.write(output, document);
  console.info({ output, rawBytes: (await readFile(raw)).length, bytes: bytes.length,
    triangles, primitives: primitives.length, materials: document.getRoot().listMaterials().length,
    validationErrors: report.issues.numErrors, validationWarnings: report.issues.numWarnings });
} finally {
  // This path is our unique mkdtemp staging directory, never project/user data.
  await rm(temporary, { recursive: true, force: true });
}

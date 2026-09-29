import streetLampUrl from '../../../assets/models/props/street-lamp-test.glb?url';

/** Stable content IDs, Vite-resolved URLs (including non-root deployments). */
export const modelCatalog = {
  streetLampTest: { id: 'props/street-lamp-test', url: streetLampUrl, heightMetres: 4.89 }
} as const;

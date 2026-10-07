// Build: copia as bibliotecas do npm para /public/vendor (sem depender de CDN)
// e compila o Tailwind CSS para /public/assets/app.css.
import { cp, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const nm = (p) => `${root}node_modules/${p}`;
const out = (p) => `${root}public/vendor/${p}`;

await mkdir(out(''), { recursive: true });
await Promise.all([
  cp(nm('leaflet/dist/leaflet.js'), out('leaflet/leaflet.js')),
  cp(nm('leaflet/dist/leaflet.css'), out('leaflet/leaflet.css')),
  cp(nm('leaflet/dist/images'), out('leaflet/images'), { recursive: true }),
  cp(nm('leaflet.markercluster/dist/leaflet.markercluster.js'), out('markercluster/leaflet.markercluster.js')),
  cp(nm('leaflet.markercluster/dist/MarkerCluster.css'), out('markercluster/MarkerCluster.css')),
  cp(nm('lucide/dist/umd/lucide.min.js'), out('lucide/lucide.min.js')),
]);

execFileSync(nm('.bin/tailwindcss'), ['-i', `${root}src/styles.css`, '-o', `${root}public/assets/app.css`, '--minify'], {
  stdio: 'inherit', cwd: root,
});
console.log('✔ build concluído');

// Build do site estático (public/):
//  1. Leaflet + markercluster copiados do npm (sem CDN).
//  2. Lucide reduzido: só os ícones que o código usa (de ~350 KB para ~12 KB).
//  3. Fontes servidas pelo próprio site (o Google não recebe o IP de quem visita).
//  4. Tailwind CSS compilado e minificado.
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const nm = (p) => `${root}node_modules/${p}`;
const out = (p) => `${root}public/vendor/${p}`;

await mkdir(out('fonts/files'), { recursive: true });
await mkdir(out('lucide'), { recursive: true });

// 1. Leaflet
await Promise.all([
  cp(nm('leaflet/dist/leaflet.js'), out('leaflet/leaflet.js')),
  cp(nm('leaflet/dist/leaflet.css'), out('leaflet/leaflet.css')),
  cp(nm('leaflet/dist/images'), out('leaflet/images'), { recursive: true }),
  cp(nm('leaflet.markercluster/dist/leaflet.markercluster.js'), out('markercluster/leaflet.markercluster.js')),
  cp(nm('leaflet.markercluster/dist/MarkerCluster.css'), out('markercluster/MarkerCluster.css')),
]);

// 2. Lucide: procura nomes de ícones citados entre aspas no código do site.
const lucide = await import('lucide');
const pascal = (nome) => nome.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
const fontes = [
  ...(await readdir(`${root}public`)).filter((f) => /\.(html|js)$/.test(f)).map((f) => `${root}public/${f}`),
  ...(await readdir(`${root}public/js`)).map((f) => `${root}public/js/${f}`),
];
const usados = new Set();
for (const arquivo of fontes) {
  for (const [, nome] of (await readFile(arquivo, 'utf8')).matchAll(/["'`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)["'`]/g)) {
    if (lucide[pascal(nome)] && typeof lucide[pascal(nome)] === 'object') usados.add(pascal(nome));
  }
}
const nomes = [...usados].sort();
await build({
  stdin: {
    contents: `import { createIcons, ${nomes.join(', ')} } from 'lucide';
      const icons = { ${nomes.join(', ')} };
      window.lucide = { createIcons: (opcoes = {}) => createIcons({ icons, ...opcoes }) };`,
    resolveDir: root,
  },
  bundle: true, minify: true, format: 'iife', outfile: out('lucide/lucide.min.js'), logLevel: 'warning',
});

// 3. Fontes (@fontsource): Plus Jakarta Sans 400–700 e Cinzel 500/700, todos os
//    subconjuntos (latin-ext cobre diacríticos iorubás como ọ̀ e ṣ). O navegador
//    só baixa o subconjunto necessário (unicode-range).
const pesos = [['plus-jakarta-sans', [400, 500, 600, 700]], ['cinzel', [500, 700]]];
let css = '';
for (const [familia, lista] of pesos) {
  for (const peso of lista) {
    const original = await readFile(nm(`@fontsource/${familia}/${peso}.css`), 'utf8');
    // Mantém só woff2 (todos os navegadores atuais) e copia os arquivos usados.
    const ajustado = original.replace(/, url\([^)]+\.woff\) format\('woff'\)/g, '');
    for (const [, arquivo] of ajustado.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)) {
      await cp(nm(`@fontsource/${familia}/files/${arquivo}`), out(`fonts/files/${arquivo}`));
    }
    css += ajustado;
  }
}
await writeFile(out('fonts/fonts.css'), css);

// 4. Tailwind — roda o CLI com o próprio Node (process.execPath) em vez do
//    atalho node_modules/.bin, que no Windows é um .cmd e falha com ENOENT.
execFileSync(process.execPath, [nm('@tailwindcss/cli/dist/index.mjs'), '-i', `${root}src/styles.css`, '-o', `${root}public/assets/app.css`, '--minify'], {
  stdio: ['ignore', 'ignore', 'inherit'], cwd: root,
});
console.log(`✔ build concluído (${nomes.length} ícones Lucide)`);

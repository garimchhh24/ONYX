// Turns the single-file Vite build into a claude.ai artifact page: no document skeleton
// (the host adds it), <title> first, fonts from Google Fonts, everything else inline.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input = 'artifact-dist/artifact.html', output = 'artifact-dist/cadence-preview.html'] = process.argv;
const html = readFileSync(input, 'utf8');
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
if (scripts.length !== 1) throw new Error(`expected one inline script, found ${scripts.length}`);
if (/<script[^>]+src=/.test(scripts[0])) throw new Error('script is not inlined');
const page = [
  '<title>CADENCE</title>',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=JetBrains+Mono:wght@400..700&family=Sora:wght@400..700&display=swap">',
  ...styles,
  '<div id="root"></div>',
  ...scripts,
  '',
].join('\n');
writeFileSync(output, page);
console.log(`artifact page: ${output} (${(page.length / 1024 / 1024).toFixed(2)} MB)`);

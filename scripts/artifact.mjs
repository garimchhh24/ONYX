// Turns the single-file build into a Claude artifact page:
// no document skeleton, <title> first, only allowed external resources (Google Fonts).
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input = 'dist-single/index.html', output = 'dist-single/onyx-artifact.html'] = process.argv;
const html = readFileSync(input, 'utf8');
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
if (!scripts.length) throw new Error('no inline script found');
const out = [
  '<title>ONYX Trading Journal</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tektur:wght@400..700&display=swap">',
  ...styles,
  '<div id="root"></div>',
  ...scripts,
  '',
].join('\n');
writeFileSync(output, out);
console.log(`artifact page: ${output} (${(out.length / 1024).toFixed(0)} KB)`);

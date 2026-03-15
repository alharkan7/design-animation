
import fs from 'fs';
import path from 'path';

const baseDir = '/Users/alharkan/Documents/Repositories/Archive/design-animation';
const htmlPath = path.join(baseDir, 'languages/index.html');
const jsPath = path.join(baseDir, 'src/languages_animation.js');
const dataPath = path.join(baseDir, 'public/languages/lang_list.json');
const outputPath = path.join(baseDir, 'languages/standalone.html');

console.log('Reading files...');
let html = fs.readFileSync(htmlPath, 'utf8');
let js = fs.readFileSync(jsPath, 'utf8');
const data = fs.readFileSync(dataPath, 'utf8');

console.log('Inserting data into JS...');
// Replace the fetch call with the actual data
const fetchPattern = /const resList = await fetch\(['"]\/languages\/lang_list\.json['"]\);[\s\S]*?const list = await resList\.json\(\);/;
const replacement = `const list = ${data};`;

if (fetchPattern.test(js)) {
  js = js.replace(fetchPattern, replacement);
  console.log('Successfully injected data into JS.');
} else {
  console.warn('Could not find the fetch pattern in JS. Manual replacement might be needed.');
}

console.log('Inlining JS into HTML...');
// Replace the script tag
const scriptTagPattern = /<script type="module" src="\/src\/languages_animation\.js"><\/script>/;
const inlinedScript = `<script type="module">
${js}
</script>`;

if (scriptTagPattern.test(html)) {
  html = html.replace(scriptTagPattern, inlinedScript);
  console.log('Successfully inlined JS into HTML.');
} else {
  console.warn('Could not find the script tag in HTML. Manual replacement might be needed.');
}

// Optional: Inline the favicon if you want it TRULY standalone, but skipping for simplicity unless requested.
// html = html.replace('<link rel="icon" type="image/svg+xml" href="/vite.svg" />', '');

console.log(`Writing output to ${outputPath}...`);
fs.writeFileSync(outputPath, html);
console.log('Done!');

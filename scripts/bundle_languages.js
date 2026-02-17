import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const htmlPath = path.join(projectRoot, 'languages', 'index.html');
const jsPath = path.join(projectRoot, 'src', 'languages_animation.js');
const jsonPath = path.join(projectRoot, 'public', 'languages', 'lang_list.json');
const outputPath = path.join(projectRoot, 'languages', 'bundled.html');

console.log('Reading files...');
try {
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    let jsContent = fs.readFileSync(jsPath, 'utf8');
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');

    console.log('Processing JS content...');
    
    // 1. Inject the JSON data
    // Use a unique variable name to avoid conflicts
    const inlinedDataConst = `const INLINED_DATA = ${jsonContent};\n\n`;
    
    // Prepend data to JS content
    jsContent = inlinedDataConst + jsContent;

    // 2. Replace the fetch calls
    // We look for the specific pattern used in src/languages_animation.js
    // const resList = await fetch('/languages/lang_list.json');
    // const list = await resList.json();

    const fetchPattern = /const resList = await fetch\(['"][^'"]+['"]\);/g;
    const jsonPattern = /const list = await resList\.json\(\);/g;

    if (!fetchPattern.test(jsContent) || !jsonPattern.test(jsContent)) {
        console.warn('Warning: Fetch pattern not found in JS. Data might not be replaced correctly.');
    }

    jsContent = jsContent.replace(fetchPattern, '// Data inlined: fetch removed');
    jsContent = jsContent.replace(jsonPattern, 'const list = INLINED_DATA;');

    console.log('Processing HTML content...');
    // 3. Replace external script with inline script
    // <script type="module" src="/src/languages_animation.js"></script>
    // We use a regex that handles potential whitespace variations
    const scriptTagRegex = /<script\s+type="module"\s+src="\/src\/languages_animation\.js"\s*><\/script>/;
    
    // Create the inline script tag
    // Note: We keep type="module" to support top-level await if used, and strict mode
    const inlineScript = `<script type="module">\n${jsContent}\n</script>`;

    const newHtmlContent = htmlContent.replace(scriptTagRegex, () => inlineScript);

    if (newHtmlContent === htmlContent) {
        console.error('Error: Could not find the script tag to replace in HTML.');
        process.exit(1);
    }

    console.log(`Writing output to ${outputPath}...`);
    fs.writeFileSync(outputPath, newHtmlContent);
    console.log('Done! Bundled file created successfully.');

} catch (err) {
    console.error('An error occurred:', err);
    process.exit(1);
}

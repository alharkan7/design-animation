const fs = require('fs');
const path = require('path');

const indexHtmlPath = path.join(__dirname, 'map3d', 'index.html');
const mainJsPath = path.join(__dirname, 'map3d', 'main.js');

let indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');

// Update index.html styles for light/warm theme
indexHtml = indexHtml.replace(/background: #0f172a; \/\* Dark background/g, 'background: #d6e1e6; /* Soft blue-grey water background');
indexHtml = indexHtml.replace(/color: white;/g, 'color: #1e293b;');
indexHtml = indexHtml.replace(/background: rgba\(15, 23, 42, 0\.7\);/g, 'background: rgba(255, 255, 255, 0.85);');
indexHtml = indexHtml.replace(/border: 1px solid rgba\(255, 255, 255, 0\.1\);/g, 'border: 1px solid rgba(0, 0, 0, 0.1);');
indexHtml = indexHtml.replace(/background: linear-gradient\(to right, #fff, #38bdf8\);/g, 'background: linear-gradient(to right, #ea580c, #f59e0b);');
indexHtml = indexHtml.replace(/color: #94a3b8;/g, 'color: #475569;');
indexHtml = indexHtml.replace(/color: #e2e8f0;/g, 'color: #1e293b;');
indexHtml = indexHtml.replace(/color: #cbd5e1;/g, 'color: #334155;');
indexHtml = indexHtml.replace(/background: linear-gradient\(to top, #0ea5e9, #38bdf8, #818cf8, #c084fc, #e879f9, #f472b6\);/g, 'background: linear-gradient(to top, #fcd34d, #fbbf24, #f59e0b, #ea580c, #b91c1c);');
indexHtml = indexHtml.replace(/background: #1e293b;/g, 'background: #f2efe9;');
indexHtml = indexHtml.replace(/border: 1px solid #334155;/g, 'border: 1px solid #d6d3d1;');
indexHtml = indexHtml.replace(/background: rgba\(15, 23, 42, 0\.8\);/g, 'background: rgba(255, 255, 255, 0.8);');
indexHtml = indexHtml.replace(/color: #38bdf8;/g, 'color: #ea580c;');
indexHtml = indexHtml.replace(/background: rgba\(15, 23, 42, 0\.85\);/g, 'background: rgba(255, 255, 255, 0.9);');
indexHtml = indexHtml.replace(/border: 1px solid rgba\(56, 189, 248, 0\.5\);/g, 'border: 1px solid rgba(0, 0, 0, 0.1);');
indexHtml = indexHtml.replace(/box-shadow: 0 10px 30px -10px rgba\(0,0,0,0\.7\), 0 0 15px rgba\(56, 189, 248, 0\.1\);/g, 'box-shadow: 0 10px 30px -10px rgba(0,0,0,0.15);');
indexHtml = indexHtml.replace(/color: #f8fafc;/g, 'color: #1e293b;');
indexHtml = indexHtml.replace(/background: rgba\(0, 0, 0, 0\.25\);/g, 'background: rgba(0, 0, 0, 0.03);');
indexHtml = indexHtml.replace(/border: 1px solid rgba\(255, 255, 255, 0\.05\);/g, 'border: 1px solid rgba(0, 0, 0, 0.05);');

fs.writeFileSync(indexHtmlPath, indexHtml);

let mainJs = fs.readFileSync(mainJsPath, 'utf-8');

// Update main.js for warm Apple maps theme
mainJs = mainJs.replace(/const colorGood = \[15, 23, 42\];/g, 'const colorGood = [242, 239, 233];');
mainJs = mainJs.replace(/const colorPoor = \[127, 29, 29\];/g, 'const colorPoor = [224, 122, 95];');
mainJs = mainJs.replace(/backgroundColor: '#0f172a'/g, "backgroundColor: '#d6e1e6'");
mainJs = mainJs.replace(/color: \['#0ea5e9', '#38bdf8', '#818cf8', '#c084fc', '#e879f9', '#f472b6'\]/g, "color: ['#fcd34d', '#fbbf24', '#f59e0b', '#ea580c', '#b91c1c']");
mainJs = mainJs.replace(/color: '#1e293b'/g, "color: '#f2efe9'");
mainJs = mainJs.replace(/borderColor: 'rgba\(56, 189, 248, 0\.4\)'/g, "borderColor: 'rgba(200, 195, 185, 0.8)'");

fs.writeFileSync(mainJsPath, mainJs);

console.log("Theme updated.");

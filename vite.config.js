import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { GoogleGenAI, Modality } from '@google/genai';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import puppeteer from 'puppeteer';
import PptxGenJS from 'pptxgenjs';
import { STYLE_PRESETS, SLIDES_SYSTEM_INSTRUCTION, buildPrompt, sanitizeGeneratedHtml, validateGeneratedHtml } from './lib/slides-config.js';
import { generatePptxBuffer } from './lib/pptx-export.js';
import { SYSTEM_INSTRUCTION as MG_SYSTEM_INSTRUCTION, buildPrompt as buildMGPrompt, sanitizeHtml as sanitizeMGHtml, validateHtml as validateMGHtml, CSS_PRESETS } from './lib/motion-graphics-config.js';

function readJsonBody(req, limitBytes = 100_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function toNodeReadableStream(audio) {
  if (!audio) return null;
  if (typeof audio.pipe === 'function') return audio;
  if (typeof audio.getReader === 'function') return Readable.fromWeb(audio);
  if (audio instanceof ArrayBuffer) return Readable.from([Buffer.from(audio)]);
  if (ArrayBuffer.isView(audio)) return Readable.from([Buffer.from(audio.buffer)]);
  return Readable.from(audio);
}

function ttsApiPlugin() {
  let client = null;

  async function handler(req, res) {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Method not allowed');
      return;
    }

    const apiKey = process.env.ELEVENLABS_API_KEY || process.env.VITE_ELEVENLABS_API_KEY;
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Missing ELEVENLABS_API_KEY');
      return;
    }

    if (!client) client = new ElevenLabsClient({ apiKey });

    try {
      const body = await readJsonBody(req);
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      const voiceId = typeof body.voiceId === 'string' ? body.voiceId : 'JBFqnCBsd6RMkjVDRZzb';
      const modelId = typeof body.modelId === 'string' ? body.modelId : 'eleven_multilingual_v2';
      const outputFormat = typeof body.outputFormat === 'string' ? body.outputFormat : 'mp3_44100_128';

      if (!text) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Missing text');
        return;
      }

      const audio = await client.textToSpeech.convert(voiceId, { text, modelId, outputFormat });
      const audioStream = toNodeReadableStream(audio);
      if (!audioStream) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Unexpected audio response');
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');

      audioStream.on('error', (err) => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        }
        res.end(err?.message || 'Audio stream error');
      });

      audioStream.pipe(res);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(err?.message || 'TTS error');
    }
  }

  return {
    name: 'tts-api',
    configureServer(server) {
      server.middlewares.use('/api/tts', (req, res) => {
        handler(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/tts', (req, res) => {
        handler(req, res);
      });
    },
  };
}

function slidesGeneratorPlugin() {
  let ai = null;

  async function handler(req, res) {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Missing GEMINI_API_KEY in environment' }));
      return;
    }

    if (!ai) ai = new GoogleGenAI({ apiKey });

    try {
      const body = await readJsonBody(req, 50_000_000);
      const { fileData, fileType, fileName, style, additionalPrompt } = body;

      if (!fileData) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Missing fileData' }));
        return;
      }

      const styleKey = style || 'midnight-executive';
      const stylePreset = STYLE_PRESETS[styleKey] || STYLE_PRESETS['midnight-executive'];
      const prompt = buildPrompt(stylePreset, additionalPrompt);

      const result = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: [
          {
            role: 'user', parts: [
              { text: prompt },
              { inlineData: { mimeType: fileType, data: fileData } }
            ]
          }
        ],
        config: {
          systemInstruction: SLIDES_SYSTEM_INSTRUCTION,
          maxOutputTokens: 65536,
          responseMimeType: 'text/plain',
        }
      });

      const finishReason = result.candidates?.[0]?.finishReason;
      if (finishReason === 'MAX_TOKENS') {
        throw new Error('The generated presentation was too long and got cut off. Try a shorter document or add "keep it concise, max 10 slides" to your instructions.');
      }
      if (finishReason && finishReason !== 'STOP') {
        throw new Error(`Generation failed (reason: ${finishReason}). Please try again.`);
      }

      let html = sanitizeGeneratedHtml(result.text);
      validateGeneratedHtml(html);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ html }));

    } catch (err) {
      console.error('Slides generation error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: err?.message || 'Failed to generate slides' }));
    }
  }

  return {
    name: 'slides-generator-api',
    configureServer(server) {
      server.middlewares.use('/api/generate-slides', (req, res) => {
        handler(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/generate-slides', (req, res) => {
        handler(req, res);
      });
    },
  };
}

function infographicGeneratorPlugin() {
  let ai = null;
  let modelMethodsCache = null;

  const IMAGE_MODELS = new Set([
    'gemini-2.5-flash-image',
    'gemini-3-pro-image-preview',
    'gemini-3.1-flash-image-preview',
  ]);

  const PROMPT_EXTRACT_MODEL = 'gemini-flash-latest';

  function normalizeModelName(name) {
    if (typeof name !== 'string') return '';
    return name.startsWith('models/') ? name.slice('models/'.length) : name;
  }

  function sanitizePrompt(text) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text.trim();
    const fencedMatch = cleaned.match(/```(?:text|markdown)?\n?([\s\S]+?)```/i);
    if (fencedMatch) cleaned = fencedMatch[1].trim();
    return cleaned.replace(/^["']|["']$/g, '').trim();
  }

  function getErrorMessage(err) {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    if (typeof err.message === 'string' && err.message.trim()) return err.message;
    if (typeof err.error?.message === 'string' && err.error.message.trim()) return err.error.message;
    try {
      return JSON.stringify(err);
    } catch {
      return 'Unknown error';
    }
  }

  async function getModelSupportedMethods(model) {
    if (!modelMethodsCache) {
      modelMethodsCache = new Map();
      const pager = await ai.models.list();
      for await (const m of pager) {
        const fullName = m.name || '';
        const shortName = normalizeModelName(fullName);
        const methods = Array.isArray(m.supportedActions)
          ? m.supportedActions
          : (Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : []);
        const methodSet = new Set(methods);
        if (fullName) modelMethodsCache.set(fullName, methodSet);
        if (shortName) modelMethodsCache.set(shortName, methodSet);
      }
    }
    return modelMethodsCache.get(model) || modelMethodsCache.get(normalizeModelName(model)) || null;
  }

  function extractGeneratedImage(contentResponse) {
    const candidates = Array.isArray(contentResponse?.candidates) ? contentResponse.candidates : [];
    for (const candidate of candidates) {
      const parts = candidate?.content?.parts || [];
      for (const part of parts) {
        if (part?.inlineData?.data) {
          return {
            imageData: part.inlineData.data,
            mimeType: part.inlineData.mimeType || 'image/png',
          };
        }
      }
    }
    return null;
  }

  async function handler(req, res) {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Missing GEMINI_API_KEY in environment' }));
      return;
    }

    if (!ai) ai = new GoogleGenAI({ apiKey });

    try {
      const body = await readJsonBody(req, 60_000_000);
      const model = typeof body.model === 'string' ? body.model.trim() : '';
      const manualPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      const fileData = typeof body.fileData === 'string' ? body.fileData : '';
      const fileType = typeof body.fileType === 'string' ? body.fileType : 'application/octet-stream';
      const fileName = typeof body.fileName === 'string' ? body.fileName : 'uploaded-document';

      if (!IMAGE_MODELS.has(model)) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Invalid image model selected' }));
        return;
      }

      if (!manualPrompt && !fileData) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Provide either a prompt or a document file' }));
        return;
      }

      let generationPrompt = manualPrompt;
      let generatedFromDocument = false;

      if (fileData) {
        const extraction = await ai.models.generateContent({
          model: PROMPT_EXTRACT_MODEL,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: [
                    'Convert this document into one detailed infographic image prompt.',
                    'Goal: extract key facts, structure, and narrative from the document.',
                    'Output only the final prompt text, no markdown and no explanation.',
                    'The prompt should be clear for an image generation model to create a readable infographic with titles, sections, labels, charts/icons, and concise text snippets.',
                    manualPrompt ? `Additional user direction: ${manualPrompt}` : '',
                    `Document file name: ${fileName}`,
                  ].filter(Boolean).join('\n'),
                },
                { inlineData: { mimeType: fileType, data: fileData } },
              ],
            },
          ],
          config: {
            responseMimeType: 'text/plain',
          },
        });

        generationPrompt = sanitizePrompt(extraction.text);
        generatedFromDocument = true;

        if (!generationPrompt) {
          throw new Error('Gemini could not extract an infographic prompt from the document');
        }
      }

      const supportedMethods = await getModelSupportedMethods(model);
      let imageData = '';
      let mimeType = 'image/png';

      if (supportedMethods?.has('generateContent')) {
        const contentResponse = await ai.models.generateContent({
          model,
          contents: generationPrompt,
          config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
          },
        });

        const extracted = extractGeneratedImage(contentResponse);
        if (!extracted?.imageData) {
          throw new Error('Model returned no image output. Try a more explicit visual prompt.');
        }
        imageData = extracted.imageData;
        mimeType = extracted.mimeType;
      } else if (supportedMethods?.has('predict')) {
        const imageResponse = await ai.models.generateImages({
          model,
          prompt: generationPrompt,
          config: {
            numberOfImages: 1,
          },
        });

        const firstImage = imageResponse.generatedImages?.[0];
        const imageBytes = firstImage?.image?.imageBytes;
        const returnedMimeType = firstImage?.image?.mimeType || 'image/png';
        if (!imageBytes) {
          const reason = firstImage?.raiFilteredReason ? `: ${firstImage.raiFilteredReason}` : '';
          throw new Error(`Image generation returned no image${reason}`);
        }
        imageData = imageBytes;
        mimeType = returnedMimeType;
      } else {
        throw new Error(`Model "${model}" does not support image generation in this API key/project.`);
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        imageData,
        mimeType,
        promptUsed: generationPrompt,
        generatedFromDocument,
      }));
    } catch (err) {
      console.error('Infographic generation error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: getErrorMessage(err) || 'Failed to generate infographic' }));
    }
  }

  return {
    name: 'infographic-generator-api',
    configureServer(server) {
      server.middlewares.use('/api/generate-infographic', (req, res) => {
        handler(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/generate-infographic', (req, res) => {
        handler(req, res);
      });
    },
  };
}

// Export plugin for PDF and PPTX generation
function slidesExportPlugin() {
  let browser = null;

  async function getBrowser() {
    if (!browser) {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
    }
    return browser;
  }

  async function generatePdf(html) {
    const br = await getBrowser();
    const page = await br.newPage();

    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));

    const slideCount = await page.evaluate(() => {
      return document.querySelectorAll('section').length || 1;
    });

    const screenshots = [];
    for (let i = 0; i < slideCount; i++) {
      await page.evaluate((idx) => {
        const sections = document.querySelectorAll('section');
        sections.forEach((s, j) => {
          s.classList.remove('active', 'exit-left');
          s.style.transition = 'none';
          if (j === idx) {
            s.classList.add('active');
            s.style.opacity = '1';
            s.style.visibility = 'visible';
            s.style.transform = 'none';
            s.style.zIndex = '1';
            s.style.pointerEvents = 'auto';
          } else {
            s.style.opacity = '0';
            s.style.visibility = 'hidden';
            s.style.zIndex = '0';
            s.style.pointerEvents = 'none';
          }
        });
      }, i);

      await new Promise(r => setTimeout(r, 300));
      const screenshot = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 1280, height: 720 }
      });
      screenshots.push(screenshot);
    }
    await page.close();

    const pdfPage = await br.newPage();
    const imagesHtml = screenshots.map((s) =>
      `<div class="pg"><img src="data:image/png;base64,${s.toString('base64')}" /></div>`
    ).join('');

    await pdfPage.setContent(`<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; }
  @page { size: 1280px 720px; margin: 0; }
  .pg { width: 1280px; height: 720px; page-break-after: always; overflow: hidden; }
  .pg img { width: 100%; height: 100%; display: block; }
</style></head>
<body>${imagesHtml}</body></html>`, { waitUntil: 'load' });

    const pdfBuffer = await pdfPage.pdf({
      width: '1280px',
      height: '720px',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });

    await pdfPage.close();
    return pdfBuffer;
  }

  async function generatePptx(html) {
    return await generatePptxBuffer(html);
  }

  async function handler(req, res) {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      const body = await readJsonBody(req, 10_000_000);
      const { html, format } = body;

      if (!html) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Missing html content' }));
        return;
      }

      if (format === 'pdf') {
        const pdfBuffer = await generatePdf(html);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="slides.pdf"');
        res.end(pdfBuffer);
      } else if (format === 'pptx') {
        const pptxBuffer = await generatePptx(html);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', 'attachment; filename="slides.pptx"');
        res.end(pptxBuffer);
      } else {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Invalid format. Use "pdf" or "pptx"' }));
      }

    } catch (err) {
      console.error('Export error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: err?.message || 'Export failed' }));
    }
  }

  // Cleanup browser on process exit
  process.on('beforeExit', async () => {
    if (browser) {
      await browser.close();
    }
  });

  return {
    name: 'slides-export-api',
    configureServer(server) {
      server.middlewares.use('/api/export-slides', (req, res) => {
        handler(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/export-slides', (req, res) => {
        handler(req, res);
      });
    },
  };
}

function motionGraphicsGeneratorPlugin() {
  let ai = null;

  async function handler(req, res) {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Missing GEMINI_API_KEY in environment' }));
      return;
    }

    if (!ai) ai = new GoogleGenAI({ apiKey });

    try {
      const body = await readJsonBody(req, 1_000_000);
      const { prompt, cssPreset = 'midnight-executive' } = body;

      if (!prompt) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Missing prompt' }));
        return;
      }

      const preset = CSS_PRESETS[cssPreset] || CSS_PRESETS['midnight-executive'];
      const builtPrompt = buildMGPrompt(prompt, cssPreset);

      // Build system instruction with actual CSS values
      const systemInstruction = MG_SYSTEM_INSTRUCTION
        .replace('{PRIMARY_COLOR}', preset.colors.primary)
        .replace('{ACCENT_COLOR}', preset.colors.accent)
        .replace('{BG_COLOR}', preset.colors.bg)
        .replace('{BG_SECONDARY_COLOR}', preset.colors.bgSecondary)
        .replace('{TEXT_COLOR}', preset.colors.text)
        .replace('{TEXT_SECONDARY_COLOR}', preset.colors.textSecondary)
        .replace("{DISPLAY_FONT}'", preset.typography.display)
        .replace("{BODY_FONT}", preset.typography.body);

      const result = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: [
          { role: 'user', parts: [{ text: builtPrompt }] }
        ],
        config: {
          systemInstruction: systemInstruction,
          maxOutputTokens: 32768,
          responseMimeType: 'text/plain',
        }
      });

      const finishReason = result.candidates?.[0]?.finishReason;
      if (finishReason === 'MAX_TOKENS') {
        throw new Error('The generated motion graphic was too long and got cut off. Try a simpler prompt.');
      }
      if (finishReason && finishReason !== 'STOP') {
        throw new Error(`Generation failed (reason: ${finishReason}). Please try again.`);
      }

      let html = sanitizeMGHtml(result.text);
      validateMGHtml(html);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ html }));

    } catch (err) {
      console.error('Motion graphics generation error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: err?.message || 'Failed to generate motion graphics' }));
    }
  }

  return {
    name: 'motion-graphics-generator-api',
    configureServer(server) {
      server.middlewares.use('/api/generate-motion-graphics', (req, res) => {
        handler(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/generate-motion-graphics', (req, res) => {
        handler(req, res);
      });
    },
  };
}

function motionGraphicsExportPlugin() {
  let browser = null;

  async function getBrowser() {
    if (!browser) {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
    }
    return browser;
  }

  // Get animation duration from computed styles
  async function getAnimationDuration(page) {
    return await page.evaluate(() => {
      let maxDuration = 5000; // Default 5 seconds

      // Check all animated elements
      const elements = document.querySelectorAll('*');
      elements.forEach(el => {
        const styles = window.getComputedStyle(el);
        const animationDuration = styles.animationDuration;
        const animationDelay = styles.animationDelay;

        if (animationDuration && animationDuration !== '0s' && animationDuration !== 'none') {
          let duration = parseFloat(animationDuration);
          if (animationDuration.includes('ms')) duration /= 1000;

          let delay = 0;
          if (animationDelay && animationDelay !== '0s') {
            delay = parseFloat(animationDelay);
            if (animationDelay.includes('ms')) delay /= 1000;
          }

          const totalDuration = (duration + delay) * 1000; // Convert to ms
          // For looping animations, capture one full cycle
          const iterationCount = styles.animationIterationCount;
          const iterations = iterationCount === 'infinite' ? 1 : parseFloat(iterationCount);
          maxDuration = Math.max(maxDuration, totalDuration * iterations + 1000); // Add 1s buffer
        }
      });

      return maxDuration;
    });
  }

  async function handler(req, res) {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      const body = await readJsonBody(req, 10_000_000);
      const { html, resolution = '1080p', layout = 'landscape' } = body;

      if (!html) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Missing html content' }));
        return;
      }

      // Calculate dimensions based on resolution and layout
      const getDimensions = () => {
        const baseRes = resolution === '720p' ? 720 : resolution === '4k' ? 2160 : 1080;
        if (layout === 'portrait') {
          return { width: Math.round(baseRes * 9 / 16), height: baseRes };
        }
        return { width: baseRes, height: Math.round(baseRes * 9 / 16) };
      };

      const { width, height } = getDimensions();

      const br = await getBrowser();
      const page = await br.newPage();

      await page.setViewport({ width, height });

      // Inject the HTML
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

      // Wait a bit for animations to start
      await new Promise(r => setTimeout(r, 500));

      // Get animation duration (capped at 5 seconds for performance)
      let duration = await getAnimationDuration(page);
      const maxDuration = 5000; // 5 seconds max
      duration = Math.min(duration, maxDuration);
      console.log(`Recording for ${duration}ms (${duration / 1000}s)`);

      // Capture frames using screenshots
      const fps = 30;
      const totalFrames = Math.min(Math.ceil(duration / 1000 * fps), 150); // Max 150 frames (5 seconds)
      const frameDelay = 1000 / fps;

      console.log(`Capturing ${totalFrames} frames...`);
      const frames = [];
      for (let i = 0; i < totalFrames; i++) {
        const screenshot = await page.screenshot({
          type: 'png',
          clip: { x: 0, y: 0, width, height }
        });
        frames.push(`data:image/png;base64,${screenshot.toString('base64')}`);
        if (i < totalFrames - 1) {
          await new Promise(r => setTimeout(r, frameDelay));
        }
        if (i % 30 === 0) {
          console.log(`Captured ${i}/${totalFrames} frames`);
        }
      }

      await page.close();
      console.log('Frames captured, encoding video...');

      // Encode video using a separate page with timeout
      const encodePage = await br.newPage();

      // Increase the default timeout for this page (2 minutes)
      encodePage.setDefaultTimeout(120000);

      // Set a longer timeout for video encoding
      const videoDataUrl = await encodePage.evaluate(async (frameDataUrls) => {
        return new Promise((resolve, reject) => {
          // Add timeout to prevent hanging
          const timeout = setTimeout(() => {
            reject(new Error('Video encoding timed out after 60 seconds'));
          }, 60000);

          const canvas = document.createElement('canvas');
          const firstImg = new Image();

          firstImg.onload = () => {
            canvas.width = firstImg.width;
            canvas.height = firstImg.height;
            const ctx = canvas.getContext('2d');
            const fps = 30;

            // Try different MIME types
            let mimeType = 'video/webm;codecs=vp9';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = 'video/webm;codecs=vp8';
              if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/webm';
              }
            }

            const stream = canvas.captureStream(fps);
            const mediaRecorder = new MediaRecorder(stream, {
              mimeType,
              videoBitsPerSecond: 5000000
            });

            const chunks = [];
            mediaRecorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                chunks.push(e.data);
              }
            };

            mediaRecorder.onstop = () => {
              clearTimeout(timeout);
              try {
                const blob = new Blob(chunks, { type: 'video/webm' });
                if (blob.size === 0) {
                  reject(new Error('Generated video is empty'));
                  return;
                }
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Failed to read video blob'));
                reader.readAsDataURL(blob);
              } catch (e) {
                reject(e);
              }
            };

            mediaRecorder.onerror = (e) => {
              clearTimeout(timeout);
              reject(new Error('MediaRecorder error: ' + e));
            };

            mediaRecorder.start();

            // Draw each frame
            let frameIndex = 0;
            const drawFrame = () => {
              if (frameIndex < frameDataUrls.length) {
                const img = new Image();
                img.onload = () => {
                  ctx.drawImage(img, 0, 0);
                  frameIndex++;
                  setTimeout(drawFrame, 1000 / fps);
                };
                img.onerror = () => {
                  console.error(`Failed to load frame ${frameIndex}`);
                  frameIndex++;
                  // Continue even if a frame fails
                  setTimeout(drawFrame, 1000 / fps);
                };
                img.src = frameDataUrls[frameIndex];
              } else {
                // Give it time to finish recording
                setTimeout(() => {
                  try {
                    mediaRecorder.stop();
                  } catch (e) {
                    clearTimeout(timeout);
                    reject(e);
                  }
                }, 200);
              }
            };
            drawFrame();
          };

          firstImg.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Failed to load first frame'));
          };
          firstImg.src = frameDataUrls[0];
        });
      }, frames);

      // Close encode page after successful encoding
      try {
        await encodePage.close();
      } catch (e) {
        console.error('Error closing encode page:', e);
      }
      console.log('Video encoded successfully');

      // Extract base64 data
      const base64Data = videoDataUrl.split(',')[1];
      const videoBuffer = Buffer.from(base64Data, 'base64');

      // Send video
      res.statusCode = 200;
      res.setHeader('Content-Type', 'video/webm');
      res.setHeader('Content-Disposition', 'attachment; filename="motion-graphic.webm"');
      res.end(videoBuffer);

    } catch (err) {
      console.error('Motion graphics export error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: err?.message || 'Export failed' }));
    }
  }

  // Cleanup browser on process exit
  process.on('beforeExit', async () => {
    if (browser) {
      await browser.close();
    }
  });

  return {
    name: 'motion-graphics-export-api',
    configureServer(server) {
      server.middlewares.use('/api/export-motion-graphics-video', (req, res) => {
        handler(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/export-motion-graphics-video', (req, res) => {
        handler(req, res);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] == null) process.env[k] = v;
  }

  return {
    plugins: [ttsApiPlugin(), slidesGeneratorPlugin(), infographicGeneratorPlugin(), slidesExportPlugin(), motionGraphicsGeneratorPlugin(), motionGraphicsExportPlugin()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          counter: resolve(__dirname, 'counter/index.html'),
          languages: resolve(__dirname, 'languages/index.html'),
          tts: resolve(__dirname, 'tts/index.html'),
          'apbn-pendidikan': resolve(__dirname, 'apbn-pendidikan/index.html'),
          'slides-generator': resolve(__dirname, 'slides-generator/index.html'),
          'infographic-generator': resolve(__dirname, 'infographic-generator/index.html'),
          'citation-generator': resolve(__dirname, 'citation-generator/index.html'),
          'motion-graphics': resolve(__dirname, 'motion-graphics/index.html'),
        },
      },
    },
    server: {
      host: '::',
    },
    preview: {
      host: '::',
    },
  };
});

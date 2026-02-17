import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { Readable } from 'node:stream';
import { defineConfig, loadEnv } from 'vite';

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] == null) process.env[k] = v;
  }

  return {
    plugins: [ttsApiPlugin()],
    server: {
      host: '::',
    },
    preview: {
      host: '::',
    },
  };
});

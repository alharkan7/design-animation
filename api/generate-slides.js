import { GoogleGenAI } from '@google/genai';
import {
  STYLE_PRESETS,
  SLIDES_SYSTEM_INSTRUCTION,
  buildPrompt,
  sanitizeGeneratedHtml,
  validateGeneratedHtml
} from '../lib/slides-config.js';

export const config = {
  maxDuration: 60,
};

let ai = null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing GEMINI_API_KEY in environment' });
  }

  if (!ai) ai = new GoogleGenAI({ apiKey });

  try {
    const { fileData, fileType, style, additionalPrompt } = req.body;

    if (!fileData) {
      return res.status(400).json({ error: 'Missing fileData' });
    }

    const styleKey = style || 'midnight-executive';
    const stylePreset = STYLE_PRESETS[styleKey] || STYLE_PRESETS['midnight-executive'];
    const prompt = buildPrompt(stylePreset, additionalPrompt);

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: fileType, data: fileData } }
          ]
        }
      ],
      config: {
        systemInstruction: SLIDES_SYSTEM_INSTRUCTION
      }
    });

    let html = sanitizeGeneratedHtml(result.text);
    validateGeneratedHtml(html);

    return res.status(200).json({ html });
  } catch (err) {
    console.error('Slides generation error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to generate slides' });
  }
}

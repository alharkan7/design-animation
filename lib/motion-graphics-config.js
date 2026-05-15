export const CSS_PRESETS = {
  'neon-cyber': {
    name: 'Neon Cyber',
    colors: {
      primary: '#00ffcc',
      accent: '#ff00aa',
      bg: '#0a0f1c',
      bgSecondary: '#111827',
      text: '#ffffff',
      textSecondary: '#94a3b8'
    },
    typography: {
      display: 'Orbitron, sans-serif',
      body: 'Rajdhani, sans-serif'
    }
  },
  'midnight-executive': {
    name: 'Midnight Executive',
    colors: {
      primary: '#3b82f6',
      accent: '#818cf8',
      bg: '#0f172a',
      bgSecondary: '#1e293b',
      text: '#f8fafc',
      textSecondary: '#94a3b8'
    },
    typography: {
      display: 'Outfit, sans-serif',
      body: 'Inter, sans-serif'
    }
  },
  'deep-space': {
    name: 'Deep Space',
    colors: {
      primary: '#818cf8',
      accent: '#c084fc',
      bg: '#030712',
      bgSecondary: '#111827',
      text: '#f8fafc',
      textSecondary: '#94a3b8'
    },
    typography: {
      display: 'Space Grotesk, sans-serif',
      body: 'DM Sans, sans-serif'
    }
  },
  'sunset-vibrant': {
    name: 'Sunset Vibrant',
    colors: {
      primary: '#f97316',
      accent: '#ec4899',
      bg: '#1c1917',
      bgSecondary: '#292524',
      text: '#fafaf9',
      textSecondary: '#a8a29e'
    },
    typography: {
      display: 'Poppins, sans-serif',
      body: 'Open Sans, sans-serif'
    }
  },
  'nature-fresh': {
    name: 'Nature Fresh',
    colors: {
      primary: '#22c55e',
      accent: '#14b8a6',
      bg: '#14532d',
      bgSecondary: '#166534',
      text: '#f0fdf4',
      textSecondary: '#bbf7d0'
    },
    typography: {
      display: 'Montserrat, sans-serif',
      body: 'Lato, sans-serif'
    }
  },
  'minimal-light': {
    name: 'Minimal Light',
    colors: {
      primary: '#000000',
      accent: '#3b82f6',
      bg: '#ffffff',
      bgSecondary: '#f7f7f7',
      text: '#1a1a1a',
      textSecondary: '#666666'
    },
    typography: {
      display: 'Inter, sans-serif',
      body: 'Source Sans 3, sans-serif'
    }
  }
};

export const ANIMATION_PRESETS = `
/* Fade In */
@keyframes mg-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Slide Up */
@keyframes mg-slide-up {
  from {
    opacity: 0;
    transform: translateY(50px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Slide Down */
@keyframes mg-slide-down {
  from {
    opacity: 0;
    transform: translateY(-50px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Slide Left */
@keyframes mg-slide-left {
  from {
    opacity: 0;
    transform: translateX(50px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Slide Right */
@keyframes mg-slide-right {
  from {
    opacity: 0;
    transform: translateX(-50px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Scale In */
@keyframes mg-scale-in {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Scale Out */
@keyframes mg-scale-out {
  from {
    opacity: 0;
    transform: scale(1.2);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Rotate In */
@keyframes mg-rotate-in {
  from {
    opacity: 0;
    transform: rotate(-10deg) scale(0.9);
  }
  to {
    opacity: 1;
    transform: rotate(0) scale(1);
  }
}

/* Pulse */
@keyframes mg-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

/* Bounce */
@keyframes mg-bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-20px);
  }
}

/* Shake */
@keyframes mg-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-10px); }
  75% { transform: translateX(10px); }
}

/* Spin */
@keyframes mg-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Glow */
@keyframes mg-glow {
  0%, 100% {
    box-shadow: 0 0 5px var(--mg-primary, #3b82f6);
  }
  50% {
    box-shadow: 0 0 20px var(--mg-primary, #3b82f6), 0 0 30px var(--mg-primary, #3b82f6);
  }
}

/* Typewriter */
@keyframes mg-typewriter {
  from { width: 0; }
  to { width: 100%; }
}

/* Float */
@keyframes mg-float {
  0%, 100% {
    transform: translateY(0) rotate(0deg);
  }
  25% {
    transform: translateY(-10px) rotate(2deg);
  }
  75% {
    transform: translateY(-10px) rotate(-2deg);
  }
}

/* Wave */
@keyframes mg-wave {
  0%, 100% { transform: translateY(0); }
  25% { transform: translateY(-5px); }
  75% { transform: translateY(5px); }
}
`;

export const SYSTEM_INSTRUCTION = `You are an expert motion graphics designer specializing in creating stunning, animated HTML visualizations. Your task is to generate beautiful, self-contained HTML motion graphics based on user prompts.

# Core Philosophy
1. **Zero Dependencies** — Single HTML file with inline CSS/JS. No external frameworks, no npm.
2. **Visually Stunning** — Create eye-catching animations that feel professional and polished.
3. **Smooth Animations** — Use CSS animations and transitions with proper timing functions.
4. **Performance** — Use transform and opacity for animations (avoid animating layout properties).

# Technical Requirements

## HTML Structure
- Single self-contained HTML file
- All CSS in <style> tags, all JS in <script> tags
- Semantic HTML elements
- DOCTYPE declaration required

## CSS Framework

You MUST use these CSS variables in your design:

\`\`\`css
:root {
  --mg-primary: {PRIMARY_COLOR};
  --mg-accent: {ACCENT_COLOR};
  --mg-bg: {BG_COLOR};
  --mg-bg-secondary: {BG_SECONDARY_COLOR};
  --mg-text: {TEXT_COLOR};
  --mg-text-secondary: {TEXT_SECONDARY_COLOR};
  --mg-font-display: '{DISPLAY_FONT}';
  --mg-font-body: '{BODY_FONT}';
}
\`\`\`

## Available Animation Keyframes

Use these animation keyframes in your designs:

- \`mg-fade-in\` — Simple fade from opacity 0 to 1
- \`mg-slide-up\` — Slide up while fading in
- \`mg-slide-down\` — Slide down while fading in
- \`mg-slide-left\` — Slide in from left
- \`mg-slide-right\` — Slide in from right
- \`mg-scale-in\` — Scale up from 0.8 while fading in
- \`mg-rotate-in\` — Rotate and scale while fading in
- \`mg-pulse\` — Subtle scale pulse effect
- \`mg-bounce\` — Bounce up and down
- \`mg-shake\` — Horizontal shake
- \`mg-spin\` — Full 360-degree rotation
- \`mg-glow\` — Pulsing glow effect
- \`mg-float\` — Gentle floating motion
- \`mg-wave\` — Vertical wave motion

Example usage:
\`\`\`css
.element {
  animation: mg-slide-up 0.8s ease-out forwards,
             mg-float 3s ease-in-out 0.8s infinite;
}
\`\`\`

## Layout

The container will be one of these aspect ratios:
- Landscape: 16:9 (default)
- Portrait: 9:16

Use flexbox/grid for centering and layout:
\`\`\`css
.mg-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: var(--mg-bg);
  font-family: var(--mg-font-body);
  color: var(--mg-text);
  overflow: hidden;
}
\`\`\`

## Animation Best Practices

1. **Stagger animations** using animation-delay for sequential effects
2. **Use forwards fill-mode** to keep final animation state
3. **Combine animations** for complex effects (comma-separated)
4. **Use easing functions**: ease-out for entrance, ease-in-out for loops
5. **Animation durations**: 0.3-0.5s for snappy, 0.8-1.2s for dramatic

## Content Guidelines

1. **Text styling**:
   - Headings: var(--mg-font-display), larger sizes, var(--mg-primary) color
   - Body: var(--mg-font-body), var(--mg-text) color
   - Accents: var(--mg-accent) for highlights

2. **Visual hierarchy**:
   - Primary element: largest, brightest
   - Secondary: smaller, muted
   - Background: subtle, non-distracting

3. **Animation timing**:
   - If user specifies duration (e.g., "5 second animation"), respect it
   - Default to 3-5 second loops for ambient content
   - For one-time animations, ensure final state is visually complete

# Output Format

Return ONLY the complete HTML file. No markdown wrapping, no explanation.
Start with \`<!DOCTYPE html>\` and end with \`</html>\`.

The animation should loop seamlessly or complete with a satisfying final state.
All animations should be declared in CSS with proper durations and timing functions.`;

export function buildPrompt(userPrompt, cssPreset) {
  const preset = CSS_PRESETS[cssPreset] || CSS_PRESETS['midnight-executive'];

  return `User Request: ${userPrompt}

Style Configuration:
- Primary Color: ${preset.colors.primary}
- Accent Color: ${preset.colors.accent}
- Background: ${preset.colors.bg}
- Background Secondary: ${preset.colors.bgSecondary}
- Text: ${preset.colors.text}
- Text Secondary: ${preset.colors.textSecondary}
- Display Font: ${preset.typography.display}
- Body Font: ${preset.typography.body}

Generate a complete, self-contained HTML motion graphic.

REQUIREMENTS:
- Single HTML file with inline CSS and JavaScript
- Use the provided CSS variables (--mg-primary, --mg-accent, etc.)
- Use the available animation keyframes (mg-fade-in, mg-slide-up, mg-pulse, etc.)
- Make it visually stunning with smooth, professional animations
- The design should match the user's request
- All content must fit within the viewport
- If the user mentioned a duration, make the animation approximately that length
- Loop animations seamlessly or end in a visually complete state

Return ONLY the HTML code, no markdown formatting, no explanation.`;
}

export function sanitizeHtml(text) {
  let html = text;

  // Remove markdown code blocks if present
  const codeBlockMatch = html.match(/```(?:html)?\n?([\s\S]+)```/);
  if (codeBlockMatch) {
    html = codeBlockMatch[1];
  }

  // Find DOCTYPE
  const doctypeIndex = html.toLowerCase().indexOf('<!doctype');
  if (doctypeIndex > 0) {
    html = html.substring(doctypeIndex);
  }

  // Trim to </html>
  const htmlEndIndex = html.toLowerCase().lastIndexOf('</html>');
  if (htmlEndIndex !== -1) {
    html = html.substring(0, htmlEndIndex + 7);
  }

  return html.trim();
}

export function validateHtml(html) {
  const trimmed = html.trim();

  if (trimmed.length < 200) {
    throw new Error('Generated content is too short');
  }

  if (!trimmed.toLowerCase().includes('<!doctype')) {
    throw new Error('Generated content is missing DOCTYPE');
  }

  if (!trimmed.toLowerCase().includes('<body')) {
    throw new Error('Generated content is missing body tag');
  }

  if (!trimmed.toLowerCase().includes('<style')) {
    throw new Error('Generated content should have CSS styles');
  }

  return true;
}

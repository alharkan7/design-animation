/**
 * Motion Graphics Generator App
 * Handles AI-powered motion graphics generation with preview and export
 */

import { createIcons, icons } from 'lucide';
import { saveGraphic, getAllGraphics, getGraphic, deleteGraphic, searchGraphics, clearAllGraphics } from './motion-graphics-db.js';

// CSS preset colors for sidebar initialization
const CSS_PRESET_COLORS = {
  'neon-cyber': { primary: '#00ffcc', accent: '#ff00aa', bg: '#0a0f1c' },
  'midnight-executive': { primary: '#3b82f6', accent: '#818cf8', bg: '#0f172a' },
  'deep-space': { primary: '#818cf8', accent: '#c084fc', bg: '#030712' },
  'sunset-vibrant': { primary: '#f97316', accent: '#ec4899', bg: '#1c1917' },
  'nature-fresh': { primary: '#22c55e', accent: '#14b8a6', bg: '#14532d' },
  'minimal-light': { primary: '#000000', accent: '#3b82f6', bg: '#ffffff' }
};

// Icon configurations for toolbar buttons
const ICON_MAP = {
  'layoutLandscape': { name: 'Monitor', size: 16 },
  'layoutPortrait': { name: 'Smartphone', size: 16 },
  'viewPreview': { name: 'Eye', size: 16 },
  'viewCode': { name: 'Code', size: 16 },
  'fullscreenBtn': { name: 'Maximize', size: 16 },
  'paletteBtn': { name: 'Palette', size: 16 },
  'downloadBtn': { name: 'Download', size: 16 },
};

class MotionGraphicsApp {
  constructor() {
    // State
    this.prompt = '';
    this.generatedHtml = null;
    this.cssPreset = 'midnight-executive';
    this.layout = 'landscape';
    this.resolution = '1080p';
    this.viewMode = 'preview';
    this.isGenerating = false;
    this.progressInterval = null;
    this.customCss = null;
    this.originalHtml = null; // Store original HTML before custom style
    this.currentGraphicId = null; // ID of currently loaded graphic (for updates)
    this.savedGraphics = []; // List of saved graphics

    // DOM Elements
    this.promptInput = document.getElementById('promptInput');
    this.generateBtn = document.getElementById('generateBtn');
    this.statusSection = document.getElementById('statusSection');
    this.progressFill = document.getElementById('progressFill');
    this.statusText = document.getElementById('statusText');
    this.errorMessage = document.getElementById('errorMessage');
    this.previewSection = document.getElementById('previewSection');
    this.previewFrame = document.getElementById('previewFrame');
    this.previewContainer = document.getElementById('previewContainer');
    this.codeView = document.getElementById('codeView');
    this.codeContent = document.getElementById('codeContent');
    this.sidebar = document.getElementById('sidebar');
    this.sidebarOverlay = document.getElementById('sidebarOverlay');
    this.regenerateSection = document.getElementById('regenerateSection');
    this.charCounter = document.getElementById('charCounter');
    this.historyBtn = document.getElementById('historyBtn');
    this.historyPanel = document.getElementById('historyPanel');
    this.historyList = document.getElementById('historyList');
    this.historyOverlay = document.getElementById('historyOverlay');
    this.searchInput = document.getElementById('searchInput');

    this.init();
  }

  init() {
    // Initialize lucide icons
    this.initializeIcons();

    // Character counter
    this.promptInput.addEventListener('input', () => this.updateCharCounter());

    // Style selector
    document.querySelectorAll('.style-option').forEach(option => {
      option.addEventListener('click', () => {
        document.querySelectorAll('.style-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        this.cssPreset = option.dataset.style;
      });
    });

    // Generate button
    this.generateBtn.addEventListener('click', () => this.generate());

    // Regenerate button
    document.getElementById('regenerateBtn').addEventListener('click', () => this.generate());

    // New Prompt button
    document.getElementById('newPromptBtn').addEventListener('click', () => this.resetToNewPrompt());

    // Layout buttons
    document.getElementById('layoutLandscape').addEventListener('click', () => this.setLayout('landscape'));
    document.getElementById('layoutPortrait').addEventListener('click', () => this.setLayout('portrait'));

    // View toggle
    document.getElementById('viewPreview').addEventListener('click', () => this.setView('preview'));
    document.getElementById('viewCode').addEventListener('click', () => this.setView('code'));

    // Resolution select
    document.getElementById('resolutionSelect').addEventListener('change', (e) => {
      this.resolution = e.target.value;
    });

    // Fullscreen
    document.getElementById('fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());

    // Sidebar
    document.getElementById('paletteBtn').addEventListener('click', () => this.openSidebar());
    document.getElementById('sidebarClose').addEventListener('click', () => this.closeSidebar());
    this.sidebarOverlay.addEventListener('click', () => this.closeSidebar());
    document.getElementById('applyStyleBtn').addEventListener('click', () => this.applyCustomStyle());

    // Color inputs sync
    this.syncColorInputs('primaryColor', 'primaryColorHex');
    this.syncColorInputs('accentColor', 'accentColorHex');
    this.syncColorInputs('bgColor', 'bgColorHex');

    // Copy code button
    document.getElementById('copyCodeBtn').addEventListener('click', () => this.copyCode());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.sidebar.classList.contains('open')) {
          this.closeSidebar();
        }
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
      }
      // Ctrl/Cmd + Enter to generate
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!this.isGenerating) {
          this.generate();
        }
      }
    });

    // Fullscreen change handler
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        this.previewContainer.classList.remove('fullscreen');
      }
    });

    // Download button
    document.getElementById('downloadBtn').addEventListener('click', () => this.downloadVideo());

    // History panel
    this.historyBtn?.addEventListener('click', () => this.openHistory());
    document.getElementById('historyClose')?.addEventListener('click', () => this.closeHistory());
    document.getElementById('historyOverlay')?.addEventListener('click', () => this.closeHistory());
    this.searchInput?.addEventListener('input', (e) => this.searchSavedGraphics(e.target.value));

    // Initial char counter update
    this.updateCharCounter();

    // Load saved graphics on startup
    this.loadSavedGraphics();
  }

  initializeIcons() {
    // Add lucide icons to buttons with data-icon attribute
    document.querySelectorAll('[data-icon]').forEach(el => {
      const iconName = el.getAttribute('data-icon');
      const iconSize = el.getAttribute('data-icon-size') || 16;
      const iconElement = document.createElement('i');
      iconElement.setAttribute('data-lucide', iconName);
      iconElement.setAttribute('data-size', iconSize);
      iconElement.style.cssText = 'display: inline-flex; align-items: center; justify-content: center;';
      el.prepend(iconElement);
    });

    // Create all icons
    createIcons({
      icons,
      nameAttr: 'data-lucide',
      attrs: {
        width: 16,
        height: 16,
        strokeWidth: 2,
        stroke: 'currentColor',
        fill: 'none',
      }
    });
  }

  updateCharCounter() {
    const length = this.promptInput.value.length;
    const maxLength = parseInt(this.promptInput.getAttribute('maxlength')) || 2000;
    this.charCounter.textContent = `${length} / ${maxLength}`;

    // Update classes based on proximity to limit
    this.charCounter.classList.remove('limit-near', 'limit-reached');
    if (length >= maxLength) {
      this.charCounter.classList.add('limit-reached');
    } else if (length >= maxLength * 0.9) {
      this.charCounter.classList.add('limit-near');
    }
  }

  resetToNewPrompt() {
    this.generatedHtml = null;
    this.originalHtml = null;
    this.promptInput.value = '';
    this.promptInput.focus();
    this.updateCharCounter();
    this.previewSection.classList.remove('visible');
    this.regenerateSection.style.display = 'none';
    this.hideError();
  }

  syncColorInputs(colorId, hexId) {
    const colorInput = document.getElementById(colorId);
    const hexInput = document.getElementById(hexId);

    colorInput.addEventListener('input', () => {
      hexInput.value = colorInput.value;
    });

    hexInput.addEventListener('input', () => {
      const hex = hexInput.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        colorInput.value = hex;
      }
    });
  }

  setLayout(layout) {
    this.layout = layout;

    // Update button states
    document.getElementById('layoutLandscape').classList.toggle('active', layout === 'landscape');
    document.getElementById('layoutPortrait').classList.toggle('active', layout === 'portrait');

    // Update preview frame
    this.previewFrame.classList.toggle('portrait', layout === 'portrait');
    this.codeView.classList.toggle('portrait', layout === 'portrait');
  }

  setView(mode) {
    this.viewMode = mode;

    // Update button states
    document.getElementById('viewPreview').classList.toggle('active', mode === 'preview');
    document.getElementById('viewCode').classList.toggle('active', mode === 'code');

    // Update view visibility
    this.previewFrame.style.display = mode === 'preview' ? 'block' : 'none';
    this.codeView.classList.toggle('visible', mode === 'code');

    if (mode === 'code' && this.generatedHtml) {
      this.codeContent.textContent = this.formatHtml(this.generatedHtml);
    }
  }

  formatHtml(html) {
    // Simple HTML formatter
    let formatted = html;
    formatted = formatted.replace(/></g, '>\n<');
    return formatted;
  }

  toggleSidebar() {
    this.sidebar.classList.toggle('open');
    this.sidebarOverlay.classList.toggle('visible', this.sidebar.classList.contains('open'));
  }

  openSidebar() {
    // Initialize sidebar with current preset colors
    const presetColors = CSS_PRESET_COLORS[this.cssPreset] || CSS_PRESET_COLORS['midnight-executive'];
    document.getElementById('primaryColor').value = presetColors.primary;
    document.getElementById('primaryColorHex').value = presetColors.primary;
    document.getElementById('accentColor').value = presetColors.accent;
    document.getElementById('accentColorHex').value = presetColors.accent;
    document.getElementById('bgColor').value = presetColors.bg;
    document.getElementById('bgColorHex').value = presetColors.bg;

    this.sidebar.classList.add('open');
    this.sidebarOverlay.classList.add('visible');
  }

  closeSidebar() {
    this.sidebar.classList.remove('open');
    this.sidebarOverlay.classList.remove('visible');
  }

  copyCode() {
    if (!this.generatedHtml) return;

    const copyBtn = document.getElementById('copyCodeBtn');
    navigator.clipboard.writeText(this.generatedHtml).then(() => {
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');

      setTimeout(() => {
        copyBtn.textContent = 'Copy';
        copyBtn.classList.remove('copied');
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
      copyBtn.textContent = 'Failed';
      setTimeout(() => {
        copyBtn.textContent = 'Copy';
      }, 2000);
    });
  }

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      this.previewContainer.classList.remove('fullscreen');
    } else {
      if (this.previewContainer.requestFullscreen) {
        this.previewContainer.requestFullscreen();
      } else if (this.previewContainer.webkitRequestFullscreen) {
        this.previewContainer.webkitRequestFullscreen();
      } else {
        this.previewContainer.classList.add('fullscreen');
      }
    }
  }

  showStatus(message, progress) {
    this.statusSection.classList.add('visible');
    this.statusText.textContent = message;
    if (progress !== null) {
      this.progressFill.style.width = progress + '%';
    }
  }

  hideStatus() {
    this.statusSection.classList.remove('visible');
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  showError(message) {
    this.errorMessage.textContent = message;
    this.errorMessage.classList.add('visible');
  }

  hideError() {
    this.errorMessage.classList.remove('visible');
  }

  progressThroughStages() {
    const stages = [
      { progress: 10, text: 'Analyzing your prompt...' },
      { progress: 25, text: 'Designing the motion graphic...' },
      { progress: 40, text: 'Creating animations...' },
      { progress: 55, text: 'Applying styles and colors...' },
      { progress: 70, text: 'Refining the composition...' },
      { progress: 85, text: 'Adding final touches...' },
      { progress: 95, text: 'Almost ready...' },
    ];

    let stageIndex = 0;
    const stageDelay = 1500;

    return new Promise((resolve) => {
      this.progressInterval = setInterval(() => {
        if (stageIndex < stages.length) {
          const stage = stages[stageIndex];
          this.showStatus(stage.text, stage.progress);
          stageIndex++;
        } else {
          clearInterval(this.progressInterval);
          resolve();
        }
      }, stageDelay);
    });
  }

  async generate() {
    if (this.isGenerating) return;

    this.prompt = this.promptInput.value.trim();
    if (!this.prompt) {
      this.showError('Please enter a description for your motion graphic.');
      return;
    }

    this.isGenerating = true;
    this.generateBtn.disabled = true;
    this.generateBtn.textContent = 'Generating...';
    this.hideError();

    try {
      // Start progress animation
      const progressPromise = this.progressThroughStages();

      // Call API
      const response = await fetch('/api/generate-motion-graphics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: this.prompt,
          cssPreset: this.cssPreset
        })
      });

      // Wait for progress
      await progressPromise;

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate motion graphic');
      }

      const data = await response.json();
      this.generatedHtml = data.html;

      this.showStatus('Done!', 100);

      setTimeout(() => {
        this.hideStatus();
        this.showPreview();
      }, 500);

    } catch (error) {
      console.error('Error generating motion graphic:', error);
      this.showError(error.message || 'Failed to generate motion graphic. Please try again.');
      this.hideStatus();
    } finally {
      this.isGenerating = false;
      this.generateBtn.disabled = false;
      this.generateBtn.textContent = 'Generate Motion Graphic';
    }
  }

  showPreview() {
    // Inject overflow handling to ensure content is scrollable
    const scrollableHtml = this.injectScrollStyles(this.generatedHtml);
    const blob = new Blob([scrollableHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    this.previewFrame.src = url;
    this.previewSection.classList.add('visible');
    this.regenerateSection.style.display = 'flex';

    // Store original HTML before any custom styles
    this.originalHtml = this.generatedHtml;

    // Reset view to preview
    this.setView('preview');

    // Scroll to preview
    this.previewSection.scrollIntoView({ behavior: 'smooth' });

    // Save to database if it's a new generation (not loading from history)
    if (!this.currentGraphicId) {
      this.saveToDatabase();
    }
  }

  injectScrollStyles(html) {
    // Inject a style tag to ensure the document is scrollable
    const scrollStyle = `
      <style data-injected="scroll-fix">
        html, body {
          overflow: auto !important;
          max-height: none !important;
          height: auto !important;
          min-height: 100vh !important;
        }
        body {
          margin: 0 !important;
          padding: 0 !important;
        }
      </style>
    `;

    // Insert after opening <head> tag, or after <html> if no head
    if (html.includes('<head>')) {
      return html.replace('<head>', '<head>' + scrollStyle);
    } else if (html.includes('<html>')) {
      return html.replace('<html>', '<html><head>' + scrollStyle + '</head>');
    } else {
      // No head or html tags, prepend to document
      return scrollStyle + html;
    }
  }

  async saveToDatabase() {
    try {
      const id = await saveGraphic({
        prompt: this.prompt,
        html: this.generatedHtml,
        cssPreset: this.cssPreset,
        customCss: this.customCss,
        layout: this.layout
      });
      this.currentGraphicId = id;

      // Refresh the saved graphics list
      await this.loadSavedGraphics();
    } catch (error) {
      console.error('Failed to save graphic:', error);
    }
  }

  async loadSavedGraphics() {
    try {
      this.savedGraphics = await getAllGraphics();
      this.renderHistoryList();
    } catch (error) {
      console.error('Failed to load saved graphics:', error);
    }
  }

  renderHistoryList(graphics = this.savedGraphics) {
    if (!this.historyList) return;

    if (graphics.length === 0) {
      this.historyList.innerHTML = `
        <div class="history-empty">
          <i data-lucide="film" class="empty-icon"></i>
          <p>No saved motion graphics yet</p>
          <p class="empty-subtext">Your generated graphics will appear here</p>
        </div>
      `;
      createIcons({ icons, nameAttr: 'data-lucide' });
      return;
    }

    this.historyList.innerHTML = graphics.map(g => {
      const date = new Date(g.createdAt);
      const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const previewText = g.prompt.length > 80 ? g.prompt.substring(0, 80) + '...' : g.prompt;

      return `
        <div class="history-item" data-id="${g.id}">
          <div class="history-item-preview">
            <div class="history-item-text">${this.escapeHtml(previewText)}</div>
            <div class="history-item-meta">
              <span class="history-date">${formattedDate}</span>
              <span class="history-preset">${g.cssPreset || 'custom'}</span>
            </div>
          </div>
          <div class="history-item-actions">
            <button class="history-action-btn load-btn" data-id="${g.id}" title="Open">
              <i data-lucide="folder-open" class="icon-sm"></i>
            </button>
            <button class="history-action-btn delete-btn" data-id="${g.id}" title="Delete">
              <i data-lucide="trash-2" class="icon-sm"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Add event listeners to the new items
    this.historyList.querySelectorAll('.load-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        this.loadGraphic(id);
      });
    });

    this.historyList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        this.deleteSavedGraphic(id);
      });
    });

    // Re-initialize lucide icons for the new content
    createIcons({ icons, nameAttr: 'data-lucide' });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async searchSavedGraphics(query) {
    if (!query.trim()) {
      this.renderHistoryList(this.savedGraphics);
      return;
    }

    try {
      const results = await searchGraphics(query);
      this.renderHistoryList(results);
    } catch (error) {
      console.error('Search failed:', error);
    }
  }

  async loadGraphic(id) {
    try {
      const graphic = await getGraphic(id);
      if (!graphic) {
        this.showError('Failed to load graphic');
        return;
      }

      this.currentGraphicId = graphic.id;
      this.prompt = graphic.prompt;
      this.generatedHtml = graphic.html;
      this.originalHtml = graphic.html;
      this.cssPreset = graphic.cssPreset || 'midnight-executive';
      this.customCss = graphic.customCss;
      this.layout = graphic.layout || 'landscape';

      // Update UI
      this.promptInput.value = this.prompt;
      this.updateCharCounter();

      // Update style selector
      document.querySelectorAll('.style-option').forEach(option => {
        option.classList.toggle('selected', option.dataset.style === this.cssPreset);
      });

      // Show preview
      this.showPreview();

      // Close history panel
      this.closeHistory();

      // Update generate button text to indicate we can update
      this.generateBtn.textContent = 'Update Motion Graphic';

    } catch (error) {
      console.error('Failed to load graphic:', error);
      this.showError('Failed to load graphic');
    }
  }

  async deleteSavedGraphic(id) {
    if (!confirm('Are you sure you want to delete this motion graphic?')) {
      return;
    }

    try {
      await deleteGraphic(id);

      // Remove from local list
      this.savedGraphics = this.savedGraphics.filter(g => g.id !== id);
      this.renderHistoryList();

      // If we deleted the currently loaded graphic, reset
      if (this.currentGraphicId === id) {
        this.currentGraphicId = null;
        this.generatedHtml = null;
        this.originalHtml = null;
        this.previewSection.classList.remove('visible');
        this.regenerateSection.style.display = 'none';
        this.generateBtn.textContent = 'Generate Motion Graphic';
      }

    } catch (error) {
      console.error('Failed to delete graphic:', error);
      this.showError('Failed to delete graphic');
    }
  }

  openHistory() {
    this.historyPanel.classList.add('open');
    this.historyOverlay?.classList.add('visible');
    // Refresh the list when opening
    this.loadSavedGraphics();
  }

  closeHistory() {
    this.historyPanel?.classList.remove('open');
    this.historyOverlay?.classList.remove('visible');
  }

  applyCustomStyle() {
    if (!this.generatedHtml) {
      this.showError('Please generate a motion graphic first.');
      return;
    }

    // Use original HTML as base to avoid accumulating styles
    const baseHtml = this.originalHtml || this.generatedHtml;

    // Collect custom styles
    this.customCss = {
      primary: document.getElementById('primaryColor').value,
      accent: document.getElementById('accentColor').value,
      bg: document.getElementById('bgColor').value,
      displayFont: document.getElementById('displayFont').value,
      bodyFont: document.getElementById('bodyFont').value
    };

    // Inject custom styles into the HTML
    let modifiedHtml = baseHtml;

    // Add custom CSS override
    const customStyle = `
      <style>
        :root {
          --mg-primary: ${this.customCss.primary} !important;
          --mg-accent: ${this.customCss.accent} !important;
          --mg-bg: ${this.customCss.bg} !important;
          --mg-font-display: '${this.customCss.displayFont}' !important;
          --mg-font-body: '${this.customCss.bodyFont}' !important;
        }
        * {
          --mg-primary: ${this.customCss.primary} !important;
          --mg-accent: ${this.customCss.accent} !important;
          --mg-bg: ${this.customCss.bg} !important;
          --mg-font-display: '${this.customCss.displayFont}' !important;
          --mg-font-body: '${this.customCss.bodyFont}' !important;
        }
      </style>
    `;

    // Insert custom style after <head> or <body> start tag
    const headIndex = modifiedHtml.indexOf('<head');
    const bodyIndex = modifiedHtml.indexOf('<body');

    if (headIndex !== -1) {
      const headEndIndex = modifiedHtml.indexOf('>', headIndex) + 1;
      modifiedHtml = modifiedHtml.slice(0, headEndIndex) + customStyle + modifiedHtml.slice(headEndIndex);
    } else if (bodyIndex !== -1) {
      const bodyEndIndex = modifiedHtml.indexOf('>', bodyIndex) + 1;
      modifiedHtml = modifiedHtml.slice(0, bodyEndIndex) + customStyle + modifiedHtml.slice(bodyEndIndex);
    }

    // Update preview
    this.generatedHtml = modifiedHtml;
    this.showPreview();
    this.closeSidebar();
  }

  async downloadVideo() {
    if (!this.generatedHtml) {
      this.showError('Please generate a motion graphic first.');
      return;
    }

    const btn = document.getElementById('downloadBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `
      <i data-lucide="loader" class="spin" style="display: inline-flex; align-items: center; justify-content: center;"></i>
      Exporting...
    `;
    createIcons({
      icons,
      nameAttr: 'data-lucide',
      attrs: {
        width: 16,
        height: 16,
        strokeWidth: 2,
        stroke: 'currentColor',
        fill: 'none',
      }
    });

    // Add spin animation
    if (!document.getElementById('spin-style')) {
      const style = document.createElement('style');
      style.id = 'spin-style';
      style.textContent = '@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }';
      document.head.appendChild(style);
    }

    try {
      const response = await fetch('/api/export-motion-graphics-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          html: this.generatedHtml,
          resolution: this.resolution,
          layout: this.layout
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to export video');
      }

      // Download the video
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `motion-graphic-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error exporting video:', error);
      this.showError(error.message || 'Failed to export video. Please try again.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// Initialize the app
new MotionGraphicsApp();

/**
 * Document to Slides Generator
 * Handles file uploads, document parsing, and AI-powered slide generation.
 * PPTX export is now handled server-side via /api/export-slides (see lib/pptx-export.js).
 */

class SlidesApp {
  constructor() {
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('fileInput');
    this.optionsSection = document.getElementById('optionsSection');
    this.statusSection = document.getElementById('statusSection');
    this.resultSection = document.getElementById('resultSection');
    this.errorMessage = document.getElementById('errorMessage');
    this.container = document.querySelector('.container');
    this.previewContainer = document.getElementById('previewContainer');
    this.previewFrame = document.getElementById('previewFrame');
    this.slideCounter = document.getElementById('slideCounter');
    this.selectedFile = null;
    this.selectedStyle = 'midnight-executive';
    this.generatedHtml = null;
    this.currentSlide = 1;
    this.totalSlides = 1;
    this.isFullscreen = false;

    this.init();
  }

  init() {
    // Drop zone click
    this.dropZone.addEventListener('click', () => this.fileInput.click());

    // File input change
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));

    // Drag and drop
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('dragover');
    });

    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('dragover');
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      this.handleFileSelect(file);
    });

    // Remove file
    document.getElementById('removeFile').addEventListener('click', () => this.reset());

    // Cancel button
    document.getElementById('cancelBtn').addEventListener('click', () => this.reset());

    // Generate button
    document.getElementById('generateBtn').addEventListener('click', () => this.generateSlides());

    // Download buttons
    document.getElementById('downloadPdfBtn').addEventListener('click', () => this.downloadPdf());
    document.getElementById('downloadPptxBtn').addEventListener('click', () => this.downloadPptx());
    document.getElementById('downloadHtmlBtn').addEventListener('click', () => this.downloadHtml());

    // Navigation buttons
    document.getElementById('prevSlideBtn').addEventListener('click', () => this.prevSlide());
    document.getElementById('nextSlideBtn').addEventListener('click', () => this.nextSlide());
    document.getElementById('fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!this.resultSection.classList.contains('visible')) return;
      if (e.key === 'ArrowLeft') this.prevSlide();
      if (e.key === 'ArrowRight') this.nextSlide();
      if (e.key === 'f' || e.key === 'F') this.toggleFullscreen();
      if (e.key === 'Escape' && this.isFullscreen) this.exitFullscreen();
    });

    // Listen for messages from iframe
    window.addEventListener('message', (e) => this.handleIframeMessage(e));

    // Track browser fullscreen state changes
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        this.isFullscreen = false;
        this.previewContainer.classList.remove('fullscreen');
        document.body.style.overflow = '';
        document.getElementById('fullscreenBtn').textContent = '⛶';
      }
    });

    // Style selection
    document.querySelectorAll('.style-option').forEach(option => {
      option.addEventListener('click', () => {
        document.querySelectorAll('.style-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        this.selectedStyle = option.dataset.style;
      });
    });

    // New file button
    document.getElementById('newFileBtn').addEventListener('click', () => this.reset());
  }

  async handleFileSelect(file) {
    if (!file) return;

    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const validExtensions = ['.pdf', '.docx'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();

    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      this.showError('Please upload a PDF or DOCX file.');
      return;
    }

    this.selectedFile = file;
    document.getElementById('fileName').textContent = file.name;
    this.optionsSection.classList.add('visible');
    this.dropZone.style.display = 'none';
    this.hideError();
  }

  reset() {
    this.selectedFile = null;
    this.generatedHtml = null;
    this.fileInput.value = '';
    this.optionsSection.classList.remove('visible');
    this.statusSection.classList.remove('visible');
    this.resultSection.classList.remove('visible');
    this.container.classList.remove('wide');
    this.exitFullscreen();
    this.dropZone.style.display = 'block';
    this.hideError();
    // Remove debug button if exists
    const debugBtn = this.errorMessage.querySelector('.debug-btn');
    if (debugBtn) debugBtn.remove();
    document.getElementById('additionalPrompt').value = '';
    this.currentSlide = 1;
    this.totalSlides = 1;
  }

  showStatus(message, progress = null) {
    this.statusSection.classList.add('visible');
    document.getElementById('statusText').textContent = message;
    if (progress !== null) {
      document.getElementById('progressFill').style.width = progress + '%';
    }
  }

  // Progress stages with smooth animations
  progressThroughStages() {
    const stages = [
      { progress: 10, text: 'Preparing your document...' },
      { progress: 20, text: 'Uploading to AI...' },
      { progress: 35, text: 'AI analyzing content...' },
      { progress: 50, text: 'Designing slide layouts...' },
      { progress: 65, text: 'Applying styles & colors...' },
      { progress: 80, text: 'Adding animations...' },
      { progress: 92, text: 'Finalizing your slides...' },
    ];

    let stageIndex = 0;
    const stageDelay = 1200; // ms between stages

    // Clear any existing progress interval
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }

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

  validateGeneratedHtml(html) {
    const errors = [];

    // Check if HTML exists and is not empty
    if (!html || typeof html !== 'string') {
      errors.push('Generated content is empty or invalid');
      return { valid: false, errors };
    }

    // Trim and check minimum length
    const trimmed = html.trim();
    if (trimmed.length < 500) {
      errors.push('Generated content is too short - may be incomplete');
    }

    // Check for essential HTML structure
    const hasDoctype = trimmed.toLowerCase().includes('<!doctype');
    const hasHtmlTag = trimmed.toLowerCase().includes('<html');
    const hasBodyTag = trimmed.toLowerCase().includes('<body');
    const hasHeadTag = trimmed.toLowerCase().includes('<head');

    if (!hasDoctype) errors.push('Missing DOCTYPE declaration');
    if (!hasHtmlTag) errors.push('Missing <html> tag');
    if (!hasHeadTag) errors.push('Missing <head> tag');
    if (!hasBodyTag) errors.push('Missing <body> tag');

    // Check for slide sections
    const sectionMatch = trimmed.match(/<section/gi);
    if (!sectionMatch || sectionMatch.length < 2) {
      errors.push('Expected at least 2 slide sections (<section>), found ' + (sectionMatch ? sectionMatch.length : 0));
    }

    // Check for script tags (should have navigation JavaScript)
    const scriptMatch = trimmed.match(/<script/gi);
    if (!scriptMatch || scriptMatch.length < 1) {
      errors.push('Missing JavaScript - slides may not be interactive');
    }

    // Check for style tags
    const styleMatch = trimmed.match(/<style/gi);
    if (!styleMatch || styleMatch.length < 1) {
      errors.push('Missing CSS styles - slides may not render correctly');
    }

    // Check for common markdown code blocks that weren't cleaned
    if (trimmed.includes('```html') || trimmed.includes('```')) {
      errors.push('Output contains unprocessed markdown code blocks');
    }

    // Check for common AI artifacts
    if (trimmed.includes('Here is the HTML') || trimmed.includes('Below is')) {
      errors.push('Output contains conversational text instead of pure HTML');
    }

    // Check for unclosed tags (basic check)
    const openTags = (trimmed.match(/<section[^>]*>/gi) || []).length;
    const closeTags = (trimmed.match(/<\/section>/gi) || []).length;
    if (openTags !== closeTags) {
      errors.push(`Mismatched section tags: ${openTags} opening, ${closeTags} closing`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  sanitizeHtml(html) {
    let cleaned = html.trim();

    // Remove markdown code blocks if present
    const codeBlockMatch = cleaned.match(/```(?:html)?\n?([\s\S]+)```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1];
    }

    // Remove any conversational text before <!DOCTYPE
    const doctypeIndex = cleaned.toLowerCase().indexOf('<!doctype');
    if (doctypeIndex > 0) {
      cleaned = cleaned.substring(doctypeIndex);
    }

    // Remove any text after </html>
    const htmlEndIndex = cleaned.toLowerCase().lastIndexOf('</html>');
    if (htmlEndIndex !== -1) {
      cleaned = cleaned.substring(0, htmlEndIndex + 7);
    }

    return cleaned;
  }

  async generateSlides() {
    if (!this.selectedFile) return;

    const additionalPrompt = document.getElementById('additionalPrompt').value;

    // Clear any previous errors and debug button
    this.hideError();
    const debugBtn = this.errorMessage.querySelector('.debug-btn');
    if (debugBtn) debugBtn.remove();

    try {
      this.optionsSection.classList.remove('visible');

      // Start the progress animation
      const progressPromise = this.progressThroughStages();

      // Read file as base64
      const base64Content = await this.readFileAsBase64(this.selectedFile);

      // Call the API to generate slides
      const responsePromise = fetch('/api/generate-slides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: this.selectedFile.name,
          fileType: this.selectedFile.type,
          fileData: base64Content,
          style: this.selectedStyle,
          additionalPrompt: additionalPrompt
        })
      });

      // Wait for both progress and API response
      const [_, response] = await Promise.all([progressPromise, responsePromise]);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate slides');
      }

      const data = await response.json();
      let rawHtml = data.html;

      // Sanitize the HTML
      rawHtml = this.sanitizeHtml(rawHtml);

      // Validate the generated HTML
      const validation = this.validateGeneratedHtml(rawHtml);

      if (!validation.valid) {
        console.error('HTML validation failed:', validation.errors);
        throw new Error('Generated slides are invalid: ' + validation.errors.join('; '));
      }

      this.generatedHtml = rawHtml;

      this.showStatus('Done!', 100);

      // Show preview
      setTimeout(() => {
        this.hideStatus();
        this.showPreview();
      }, 500);

    } catch (error) {
      console.error('Error generating slides:', error);
      this.showError(error.message || 'Failed to generate slides. Please try again.');
      this.optionsSection.classList.add('visible');
      this.hideStatus();

      // If we have HTML but validation failed, show a debug option
      if (this.generatedHtml && this.generatedHtml.length > 100) {
        this.showDebugOption();
      }
    }
  }

  showDebugOption() {
    // Add a debug button to download the raw HTML
    const errorDiv = this.errorMessage;
    const debugBtn = document.createElement('button');
    debugBtn.textContent = 'Download Raw HTML (Debug)';
    debugBtn.style.cssText = 'margin-top: 0.5rem; padding: 0.5rem 1rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 8px; cursor: pointer;';
    debugBtn.onclick = () => this.downloadRawHtml();

    // Remove existing debug button if any
    const existingBtn = errorDiv.querySelector('.debug-btn');
    if (existingBtn) existingBtn.remove();

    debugBtn.className = 'debug-btn';
    errorDiv.appendChild(debugBtn);
  }

  downloadRawHtml() {
    if (!this.generatedHtml) return;

    const blob = new Blob([this.generatedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.selectedFile.name.replace(/\.[^/.]+$/, '') + '-slides-debug.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadHtml() {
    if (!this.generatedHtml) return;

    const blob = new Blob([this.generatedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.selectedFile.name.replace(/\.[^/.]+$/, '') + '-slides.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  showPreview() {
    const previewFrame = document.getElementById('previewFrame');
    const blob = new Blob([this.generatedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    if (this.iframeTimeout) clearTimeout(this.iframeTimeout);
    if (this.messageRetries) clearTimeout(this.messageRetries);

    let retries = 0;
    const maxRetries = 5;

    const requestSlideCount = () => {
      retries++;
      this.sendMessageToIframe({ action: 'getSlideCount' });
      if (retries < maxRetries) {
        this.messageRetries = setTimeout(requestSlideCount, 1000);
      }
    };

    previewFrame.onload = () => {
      setTimeout(requestSlideCount, 500);

      // Fallback: if iframe never responds, try to detect slides from the DOM
      this.iframeTimeout = setTimeout(() => {
        if (this.totalSlides <= 1) {
          this.tryFallbackSlideDetection();
        }
      }, 6000);
    };

    previewFrame.onerror = () => {
      this.showError('Failed to display slides. The generated content may have errors.');
    };

    previewFrame.src = url;
    this.resultSection.classList.add('visible');
    this.container.classList.add('wide');
  }

  tryFallbackSlideDetection() {
    try {
      const iframeDoc = this.previewFrame.contentDocument || this.previewFrame.contentWindow.document;
      if (!iframeDoc) return;

      const sections = iframeDoc.querySelectorAll('section');
      if (sections.length > 0) {
        this.totalSlides = sections.length;
        this.currentSlide = 1;
        this.updateSlideCounter();
        this.updateNavButtons();

        // Inject a minimal navigation handler if none exists
        const script = iframeDoc.createElement('script');
        script.textContent = `
          if (!window._slideNavInjected) {
            window._slideNavInjected = true;
            const slides = document.querySelectorAll('section');
            let current = 0;

            function showSlide(idx) {
              if (idx < 0 || idx >= slides.length) return;
              slides.forEach((s, i) => {
                s.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                if (i === idx) {
                  s.style.opacity = '1';
                  s.style.visibility = 'visible';
                  s.style.transform = 'translateX(0)';
                  s.style.zIndex = '1';
                  s.style.pointerEvents = 'auto';
                  s.classList.add('active');
                } else {
                  s.style.opacity = '0';
                  s.style.visibility = 'hidden';
                  s.style.transform = i < idx ? 'translateX(-30px)' : 'translateX(30px)';
                  s.style.zIndex = '0';
                  s.style.pointerEvents = 'none';
                  s.classList.remove('active');
                }
              });
              current = idx;
              window.parent.postMessage({ action: 'slideChanged', data: { current: current + 1 } }, '*');
            }

            window.addEventListener('message', (e) => {
              if (!e.data || !e.data.action) return;
              switch (e.data.action) {
                case 'getSlideCount':
                  window.parent.postMessage({ action: 'slideCount', data: { count: slides.length, current: current + 1 } }, '*');
                  break;
                case 'nextSlide': showSlide(current + 1); break;
                case 'prevSlide': showSlide(current - 1); break;
                case 'goToSlide': showSlide(e.data.index); break;
              }
            });

            document.addEventListener('keydown', (e) => {
              if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); showSlide(current + 1); }
              if (e.key === 'ArrowLeft') { e.preventDefault(); showSlide(current - 1); }
            });

            showSlide(0);
            window.parent.postMessage({ action: 'slideCount', data: { count: slides.length, current: 1 } }, '*');
          }
        `;
        iframeDoc.body.appendChild(script);
      }
    } catch (e) {
      console.warn('Fallback slide detection failed:', e.message);
    }
  }

  sendMessageToIframe(message) {
    if (this.previewFrame && this.previewFrame.contentWindow) {
      console.log('Sending message to iframe:', message);
      this.previewFrame.contentWindow.postMessage(message, '*');
    } else {
      console.warn('Cannot send message: iframe not ready');
    }
  }

  handleIframeMessage(e) {
    if (!e.data || !e.data.action) return;
    const { action, data } = e.data;

    switch (action) {
      case 'slideCount':
        if (this.messageRetries) clearTimeout(this.messageRetries);
        if (this.iframeTimeout) clearTimeout(this.iframeTimeout);
        this.totalSlides = data.count || 1;
        this.currentSlide = data.current || 1;
        this.updateSlideCounter();
        this.updateNavButtons();
        break;
      case 'slideChanged':
        this.currentSlide = data.current || 1;
        this.updateSlideCounter();
        this.updateNavButtons();
        break;
    }
  }

  updateSlideCounter() {
    this.slideCounter.textContent = `${this.currentSlide} / ${this.totalSlides}`;
  }

  updateNavButtons() {
    document.getElementById('prevSlideBtn').disabled = this.currentSlide <= 1;
    document.getElementById('nextSlideBtn').disabled = this.currentSlide >= this.totalSlides;
  }

  prevSlide() {
    if (this.currentSlide > 1) {
      this.sendMessageToIframe({ action: 'prevSlide' });
    }
  }

  nextSlide() {
    if (this.currentSlide < this.totalSlides) {
      this.sendMessageToIframe({ action: 'nextSlide' });
    }
  }

  toggleFullscreen() {
    if (this.isFullscreen) {
      this.exitFullscreen();
    } else {
      this.enterFullscreen();
    }
  }

  enterFullscreen() {
    const elem = this.previewContainer;
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else {
      elem.classList.add('fullscreen');
      document.body.style.overflow = 'hidden';
    }
    this.isFullscreen = true;
    document.getElementById('fullscreenBtn').textContent = '✕';
  }

  exitFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (document.webkitFullscreenElement) {
      document.webkitExitFullscreen();
    }
    this.previewContainer.classList.remove('fullscreen');
    document.body.style.overflow = '';
    this.isFullscreen = false;
    document.getElementById('fullscreenBtn').textContent = '⛶';
  }

  async captureAllSlides(progressCallback) {
    const { default: html2canvas } = await import('html2canvas');
    const iframeDoc = this.previewFrame.contentDocument;
    if (!iframeDoc) throw new Error('Cannot access slide content');

    const sections = iframeDoc.querySelectorAll('section');
    const slideCount = sections.length || 1;
    const captures = [];
    const originalSlide = this.currentSlide;

    const captureWidth = this.previewFrame.clientWidth;
    const captureHeight = this.previewFrame.clientHeight;

    // Wait for any Mermaid diagrams to finish rendering
    let waited = 0;
    while (waited < 5000) {
      const pending = iframeDoc.querySelectorAll('pre.mermaid:not([data-processed])');
      if (pending.length === 0) break;
      await new Promise(r => setTimeout(r, 300));
      waited += 300;
    }

    const disableStyle = iframeDoc.createElement('style');
    disableStyle.id = '__capture-override';
    disableStyle.textContent = `
      *, *::before, *::after {
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
      }
    `;
    iframeDoc.head.appendChild(disableStyle);

    for (let i = 0; i < slideCount; i++) {
      if (progressCallback) progressCallback(i + 1, slideCount);
      this.sendMessageToIframe({ action: 'goToSlide', index: i });

      await new Promise(r => setTimeout(r, 100));
      iframeDoc.documentElement.offsetHeight;

      const canvas = await html2canvas(iframeDoc.documentElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: captureWidth,
        height: captureHeight,
        windowWidth: captureWidth,
        windowHeight: captureHeight,
      });
      captures.push(canvas);
    }

    disableStyle.remove();
    this.sendMessageToIframe({ action: 'goToSlide', index: originalSlide - 1 });
    return captures;
  }

  async downloadPdf() {
    if (!this.generatedHtml) return;
    const btn = document.getElementById('downloadPdfBtn');
    btn.disabled = true;

    try {
      btn.textContent = 'Capturing slides...';
      const captures = await this.captureAllSlides((cur, tot) => {
        btn.textContent = `Capturing ${cur}/${tot}...`;
      });

      btn.textContent = 'Building PDF...';
      const { jsPDF } = await import('jspdf');

      const w = captures[0].width / 2;
      const h = captures[0].height / 2;
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [w, h],
        hotfixes: ['px_scaling'],
      });

      captures.forEach((canvas, i) => {
        if (i > 0) pdf.addPage([w, h], 'landscape');
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h);
      });

      pdf.save(this.selectedFile.name.replace(/\.[^/.]+$/, '') + '-slides.pdf');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      this.showError('PDF export failed: ' + error.message);
    } finally {
      btn.textContent = 'Download PDF';
      btn.disabled = false;
    }
  }

  async downloadPptx() {
    if (!this.generatedHtml) return;
    const btn = document.getElementById('downloadPptxBtn');
    btn.disabled = true;

    try {
      btn.textContent = 'Extracting slides...';

      const iframeDoc = this.previewFrame.contentDocument;
      const iframeWin = this.previewFrame.contentWindow;
      if (!iframeDoc || !iframeWin) throw new Error('Cannot access slide content');

      const { extractSlidesFromIframe, buildPptxFromSlides } = await import('./pptx-client.js');

      const slidesData = extractSlidesFromIframe(iframeDoc, iframeWin);
      if (!slidesData || slidesData.length === 0) throw new Error('No slides found');

      btn.textContent = 'Building PPTX...';
      const pptx = await buildPptxFromSlides(slidesData);

      const fileName = this.selectedFile.name.replace(/\.[^/.]+$/, '') + '-slides.pptx';
      await pptx.writeFile({ fileName });
    } catch (error) {
      console.error('Error downloading PPTX:', error);
      this.showError('PPTX export failed: ' + error.message);
    } finally {
      btn.textContent = 'Download PPTX';
      btn.disabled = false;
    }
  }
}

// Initialize the app
new SlidesApp();

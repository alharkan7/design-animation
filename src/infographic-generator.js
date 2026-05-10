class InfographicGeneratorApp {
  constructor() {
    this.allowedModels = new Set([
      'gemini-2.5-flash-image',
      'gemini-3-pro-image-preview',
      'gemini-3.1-flash-image-preview',
    ]);

    this.selectedFile = null;
    this.generatedImageDataUrl = '';

    this.scale = 1;
    this.minScale = 0.2;
    this.maxScale = 5;
    this.translateX = 0;
    this.translateY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;

    this.bindElements();
    this.bindEvents();
    this.updateZoomLabel();
  }

  bindElements() {
    this.modelSelect = document.getElementById('modelSelect');
    this.promptInput = document.getElementById('promptInput');
    this.dropZone = document.getElementById('dropZone');
    this.fileInput = document.getElementById('fileInput');
    this.fileInfo = document.getElementById('fileInfo');
    this.fileName = document.getElementById('fileName');
    this.clearFileBtn = document.getElementById('clearFileBtn');
    this.generateBtn = document.getElementById('generateBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.statusBox = document.getElementById('statusBox');
    this.errorBox = document.getElementById('errorBox');
    this.resultSection = document.getElementById('resultSection');
    this.resultImage = document.getElementById('resultImage');
    this.previewBtn = document.getElementById('previewBtn');
    this.downloadLink = document.getElementById('downloadLink');
    this.promptUsedBox = document.getElementById('promptUsedBox');

    this.previewModal = document.getElementById('previewModal');
    this.modalStage = document.getElementById('modalStage');
    this.modalImage = document.getElementById('modalImage');
    this.zoomOutBtn = document.getElementById('zoomOutBtn');
    this.zoomInBtn = document.getElementById('zoomInBtn');
    this.resetViewBtn = document.getElementById('resetViewBtn');
    this.closeModalBtn = document.getElementById('closeModalBtn');
    this.zoomLabel = document.getElementById('zoomLabel');
  }

  bindEvents() {
    this.dropZone.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (event) => {
      const [file] = event.target.files;
      this.setFile(file || null);
    });

    this.dropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      this.dropZone.classList.add('dragover');
    });

    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('dragover');
    });

    this.dropZone.addEventListener('drop', (event) => {
      event.preventDefault();
      this.dropZone.classList.remove('dragover');
      const [file] = event.dataTransfer.files;
      this.setFile(file || null);
    });

    this.clearFileBtn.addEventListener('click', () => this.clearFile());
    this.generateBtn.addEventListener('click', () => this.handleGenerate());
    this.resetBtn.addEventListener('click', () => this.resetAll());
    this.previewBtn.addEventListener('click', () => this.openPreviewModal());
    this.resultImage.addEventListener('click', () => this.openPreviewModal());

    this.zoomOutBtn.addEventListener('click', () => this.zoomBy(-0.2));
    this.zoomInBtn.addEventListener('click', () => this.zoomBy(0.2));
    this.resetViewBtn.addEventListener('click', () => this.resetView());
    this.closeModalBtn.addEventListener('click', () => this.closePreviewModal());

    this.previewModal.addEventListener('click', (event) => {
      if (event.target === this.previewModal) {
        this.closePreviewModal();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.previewModal.classList.contains('visible')) {
        this.closePreviewModal();
      }
    });

    this.modalStage.addEventListener('wheel', (event) => this.handleWheelZoom(event), { passive: false });
    this.modalStage.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.modalStage.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.modalStage.addEventListener('pointerup', () => this.onPointerUp());
    this.modalStage.addEventListener('pointercancel', () => this.onPointerUp());
    this.modalStage.addEventListener('pointerleave', () => this.onPointerUp());
  }

  setFile(file) {
    if (!file) return;
    this.selectedFile = file;
    this.fileName.textContent = `${file.name} (${this.formatSize(file.size)})`;
    this.fileInfo.classList.add('visible');
    this.hideError();
  }

  clearFile() {
    this.selectedFile = null;
    this.fileInput.value = '';
    this.fileInfo.classList.remove('visible');
    this.fileName.textContent = '';
  }

  resetAll() {
    this.clearFile();
    this.promptInput.value = '';
    this.hideError();
    this.hideStatus();
    this.resultSection.classList.remove('visible');
    this.generatedImageDataUrl = '';
    this.promptUsedBox.classList.remove('visible');
    this.promptUsedBox.textContent = '';
    this.closePreviewModal();
  }

  showStatus(message) {
    this.statusBox.textContent = message;
    this.statusBox.classList.add('visible');
  }

  hideStatus() {
    this.statusBox.classList.remove('visible');
    this.statusBox.textContent = '';
  }

  showError(message) {
    this.errorBox.textContent = message;
    this.errorBox.classList.add('visible');
  }

  hideError() {
    this.errorBox.classList.remove('visible');
    this.errorBox.textContent = '';
  }

  formatSize(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  async readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  async handleGenerate() {
    const selectedModel = this.modelSelect.value;
    const prompt = this.promptInput.value.trim();

    if (!this.allowedModels.has(selectedModel)) {
      this.showError('Please select a valid Gemini image model.');
      return;
    }

    if (!prompt && !this.selectedFile) {
      this.showError('Type a prompt or upload a document first.');
      return;
    }

    this.hideError();
    this.showStatus(this.selectedFile ? 'Extracting prompt from document and generating image...' : 'Generating image...');
    this.generateBtn.disabled = true;
    this.resetBtn.disabled = true;

    try {
      const payload = {
        model: selectedModel,
        prompt,
      };

      if (this.selectedFile) {
        payload.fileName = this.selectedFile.name;
        payload.fileType = this.selectedFile.type || 'application/octet-stream';
        payload.fileData = await this.readFileAsBase64(this.selectedFile);
      }

      const response = await fetch('/api/generate-infographic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate infographic');
      }

      if (!data.imageData) {
        throw new Error('No image data returned from Gemini');
      }

      const mimeType = typeof data.mimeType === 'string' ? data.mimeType : 'image/png';
      this.generatedImageDataUrl = `data:${mimeType};base64,${data.imageData}`;

      this.resultImage.src = this.generatedImageDataUrl;
      this.downloadLink.href = this.generatedImageDataUrl;
      this.resultSection.classList.add('visible');

      if (typeof data.promptUsed === 'string' && data.promptUsed.trim()) {
        this.promptUsedBox.textContent = `Prompt used: ${data.promptUsed.trim()}`;
        this.promptUsedBox.classList.add('visible');
      } else {
        this.promptUsedBox.classList.remove('visible');
        this.promptUsedBox.textContent = '';
      }

      this.showStatus('Infographic generated successfully.');
    } catch (error) {
      this.hideStatus();
      this.showError(error?.message || 'Failed to generate infographic');
      return;
    } finally {
      this.generateBtn.disabled = false;
      this.resetBtn.disabled = false;
    }
  }

  openPreviewModal() {
    if (!this.generatedImageDataUrl) return;
    this.previewModal.classList.add('visible');
    this.previewModal.setAttribute('aria-hidden', 'false');
    this.modalImage.src = this.generatedImageDataUrl;
    document.body.style.overflow = 'hidden';
    this.resetView();
  }

  closePreviewModal() {
    this.previewModal.classList.remove('visible');
    this.previewModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  resetView() {
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.applyTransform();
  }

  updateZoomLabel() {
    this.zoomLabel.textContent = `${Math.round(this.scale * 100)}%`;
  }

  applyTransform() {
    this.modalImage.style.transform = `translate(-50%, -50%) translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    this.updateZoomLabel();
  }

  zoomBy(delta) {
    const newScale = Math.min(this.maxScale, Math.max(this.minScale, this.scale + delta));
    this.scale = Number(newScale.toFixed(3));
    this.applyTransform();
  }

  handleWheelZoom(event) {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.12 : -0.12;
    this.zoomBy(delta);
  }

  onPointerDown(event) {
    if (!this.previewModal.classList.contains('visible')) return;
    this.isDragging = true;
    this.dragStartX = event.clientX - this.translateX;
    this.dragStartY = event.clientY - this.translateY;
    this.modalImage.classList.add('dragging');
    this.modalStage.setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event) {
    if (!this.isDragging) return;
    this.translateX = event.clientX - this.dragStartX;
    this.translateY = event.clientY - this.dragStartY;
    this.applyTransform();
  }

  onPointerUp() {
    this.isDragging = false;
    this.modalImage.classList.remove('dragging');
  }
}

new InfographicGeneratorApp();

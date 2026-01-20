export class VideoRecorder {
    constructor(width = 2560, height = 1440) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');
        this.mediaRecorder = null;
        this.chunks = [];
        this.stream = null;
        this.animationFrameId = null;
    }

    /**
     * Starts recording the canvas stream.
     * @param {number} fps - The frame rate to capture at.
     */
    start(fps = 60) {
        this.chunks = [];
        this.stream = this.canvas.captureStream(fps);

        // VP9 is preferred for transparency support in WebM
        const mimeTypes = [
            'video/webm; codecs=vp9',
            'video/webm; codecs=vp8',
            'video/webm'
        ];

        let selectedType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

        if (!selectedType) {
            console.warn('VP9/VP8 not supported, trying default.');
            selectedType = 'video/webm';
        }

        const options = {
            mimeType: selectedType,
            videoBitsPerSecond: 8000000 // 8 Mbps for high quality
        };

        try {
            this.mediaRecorder = new MediaRecorder(this.stream, options);
        } catch (e) {
            console.error('MediaRecorder initialization failed:', e);
            return false;
        }

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.chunks.push(e.data);
            }
        };

        this.mediaRecorder.start();
        return true;
    }

    /**
     * Stops the recording and triggers a download.
     * @param {string} filename - The name of the file to download.
     * @returns {Promise<void>}
     */
    async stop(filename = 'animation-output.webm') {
        return new Promise((resolve) => {
            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                resolve();
                return;
            }

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();

                // Cleanup
                setTimeout(() => {
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                    this.chunks = [];
                }, 100);
                resolve();
            };

            this.mediaRecorder.stop();
            // Stop all tracks to stop the 'recording' icon in browser
            this.stream.getTracks().forEach(track => track.stop());
        });
    }

    /**
     * Clears the canvas. essential for transparency.
     */
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Draws text centered on the canvas.
     * @param {string} text - The text to draw.
     * @param {object} style - formatting options.
     */
    drawText(text, style = {}) {
        const {
            color = '#ffffff',
            font = '150px "Outfit", sans-serif',
            shadowColor = 'rgba(0,0,0,0)',
            shadowBlur = 0,
            x = this.canvas.width / 2,
            y = this.canvas.height / 2
        } = style;

        this.ctx.save();
        this.ctx.fillStyle = color;
        this.ctx.font = font;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        if (shadowBlur > 0) {
            this.ctx.shadowColor = shadowColor;
            this.ctx.shadowBlur = shadowBlur;
        }

        this.ctx.fillText(text, x, y);
        this.ctx.restore();
    }

    /**
     * Utility to render a frame based on current DOM state or custom logic.
     * In this use case, we will push updates manually from the main loop.
     */
    renderFrame(text, style) {
        this.clear();

        // Draw background if specified
        if (style.backgroundColor && style.backgroundColor !== 'transparent') {
            this.ctx.save();
            this.ctx.fillStyle = style.backgroundColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
        }

        this.drawText(text, style);
    }
}

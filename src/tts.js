import { DEFAULT_VOICE_ID } from './voices.js';

const speakBtn = document.getElementById('speak-btn');
const textInput = document.getElementById('text-input');
const voiceSelect = document.getElementById('voice-select');
const status = document.getElementById('status');
const audioPlayer = document.getElementById('audio-player');

let activeObjectUrl = null;

if (speakBtn) {
    speakBtn.addEventListener('click', async () => {
        const text = textInput.value;
        if (!text) return;

        try {
            speakBtn.disabled = true;
            status.textContent = "Generating Audio...";
            status.classList.remove('hidden');

            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    voiceId: voiceSelect?.value ?? DEFAULT_VOICE_ID,
                    modelId: 'eleven_multilingual_v2',
                    outputFormat: 'mp3_44100_128',
                }),
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(errText || `TTS request failed (${res.status})`);
            }

            const audioBlob = await res.blob();
            const objectUrl = URL.createObjectURL(audioBlob);
            if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
            activeObjectUrl = objectUrl;

            const player = audioPlayer ?? new Audio();
            if (!audioPlayer) player.controls = true;
            player.src = objectUrl;
            if (audioPlayer) audioPlayer.classList.remove('hidden');

            status.textContent = "Playing...";
            await player.play();
            status.classList.add('hidden');
        } catch (error) {
            console.error("Error:", error);
            status.textContent = "Error occurred: " + (error.message || error);
        } finally {
            speakBtn.disabled = false;
        }
    });
}

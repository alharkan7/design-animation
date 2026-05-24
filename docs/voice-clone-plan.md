# Voice Cloning App - Implementation Plan

## Overview

Create a new `/voice-cloning/` app that records audio for voice cloning and synthesizes speech using cloned voices. Voice keys are stored locally in browser localStorage.

## Implementation Steps

### 1. Create App Structure

- Create `/voice-cloning/` directory
- Create `/voice-cloning/index.html` with full UI and embedded JavaScript
- Add card link to `index.html` in the root directory

### 2. Build UI Components

#### Voice Creation Section

- Language selector (English US / Indonesian)
- Consent statement display (changes based on language)
- Two audio recorders:
  - Consent audio recorder (record the consent statement)
  - Reference audio recorder (record ~10 seconds of speech)
- Audio playback for both recordings
- "Create Voice Key" button
- Generated voice key display with copy button

#### TTS Section

- Voice selector (dropdown showing saved voices)
- Text input area for synthesis
- "Generate Speech" button
- Audio player for result

#### Saved Voices Section

- List of all saved voices with:
  - Voice name (editable)
  - Language
  - Creation date
  - Delete button

### 3. Implement Audio Recording

- Use MediaRecorder API for in-browser recording
- Record as LINEAR16 (WAV) format
- Include visual recording indicator
- Allow re-recording with confirmation

### 4. Implement Backend API (vite.config.js)

Add two endpoints to the existing Vite plugin:

```javascript
// POST /api/voice-clone
// - Validates request
// - Calls Google's generateVoiceCloningKey API
// - Returns voiceCloningKey

// POST /api/voice-clone/synthesize
// - Validates request
// - Calls Google's text:synthesize API with voice_clone
// - Returns audio content
```

### 5. Client-Side Features

Store voices in localStorage with structure:

```json
{
  "id": "uuid",
  "name": "My Voice",
  "languageCode": "en-US",
  "voiceCloningKey": "key string",
  "createdAt": "timestamp"
}
```

- Export/import voices as JSON file
- Clear all voices option

### 6. Error Handling & Validation

- Show clear error messages for API failures
- Validate audio duration (5-15 seconds range)
- Handle API not ready state with helpful message
- Rate limit handling for 10 keys/minute

### 7. Polish

- Match existing app styling (glassmorphism, gradients)
- Add loading states with Lucide icons
- Responsive design
- Keyboard shortcuts for recording

### 8. Documentation

- Add inline comments about API requirements
- Note about sales contact needed for access
- Link to Google Cloud documentation

## Dependencies

- None new (using browser MediaRecorder API)
- Lucide icons (already used in project)

## API Configuration Required

When ready, set the following environment variables:

```env
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
# or for testing:
GOOGLE_ACCESS_TOKEN=your-oauth-token
```

## References

- [Instant Custom Voice Documentation](https://docs.cloud.google.com/text-to-speech/docs/chirp3-instant-custom-voice)
- [Try in Vertex AI Studio](https://console.cloud.google.com/vertex-ai/studio/media/generate;tab=audio)
- [Contact Sales for Access](https://cloud.google.com/contact)
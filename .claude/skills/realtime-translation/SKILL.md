# Skill: Realtime Audio Translation (OpenAI Realtime API + Twilio Video)

## Purpose
Implement two-way real-time audio translation inside Twilio video sessions. Each participant speaks in their native language; the other participant hears the translated audio in near-real-time (~300-500ms latency). Text captions of both original and translated speech are shown in the UI.

---

## Architecture Decision

**Relay server pattern** (not browser-direct):
OpenAI's docs warn: "your API keys are at risk if you connect to OpenAI directly from the browser."
Use a Django Channels WebSocket relay or a dedicated Node.js relay service. The frontend streams raw PCM16 audio to our relay, which forwards it to OpenAI and streams translated audio back.

**Transport chain:**
```
Twilio LocalAudioTrack
  → Web Audio API (AudioWorklet/ScriptProcessor)
  → PCM16 Int16Array chunks (24kHz)
  → WebSocket to our relay server
  → OpenAI Realtime API (wss://api.openai.com/v1/realtime)
  → translated PCM16 audio back
  → Web Audio API AudioContext.decodeAudioData → play
  → Twilio LocalAudioTrack (optional: publish translated audio as new track)
```

---

## OpenAI Realtime API — Technical Reference

### Connection
```
wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01
```

**Node.js auth headers:**
```
Authorization: Bearer {OPENAI_API_KEY}
OpenAI-Beta: realtime=v1
```

**Browser auth (insecure — use relay instead):**
```
WebSocket subprotocol: openai-insecure-api-key.{apiKey}
```

**Latest model:** `gpt-4o-realtime-preview-2024-10-01`
(check for newer: `gpt-4o-realtime-preview` without date suffix may auto-route to latest)

### NPM Package (for relay server)
```
npm i openai/openai-realtime-api-beta --save
```
Or use raw WebSocket — no SDK required.

### session.update Payload (sent after connection opens)
```json
{
  "type": "session.update",
  "session": {
    "modalities": ["audio", "text"],
    "instructions": "You are a real-time translator. The user will speak in [SOURCE_LANG]. Translate everything they say to [TARGET_LANG] and respond ONLY with the translation as spoken audio. Do not add commentary.",
    "voice": "alloy",
    "input_audio_format": "pcm16",
    "output_audio_format": "pcm16",
    "input_audio_transcription": { "model": "whisper-1" },
    "turn_detection": {
      "type": "server_vad",
      "threshold": 0.5,
      "prefix_padding_ms": 300,
      "silence_duration_ms": 500
    },
    "temperature": 0.6,
    "max_response_output_tokens": "inf"
  }
}
```

**Voice options:** `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`

**Audio formats:** `pcm16` (default, 24kHz), `g711_ulaw`, `g711_alaw`

### Client → Server Events
| Event | Payload | Purpose |
|---|---|---|
| `session.update` | session config object | Configure session |
| `input_audio_buffer.append` | `{ audio: "<base64 PCM16>" }` | Stream audio chunk |
| `input_audio_buffer.commit` | `{}` | Mark utterance complete (manual mode) |
| `response.create` | `{}` | Request model to generate (manual mode) |
| `response.cancel` | `{}` | Interrupt generation |
| `conversation.item.create` | item object | Insert text message |
| `conversation.item.truncate` | `{ item_id, content_index, audio_end_ms }` | Truncate audio |
| `conversation.item.delete` | `{ item_id }` | Delete item |

### Server → Client Events
| Event | Purpose |
|---|---|
| `session.created` | Connection established, session ID returned |
| `input_audio_buffer.speech_started` | VAD detected speech start |
| `input_audio_buffer.speech_stopped` | VAD detected silence |
| `conversation.item.created` | New item in conversation |
| `conversation.item.input_audio_transcription.completed` | Whisper transcript of user input |
| `response.created` | Generation started |
| `response.audio.delta` | **Streaming translated audio chunk (base64 PCM16)** |
| `response.audio_transcript.delta` | Streaming text transcript of translated output |
| `response.audio.done` | Audio generation complete |
| `response.output_item.done` | Output item finalized |
| `error` | Error from API |

### Audio Format: PCM16
- Sample rate: **24,000 Hz**
- Encoding: signed 16-bit PCM, little-endian
- Input: `Int16Array` or `ArrayBuffer`
- Base64-encoded for WebSocket transport
- Twilio audio is also PCM — but may need resampling from 48kHz → 24kHz

---

## Twilio Video — Audio Track Access

### Get raw PCM audio from Twilio LocalAudioTrack
```typescript
// In useTwilioTracks.ts or new hook
const audioTrack = localAudioTrack; // from useTwilioTracks
const mediaStreamTrack = (audioTrack as any).mediaStreamTrack; // raw MediaStreamTrack
const stream = new MediaStream([mediaStreamTrack]);

// Use Web Audio API to process
const audioContext = new AudioContext({ sampleRate: 24000 });
const source = audioContext.createMediaStreamSource(stream);
const processor = audioContext.createScriptProcessor(4096, 1, 1);

processor.onaudioprocess = (event) => {
  const inputData = event.inputBuffer.getChannelData(0); // Float32Array
  const pcm16 = float32ToPcm16(inputData); // convert to Int16Array
  const base64 = arrayBufferToBase64(pcm16.buffer);
  relayWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }));
};

source.connect(processor);
processor.connect(audioContext.destination);
```

**Resampling:** Twilio default is 48kHz; OpenAI needs 24kHz. Either:
1. Create AudioContext at 24kHz (supported in most browsers)
2. Or use an OfflineAudioContext to resample

### Access remote participant audio (for translating what they say)
```typescript
// In useTwilioRoom.ts - track.kind === 'audio'
const remoteMediaStream = new MediaStream([track.mediaStreamTrack]);
// Same AudioContext pipeline as above
```

### Key files to modify
| File | Purpose |
|---|---|
| `src/hooks/useTwilioRoom.ts` | Access remote audio tracks |
| `src/hooks/useTwilioTracks.ts` | Access local audio track (`localAudioTrack.mediaStreamTrack`) |
| `src/components/Call/TwilioVideoCall.tsx` | Main call UI — add translation toggle + caption overlay |
| `apps/video_conferencing/views.py` | Add relay token/session endpoint |
| `apps/video_conferencing/urls.py` | Register new endpoints |

---

## Backend Implementation Plan

### New endpoint: `/api/v1/videocall/translation/session/`
- POST — authenticated, returns ephemeral session config for relay
- Creates a per-participant OpenAI Realtime WebSocket relay
- Returns: `{ relay_ws_url, session_id, source_lang, target_lang }`

### Django Channels relay (preferred) or Node.js sidecar
- Accepts WebSocket from frontend
- Opens WebSocket to OpenAI Realtime API with server-side API key
- Bidirectional proxy: frontend audio → OpenAI, OpenAI audio → frontend
- Per-participant relay (one OpenAI session per participant)

### New Django model: `TranslationSession`
```python
class TranslationSession(BaseModel):
    appointment = models.ForeignKey(Appointment, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    source_language = models.CharField(max_length=50)
    target_language = models.CharField(max_length=50)
    openai_session_id = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
```

---

## Frontend Implementation Plan

### New hook: `useRealtimeTranslation`
```typescript
// src/hooks/useRealtimeTranslation.ts
interface UseRealtimeTranslationProps {
  localAudioTrack: any;          // from useTwilioTracks
  remoteAudioTracks?: any[];     // from useTwilioRoom
  sourceLanguage: string;        // e.g., "English"
  targetLanguage: string;        // e.g., "Spanish"
  relayWsUrl: string;            // from backend
}

// Returns:
// - isTranslating: boolean
// - startTranslation(): void
// - stopTranslation(): void
// - captions: { original: string, translated: string }
// - translatedAudioNode: AudioNode (to pipe to speakers)
```

### Audio pipeline
1. Tap `localAudioTrack.mediaStreamTrack` via Web Audio API
2. Convert Float32→PCM16, resample to 24kHz
3. Send base64 chunks to relay WebSocket (`input_audio_buffer.append`)
4. Receive `response.audio.delta` → decode base64 → decode PCM16 → play via AudioContext
5. Receive `response.audio_transcript.delta` → update caption state
6. Receive `conversation.item.input_audio_transcription.completed` → show original speech caption

### Utility functions needed
```typescript
// float32ToPcm16(float32: Float32Array): Int16Array
// pcm16ToFloat32(pcm16: Int16Array): Float32Array
// arrayBufferToBase64(buffer: ArrayBuffer): string
// base64ToArrayBuffer(base64: string): ArrayBuffer
// playPcm16Audio(pcm16: Int16Array, audioContext: AudioContext): void
```

---

## Consent & Language Selection UI
- Shown before translation starts (not during active call)
- "Enable real-time translation" toggle in call controls
- Language selector: source + target (dropdown with all languages)
- Consent disclosure: "Your audio will be processed by OpenAI for translation"
- Can be added to the existing call controls bar in `TwilioVideoCall.tsx`

---

## Dependencies to Add

### Backend
```
# requirements.txt
channels[daphne]>=4.0.0       # Django Channels for WebSocket relay
channels-redis>=4.0.0          # Redis channel layer
openai>=1.0.0                  # OpenAI Python SDK (has Realtime support in v2+)
```

### Frontend
```json
// package.json - no new deps needed
// Web Audio API is browser-native
// WebSocket is browser-native
// openai npm package optional (can use raw WebSocket)
```

---

## Environment Variables

### Backend `.env`
```
OPENAI_API_KEY=sk-...
```

### Frontend `.env.local`
```
# No frontend key — relay handles auth
NEXT_PUBLIC_TRANSLATION_WS_URL=ws://localhost:8000/ws/translation/
```

---

## Known Gotchas
1. **Twilio audio is 48kHz, OpenAI needs 24kHz** — always resample
2. **ScriptProcessor is deprecated** — use AudioWorklet in production for better performance
3. **One OpenAI session per participant** — not one per room. Each person translates what THEY say.
4. **VAD server_vad** is simplest for turn detection — no need to manually commit audio buffers
5. **Echo cancellation**: if you play translated audio through speakers while mic is open, feedback loop risk. Use headphones or apply echo cancellation via `echoCancellation: true` on getUserMedia constraints.
6. **Django Channels requires ASGI** — ensure `asgi.py` is configured and Daphne/Uvicorn is used instead of WSGI
7. **Redis channel layer** required for Django Channels in production (already in docker-compose)

---

## Testing Strategy
- Unit test audio conversion utilities (float32↔pcm16, base64 encoding)
- Integration test relay WebSocket with mock OpenAI responses
- E2E: two browser tabs, verify captions appear correctly
- Mock mode: if `OPENAI_API_KEY` missing, return static audio/captions

---

## Reference Repos
- `github.com/openai/openai-realtime-api-beta` — official SDK + protocol docs
- `github.com/openai/openai-realtime-console` — reference implementation (uses WebRTC in latest version, WebSocket in older branch)
- SDK install: `npm i openai/openai-realtime-api-beta --save`

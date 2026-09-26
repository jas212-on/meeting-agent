import { chromium } from "playwright";
import path from "node:path";

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Real-Time Voice Interaction Architecture: Google Meet AI Agent & Vapi Integration</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

  @page {
    size: A4;
    margin: 18mm 15mm 18mm 15mm;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #1e293b;
    background: #ffffff;
    line-height: 1.55;
    font-size: 9.5pt;
  }

  .header {
    border-bottom: 2px solid #3b82f6;
    padding-bottom: 14px;
    margin-bottom: 22px;
  }

  .header-badge {
    display: inline-block;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 3px 9px;
    border-radius: 9999px;
    margin-bottom: 8px;
    border: 1px solid #bfdbfe;
  }

  h1 {
    font-size: 19pt;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.2;
    margin-bottom: 6px;
    letter-spacing: -0.02em;
  }

  .subtitle {
    font-size: 10pt;
    color: #64748b;
    font-weight: 400;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-top: 14px;
    background: #f8fafc;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }

  .meta-item {
    font-size: 8pt;
  }

  .meta-label {
    color: #94a3b8;
    text-transform: uppercase;
    font-weight: 600;
    font-size: 7pt;
    letter-spacing: 0.05em;
  }

  .meta-value {
    color: #334155;
    font-weight: 600;
    margin-top: 1px;
  }

  h2 {
    font-size: 13pt;
    font-weight: 700;
    color: #0f172a;
    margin-top: 22px;
    margin-bottom: 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  h3 {
    font-size: 10.5pt;
    font-weight: 700;
    color: #1e293b;
    margin-top: 14px;
    margin-bottom: 6px;
  }

  p {
    margin-bottom: 8px;
    color: #334155;
  }

  .card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 12px;
  }

  .card-blue {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }

  .card-indigo {
    background: #eef2ff;
    border-color: #c7d2fe;
  }

  .card-amber {
    background: #fffbeb;
    border-color: #fde68a;
  }

  .card-title {
    font-size: 9.5pt;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* Flow Steps */
  .step-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 10px 0 14px 0;
  }

  .step-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 8px 12px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  }

  .step-num {
    background: #3b82f6;
    color: #ffffff;
    font-weight: 700;
    font-size: 7.5pt;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .step-num-green {
    background: #10b981;
  }

  .step-content {
    flex: 1;
  }

  .step-title {
    font-weight: 600;
    font-size: 8.5pt;
    color: #0f172a;
  }

  .step-desc {
    font-size: 8pt;
    color: #475569;
    margin-top: 2px;
    line-height: 1.45;
  }

  .tech-pill {
    display: inline-block;
    background: #e2e8f0;
    color: #334155;
    font-family: 'JetBrains Mono', monospace;
    font-size: 7pt;
    font-weight: 500;
    padding: 1px 5px;
    border-radius: 4px;
    margin-left: 4px;
  }

  /* Diagrams */
  .diagram-container {
    background: #0f172a;
    color: #f8fafc;
    border-radius: 8px;
    padding: 14px;
    margin: 12px 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5pt;
    line-height: 1.45;
    overflow: hidden;
  }

  .diagram-title {
    color: #94a3b8;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 8px;
    border-bottom: 1px solid #334155;
    padding-bottom: 4px;
  }

  .diagram-node {
    background: #1e293b;
    border: 1px solid #475569;
    border-radius: 5px;
    padding: 6px 10px;
    margin: 4px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .diagram-arrow {
    text-align: center;
    color: #38bdf8;
    font-size: 9pt;
    font-weight: bold;
    margin: 2px 0;
  }

  .diagram-tag {
    background: #0284c7;
    color: #ffffff;
    font-size: 6.5pt;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 600;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 8pt;
  }

  th {
    background: #f1f5f9;
    color: #334155;
    text-align: left;
    padding: 7px 10px;
    font-weight: 600;
    border-bottom: 2px solid #cbd5e1;
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  td {
    padding: 7px 10px;
    border-bottom: 1px solid #e2e8f0;
    color: #334155;
    vertical-align: top;
  }

  tr:nth-child(even) {
    background: #f8fafc;
  }

  .code-inline {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5pt;
    background: #f1f5f9;
    color: #0f172a;
    padding: 1px 4px;
    border-radius: 3px;
    border: 1px solid #e2e8f0;
  }

  .page-break {
    page-break-before: always;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 10px 0;
  }

  .footer {
    margin-top: 30px;
    border-top: 1px solid #e2e8f0;
    padding-top: 10px;
    display: flex;
    justify-content: space-between;
    font-size: 7.5pt;
    color: #94a3b8;
  }
</style>
</head>
<body>

  <!-- PAGE 1: TITLE & HIGH LEVEL ARCHITECTURE -->
  <div class="header">
    <div class="header-badge">Technical Architecture & Engineering Reference</div>
    <h1>Real-Time Voice Interaction Architecture</h1>
    <div class="subtitle">Deep Dive into Bidirectional Audio Pipeline: Google Meet WebRTC &harr; Vapi AI Voice Agent</div>
    
    <div class="meta-grid">
      <div class="meta-item">
        <div class="meta-label">Protocol</div>
        <div class="meta-value">Raw PCM WebSockets (16kHz)</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Duplex Engine</div>
        <div class="meta-value">Virtual Audio Cable (VB-Cable)</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Audio Worklet</div>
        <div class="meta-value">Linear Resampler & Hysteresis</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Automation Layer</div>
        <div class="meta-value">Playwright Persistent Context</div>
      </div>
    </div>
  </div>

  <h2>1. Executive Overview & System Architecture</h2>
  <p>
    Enabling a cloud-hosted conversational voice AI (Vapi) to participate in a standard Google Meet call in real time requires bridging three fundamentally isolated domains: 
    <strong>Google Meet's WebRTC browser sandbox</strong>, the <strong>Windows Host Operating System Audio Subsystem</strong>, and the <strong>Vapi Low-Latency WebSocket Engine</strong>.
  </p>

  <div class="diagram-container">
    <div class="diagram-title">System-Wide End-to-End Component Topology</div>
    <div class="diagram-node">
      <span><strong>Remote Meeting Participants</strong> (Google Meet WebRTC Call)</span>
      <span class="diagram-tag">Human Voice Audio</span>
    </div>
    <div class="diagram-arrow">&darr; WebRTC Playback Output (Speakers) &nbsp;&nbsp;&nbsp;&nbsp; &uarr; WebRTC Capture Input (Microphone)</div>
    <div class="diagram-node">
      <span><strong>Windows Virtual Audio Engine</strong> (VB-Cable Input &harr; VB-Cable Output Loopback)</span>
      <span class="diagram-tag">Hardware Audio Bus</span>
    </div>
    <div class="diagram-arrow">&darr; getUserMedia Capture Stream &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; &uarr; AudioContext setSinkId Output</div>
    <div class="diagram-node">
      <span><strong>Chromium Audio Bridge Page</strong> (Web Audio API &bull; AudioWorklet &bull; Linear Resampler)</span>
      <span class="diagram-tag">In-Browser Worklet</span>
    </div>
    <div class="diagram-arrow">&darr; WebSocket (/ws) Binary PCM &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; &uarr; WebSocket (/ws) TTS Binary Chunks</div>
    <div class="diagram-node">
      <span><strong>Node.js Orchestrator</strong> (AudioBridge &bull; VapiBridge &bull; Playwright Meet Controller)</span>
      <span class="diagram-tag">Node.js Runtime</span>
    </div>
    <div class="diagram-arrow">&darr; Secure WebSocket (wss://api.vapi.ai) &uarr; Secure WebSocket (wss://api.vapi.ai)</div>
    <div class="diagram-node">
      <span><strong>Vapi Voice Engine</strong> (Soniox STT &bull; OpenAI LLM &bull; ElevenLabs/Deepgram TTS)</span>
      <span class="diagram-tag">Cloud Voice AI</span>
    </div>
  </div>

  <div class="grid-2">
    <div class="card card-blue">
      <div class="card-title">&#128225; Pipeline A: User &rarr; Vapi (STT)</div>
      <p style="font-size: 8pt; margin-bottom: 0;">
        Extracts participant speech from the Meet room, resamples from Windows hardware rate (48kHz) to speech-grade PCM (16kHz 16-bit mono), performs acoustic echo suppression, and streams it to Vapi's real-time transcriber.
      </p>
    </div>
    <div class="card card-indigo">
      <div class="card-title">&#128227; Pipeline B: Vapi &rarr; User (TTS)</div>
      <p style="font-size: 8pt; margin-bottom: 0;">
        Streams synthesized assistant PCM audio chunks from Vapi, buffers them in a low-latency AudioWorklet, resamples 16kHz &rarr; 48kHz, feeds them into VB-Cable Input, and unmutes Google Meet mic for broadcasting.
      </p>
    </div>
  </div>

  <!-- PAGE 2: USER TO VAPI DEEP DIVE -->
  <div class="page-break"></div>

  <h2>2. Pipeline A: User to Vapi (Speech Recognition Flow)</h2>
  <p>
    When a human participant speaks inside the Google Meet meeting, their voice traverses an 8-step ingestion and processing pipeline before reaching Vapi's Large Language Model.
  </p>

  <div class="step-list">
    <div class="step-item">
      <div class="step-num step-num-green">1</div>
      <div class="step-content">
        <div class="step-title">WebRTC Audio Output in Google Meet</div>
        <div class="step-desc">
          The remote user's voice arrives over Google's WebRTC audio peer connection. Google Meet plays the incoming audio through Chrome's default playback device. Because the agent configured the system default render device to <span class="code-inline">CABLE Input (VB-Audio)</span>, the user's voice outputs directly into the virtual cable.
        </div>
      </div>
    </div>

    <div class="step-item">
      <div class="step-num step-num-green">2</div>
      <div class="step-content">
        <div class="step-title">Hardware Driver Loopback (VB-Cable)</div>
        <div class="step-desc">
          The VB-Cable driver internally routes all digital audio received on <span class="code-inline">CABLE Input</span> directly to the <span class="code-inline">CABLE Output</span> capture endpoint with near-zero latency (&lt;2ms).
        </div>
      </div>
    </div>

    <div class="step-item">
      <div class="step-num step-num-green">3</div>
      <div class="step-content">
        <div class="step-title">Browser Capture via getUserMedia</div>
        <div class="step-desc">
          The background Audio Bridge page (<span class="code-inline">http://127.0.0.1:bridgePort</span>) requests a microphone stream. Because Windows default capture is set to <span class="code-inline">CABLE Output</span>, the browser captures the human participant's audio with <span class="code-inline">echoCancellation: false</span> and <span class="code-inline">noiseSuppression: false</span> for pure studio fidelity.
        </div>
      </div>
    </div>

    <div class="step-item">
      <div class="step-num step-num-green">4</div>
      <div class="step-content">
        <div class="step-title">Dynamic Linear Interpolation Resampling (48kHz &rarr; 16kHz)</div>
        <div class="step-desc">
          Windows AudioContext runs at native hardware rate (typically 48,000 Hz or 44,100 Hz). The Audio Bridge converts 32-bit floating point audio to 16,000 Hz using linear interpolation:
          <span class="code-inline">ratio = inCtx.sampleRate / 16000</span>. This prevents audio from playing at 3&times; speed (chipmunk effect) in speech models.
        </div>
      </div>
    </div>

    <div class="step-item">
      <div class="step-num step-num-green">5</div>
      <div class="step-content">
        <div class="step-title">PCM Encoding (16-bit Signed Little-Endian)</div>
        <div class="step-desc">
          Normalized float samples (<span class="code-inline">-1.0 to +1.0</span>) are scaled and quantized to 16-bit integers (<span class="code-inline">-32768 to +32767</span>), producing raw <span class="code-inline">pcm_s16le</span> buffers.
        </div>
      </div>
    </div>

    <div class="step-item">
      <div class="step-num step-num-green">6</div>
      <div class="step-content">
        <div class="step-title">In-Browser Echo Gating</div>
        <div class="step-desc">
          If the assistant is currently speaking or in its trailing 500ms acoustic dissipation cooldown, the capture processor drops the chunk to eliminate self-speech loopback.
        </div>
      </div>
    </div>

    <div class="step-item">
      <div class="step-num step-num-green">7</div>
      <div class="step-content">
        <div class="step-title">Local WebSocket Bridge &rarr; Node.js VapiBridge</div>
        <div class="step-desc">
          The binary buffer is sent across <span class="code-inline">ws://127.0.0.1:bridgePort/ws</span> to the Node.js process. <span class="code-inline">VapiBridge.sendUserAudio()</span> validates the assistant state and pipes the binary frame over the persistent WebSocket to Vapi.
        </div>
      </div>
    </div>

    <div class="step-item">
      <div class="step-num step-num-green">8</div>
      <div class="step-content">
        <div class="step-title">Vapi Cloud Ingestion & Speech-to-Text (STT)</div>
        <div class="step-desc">
          Vapi's neural STT engine (Soniox/Deepgram) streams interim and final transcription tokens (<span class="code-inline">"transcript"</span> event). When the user pauses, Vapi's VAD (Voice Activity Detector) triggers an LLM turn.
        </div>
      </div>
    </div>
  </div>

  <div class="card card-amber">
    <div class="card-title">&#9888; Critical Engineering Highlight: Resampling Math</div>
    <p style="font-size: 8pt; margin-bottom: 0;">
      Without the custom linear interpolation resampler, 48kHz audio sent directly into a 16kHz Vapi session caused speech to be compressed by 66.7% in time, increasing pitch by 3 octaves and causing 100% recognition failure. The resampler restores natural human formant frequencies.
    </p>
  </div>

  <!-- PAGE 3: VAPI TO USER DEEP DIVE -->
  <div class="page-break"></div>

  <h2>3. Pipeline B: Vapi to User (Assistant Speech Flow)</h2>
  <p>
    When the AI assistant generates a response, synthesized speech audio is streamed back into the Google Meet call with sub-second latency through the reverse pipeline.
  </p>

  <div class="step-list">
    <div class="step-item">
      <div class="step-num">1</div>
      <div class="step-content">
        <div class="step-title">Vapi Cloud TTS Audio Streaming</div>
        <div class="step-desc">
          Vapi synthesizes conversational audio chunks (raw <span class="code-inline">pcm_s16le</span>, 16kHz mono) and emits a <span class="code-inline">speech-update: assistant started</span> message followed by binary WebSocket frames.
        </div>
      </div>
    </div>

    <div class="step-item">
      <div class="step-num">2</div>
      <div class="step-content">
        <div class="step-title">Node.js VapiBridge & Mode Switching</div>
        <div class="step-desc">
          <span class="code-inline">VapiBridge</span> receives binary chunks, sets <span class="code-inline">isSpeaking = true</span>, and dispatches a mode change notification to the Playwright controller (<span class="code-inline">setMic(page, true)</span>) to unmute Google Meet's microphone.
        </div>
      </div>
    </div>

    <div class="step-item">
      <div class="step-num">3</div>
      <div class="step-content">
        <div class="step-title">AudioBridge &rarr; Browser WebSocket</div>
        <div class="step-desc">
          Node.js forwards binary PCM chunks to the Audio Bridge browser page over the local WebSocket connection (<span class="code-inline">/ws</span>).
        </div>
      </div>
    </div>

    <div class="step-item">
      <div class="step-num">4</div>
      <div class="step-content">
        <div class="step-title">AudioWorklet (PcmProcessor) Queueing</div>
        <div class="step-desc">
          The AudioWorklet thread receives the ArrayBuffer, converts 16-bit integers to normalized 32-bit floats, and pushes them into an internal FIFO audio buffer queue.
        </div>
      </div>
    </div>

    <div class="step-item">
      <div class="step-num">5</div>
      <div class="step-content">
        <div class="step-title">AudioWorklet Resampling (16kHz &rarr; 48kHz) & Audio Output</div>
        <div class="step-desc">
          The worklet's <span class="code-inline">process()</span> callback renders 128-sample frames at 48kHz by upsampling with linear interpolation (<span class="code-inline">ratio = 16000 / 48000 = 0.333</span>).
        </div>
      </div>
    </div>

    <div class="step-item">
      <div class="step-num">6</div>
      <div class="step-content">
        <div class="step-title">Sink Routing to CABLE Input</div>
        <div class="step-desc">
          The AudioContext's output destination is explicitly bound to <span class="code-inline">CABLE Input (VB-Audio)</span> via <span class="code-inline">ctx.setSinkId(cableSink.deviceId)</span>.
        </div>
      </div>
    </div>

    <div class="step-item">
      <div class="step-num">7</div>
      <div class="step-content">
        <div class="step-title">Google Meet Microphone Injection</div>
        <div class="step-desc">
          In the Google Meet page, the <span class="code-inline">MediaHook</span> script intercepted <span class="code-inline">getUserMedia</span> and forced the microphone source to <span class="code-inline">CABLE Output</span>. The bot's synthesized voice is ingested by Google Meet as its official microphone input.
        </div>
      </div>
    </div>

    <div class="step-item">
      <div class="step-num">8</div>
      <div class="step-content">
        <div class="step-title">WebRTC Transmission to Meeting Room</div>
        <div class="step-desc">
          Google Meet encodes the bot's speech with the Opus codec and broadcasts it over WebRTC to all remote participants in the room.
        </div>
      </div>
    </div>
  </div>

  <!-- PAGE 4: ECHO CANCELLATION & DATA FORMATS -->
  <div class="page-break"></div>

  <h2>4. Echo Prevention, Hysteresis & State Machine</h2>
  <p>
    Because the bot's microphone and speaker are connected through the same virtual audio driver (VB-Cable), a naive implementation creates an infinite echo loop where the bot listens to its own voice. Our multi-tiered state machine prevents this.
  </p>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">&#128260; 400ms Silence Hysteresis</div>
      <p style="font-size: 8pt;">
        Streaming WebSocket audio packets arrive with 20&ndash;50ms intervals. Without hysteresis, micro-gaps between packets cause the worklet to declare <span class="code-inline">playback-stopped</span> prematurely, causing rapid microphone chatter. Our worklet requires <strong>150 consecutive empty frames (400ms)</strong> before firing a stop event.
      </p>
    </div>
    <div class="card">
      <div class="card-title">&#128737; Dual-Layer Echo Gate</div>
      <p style="font-size: 8pt;">
        1. <strong>Browser-Side:</strong> When the worklet is playing, <span class="code-inline">isAssistantPlaying = true</span> drops capture buffers at the source with a 500ms trailing acoustic cooldown.<br>
        2. <strong>Node-Side:</strong> <span class="code-inline">VapiBridge.sendUserAudio()</span> drops packets if <span class="code-inline">isSpeaking = true</span>.
      </p>
    </div>
  </div>

  <h2>5. Protocols, Sample Rates & Latency Profile</h2>

  <table>
    <thead>
      <tr>
        <th>Hop / Interface</th>
        <th>Protocol / API</th>
        <th>Audio Format</th>
        <th>Sample Rate</th>
        <th>Typical Latency</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Meet &rarr; VB-Cable</strong></td>
        <td>WebRTC Playback</td>
        <td>PCM 32-bit Float</td>
        <td>48,000 Hz</td>
        <td>&lt; 5 ms</td>
      </tr>
      <tr>
        <td><strong>VB-Cable Loopback</strong></td>
        <td>Windows Kernel Audio Driver</td>
        <td>PCM 24/32-bit</td>
        <td>48,000 Hz</td>
        <td>&lt; 2 ms</td>
      </tr>
      <tr>
        <td><strong>Capture &amp; Resample</strong></td>
        <td>Web Audio ScriptProcessor</td>
        <td>Linear Resampled Float &rarr; Int16</td>
        <td>48kHz &rarr; 16kHz</td>
        <td>~10 ms</td>
      </tr>
      <tr>
        <td><strong>Browser &harr; Node.js</strong></td>
        <td>Local WebSocket (<span class="code-inline">/ws</span>)</td>
        <td>Binary <span class="code-inline">pcm_s16le</span></td>
        <td>16,000 Hz</td>
        <td>&lt; 1 ms</td>
      </tr>
      <tr>
        <td><strong>Node.js &harr; Vapi Cloud</strong></td>
        <td>WSS TLS WebSocket</td>
        <td>Raw PCM Stream (<span class="code-inline">pcm_s16le</span>)</td>
        <td>16,000 Hz</td>
        <td>30 &ndash; 60 ms</td>
      </tr>
      <tr>
        <td><strong>Vapi TTS &rarr; AudioWorklet</strong></td>
        <td>AudioWorklet <span class="code-inline">PcmProcessor</span></td>
        <td>Upsampled Float32 Array</td>
        <td>16kHz &rarr; 48kHz</td>
        <td>~5 ms</td>
      </tr>
      <tr>
        <td><strong>Worklet &rarr; Meet Mic</strong></td>
        <td>Web Audio <span class="code-inline">setSinkId</span> &rarr; WebRTC</td>
        <td>PCM 32-bit Float &rarr; Opus</td>
        <td>48,000 Hz</td>
        <td>&lt; 5 ms</td>
      </tr>
    </tbody>
  </table>

  <h2>6. Summary of Key Files</h2>
  <div class="card card-indigo">
    <p style="font-size: 8pt; margin-bottom: 4px;">
      &bull; <span class="code-inline">src/audio-bridge-page.ts</span>: In-browser AudioWorklet, linear resampler (48k &harr; 16k), VB-Cable sink configuration, and echo gating.
    </p>
    <p style="font-size: 8pt; margin-bottom: 4px;">
      &bull; <span class="code-inline">src/vapi-bridge.ts</span>: Manages Vapi call session, speech state transitions, STT/TTS streaming, and padding frame filters.
    </p>
    <p style="font-size: 8pt; margin-bottom: 4px;">
      &bull; <span class="code-inline">src/audio-routing.ts</span>: Interacts with SoundVolumeView (<span class="code-inline">svcl.exe</span>) to automate Windows default playback and recording device routing.
    </p>
    <p style="font-size: 8pt; margin-bottom: 0;">
      &bull; <span class="code-inline">src/join-meeting.ts</span> &amp; <span class="code-inline">src/meet-control.ts</span>: Controls Playwright Chrome instance, Google Meet pre-join, in-call camera/mic state, and popup dismissals.
    </p>
  </div>

  <div class="footer">
    <span>Google Meet AI Agent &bull; Architectural Reference Document</span>
    <span>Generated: September 2026</span>
  </div>

</body>
</html>
`;

async function run() {
  console.log("Launching Chrome to compile PDF...");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  
  await page.setContent(htmlContent, { waitUntil: "networkidle" });
  
  const outputPath = path.resolve("..", "Realtime_Voice_Interaction_Architecture.pdf");
  console.log("Rendering PDF to:", outputPath);

  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    margin: {
      top: "14mm",
      bottom: "14mm",
      left: "14mm",
      right: "14mm",
    },
  });

  await browser.close();
  console.log("PDF generated successfully at:", outputPath);
}

run().catch((err) => {
  console.error("Failed to generate PDF:", err);
  process.exit(1);
});

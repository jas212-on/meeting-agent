const processorCode = `
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.queue = [];
    this.current = null;
    this.playing = false;
    this.silenceBlocks = 0;

    this.port.onmessage = (event) => {
      const data = event.data;

      if (data instanceof ArrayBuffer) {
        const int16 = new Int16Array(data);
        const float32 = new Float32Array(int16.length);

        for (let i = 0; i < int16.length; i++) {
          float32[i] = int16[i] / 32768;
        }

        this.queue.push(float32);
        this.silenceBlocks = 0;

        if (!this.playing) {
          this.playing = true;
          this.port.postMessage({
            type: "playback-started"
          });
        }

        return;
      }

      if (data && data.type === "clear") {
        this.queue = [];
        this.current = null;
        this.position = 0;
        this.playing = false;
        this.silenceBlocks = 0;

        this.port.postMessage({
          type: "playback-stopped"
        });
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];

    if (!output || !output[0]) {
      return true;
    }

    const left = output[0];
    const right = output[1];

    const OUTPUT_RATE = sampleRate;
    const INPUT_RATE = 16000;
    const ratio = INPUT_RATE / OUTPUT_RATE;

    for (let i = 0; i < left.length; i++) {
      if (!this.current || this.position >= this.current.length) {
        this.current = this.queue.shift();
        this.position = 0;

        if (!this.current) {
          left[i] = 0;
          if (right) {
            right[i] = 0;
          }
          continue;
        }
      }

      const index = Math.floor(this.position);
      const fraction = this.position - index;

      const s0 = this.current[index] || 0;
      const s1 =
        index + 1 < this.current.length
          ? this.current[index + 1]
          : s0;

      const sample =
        s0 + (s1 - s0) * fraction;

      left[i] = sample;
      if (right) {
        right[i] = sample;
      }

      this.position += ratio;
    }

    // Debounce playback-stopped: require ~400ms of continuous silence before declaring playback stopped
    // 150 blocks * 128 samples / 48000 Hz = 400ms
    if (!this.current && this.queue.length === 0) {
      if (this.playing) {
        this.silenceBlocks++;
        if (this.silenceBlocks > 150) {
          this.playing = false;
          this.silenceBlocks = 0;
          this.port.postMessage({
            type: "playback-stopped"
          });
        }
      }
    } else {
      this.silenceBlocks = 0;
    }

    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
`;

export const audioBridgePageHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Audio Bridge</title>
</head>

<body>

<script>

(function () {

  console.log("[AudioBridgePage] Step 1: Initializing Audio Bridge in browser...");

  var ws = new WebSocket(
    (location.protocol === 'https:' ? 'wss://' : 'ws://') +
    location.host +
    '/ws'
  );

  ws.binaryType = 'arraybuffer';

  ws.onopen = function () {
    console.log("[AudioBridgePage] SUCCESS: WebSocket connection to Node bridge OPEN");
  };

  ws.onerror = function (e) {
    console.error("[AudioBridgePage] ERROR: WebSocket connection failed", e);
  };

  ws.onclose = function () {
    console.log("[AudioBridgePage] WebSocket CLOSED");
  };

  var audioNode = null;
  var pendingQueue = [];
  var lastUserAudioCapturedLog = 0;
  var totalCapturedBytes = 0;
  var isAssistantPlaying = false;
  var playbackStopTimer = null;

  // ============================================================
  // VAPI AUDIO FROM NODE
  // ============================================================

  function forwardAudio(buf) {
    if (audioNode) {
      audioNode.port.postMessage(
        buf,
        [buf]
      );
    } else {
      console.log(
        "[AudioBridgePage] Worklet not ready yet, queueing assistant voice buffer (" + buf.byteLength + " bytes)"
      );
      pendingQueue.push(buf);
    }
  }

  ws.onmessage = function (ev) {
    var data = ev.data;

    if (data instanceof Blob) {

      data.arrayBuffer().then(function (buf) {
        forwardAudio(buf);
      });

    } else if (data instanceof ArrayBuffer) {

      forwardAudio(data);

    } else {

      console.warn(
        "[AudioBridgePage] Unknown WS message received:",
        data
      );
    }
  };

  // ============================================================
  // START AUDIO
  // ============================================================

  async function startAudio() {

    try {

      console.log("[AudioBridgePage] Step 2: Requesting microphone permission probe...");

      // Permission probe.
      try {

        var probe =
          await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
          });

        probe.getTracks().forEach(function (t) {
          t.stop();
        });

        console.log(
          "[AudioBridgePage] SUCCESS: Microphone permission granted"
        );

      } catch (e) {

        console.warn(
          "[AudioBridgePage] Microphone permission probe warning/failed:",
          e
        );
      }

      // ========================================================
      // FIND VB-CABLE INPUT
      // ========================================================

      console.log("[AudioBridgePage] Step 3: Enumerating audio devices to find CABLE Input (VB-Audio)...");
      var devices =
        await navigator.mediaDevices
          .enumerateDevices()
          .catch(function () {
            return [];
          });

      var audioOutputs = devices
        .filter(function (d) {
          return d.kind === "audiooutput";
        })
        .map(function (d) {
          return {
            label: d.label,
            id: d.deviceId
          };
        });

      console.log(
        "[AudioBridgePage] Discovered audio output devices:",
        audioOutputs
      );

      var cableSink = devices.find(function (d) {

        return (
          d.kind === "audiooutput" &&
          /cable input|vb-audio/i.test(d.label)
        );

      });

      if (cableSink) {
        console.log("[AudioBridgePage] Found CABLE Input device:", cableSink.label, cableSink.deviceId);
      } else {
        console.warn("[AudioBridgePage] CABLE Input device NOT explicitly found in enumeration list; will attempt default routing.");
      }

      // ========================================================
      // AUDIO CONTEXT
      // ========================================================

      console.log("[AudioBridgePage] Step 4: Creating AudioContext (48kHz)...");
      var ctx = new AudioContext({
        sampleRate: 48000
      });

      console.log(
        "[AudioBridgePage] AudioContext created with sample rate:",
        ctx.sampleRate
      );

      // Route AudioContext output to CABLE Input.
      if (
        cableSink &&
        typeof ctx.setSinkId === "function"
      ) {

        try {

          await ctx.setSinkId(
            cableSink.deviceId
          );

          console.log(
            "[AudioBridgePage] SUCCESS: AudioContext sink set to:",
            cableSink.label
          );

        } catch (err) {

          console.error(
            "[AudioBridgePage] FAILED to set CABLE sink on AudioContext:",
            err
          );
        }

      }

      await ctx.resume();

      console.log(
        "[AudioBridgePage] AudioContext state after resume:",
        ctx.state
      );

      // ========================================================
      // AUDIO WORKLET
      // ========================================================

      console.log("[AudioBridgePage] Step 5: Loading AudioWorklet PCM processor module...");
      var moduleBlob = new Blob(
        [${JSON.stringify(processorCode)}],
        {
          type: 'application/javascript'
        }
      );

      await ctx.audioWorklet.addModule(
        URL.createObjectURL(moduleBlob)
      );

      audioNode = new AudioWorkletNode(
        ctx,
        'pcm-processor'
      );

      console.log("[AudioBridgePage] AudioWorkletNode instantiated successfully.");

      // ========================================================
      // RECEIVE STATUS FROM WORKLET
      // ========================================================

      audioNode.port.onmessage = function (e) {

        if (
          e.data &&
          e.data.type
        ) {

          console.log(
            "[AudioBridgePage] Worklet state event:",
            e.data.type
          );

          if (e.data.type === "playback-started") {
            if (playbackStopTimer) {
              clearTimeout(playbackStopTimer);
              playbackStopTimer = null;
            }
            isAssistantPlaying = true;
          } else if (e.data.type === "playback-stopped") {
            if (playbackStopTimer) clearTimeout(playbackStopTimer);
            playbackStopTimer = setTimeout(function () {
              isAssistantPlaying = false;
              playbackStopTimer = null;
            }, 500);
          }

          if (
            ws.readyState === WebSocket.OPEN
          ) {

            ws.send(
              JSON.stringify(e.data)
            );
          }

          return;
        }
      };

      // ========================================================
      // CONNECT AUDIO NODE
      // ========================================================

      audioNode.connect(
        ctx.destination
      );

      console.log(
        "[AudioBridgePage] Step 6: AudioWorklet connected to destination (CABLE Input sink)"
      );

      // ========================================================
      // FLUSH QUEUED AUDIO
      // ========================================================

      if (pendingQueue.length > 0) {
        console.log("[AudioBridgePage] Flushing " + pendingQueue.length + " queued audio chunks to worklet...");
      }
      while (
        pendingQueue.length > 0
      ) {

        var b =
          pendingQueue.shift();

        audioNode.port.postMessage(
          b,
          [b]
        );
      }

      // ========================================================
      // TELL NODE WE ARE READY
      // ========================================================

      console.log("[AudioBridgePage] Step 7: Sending 'ready' notification to Node audio bridge server...");
      if (
        ws.readyState === WebSocket.OPEN
      ) {

        ws.send(
          JSON.stringify({
            type: "ready"
          })
        );

      } else {

        ws.addEventListener(
          "open",
          function () {

            ws.send(
              JSON.stringify({
                type: "ready"
              })
            );

          }
        );
      }

      // ========================================================
      // INCOMING PARTICIPANT CAPTURE (from CABLE Output)
      // ========================================================
      console.log("[AudioBridgePage] Step 8: Starting incoming user voice capture (microphone stream)...");
      try {
        var micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
          video: false,
        });

        console.log("[AudioBridgePage] SUCCESS: Microphone capture stream acquired for Vapi input");

        var inCtx = new (window.AudioContext || window.webkitAudioContext)();
        console.log("[AudioBridgePage] Mic capture AudioContext sampleRate: " + inCtx.sampleRate + " Hz (will resample to 16000 Hz for Vapi)");

        var inSource = inCtx.createMediaStreamSource(micStream);
        var inProcessor = inCtx.createScriptProcessor(2048, 1, 1);
        var inMute = inCtx.createGain();
        inMute.gain.value = 0; // Prevent local loopback

        function resampleTo16k(inputData, inputSampleRate) {
          if (inputSampleRate === 16000) {
            var direct = new Int16Array(inputData.length);
            for (var i = 0; i < inputData.length; i++) {
              var s = Math.max(-1, Math.min(1, inputData[i]));
              direct[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            return direct;
          }

          var ratio = inputSampleRate / 16000;
          var newLength = Math.floor(inputData.length / ratio);
          var pcm = new Int16Array(newLength);
          for (var i = 0; i < newLength; i++) {
            var position = i * ratio;
            var index = Math.floor(position);
            var fraction = position - index;
            var s0 = inputData[index] || 0;
            var s1 = (index + 1 < inputData.length) ? inputData[index + 1] : s0;
            var s = s0 + (s1 - s0) * fraction;
            s = Math.max(-1, Math.min(1, s));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          return pcm;
        }

        inProcessor.onaudioprocess = function (e) {
          if (inCtx.state === "suspended") {
            inCtx.resume().catch(function () {});
          }

          // Echo gating: do not transmit user voice while assistant is actively speaking into the loopback
          if (isAssistantPlaying) {
            return;
          }

          var inCh = e.inputBuffer.getChannelData(0);
          var pcm = resampleTo16k(inCh, inCtx.sampleRate);

          if (ws.readyState === WebSocket.OPEN) {
            totalCapturedBytes += pcm.buffer.byteLength;
            var now = Date.now();
            if (now - lastUserAudioCapturedLog > 3000) {
              console.log("[AudioBridgePage] User voice stream active: captured and sent " + Math.round(totalCapturedBytes / 1024) + " KB (16kHz PCM) to Node bridge");
              lastUserAudioCapturedLog = now;
            }
            ws.send(pcm.buffer);
          }
        };

        inSource.connect(inProcessor);
        inProcessor.connect(inMute);
        inMute.connect(inCtx.destination);
        console.log("[AudioBridgePage] SUCCESS: Audio processing pipeline connected for user voice capture (resampled to 16kHz)");
      } catch (err) {
        console.error("[AudioBridgePage] FAILED to start microphone capture pipeline:", err);
      }

      console.log(
        "[AudioBridgePage] ALL STEPS COMPLETE: Audio Bridge is READY"
      );

    } catch (err) {

      console.error(
        "[AudioBridgePage] FAILED in startAudio:",
        err
      );

    }

  }

  window.addEventListener(
    "load",
    function () {
      startAudio();
    }
  );

})();

</script>

</body>
</html>`;
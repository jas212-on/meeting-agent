const processorCode = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      const pcm = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++) {
        const s = Math.max(-1, Math.min(1, ch[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('capture', Capture);
`;

export const audioBridgePageHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>audio-bridge</title>
</head>
<body>
<script>
(function () {
  var ws = new WebSocket(
    (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'
  );
  ws.onopen = function () { console.log('audio-bridge: ws open'); };
  ws.onerror = function () { console.log('audio-bridge: ws error'); };

  var playCtx = null;
  var nextTime = 0;

  ws.onmessage = function (ev) {
    if (ev.data instanceof Blob) {
      ev.data.arrayBuffer().then(playPcm);
    } else if (ev.data instanceof ArrayBuffer) {
      playPcm(ev.data);
    }
  };

  function ensurePlayCtx() {
    if (!playCtx) {
      playCtx = new AudioContext();
      playCtx.resume();
      nextTime = 0;
    }
    return playCtx;
  }

  function playPcm(buffer) {
    var ctx = ensurePlayCtx();
    var int16 = new Int16Array(buffer);
    if (!int16.length) return;
    var float = new Float32Array(int16.length);
    for (var i = 0; i < int16.length; i++) {
      float[i] = int16[i] / 32768;
    }
    var buf = ctx.createBuffer(1, int16.length, 16000);
    buf.copyToChannel(float, 0);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    var now = ctx.currentTime + 0.06;
    if (nextTime < now) nextTime = now;
    src.start(nextTime);
    nextTime += buf.duration;
  }

  async function startCapture() {
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      var ctx = new AudioContext({ sampleRate: 16000 });
      await ctx.audioWorklet.addModule(
        URL.createObjectURL(new Blob([${JSON.stringify(processorCode)}], { type: 'application/javascript' }))
      );
      var source = ctx.createMediaStreamSource(stream);
      var node = new AudioWorkletNode(ctx, 'capture');
      node.port.onmessage = function (e) {
        if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
      };
      source.connect(node);
      ctx.resume();
    } catch (e) {
      console.error('audio capture failed', e);
    }
  }

  startCapture();
})();
</script>
</body>
</html>`;

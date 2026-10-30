'use strict';
class LpCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(512);
    this._off = 0;
    this._t0 = 0;
  }
  process(inputs) {
    const inp = inputs[0];
    if (!inp || !inp[0] || !inp[0].length) return true;
    const ch = inp[0];
    if (this._off === 0) this._t0 = currentTime;
    for (let i = 0; i < ch.length; i++) {
      this._buf[this._off++] = ch[i];
      if (this._off >= this._buf.length) {
        const d = this._buf.slice();
        this.port.postMessage({ d, t0: this._t0 }, [d.buffer]);
        this._off = 0;
        this._t0 = currentTime + (i + 1) / sampleRate;
      }
    }
    return true;
  }
}

class LpMixProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._L = new Float32Array(1024);
    this._R = new Float32Array(1024);
    this._off = 0;
  }
  process(inputs) {
    const inp = inputs[0];
    if (!inp || !inp[0] || !inp[0].length) return true;
    const chL = inp[0], chR = inp[1] || inp[0];
    for (let i = 0; i < chL.length; i++) {
      this._L[this._off] = chL[i];
      this._R[this._off] = chR[i];
      this._off++;
      if (this._off >= this._L.length) {
        const L = this._L.slice(), R = this._R.slice();
        this.port.postMessage({ L, R }, [L.buffer, R.buffer]);
        this._off = 0;
      }
    }
    return true;
  }
}

registerProcessor('lp-capture-processor', LpCaptureProcessor);
registerProcessor('lp-mix-processor', LpMixProcessor);

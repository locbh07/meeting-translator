class VADDetector {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.silenceThreshold = -50; // dB
  }

  async initialize(stream) {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000
    });
    const source = this.audioContext.createMediaStreamSource(stream);
    
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    
    source.connect(this.analyser);
  }

  getVolume() {
    if (!this.analyser) return -100;
    
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);
    
    const sum = dataArray.reduce((a, b) => a + b, 0);
    const average = sum / bufferLength;
    
    return 20 * Math.log10(average / 255);
  }

  hasVoice() {
    const volume = this.getVolume();
    return volume > this.silenceThreshold;
  }

  destroy() {
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}

export default VADDetector;
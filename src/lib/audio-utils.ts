export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onAudioData: (base64Data: string) => void;

  constructor(onAudioData: (base64Data: string) => void) {
    this.onAudioData = onAudioData;
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = this.floatTo16BitPCM(inputData);
        const base64Data = this.arrayBufferToBase64(pcmData);
        this.onAudioData(base64Data);
      };
    } catch (error) {
      console.error("Error starting audio recorder:", error);
      throw error;
    }
  }

  stop() {
    try {
      this.processor?.disconnect();
      this.audioContext?.close();
      this.stream?.getTracks().forEach(track => track.stop());
    } catch (error) {
      console.error("Error stopping audio recorder:", error);
    } finally {
      this.processor = null;
      this.audioContext = null;
      this.stream = null;
    }
  }

  private floatTo16BitPCM(input: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private isInitialized: boolean = false;

  constructor() {
    this.init();
  }

  private init() {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 24000 });
      this.isInitialized = true;
    } catch (error) {
      console.error("Error initializing audio player:", error);
    }
  }

  async playChunk(base64Data: string) {
    if (!this.audioContext || !this.isInitialized) return;
    
    try {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const binary = window.atob(base64Data);
      const len = binary.length;
      const buffer = new Int16Array(len / 2);
      for (let i = 0; i < len; i += 2) {
        buffer[i / 2] = (binary.charCodeAt(i + 1) << 8) | binary.charCodeAt(i);
      }

      const floatData = new Float32Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        floatData[i] = buffer[i] / 32768.0;
      }

      const audioBuffer = this.audioContext.createBuffer(1, floatData.length, 24000);
      audioBuffer.getChannelData(0).set(floatData);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      const currentTime = this.audioContext.currentTime;
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
      }
      
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
    } catch (error) {
      console.error("Error playing audio chunk:", error);
    }
  }

  stop() {
    try {
      if (this.audioContext) {
        this.audioContext.close();
      }
    } catch (error) {
      console.error("Error stopping audio player:", error);
    } finally {
      this.init();
      this.nextStartTime = 0;
    }
  }
}

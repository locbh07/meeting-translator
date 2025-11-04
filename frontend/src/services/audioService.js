import RecordRTC from 'recordrtc';

class AudioService {
  constructor() {
    this.recorder = null;
    this.stream = null;
    this.isRecording = false;
  }

  async startContinuousRecording(onAudioChunk) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      console.log('🎤 Microphone access granted');

      this.recorder = new RecordRTC(this.stream, {
        type: 'audio',
        mimeType: 'audio/wav',
        recorderType: RecordRTC.StereoAudioRecorder,
        numberOfAudioChannels: 1,
        desiredSampRate: 16000,
        
        // ✅ GIẢM XUỐNG 1.5 GIÂY để audio nhỏ hơn 50KB
        timeSlice: 1500, // 1.5 seconds
        
        ondataavailable: async (blob) => {
          if (this.isRecording && blob.size > 0) {
            try {
              const sizeKB = Math.round(blob.size / 1024);
              console.log('📦 Audio chunk:', blob.size, 'bytes (', sizeKB, 'KB)');
              
              // Chỉ gửi nếu kích thước hợp lý
              if (blob.size > 500 && blob.size < 60000) {
                const base64Audio = await this.blobToBase64(blob);
                onAudioChunk(base64Audio);
              } else if (blob.size >= 60000) {
                console.warn('⚠️ Chunk quá lớn, bỏ qua:', sizeKB, 'KB');
              } else {
                console.warn('⚠️ Chunk quá nhỏ, bỏ qua');
              }
            } catch (error) {
              console.error('Error processing audio:', error);
            }
          }
        }
      });

      this.recorder.startRecording();
      this.isRecording = true;
      
      console.log('✅ Recording started (WAV, 16kHz mono, 1.5s chunks)');
      return true;

    } catch (error) {
      console.error('❌ Error starting recording:', error);
      alert('Không thể truy cập microphone: ' + error.message);
      return false;
    }
  }

  stopRecording() {
    if (this.recorder && this.isRecording) {
      this.recorder.stopRecording(() => {
        console.log('⏹️ Recording stopped');
        
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
        }
      });
      
      this.isRecording = false;
    }
  }

  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  isActive() {
    return this.isRecording;
  }
}

export default new AudioService();
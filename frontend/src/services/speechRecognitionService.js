/**
 * Web Speech API Service - Real-time streaming transcription
 * Supports: Vietnamese, Japanese, English
 */
class SpeechRecognitionService {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.currentLanguage = 'vi-VN';
    this.interimTranscript = '';
    this.onInterimResult = null;
    this.onFinalResult = null;
    this.onError = null;
  }

  /**
   * Check if browser supports Web Speech API
   */
  isSupported() {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }

  /**
   * Initialize and start recognition
   */
  start(language, onInterim, onFinal, onError) {
    if (!this.isSupported()) {
      const error = new Error('Browser không hỗ trợ Web Speech API. Vui lòng dùng Chrome/Edge.');
      if (onError) onError(error);
      return false;
    }

    // Stop existing recognition if any
    this.stop();

    // Create new recognition instance
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    // Configure recognition
    this.recognition.continuous = true; // Keep listening
    this.recognition.interimResults = true; // Get partial results
    this.recognition.maxAlternatives = 1;
    this.recognition.lang = this.mapLanguageCode(language);

    // Store callbacks
    this.onInterimResult = onInterim;
    this.onFinalResult = onFinal;
    this.onError = onError;

    console.log('🎤 Starting Speech Recognition:', this.recognition.lang);

    // Handle results
    this.recognition.onresult = (event) => {
      this.handleResult(event);
    };

    // Handle end (auto-restart)
    this.recognition.onend = () => {
      if (this.isListening) {
        console.log('🔄 Recognition ended, restarting...');
        setTimeout(() => {
          if (this.isListening) {
            this.recognition.start();
          }
        }, 100);
      }
    };

    // Handle errors
    this.recognition.onerror = (event) => {
      console.error('❌ Speech Recognition Error:', event.error);
      
      // Don't treat 'no-speech' as error, just continue
      if (event.error === 'no-speech') {
        console.log('⏸️ No speech detected, waiting...');
        return;
      }

      // Don't treat 'aborted' as error if we're stopping
      if (event.error === 'aborted' && !this.isListening) {
        return;
      }

      if (this.onError) {
        this.onError(new Error(`Speech Recognition: ${event.error}`));
      }
    };

    // Start recognition
    try {
      this.recognition.start();
      this.isListening = true;
      return true;
    } catch (error) {
      console.error('❌ Failed to start recognition:', error);
      if (this.onError) this.onError(error);
      return false;
    }
  }

  /**
   * Handle recognition results
   */
  handleResult(event) {
    let interim = '';
    let final = '';

    // Process all results
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      
      if (event.results[i].isFinal) {
        final += transcript;
      } else {
        interim += transcript;
      }
    }

    // Send interim results (typing effect)
    if (interim && this.onInterimResult) {
      console.log('📝 Interim:', interim);
      this.interimTranscript = interim;
      this.onInterimResult({
        text: interim,
        isFinal: false,
        timestamp: Date.now()
      });
    }

    // Send final results ONLY when Web Speech API marks as final
    if (final) {
      console.log('✅ Final:', final);
      
      if (this.onFinalResult) {
        this.onFinalResult({
          text: final,
          isFinal: true,
          timestamp: Date.now()
        });
      }

      // Reset interim transcript after final
      this.interimTranscript = '';
    }
  }

  /**
   * Stop recognition
   */
  stop() {
    this.isListening = false;

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (error) {
        // Ignore errors when stopping
      }
      this.recognition = null;
    }

    console.log('⏹️ Speech Recognition stopped');
  }

  /**
   * Change language on the fly
   */
  changeLanguage(language) {
    console.log('🔄 Changing language to:', language);
    
    this.currentLanguage = this.mapLanguageCode(language);
    const wasListening = this.isListening;
    const callbacks = {
      onInterim: this.onInterimResult,
      onFinal: this.onFinalResult,
      onError: this.onError
    };

    this.stop();

    if (wasListening) {
      setTimeout(() => {
        this.start(language, callbacks.onInterim, callbacks.onFinal, callbacks.onError);
      }, 300); // Tăng delay để đảm bảo stop hoàn toàn
    }
  }

  /**
   * Map 2-letter code to Web Speech API locale
   */
  mapLanguageCode(code) {
    const mapping = {
      'vi': 'vi-VN',
      'ja': 'ja-JP',
      'en': 'en-US',
      'ko': 'ko-KR',
      'zh': 'zh-CN'
    };
    return mapping[code] || 'vi-VN';
  }

  /**
   * Check if currently listening
   */
  isActive() {
    return this.isListening;
  }
}

export default new SpeechRecognitionService();
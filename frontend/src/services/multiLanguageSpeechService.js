// src/services/multiLanguageSpeechService.js

/**
 * Multi-Language Speech Recognition Service (Client-side, Web Speech API)
 * - Auto detect giữa 2 ngôn ngữ (vi <-> ja) bằng ký tự đặc trưng
 * - Gom câu (utterance aggregator) để tránh cắt sớm tiếng Nhật
 * - KHÔNG cộng dồn "interim" vào buffer để tránh lặp câu
 */
class MultiLanguageSpeechService {
  constructor() {
    this.activeLanguage = null;   // 'vi' | 'ja' | ...
    this.language1 = 'vi';
    this.language2 = 'ja';
    this.isListening = false;

    this.onInterimResult = null;
    this.onFinalResult = null;
    this.onError = null;

    this.currentRecognition = null;

    // Buffers final theo ngôn ngữ
    this.buffers = { vi: '', ja: '' };
    // Interim tạm thời theo ngôn ngữ (không ghi vào buffer chính)
    this.tempInterim = { vi: '', ja: '' };

    this.lastUpdateTs = 0;

    // Ký tự kết câu
    this.END_JA = '。．！？!?…';
    this.END_VI = '.!?…';

    // Phát hiện & chống nhảy ngôn ngữ liên tục (hysteresis)
    this.detectWindow = [];
    this.DETECT_WINDOW_SIZE = 5;
    this.SWITCH_THRESHOLD = 3;
    this.lastStableLang = null;
    this.lastSwitchTs = 0;
    this.MIN_SWITCH_INTERVAL_MS = 1200;

    // Timer finalize
    this.pauseTimer = null;
    this.maxUtteranceTimer = null;
    this.JA_PAUSE_MS = 3000;
    this.VI_PAUSE_MS = 1800;
    this.MAX_UTTERANCE_MS = 10000;
  }

  isSupported() {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }

  start(lang1, lang2, onInterim, onFinal, onError) {
    if (!this.isSupported()) {
      const err = new Error('Browser không hỗ trợ Web Speech API. Vui lòng dùng Chrome/Edge.');
      onError && onError(err);
      return false;
    }

    this.language1 = lang1 || 'vi';
    this.language2 = lang2 || 'ja';
    this.onInterimResult = onInterim;
    this.onFinalResult = onFinal;
    this.onError = onError;

    // Reset
    this.buffers = { vi: '', ja: '' };
    this.tempInterim = { vi: '', ja: '' };
    this._clearTimers();
    this.detectWindow = [];
    this.lastStableLang = this.language1;
    this.activeLanguage = this.language1;
    this.isListening = true;

    this._startRecognizer(this.activeLanguage);
    return true;
  }

  stop() {
    this.isListening = false;
    this._clearTimers();
    if (this.currentRecognition) {
      try { this.currentRecognition.stop(); } catch (_) {}
      this.currentRecognition = null;
    }
    // Flush phần còn lại
    this._finalizeIfAny('vi', true);
    this._finalizeIfAny('ja', true);
    this.tempInterim = { vi: '', ja: '' };
  }

  isActive() { return this.isListening; }

  // ================= internal =================
  _startRecognizer(language) {
    if (this.currentRecognition) {
      try { this.currentRecognition.stop(); } catch (_) {}
      this.currentRecognition = null;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = this._mapLanguage(language);

    recognition.onresult = (event) => this._handleResult(event, language);
    recognition.onend = () => {
      if (this.isListening) setTimeout(() => {
        if (this.isListening) { try { recognition.start(); } catch(_){} }
      }, 120);
    };
    recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.onError && this.onError(new Error(`Speech Recognition: ${e.error}`));
    };

    try { recognition.start(); this.currentRecognition = recognition; }
    catch (err) { this.onError && this.onError(err); }
  }

  _handleResult(event, expectedLang) {
    let interim = ''; const finals = [];
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      const t = r[0]?.transcript || '';
      if (!t) continue;
      if (r.isFinal) finals.push(t);
      else interim += t;
    }

    const textForDetect = interim || finals.join(' ').trim();
    const detected = this._detectLang(textForDetect) || expectedLang;

    // Hysteresis
    this._pushDetect(detected);
    const stable = this._stableDetected();
    if (stable && stable !== this.activeLanguage) {
      const now = Date.now();
      if (now - this.lastSwitchTs >= this.MIN_SWITCH_INTERVAL_MS) {
        // finalize buffer cũ trước khi đổi
        this._finalizeIfAny(this.activeLanguage, true);
        this.activeLanguage = stable;
        this.lastSwitchTs = now;
        setTimeout(() => this._startRecognizer(stable), 80);
        return;
      }
    }

    // INTERIM: chỉ lưu tạm, KHÔNG append vào buffer chính
    if (interim) {
      this.tempInterim[this.activeLanguage] = interim;

      this.onInterimResult && this.onInterimResult({
        text: interim,
        language: this.activeLanguage,
        isFinal: false,
        timestamp: Date.now()
      });
      this._armPause(this.activeLanguage);
    }

    // FINALS: chỉ khi browser thật sự trả final
    if (finals.length) {
      const joined = finals.join(' ').trim();
      if (joined) {
        this._append(this.activeLanguage, joined);
        // final tới → xoá interim tạm
        this.tempInterim[this.activeLanguage] = '';

        if (this._endsWithSentence(this.activeLanguage, this._snap(this.activeLanguage))) {
          this._finalizeIfAny(this.activeLanguage);
        } else {
          this._armPause(this.activeLanguage);
        }
        this.onInterimResult && this.onInterimResult({
          text: this._snap(this.activeLanguage) || joined,
          language: this.activeLanguage,
          isFinal: false,
          timestamp: Date.now()
        });
      }
    }
  }

  _append(lang, piece) {
    const t = piece.trim();
    if (!t) return;
    if (lang === 'ja') {
      // Nhật: nối không chèn space
      this.buffers.ja += t;
    } else {
      // Việt/khác: đảm bảo 1 space giữa các mảnh
      if (this.buffers[lang] && !/\s$/.test(this.buffers[lang])) this.buffers[lang] += ' ';
      this.buffers[lang] += t;
    }
    this.lastUpdateTs = Date.now();
    this._armMax(lang);
  }

  _snap(lang) {
    return (this.buffers[lang] || '').trim();
  }

  _endsWithSentence(lang, text) {
    if (!text) return false;
    const last = text[text.length - 1];
    return lang === 'ja' ? this.END_JA.includes(last) : this.END_VI.includes(last);
  }

  _finalizeIfAny(lang, force = false) {
    const text = this._snap(lang);
    if (!text && !this.tempInterim[lang]) return;

    if (!force && !this._endsWithSentence(lang, text)) return;

    // Nếu force (pause) mà chưa có dấu câu: lấy interim tạm cho “kết mềm”
    const out = (force && !this._endsWithSentence(lang, text))
      ? (this.tempInterim[lang] || text)
      : text;

    const finalText = (out || '').trim();
    if (!finalText) return;

    this.onFinalResult && this.onFinalResult({
      text: finalText, language: lang, isFinal: true, timestamp: Date.now()
    });

    this.buffers[lang] = '';
    this.tempInterim[lang] = '';
    this._clearPause();
    this._clearMax();
  }

  _armPause(lang) {
    this._clearPause();
    const wait = (lang === 'ja') ? this.JA_PAUSE_MS : this.VI_PAUSE_MS;
    this.pauseTimer = setTimeout(() => this._finalizeIfAny(lang, true), wait);
  }

  _armMax(lang) {
    this._clearMax();
    this.maxUtteranceTimer = setTimeout(() => this._finalizeIfAny(lang, true), this.MAX_UTTERANCE_MS);
  }

  _clearTimers() { this._clearPause(); this._clearMax(); }
  _clearPause() { if (this.pauseTimer) { clearTimeout(this.pauseTimer); this.pauseTimer = null; } }
  _clearMax() { if (this.maxUtteranceTimer) { clearTimeout(this.maxUtteranceTimer); this.maxUtteranceTimer = null; } }

  _detectLang(text) {
    if (!text || !text.trim()) return null;
    if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) return 'ja';
    if (/[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđĐ]/.test(text)) return 'vi';
    return this.activeLanguage || this.lastStableLang || 'vi';
  }

  _pushDetect(lang) {
    this.detectWindow.push(lang);
    if (this.detectWindow.length > this.DETECT_WINDOW_SIZE) this.detectWindow.shift();
  }

  _stableDetected() {
    if (this.detectWindow.length < this.SWITCH_THRESHOLD) return null;
    const count = this.detectWindow.reduce((acc, l) => (acc[l] = (acc[l] || 0) + 1, acc), {});
    const entries = Object.entries(count).sort((a,b)=>b[1]-a[1]);
    const [topLang, topCount] = entries[0];
    if (topCount >= this.SWITCH_THRESHOLD) { this.lastStableLang = topLang; return topLang; }
    return null;
  }

  _mapLanguage(code) {
    const map = { vi: 'vi-VN', ja: 'ja-JP', en: 'en-US', ko: 'ko-KR', zh: 'zh-CN' };
    return map[code] || 'vi-VN';
  }
}

export default new MultiLanguageSpeechService();

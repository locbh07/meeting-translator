import { useState, useEffect, useRef } from 'react';
import { Mic, Download, Settings, Play, Square, Info, Volume2 } from 'lucide-react';
import speechRecognitionService from './services/speechRecognitionService';
import websocketService from './services/websocketService';
import './App.css';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  
  const [language1, setLanguage1] = useState('vi');
  const [language2, setLanguage2] = useState('ja');
  const [currentSpeaker, setCurrentSpeaker] = useState('1');
  
  // Streaming states
  const [typingText, setTypingText] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [translatingId, setTranslatingId] = useState(null);
  
  const [sessionDuration, setSessionDuration] = useState(0);
  
  const conversationRef = useRef(null);
  const sessionStartTime = useRef(null);

  // Check Web Speech API support
  useEffect(() => {
    if (!speechRecognitionService.isSupported()) {
      alert('⚠️ Trình duyệt không hỗ trợ Web Speech API!\nVui lòng sử dụng Chrome hoặc Edge.');
    }
  }, []);

  useEffect(() => {
    websocketService.connect(
      null, // No partial caption needed with Web Speech
      handleTranslationResult,
      () => {
        console.log('✅ Connected to server');
        setIsConnected(true);
      },
      (error) => {
        console.error('❌ Connection error:', error);
        setIsConnected(false);
      }
    );

    return () => {
      if (isSessionActive) {
        stopSession();
      }
      websocketService.disconnect();
    };
  }, []);

  useEffect(() => {
    let interval;
    if (isSessionActive) {
      if (!sessionStartTime.current) {
        sessionStartTime.current = Date.now();
      }
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - sessionStartTime.current) / 1000);
        setSessionDuration(elapsed);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSessionActive]);

  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [conversations, typingText]);

  const handleInterimResult = (result) => {
    const currentLang = currentSpeaker === '1' ? language1 : language2;
    console.log('📝 Typing:', result.text);
    
    setTypingText({
      text: result.text,
      language: currentLang,
      timestamp: result.timestamp
    });
  };

  const handleFinalResult = async (result) => {
    const currentLang = currentSpeaker === '1' ? language1 : language2;
    const targetLang = currentSpeaker === '1' ? language2 : language1;
    
    console.log('✅ Final speech:', result.text);
    
    // Clear typing
    setTypingText(null);
    
    // Add to conversation with "translating" status
    const newConv = {
      id: `conv-${Date.now()}`,
      originalText: result.text,
      originalLang: currentLang,
      translatedText: null, // Will be filled later
      translatedLang: targetLang,
      timestamp: result.timestamp,
      isTranslating: true
    };
    
    setConversations(prev => [...prev, newConv]);
    setTranslatingId(newConv.id);
    
    // Send to backend for translation only
    try {
      const translation = await requestTranslation(result.text, currentLang, targetLang);
      
      // Update conversation with translation
      setConversations(prev => prev.map(conv => 
        conv.id === newConv.id 
          ? { ...conv, translatedText: translation, isTranslating: false }
          : conv
      ));
      setTranslatingId(null);
      
      console.log('✅ Translation:', translation);
    } catch (error) {
      console.error('❌ Translation error:', error);
      setTranslatingId(null);
    }
  };

  const handleTranslationResult = (data) => {
    // Handle WebSocket translation response if needed
    console.log('WebSocket translation:', data);
  };

  const requestTranslation = async (text, sourceLang, targetLang) => {
    try {
      const response = await fetch('http://localhost:8080/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          sourceLang: sourceLang,
          targetLang: targetLang,
          sessionId: websocketService.getSessionId()
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.translation;
      } else {
        throw new Error('Translation failed');
      }
    } catch (error) {
      console.error('Translation request error:', error);
      return `[Error: ${text}]`;
    }
  };

  const startSession = () => {
    if (!isConnected) {
      alert('Chưa kết nối tới server!');
      return;
    }

    if (!speechRecognitionService.isSupported()) {
      alert('Trình duyệt không hỗ trợ Web Speech API!');
      return;
    }

    websocketService.sendSessionInit(language1, language2);
    
    const startLang = currentSpeaker === '1' ? language1 : language2;
    const success = speechRecognitionService.start(
      startLang,
      handleInterimResult,
      handleFinalResult,
      (error) => {
        console.error('Speech recognition error:', error);
        alert('Lỗi nhận dạng giọng nói: ' + error.message);
      }
    );

    if (success) {
      setIsSessionActive(true);
      console.log('🎬 Session started with Web Speech API');
    } else {
      alert('Không thể bắt đầu nhận dạng giọng nói!');
    }
  };

  const stopSession = () => {
    speechRecognitionService.stop();
    setIsSessionActive(false);
    setTypingText(null);
    sessionStartTime.current = null;
    setSessionDuration(0);
    console.log('⏹️ Session stopped');
  };

  const switchSpeaker = () => {
    const newSpeaker = currentSpeaker === '1' ? '2' : '1';
    const newLang = newSpeaker === '1' ? language1 : language2;
    
    console.log('🔄 Switching speaker:', {
      from: currentSpeaker,
      to: newSpeaker,
      fromLang: currentSpeaker === '1' ? language1 : language2,
      toLang: newLang
    });
    
    setCurrentSpeaker(newSpeaker);
    
    if (isSessionActive) {
      speechRecognitionService.changeLanguage(newLang);
      console.log('✅ Language changed to:', newLang);
    }
  };

  const exportTranscript = () => {
    const data = {
      sessionId: websocketService.getSessionId(),
      startTime: sessionStartTime.current,
      languages: { lang1: language1, lang2: language2 },
      conversations: conversations.filter(c => !c.isTranslating)
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transcript-${Date.now()}.json`;
    link.click();
  };

  const clearConversation = () => {
    if (window.confirm('Xóa toàn bộ cuộc hội thoại?')) {
      setConversations([]);
      setTypingText(null);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getLanguageName = (code) => {
    const names = {
      'vi': '🇻🇳 Tiếng Việt',
      'ja': '🇯🇵 日本語',
      'en': '🇺🇸 English',
      'ko': '🇰🇷 한국어',
      'zh': '🇨🇳 中文'
    };
    return names[code] || code.toUpperCase();
  };

  const getTextForColumn = (conv, columnLang) => {
    return conv.originalLang === columnLang 
      ? conv.originalText 
      : conv.translatedText || '(đang dịch...)';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                Meeting Translator
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Real-time Speech Recognition (Web Speech API)
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-600">
                  {isConnected ? 'Đã kết nối' : 'Mất kết nối'}
                </span>
              </div>

              {isSessionActive && (
                <div className="flex items-center gap-2 bg-red-100 px-3 py-1 rounded-full">
                  <Volume2 className="w-4 h-4 text-red-500 animate-pulse" />
                  <span className="text-sm font-mono text-red-700">
                    LISTENING {formatTime(sessionDuration)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Language Setup Panel */}
        {!isSessionActive && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Thiết lập cuộc hội thoại
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ngôn ngữ 1 (Bên trái)
                </label>
                <select
                  value={language1}
                  onChange={(e) => setLanguage1(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="vi">🇻🇳 Tiếng Việt</option>
                  <option value="ja">🇯🇵 日本語</option>
                  <option value="en">🇺🇸 English</option>
                  <option value="ko">🇰🇷 한국어</option>
                </select>
              </div>

              <div className="flex items-end justify-center pb-2">
                <div className="text-2xl text-gray-400">↔</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ngôn ngữ 2 (Bên phải)
                </label>
                <select
                  value={language2}
                  onChange={(e) => setLanguage2(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="ja">🇯🇵 日本語</option>
                  <option value="vi">🇻🇳 Tiếng Việt</option>
                  <option value="en">🇺🇸 English</option>
                  <option value="ko">🇰🇷 한국어</option>
                </select>
              </div>
            </div>

            <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-green-800">
                  <p className="font-semibold mb-1">🎤 Web Speech API Mode:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Real-time streaming</strong> - Thấy từng từ đang nói</li>
                    <li><strong>Tự động dịch</strong> khi câu hoàn thành (im lặng 2s)</li>
                    <li><strong>Miễn phí</strong> - Không tốn API OpenAI cho transcription</li>
                    <li>Yêu cầu: Chrome/Edge, cho phép microphone</li>
                  </ul>
                </div>
              </div>
            </div>

            <button
              onClick={startSession}
              disabled={!isConnected || language1 === language2}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-5 h-5" />
              Bắt đầu hội thoại
            </button>

            {language1 === language2 && (
              <p className="text-red-500 text-sm text-center mt-2">
                ⚠️ Vui lòng chọn 2 ngôn ngữ khác nhau
              </p>
            )}
          </div>
        )}

        {/* Active Session Panel */}
        {isSessionActive && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-sm">
                  <span className="font-semibold">Đang nghe:</span>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={switchSpeaker}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors flex items-center gap-1 ${
                        currentSpeaker === '1'
                          ? 'bg-blue-500 text-white shadow-lg'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {currentSpeaker === '1' && <Volume2 className="w-3 h-3 animate-pulse" />}
                      {getLanguageName(language1)}
                    </button>
                    <button
                      onClick={switchSpeaker}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors flex items-center gap-1 ${
                        currentSpeaker === '2'
                          ? 'bg-indigo-500 text-white shadow-lg'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {currentSpeaker === '2' && <Volume2 className="w-3 h-3 animate-pulse" />}
                      {getLanguageName(language2)}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={exportTranscript}
                  disabled={conversations.length === 0}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Xuất
                </button>
                <button
                  onClick={clearConversation}
                  disabled={conversations.length === 0}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  Xóa
                </button>
                <button
                  onClick={stopSession}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
                >
                  <Square className="w-4 h-4" />
                  Dừng
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Typing Indicator */}
        {typingText && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 p-4 mb-6 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Volume2 className="w-4 h-4 text-blue-600 animate-bounce" />
              <span className="text-xs font-semibold text-blue-700 uppercase">
                Đang nhận dạng... {getLanguageName(typingText.language)}
              </span>
              <span className="text-xs text-gray-500">
                (Speaker {currentSpeaker === '1' ? 'A' : 'B'})
              </span>
            </div>
            <p className="text-xl text-gray-800 font-medium">
              {typingText.text}<span className="animate-pulse">|</span>
            </p>
          </div>
        )}

        {/* Translation Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Left Column */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-3">
              <h2 className="text-lg font-semibold">
                {getLanguageName(language1)}
              </h2>
              <p className="text-xs opacity-90">Người A</p>
            </div>
            <div 
              ref={conversationRef}
              className="p-4 h-[500px] overflow-y-auto space-y-3 bg-gray-50"
            >
              {conversations.map((conv, index) => {
                const text = getTextForColumn(conv, language1);
                const isOriginal = conv.originalLang === language1;
                const isTranslating = conv.isTranslating && !isOriginal;
                
                return (
                  <div 
                    key={conv.id || index} 
                    className={`p-3 rounded-lg transition-all ${
                      isOriginal 
                        ? 'bg-blue-100 border-l-4 border-blue-500' 
                        : isTranslating
                        ? 'bg-yellow-50 border-l-4 border-yellow-400 animate-pulse'
                        : 'bg-white border-l-4 border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">
                        {new Date(conv.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`text-xs font-semibold ${
                        isOriginal ? 'text-blue-600' : isTranslating ? 'text-yellow-600' : 'text-gray-500'
                      }`}>
                        {isOriginal ? 'GỐC' : isTranslating ? 'ĐANG DỊCH...' : 'DỊCH'}
                      </span>
                    </div>
                    <p className="text-base text-gray-800 leading-relaxed">
                      {text}
                    </p>
                  </div>
                );
              })}
              
              {conversations.length === 0 && !isSessionActive && (
                <div className="text-center text-gray-400 mt-32">
                  <Mic className="w-16 h-16 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Chưa có dữ liệu</p>
                  <p className="text-xs mt-1">Nhấn "Bắt đầu" để bắt đầu</p>
                </div>
              )}

              {isSessionActive && conversations.length === 0 && !typingText && (
                <div className="text-center text-blue-500 mt-32">
                  <Volume2 className="w-16 h-16 mx-auto mb-3 animate-pulse" />
                  <p className="text-sm font-medium">Đang lắng nghe...</p>
                  <p className="text-xs mt-1">Hãy bắt đầu nói</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white px-4 py-3">
              <h2 className="text-lg font-semibold">
                {getLanguageName(language2)}
              </h2>
              <p className="text-xs opacity-90">Người B</p>
            </div>
            <div className="p-4 h-[500px] overflow-y-auto space-y-3 bg-gray-50">
              {conversations.map((conv, index) => {
                const text = getTextForColumn(conv, language2);
                const isOriginal = conv.originalLang === language2;
                const isTranslating = conv.isTranslating && !isOriginal;
                
                return (
                  <div 
                    key={conv.id || index} 
                    className={`p-3 rounded-lg transition-all ${
                      isOriginal 
                        ? 'bg-indigo-100 border-l-4 border-indigo-500' 
                        : isTranslating
                        ? 'bg-yellow-50 border-l-4 border-yellow-400 animate-pulse'
                        : 'bg-white border-l-4 border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">
                        {new Date(conv.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`text-xs font-semibold ${
                        isOriginal ? 'text-indigo-600' : isTranslating ? 'text-yellow-600' : 'text-gray-500'
                      }`}>
                        {isOriginal ? 'GỐC' : isTranslating ? 'ĐANG DỊCH...' : 'DỊCH'}
                      </span>
                    </div>
                    <p className="text-base text-gray-800 leading-relaxed">
                      {text}
                    </p>
                  </div>
                );
              })}
              
              {conversations.length === 0 && !isSessionActive && (
                <div className="text-center text-gray-400 mt-32">
                  <Mic className="w-16 h-16 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Chưa có dữ liệu</p>
                  <p className="text-xs mt-1">Nhấn "Bắt đầu" để bắt đầu</p>
                </div>
              )}

              {isSessionActive && conversations.length === 0 && !typingText && (
                <div className="text-center text-indigo-500 mt-32">
                  <Volume2 className="w-16 h-16 mx-auto mb-3 animate-pulse" />
                  <p className="text-sm font-medium">Đang lắng nghe...</p>
                  <p className="text-xs mt-1">Hãy bắt đầu nói</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        {conversations.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex justify-center gap-8 text-sm text-gray-600">
              <div>
                <span className="font-semibold">Tổng số câu:</span>{' '}
                <span className="text-blue-600">{conversations.filter(c => !c.isTranslating).length}</span>
              </div>
              <div>
                <span className="font-semibold">Thời lượng:</span>{' '}
                <span className="text-blue-600">{formatTime(sessionDuration)}</span>
              </div>
              <div>
                <span className="font-semibold">Công nghệ:</span>{' '}
                <span className="text-green-600 font-mono text-xs">Web Speech API</span>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-gray-200 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <p className="text-center text-sm text-gray-500">
            Meeting Translator - Real-time Mode | Web Speech API + OpenAI Translation
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
import { useState, useEffect, useRef } from 'react';
import { Mic, Download, Settings, Play, Square, Info } from 'lucide-react';
import websocketService from './services/websocketService';
import audioService from './services/audioService';
import './App.css';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  
  const [language1, setLanguage1] = useState('vi');
  const [language2, setLanguage2] = useState('ja');
  const [currentSpeaker, setCurrentSpeaker] = useState('1');
  
  const [partialCaption, setPartialCaption] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [sessionDuration, setSessionDuration] = useState(0);
  
  const conversationRef = useRef(null);
  const sessionStartTime = useRef(null);

  useEffect(() => {
    websocketService.connect(
      handlePartialCaption,
      handleFinalTranslation,
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
  }, [conversations, partialCaption]);

  const handlePartialCaption = (data) => {
    console.log('📝 Partial:', data.text);
    setPartialCaption(data);
  };

  const handleFinalTranslation = (data) => {
    console.log('✅ Final:', data.originalText, '→', data.translatedText);
    setConversations(prev => [...prev, data]);
    setPartialCaption(null);
  };

  const startSession = async () => {
    if (!isConnected) {
      alert('Chưa kết nối tới server!');
      return;
    }

    websocketService.sendSessionInit(language1, language2);
    console.log('📤 Session init:', language1, '↔', language2);

    const success = await audioService.startContinuousRecording((audioData) => {
      const langToSend = currentSpeaker === '1' ? language1 : language2;
      websocketService.sendAudio(audioData, langToSend);
    });

    if (success) {
      setIsSessionActive(true);
      console.log('🎬 Session started');
    } else {
      alert('Không thể bắt đầu phiên! Kiểm tra microphone.');
    }
  };

  const stopSession = () => {
    audioService.stopRecording();
    setIsSessionActive(false);
    sessionStartTime.current = null;
    setSessionDuration(0);
    console.log('⏹️ Session stopped');
  };

  const exportTranscript = () => {
    const data = {
      sessionId: websocketService.getSessionId(),
      startTime: sessionStartTime.current,
      languages: { lang1: language1, lang2: language2 },
      conversations: conversations
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
      setPartialCaption(null);
    }
  };

  const switchSpeaker = () => {
    setCurrentSpeaker(prev => prev === '1' ? '2' : '1');
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
      : conv.translatedText;
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
                Continuous Conversation Mode
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
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm font-mono text-red-700">
                    REC {formatTime(sessionDuration)}
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
                  <option value="zh">🇨🇳 中文</option>
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
                  <option value="zh">🇨🇳 中文</option>
                </select>
              </div>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-semibold mb-1">Chế độ Continuous:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Nhấn "Start" <strong>một lần duy nhất</strong></li>
                    <li>Hệ thống sẽ <strong>luôn lắng nghe</strong> và tự động dịch</li>
                    <li>Không cần bấm nút mỗi khi nói</li>
                    <li>Kết quả hiển thị realtime song song 2 ngôn ngữ</li>
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
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        currentSpeaker === '1'
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {getLanguageName(language1)}
                    </button>
                    <button
                      onClick={switchSpeaker}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        currentSpeaker === '2'
                          ? 'bg-indigo-500 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
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

        {/* Partial Caption */}
        {partialCaption && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-r-lg animate-pulse">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-ping" />
              <span className="text-xs font-semibold text-yellow-700 uppercase">
                Đang xử lý...
              </span>
            </div>
            <p className="text-lg text-gray-800 font-medium">
              {partialCaption.text}
            </p>
            <span className="text-xs text-yellow-600 mt-1 inline-block">
              {getLanguageName(partialCaption.language)}
            </span>
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
                
                return (
                  <div 
                    key={conv.id || index} 
                    className={`p-3 rounded-lg transition-all ${
                      isOriginal 
                        ? 'bg-blue-100 border-l-4 border-blue-500' 
                        : 'bg-white border-l-4 border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">
                        {new Date(conv.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`text-xs font-semibold ${
                        isOriginal ? 'text-blue-600' : 'text-gray-500'
                      }`}>
                        {isOriginal ? 'GỐC' : 'DỊCH'}
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

              {isSessionActive && conversations.length === 0 && (
                <div className="text-center text-blue-500 mt-32">
                  <div className="w-16 h-16 mx-auto mb-3 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
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
                
                return (
                  <div 
                    key={conv.id || index} 
                    className={`p-3 rounded-lg transition-all ${
                      isOriginal 
                        ? 'bg-indigo-100 border-l-4 border-indigo-500' 
                        : 'bg-white border-l-4 border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">
                        {new Date(conv.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`text-xs font-semibold ${
                        isOriginal ? 'text-indigo-600' : 'text-gray-500'
                      }`}>
                        {isOriginal ? 'GỐC' : 'DỊCH'}
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

              {isSessionActive && conversations.length === 0 && (
                <div className="text-center text-indigo-500 mt-32">
                  <div className="w-16 h-16 mx-auto mb-3 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
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
                <span className="text-blue-600">{conversations.length}</span>
              </div>
              <div>
                <span className="font-semibold">Thời lượng:</span>{' '}
                <span className="text-blue-600">{formatTime(sessionDuration)}</span>
              </div>
              <div>
                <span className="font-semibold">Session:</span>{' '}
                <span className="text-gray-500 font-mono text-xs">
                  {websocketService.getSessionId()?.substring(0, 16)}...
                </span>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-gray-200 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <p className="text-center text-sm text-gray-500">
            Meeting Translator - Continuous Mode | Powered by OpenAI
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
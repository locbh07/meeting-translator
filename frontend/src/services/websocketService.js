import { Client } from '@stomp/stompjs';

class WebSocketService {
  constructor() {
    this.client = null;
    this.connected = false;
    this.sessionId = null;
    this.subscriptions = [];
  }

  connect(onPartialCaption, onFinalTranslation, onConnect, onError) {
    this.sessionId = `session-${Date.now()}`;
    
    this.client = new Client({
      brokerURL: 'ws://localhost:8080/ws',
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      
      onConnect: () => {
        console.log('✅ WebSocket connected');
        this.connected = true;
        
        // Subscribe ONLY for receiving results
        const sub1 = this.client.subscribe('/topic/partial', (message) => {
          try {
            const data = JSON.parse(message.body);
            onPartialCaption(data);
          } catch (error) {
            console.error('Error parsing partial:', error);
          }
        });
        
        const sub2 = this.client.subscribe('/topic/final', (message) => {
          try {
            const data = JSON.parse(message.body);
            onFinalTranslation(data);
          } catch (error) {
            console.error('Error parsing final:', error);
          }
        });
        
        this.subscriptions = [sub1, sub2];
        
        if (onConnect) onConnect();
      },
      
      onStompError: (frame) => {
        console.error('❌ STOMP Error:', frame.headers.message);
        this.connected = false;
        if (onError) onError(new Error(frame.headers.message));
      },
      
      onWebSocketError: (error) => {
        console.error('❌ WebSocket Error:', error);
        this.connected = false;
        if (onError) onError(error);
      },
      
      onDisconnect: () => {
        console.log('🔌 Disconnected');
        this.connected = false;
      }
    });
    
    this.client.activate();
  }

  // Send via HTTP instead of WebSocket
  async sendSessionInit(language1, language2) {
    try {
      const response = await fetch('http://localhost:8080/api/session/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          language1: language1,
          language2: language2
        })
      });
      console.log('✅ Session init via HTTP');
    } catch (error) {
      console.error('❌ Session init failed:', error);
    }
  }

  // Send audio via HTTP instead of WebSocket
  async sendAudio(audioData, language) {
    try {
      const response = await fetch('http://localhost:8080/api/audio/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          audioData: audioData,
          language: language,
          timestamp: Date.now()
        })
      });
      
      if (response.ok) {
        console.log('✅ Audio sent via HTTP');
      } else {
        console.error('❌ Upload failed:', response.status);
      }
    } catch (error) {
      console.error('❌ Upload error:', error);
    }
  }

  disconnect() {
    if (this.subscriptions.length > 0) {
      this.subscriptions.forEach(sub => sub.unsubscribe());
      this.subscriptions = [];
    }
    
    if (this.client) {
      this.client.deactivate();
      this.connected = false;
    }
  }

  isConnected() {
    return this.connected;
  }

  getSessionId() {
    return this.sessionId;
  }
}

export default new WebSocketService();
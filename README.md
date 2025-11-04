# Meeting Translator

**Bilingual Realtime Speech-to-Text & Translation App**  
React + Spring Boot + OpenAI (Whisper + GPT)

## 🧩 Project Structure
meeting-translator/
├── frontend/ → React + Vite + Tailwind + TypeScript
└── backend/ → Spring Boot 3.5.7 + OpenAI API (Whisper, GPT)

### 1) Prereqs
- Node 22+, npm 10+
- Java 21+, Maven 3.9+
- Set environment variable: `OPENAI_API_KEY`

## 🚀 How to Run

### Frontend
```bash
cd frontend
npm install
npm run dev

cd backend
mvn spring-boot:run

# Meeting Translator (Quick Notes)

## What AI should focus on
- Frontend: restore 2-column view (VI | JA), stable partial/final render.
- Backend: improve auto language detection (prefer JA/VI, avoid false EN).
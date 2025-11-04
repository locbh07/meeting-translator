//package com.translator.backend.controller;
//
//import com.translator.backend.dto.FinalTranslationDTO;
//import com.translator.backend.dto.PartialCaptionDTO;
//import com.translator.backend.model.AudioChunk;
//import com.translator.backend.service.LanguageDetectionService;
//import com.translator.backend.service.TranslationService;
//import com.translator.backend.service.WhisperService;
//import lombok.RequiredArgsConstructor;
//import lombok.extern.slf4j.Slf4j;
//import org.springframework.messaging.handler.annotation.MessageMapping;
//import org.springframework.messaging.handler.annotation.Payload;
//import org.springframework.messaging.simp.SimpMessagingTemplate;
//import org.springframework.stereotype.Controller;
//
//import java.util.UUID;
//import java.util.concurrent.CompletableFuture;
//import java.util.concurrent.ConcurrentHashMap;
//
//@Slf4j
//@Controller
//@RequiredArgsConstructor
//public class AudioController {
//
//    private final WhisperService whisperService;
//    private final TranslationService translationService;
//    private final LanguageDetectionService languageDetectionService;
//    private final SimpMessagingTemplate messagingTemplate;
//    
//    private final ConcurrentHashMap<String, LanguagePair> sessionLanguages = new ConcurrentHashMap<>();
//
//    @MessageMapping("/audio/stream")
//    public void handleAudioStream(@Payload AudioChunk audioChunk) {
//        log.info("📥 Received audio chunk - Session: {}, Language hint: {}", 
//                 audioChunk.getSessionId(), audioChunk.getLanguage());
//
//        CompletableFuture.runAsync(() -> {
//            try {
//                String transcribedText = whisperService.transcribe(
//                    audioChunk.getAudioData(),
//                    audioChunk.getLanguage()
//                );
//
//                if (transcribedText == null || transcribedText.trim().isEmpty()) {
//                    log.warn("⚠️ Empty transcription, skipping");
//                    return;
//                }
//
//                log.info("📝 Transcribed: {}", transcribedText);
//
//                String detectedLang = languageDetectionService.detectLanguage(
//                    transcribedText, 
//                    audioChunk.getLanguage()
//                );
//                
//                log.info("🔍 Detected language: {}", detectedLang);
//
//                PartialCaptionDTO partialCaption = new PartialCaptionDTO(
//                    transcribedText,
//                    detectedLang,
//                    System.currentTimeMillis(),
//                    audioChunk.getSessionId()
//                );
//                
//                messagingTemplate.convertAndSend("/topic/partial", partialCaption);
//
//                String targetLang = determineTargetLanguage(
//                    audioChunk.getSessionId(),
//                    detectedLang,
//                    audioChunk.getLanguage()
//                );
//
//                String translatedText = translationService.translate(
//                    transcribedText,
//                    detectedLang,
//                    targetLang
//                );
//
//                FinalTranslationDTO finalTranslation = new FinalTranslationDTO(
//                    UUID.randomUUID().toString(),
//                    transcribedText,
//                    detectedLang,
//                    translatedText,
//                    targetLang,
//                    System.currentTimeMillis(),
//                    audioChunk.getSessionId()
//                );
//                
//                messagingTemplate.convertAndSend("/topic/final", finalTranslation);
//                log.info("✅ Complete: {} ({}) → {} ({})", 
//                         transcribedText, detectedLang, translatedText, targetLang);
//
//            } catch (Exception e) {
//                log.error("❌ Error processing audio chunk", e);
//            }
//        });
//    }
//
//    @MessageMapping("/session/init")
//    public void initSession(@Payload SessionInit sessionInit) {
//        log.info("🎬 Initializing session {} with languages: {} ↔ {}", 
//                 sessionInit.getSessionId(), 
//                 sessionInit.getLanguage1(), 
//                 sessionInit.getLanguage2());
//        
//        sessionLanguages.put(
//            sessionInit.getSessionId(), 
//            new LanguagePair(sessionInit.getLanguage1(), sessionInit.getLanguage2())
//        );
//    }
//
//    private String determineTargetLanguage(String sessionId, String detectedLang, String hintLang) {
//        LanguagePair pair = sessionLanguages.get(sessionId);
//        
//        if (pair == null) {
//            return detectedLang.equalsIgnoreCase(hintLang) 
//                ? getOppositeLanguage(hintLang) 
//                : hintLang;
//        }
//        
//        return detectedLang.equalsIgnoreCase(pair.getLang1()) 
//            ? pair.getLang2() 
//            : pair.getLang1();
//    }
//
//    private String getOppositeLanguage(String lang) {
//        return switch (lang.toLowerCase()) {
//            case "vi" -> "ja";
//            case "ja" -> "vi";
//            case "en" -> "vi";
//            default -> "en";
//        };
//    }
//
//    @lombok.Data
//    @lombok.NoArgsConstructor
//    @lombok.AllArgsConstructor
//    public static class SessionInit {
//        private String sessionId;
//        private String language1;
//        private String language2;
//    }
//
//    @lombok.Data
//    @lombok.AllArgsConstructor
//    private static class LanguagePair {
//        private String lang1;
//        private String lang2;
//    }
//}
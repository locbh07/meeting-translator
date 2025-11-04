package com.translator.backend.controller;

import com.translator.backend.dto.FinalTranslationDTO;
import com.translator.backend.dto.PartialCaptionDTO;
import com.translator.backend.model.AudioChunk;
import com.translator.backend.service.LanguageDetectionService;
import com.translator.backend.service.TranslationService;
import com.translator.backend.service.WhisperService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AudioRestController {

    private final WhisperService whisperService;
    private final TranslationService translationService;
    private final LanguageDetectionService languageDetectionService;
    private final SimpMessagingTemplate messagingTemplate;
    
    private final ConcurrentHashMap<String, LanguagePair> sessionLanguages = new ConcurrentHashMap<>();

    @PostMapping("/audio/upload")
    public void uploadAudio(@RequestBody AudioChunk audioChunk) {
        log.info("📥 HTTP: Received audio - Session: {}, Size: {} bytes", 
                 audioChunk.getSessionId(), 
                 audioChunk.getAudioData() != null ? audioChunk.getAudioData().length() : 0);

        CompletableFuture.runAsync(() -> {
            try {
                String transcribedText = whisperService.transcribe(
                    audioChunk.getAudioData(),
                    audioChunk.getLanguage()
                );

                if (transcribedText == null || transcribedText.trim().isEmpty()) {
                    log.warn("⚠️ Empty transcription");
                    return;
                }

                log.info("📝 Transcribed: {}", transcribedText);

                String detectedLang = languageDetectionService.detectLanguage(
                    transcribedText, 
                    audioChunk.getLanguage()
                );
                
                log.info("🔍 Detected: {}", detectedLang);

                // Send partial via WebSocket
                PartialCaptionDTO partialCaption = new PartialCaptionDTO(
                    transcribedText,
                    detectedLang,
                    System.currentTimeMillis(),
                    audioChunk.getSessionId()
                );
                
                messagingTemplate.convertAndSend("/topic/partial", partialCaption);

                String targetLang = determineTargetLanguage(
                    audioChunk.getSessionId(),
                    detectedLang,
                    audioChunk.getLanguage()
                );

                String translatedText = translationService.translate(
                    transcribedText,
                    detectedLang,
                    targetLang
                );

                // Send final via WebSocket
                FinalTranslationDTO finalTranslation = new FinalTranslationDTO(
                    UUID.randomUUID().toString(),
                    transcribedText,
                    detectedLang,
                    translatedText,
                    targetLang,
                    System.currentTimeMillis(),
                    audioChunk.getSessionId()
                );
                
                messagingTemplate.convertAndSend("/topic/final", finalTranslation);
                log.info("✅ Complete: {} ({}) → {} ({})", 
                         transcribedText, detectedLang, translatedText, targetLang);

            } catch (Exception e) {
                log.error("❌ Error processing", e);
            }
        });
    }

    @PostMapping("/session/init")
    public void initSession(@RequestBody SessionInit sessionInit) {
        log.info("🎬 Init session: {} ↔ {}", 
                 sessionInit.getLanguage1(), 
                 sessionInit.getLanguage2());
        
        sessionLanguages.put(
            sessionInit.getSessionId(), 
            new LanguagePair(sessionInit.getLanguage1(), sessionInit.getLanguage2())
        );
    }

    private String determineTargetLanguage(String sessionId, String detectedLang, String hintLang) {
        LanguagePair pair = sessionLanguages.get(sessionId);
        
        if (pair == null) {
            return detectedLang.equalsIgnoreCase(hintLang) 
                ? getOppositeLanguage(hintLang) 
                : hintLang;
        }
        
        return detectedLang.equalsIgnoreCase(pair.getLang1()) 
            ? pair.getLang2() 
            : pair.getLang1();
    }

    private String getOppositeLanguage(String lang) {
        return switch (lang.toLowerCase()) {
            case "vi" -> "ja";
            case "ja" -> "vi";
            case "en" -> "vi";
            default -> "en";
        };
    }

    @lombok.Data
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    public static class SessionInit {
        private String sessionId;
        private String language1;
        private String language2;
    }

    @lombok.Data
    @lombok.AllArgsConstructor
    private static class LanguagePair {
        private String lang1;
        private String lang2;
    }
}
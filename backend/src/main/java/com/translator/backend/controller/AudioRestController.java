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
import java.util.Set;
import java.util.concurrent.ConcurrentSkipListSet;

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
    
    // ✅ Thêm duplicate detection
    private final ConcurrentHashMap<String, Set<String>> processedTexts = new ConcurrentHashMap<>();

    @PostMapping("/audio/upload")
    public void uploadAudio(@RequestBody AudioChunk audioChunk) {
        String sessionId = audioChunk.getSessionId();
        
        log.info("📥 HTTP: Audio received - Session: {}, Size: {} bytes", 
                 sessionId, 
                 audioChunk.getAudioData() != null ? audioChunk.getAudioData().length() : 0);

        CompletableFuture.runAsync(() -> {
            try {
                // ✅ BƯỚC 1: Dùng Whisper auto-detect thay vì language hint
                WhisperService.TranscriptionResult result = whisperService.transcribeWithDetection(
                    audioChunk.getAudioData()
                );

                if (result == null || result.text == null || result.text.trim().isEmpty()) {
                    log.warn("⚠️ Empty transcription");
                    return;
                }

                String transcribedText = result.text;
                String whisperDetectedLang = result.detectedLanguage;
                
                log.info("📝 Whisper result: [{}] {}", whisperDetectedLang, transcribedText);

                // ✅ BƯỚC 2: Check duplicate
                Set<String> sessionTexts = processedTexts.computeIfAbsent(
                    sessionId, 
                    k -> new ConcurrentSkipListSet<>()
                );
                
                String textKey = transcribedText.toLowerCase().trim();
                if (sessionTexts.contains(textKey)) {
                    log.warn("⚠️ DUPLICATE detected, skipping: {}", transcribedText);
                    return;
                }
                sessionTexts.add(textKey);

                // ✅ BƯỚC 3: Verify language với pattern detection (backup)
                String verifiedLang = languageDetectionService.verifyLanguage(
                    transcribedText, 
                    whisperDetectedLang,
                    audioChunk.getLanguage()
                );
                
                log.info("🔍 Verified language: {}", verifiedLang);

                // ✅ BƯỚC 4: Send partial caption
                PartialCaptionDTO partialCaption = new PartialCaptionDTO(
                    transcribedText,
                    verifiedLang,
                    System.currentTimeMillis(),
                    sessionId
                );
                
                messagingTemplate.convertAndSend("/topic/partial", partialCaption);

                // ✅ BƯỚC 5: Determine target language
                String targetLang = determineTargetLanguage(
                    sessionId,
                    verifiedLang,
                    audioChunk.getLanguage()
                );

                // ✅ BƯỚC 6: Translate
                String translatedText = translationService.translate(
                    transcribedText,
                    verifiedLang,
                    targetLang
                );

                // ✅ BƯỚC 7: Send final translation
                FinalTranslationDTO finalTranslation = new FinalTranslationDTO(
                    UUID.randomUUID().toString(),
                    transcribedText,
                    verifiedLang,
                    translatedText,
                    targetLang,
                    System.currentTimeMillis(),
                    sessionId
                );
                
                messagingTemplate.convertAndSend("/topic/final", finalTranslation);
                
                log.info("✅ Complete: {} ({}) → {} ({})", 
                         transcribedText, verifiedLang, translatedText, targetLang);

            } catch (Exception e) {
                log.error("❌ Error processing audio", e);
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
        
        // Clear duplicate detection for this session
        processedTexts.put(sessionInit.getSessionId(), new ConcurrentSkipListSet<>());
    }

    @PostMapping("/session/clear")
    public void clearSession(@RequestBody SessionInit sessionInit) {
        String sessionId = sessionInit.getSessionId();
        processedTexts.remove(sessionId);
        sessionLanguages.remove(sessionId);
        log.info("🗑️ Cleared session: {}", sessionId);
    }

    private String determineTargetLanguage(String sessionId, String detectedLang, String hintLang) {
        LanguagePair pair = sessionLanguages.get(sessionId);
        
        if (pair == null) {
            // Nếu không có pair, dịch sang ngôn ngữ còn lại
            return detectedLang.equalsIgnoreCase(hintLang) 
                ? getOppositeLanguage(hintLang) 
                : hintLang;
        }
        
        // Dịch sang ngôn ngữ kia trong cặp
        return detectedLang.equalsIgnoreCase(pair.getLang1()) 
            ? pair.getLang2() 
            : pair.getLang1();
    }

    private String getOppositeLanguage(String lang) {
        return switch (lang.toLowerCase()) {
            case "vi", "vie" -> "ja";
            case "ja", "jpn" -> "vi";
            case "en", "eng" -> "vi";
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
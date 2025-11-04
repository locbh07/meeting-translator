package com.translator.backend.controller;

import com.translator.backend.service.TranslationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class TranslationController {

    private final TranslationService translationService;

    /**
     * Direct translation endpoint (no transcription)
     * For use with Web Speech API frontend
     */
    @PostMapping("/translate")
    public Map<String, String> translate(@RequestBody TranslationRequest request) {
        log.info("📥 Translation request: {} ({}) → ({})", 
                 request.getText(), 
                 request.getSourceLang(), 
                 request.getTargetLang());

        try {
            String translation = translationService.translate(
                request.getText(),
                request.getSourceLang(),
                request.getTargetLang()
            );

            log.info("✅ Translation result: {}", translation);

            return Map.of(
                "originalText", request.getText(),
                "translation", translation,
                "sourceLang", request.getSourceLang(),
                "targetLang", request.getTargetLang()
            );

        } catch (Exception e) {
            log.error("❌ Translation error", e);
            return Map.of(
                "originalText", request.getText(),
                "translation", "[Error: " + request.getText() + "]",
                "error", e.getMessage()
            );
        }
    }

    @lombok.Data
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    public static class TranslationRequest {
        private String text;
        private String sourceLang;
        private String targetLang;
        private String sessionId;
    }
}
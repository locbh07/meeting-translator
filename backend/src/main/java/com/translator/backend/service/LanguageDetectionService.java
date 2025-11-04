package com.translator.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.regex.Pattern;

@Slf4j
@Service
public class LanguageDetectionService {

    private static final Pattern JAPANESE_PATTERN = Pattern.compile(
        "[\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FAF]"
    );
    
    private static final Pattern VIETNAMESE_PATTERN = Pattern.compile(
        "[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđĐ]"
    );
    
    private static final Pattern KOREAN_PATTERN = Pattern.compile(
        "[\\uAC00-\\uD7A3\\u1100-\\u11FF\\u3130-\\u318F]"
    );
    
    private static final Pattern CHINESE_PATTERN = Pattern.compile(
        "[\\u4E00-\\u9FFF\\u3400-\\u4DBF]"
    );

    /**
     * Detect language from text patterns only
     */
    public String detectLanguage(String text, String hintLanguage) {
        if (text == null || text.trim().isEmpty()) {
            return hintLanguage;
        }

        log.debug("Detecting language for: {}", text);

        int japaneseCount = countMatches(text, JAPANESE_PATTERN);
        int vietnameseCount = countMatches(text, VIETNAMESE_PATTERN);
        int koreanCount = countMatches(text, KOREAN_PATTERN);
        int chineseCount = countMatches(text, CHINESE_PATTERN);

        log.debug("Language scores - JA: {}, VI: {}, KO: {}, ZH: {}", 
                  japaneseCount, vietnameseCount, koreanCount, chineseCount);

        if (japaneseCount > 0) {
            return "ja";
        } else if (vietnameseCount > 0) {
            return "vi";
        } else if (koreanCount > 0) {
            return "ko";
        } else if (chineseCount > 0) {
            return "zh";
        }

        if (text.matches("^[a-zA-Z0-9\\s.,!?'-]+$")) {
            return "en";
        }

        log.debug("No clear match, using hint language: {}", hintLanguage);
        return hintLanguage;
    }

    /**
     * ✅ NEW: Verify Whisper's detected language với pattern matching
     * Nếu Whisper sai (ví dụ: nhận tiếng Nhật thành Việt), sẽ correct lại
     */
    public String verifyLanguage(String text, String whisperLang, String fallbackHint) {
        if (text == null || text.trim().isEmpty()) {
            return fallbackHint;
        }

        // Normalize Whisper language codes (jpn -> ja, vie -> vi, etc.)
        String normalizedWhisper = normalizeLanguageCode(whisperLang);
        
        int japaneseCount = countMatches(text, JAPANESE_PATTERN);
        int vietnameseCount = countMatches(text, VIETNAMESE_PATTERN);
        int koreanCount = countMatches(text, KOREAN_PATTERN);

        log.debug("Verifying: Whisper={}, JA={}, VI={}, KO={}", 
                  normalizedWhisper, japaneseCount, vietnameseCount, koreanCount);

        // ✅ Case 1: Text có ký tự Nhật
        if (japaneseCount > 0) {
            if (!normalizedWhisper.equals("ja")) {
                log.warn("⚠️ Whisper said '{}' but detected Japanese characters, correcting to 'ja'", 
                         whisperLang);
                return "ja";
            }
            return "ja";
        }

        // ✅ Case 2: Text có dấu tiếng Việt
        if (vietnameseCount > 0) {
            if (!normalizedWhisper.equals("vi")) {
                log.warn("⚠️ Whisper said '{}' but detected Vietnamese characters, correcting to 'vi'", 
                         whisperLang);
                return "vi";
            }
            return "vi";
        }

        // ✅ Case 3: Text có ký tự Hàn
        if (koreanCount > 0) {
            if (!normalizedWhisper.equals("ko")) {
                log.warn("⚠️ Whisper said '{}' but detected Korean characters, correcting to 'ko'", 
                         whisperLang);
                return "ko";
            }
            return "ko";
        }

        // ✅ Case 4: English or other (trust Whisper)
        if (text.matches("^[a-zA-Z0-9\\s.,!?'-]+$")) {
            return "en".equals(normalizedWhisper) ? "en" : normalizedWhisper;
        }

        // ✅ Case 5: Không detect được gì, tin Whisper
        log.debug("No pattern match, trusting Whisper: {}", normalizedWhisper);
        return normalizedWhisper;
    }

    /**
     * Normalize language codes (3-letter -> 2-letter)
     */
    private String normalizeLanguageCode(String code) {
        if (code == null || code.isEmpty()) {
            return "unknown";
        }
        
        return switch (code.toLowerCase()) {
            case "jpn", "japanese" -> "ja";
            case "vie", "vietnamese" -> "vi";
            case "eng", "english" -> "en";
            case "kor", "korean" -> "ko";
            case "zho", "chi", "chinese" -> "zh";
            default -> code.toLowerCase();
        };
    }

    private int countMatches(String text, Pattern pattern) {
        int count = 0;
        var matcher = pattern.matcher(text);
        while (matcher.find()) {
            count++;
        }
        return count;
    }
}
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

    private int countMatches(String text, Pattern pattern) {
        int count = 0;
        var matcher = pattern.matcher(text);
        while (matcher.find()) {
            count++;
        }
        return count;
    }
}
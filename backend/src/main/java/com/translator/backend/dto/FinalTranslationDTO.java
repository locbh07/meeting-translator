package com.translator.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class FinalTranslationDTO {
    private String id;
    private String originalText;
    private String originalLang;
    private String translatedText;
    private String translatedLang;
    private long timestamp;
    private String sessionId;
}
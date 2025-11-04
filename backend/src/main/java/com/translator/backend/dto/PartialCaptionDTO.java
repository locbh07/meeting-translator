package com.translator.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PartialCaptionDTO {
    private String text;
    private String language;
    private long timestamp;
    private String sessionId;
}
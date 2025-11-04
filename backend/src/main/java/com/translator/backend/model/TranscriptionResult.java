package com.translator.backend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TranscriptionResult {
    private String text;
    private String language;
    private double confidence;
    private long timestamp;
}
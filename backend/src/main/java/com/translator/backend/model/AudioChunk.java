package com.translator.backend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AudioChunk {
    private String sessionId;
    private String audioData; // Base64 encoded
    private String language;
    private long timestamp;
}
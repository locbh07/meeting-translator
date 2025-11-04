package com.translator.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import okhttp3.*;
import org.apache.commons.codec.binary.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class WhisperService {

    @Value("${openai.api.key}")
    private String apiKey;

    @Value("${openai.whisper.model}")
    private String model;

    private final OkHttpClient httpClient;
    private final ObjectMapper objectMapper;

    public WhisperService() {
        ConnectionPool connectionPool = new ConnectionPool(5, 5, TimeUnit.MINUTES);
        
        this.httpClient = new OkHttpClient.Builder()
                .connectionPool(connectionPool)
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .build();
        this.objectMapper = new ObjectMapper();
    }

    /**
     * Transcribe với auto-detection - KHÔNG chỉ định language trước
     */
    public TranscriptionResult transcribeWithDetection(String base64Audio) {
        try {
            byte[] audioBytes = Base64.decodeBase64(base64Audio);
            
            if (audioBytes.length < 1000) {
                log.warn("Audio too short, skipping");
                return null;
            }
            
            log.info("Transcribing audio: {} bytes (auto-detect language)", audioBytes.length);

            // KHÔNG chỉ định language - để Whisper tự detect
            RequestBody requestBody = new MultipartBody.Builder()
                    .setType(MultipartBody.FORM)
                    .addFormDataPart("file", "audio.wav",
                            RequestBody.create(audioBytes, MediaType.parse("audio/wav")))
                    .addFormDataPart("model", model)
                    .addFormDataPart("response_format", "verbose_json") // Lấy language detected
                    .addFormDataPart("temperature", "0")
                    .build();

            Request request = new Request.Builder()
                    .url("https://api.openai.com/v1/audio/transcriptions")
                    .header("Authorization", "Bearer " + apiKey)
                    .post(requestBody)
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                if (response.isSuccessful()) {
                    String responseBody = response.body().string();
                    JsonNode jsonNode = objectMapper.readTree(responseBody);
                    
                    String text = jsonNode.get("text").asText().trim();
                    String detectedLang = jsonNode.has("language") 
                        ? jsonNode.get("language").asText() 
                        : "unknown";
                    
                    log.info("✅ Transcribed [{}]: {}", detectedLang, text);
                    
                    return new TranscriptionResult(text, detectedLang);
                    
                } else {
                    String errorBody = response.body() != null ? response.body().string() : "No error body";
                    log.error("Whisper API error: {} - {}", response.code(), errorBody);
                    return null;
                }
            }

        } catch (Exception e) {
            log.error("Error transcribing audio", e);
            return null;
        }
    }

    /**
     * Transcribe với language hint (fallback nếu cần)
     */
    public String transcribe(String base64Audio, String languageHint) {
        try {
            byte[] audioBytes = Base64.decodeBase64(base64Audio);
            
            if (audioBytes.length < 1000) {
                log.warn("Audio too short, skipping");
                return "";
            }
            
            log.info("Transcribing audio: {} bytes, language hint: {}", audioBytes.length, languageHint);

            RequestBody requestBody = new MultipartBody.Builder()
                    .setType(MultipartBody.FORM)
                    .addFormDataPart("file", "audio.wav",
                            RequestBody.create(audioBytes, MediaType.parse("audio/wav")))
                    .addFormDataPart("model", model)
                    .addFormDataPart("language", languageHint)
                    .addFormDataPart("response_format", "json")
                    .addFormDataPart("temperature", "0")
                    .build();

            Request request = new Request.Builder()
                    .url("https://api.openai.com/v1/audio/transcriptions")
                    .header("Authorization", "Bearer " + apiKey)
                    .post(requestBody)
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                if (response.isSuccessful()) {
                    String responseBody = response.body().string();
                    JsonNode jsonNode = objectMapper.readTree(responseBody);
                    String text = jsonNode.get("text").asText().trim();
                    
                    log.info("✅ Transcription: {}", text);
                    return text;
                    
                } else {
                    String errorBody = response.body() != null ? response.body().string() : "No error body";
                    log.error("Whisper API error: {} - {}", response.code(), errorBody);
                    return "";
                }
            }

        } catch (Exception e) {
            log.error("Error transcribing audio", e);
            return "";
        }
    }

    public static class TranscriptionResult {
        public final String text;
        public final String detectedLanguage;

        public TranscriptionResult(String text, String detectedLanguage) {
            this.text = text;
            this.detectedLanguage = detectedLanguage;
        }
    }
}
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

    public String transcribe(String base64Audio, String language) {
        int maxRetries = 3;
        int retryCount = 0;
        
        while (retryCount < maxRetries) {
            try {
                byte[] audioBytes = Base64.decodeBase64(base64Audio);
                
                if (audioBytes.length < 1000) {
                    log.warn("Audio too short, skipping");
                    return "";
                }
                
                log.info("Transcribing audio (attempt {}): {} bytes, language: {}", 
                         retryCount + 1, audioBytes.length, language);

                RequestBody requestBody = new MultipartBody.Builder()
                        .setType(MultipartBody.FORM)
                        .addFormDataPart("file", "audio.wav",
                                RequestBody.create(audioBytes, MediaType.parse("audio/wav")))
                        .addFormDataPart("model", model)
                        .addFormDataPart("language", language)
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
                        log.error("Whisper API error (attempt {}): {} - {}", 
                                 retryCount + 1, response.code(), errorBody);
                        
                        if (response.code() == 429 || response.code() >= 500) {
                            retryCount++;
                            if (retryCount < maxRetries) {
                                Thread.sleep(1000 * retryCount);
                                continue;
                            }
                        }
                        throw new IOException("Whisper API error: " + response.code());
                    }
                }

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.error("Transcription interrupted", e);
                return "";
            } catch (Exception e) {
                log.error("Error transcribing audio (attempt {})", retryCount + 1, e);
                retryCount++;
                if (retryCount >= maxRetries) {
                    return "";
                }
                try {
                    Thread.sleep(1000 * retryCount);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return "";
                }
            }
        }
        
        return "";
    }
}
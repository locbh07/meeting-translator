package com.translator.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import okhttp3.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class TranslationService {

    @Value("${openai.api.key}")
    private String apiKey;

    @Value("${openai.gpt.model}")
    private String model;

    private final OkHttpClient httpClient;
    private final ObjectMapper objectMapper;

    public TranslationService() {
        this.httpClient = new OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build();
        this.objectMapper = new ObjectMapper();
    }

    /**
     * Translate text using GPT
     */
    public String translate(String text, String sourceLang, String targetLang) {
        try {
            log.info("Translating: {} -> {}: {}", sourceLang, targetLang, text);

            // Language names for prompt
            String sourceLanguageName = getLanguageName(sourceLang);
            String targetLanguageName = getLanguageName(targetLang);

            // Create prompt
            String prompt = String.format(
            	"Vietnamese and Japanese conversation. No video content." +
                "Translate the following %s text to %s. " +
                "Provide only the translation, no explanations:\n\n%s",
                sourceLanguageName, targetLanguageName, text
            );
            

            // Build request JSON
            ObjectNode requestJson = objectMapper.createObjectNode();
            requestJson.put("model", model);
            requestJson.put("temperature", 0.3);
            
            ArrayNode messages = requestJson.putArray("messages");
            ObjectNode userMessage = messages.addObject();
            userMessage.put("role", "user");
            userMessage.put("content", prompt);

            RequestBody requestBody = RequestBody.create(
                requestJson.toString(),
                MediaType.parse("application/json")
            );

            Request request = new Request.Builder()
                    .url("https://api.openai.com/v1/chat/completions")
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .post(requestBody)
                    .build();

            // Execute request
            try (Response response = httpClient.newCall(request).execute()) {
                if (!response.isSuccessful()) {
                    String errorBody = response.body() != null ? response.body().string() : "No error body";
                    log.error("GPT API error: {} - {}", response.code(), errorBody);
                    throw new RuntimeException("GPT API error: " + response.code());
                }

                String responseBody = response.body().string();
                JsonNode jsonNode = objectMapper.readTree(responseBody);
                String translation = jsonNode
                        .get("choices")
                        .get(0)
                        .get("message")
                        .get("content")
                        .asText()
                        .trim();
                
                log.info("Translation result: {}", translation);
                return translation;
            }

        } catch (Exception e) {
            log.error("Error translating text", e);
            return text; // Return original text if translation fails
        }
    }

    private String getLanguageName(String langCode) {
        return switch (langCode.toLowerCase()) {
            case "ja" -> "Japanese";
            case "vi" -> "Vietnamese";
            case "en" -> "English";
            case "ko" -> "Korean";
            case "zh" -> "Chinese";
            default -> langCode;
        };
    }
}
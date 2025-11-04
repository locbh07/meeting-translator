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
     * ✅ Translate với prompt cải tiến để tránh hallucination
     */
    public String translate(String text, String sourceLang, String targetLang) {
        try {
            log.info("Translating: {} -> {}: {}", sourceLang, targetLang, text);

            String sourceLanguageName = getLanguageName(sourceLang);
            String targetLanguageName = getLanguageName(targetLang);

            // ✅ IMPROVED PROMPT - Rõ ràng, không thêm thắt
            String prompt = String.format(
                "You are a professional translator for live conversations.\n\n" +
                "Task: Translate the following %s text to %s.\n\n" +
                "Rules:\n" +
                "- Translate ONLY what is given\n" +
                "- Do NOT add explanations or extra content\n" +
                "- Do NOT mention video, YouTube, or any context not in the text\n" +
                "- Keep the translation natural and conversational\n" +
                "- Output ONLY the translation\n\n" +
                "Text to translate:\n%s",
                sourceLanguageName, targetLanguageName, text
            );

            // Build request JSON
            ObjectNode requestJson = objectMapper.createObjectNode();
            requestJson.put("model", model);
            requestJson.put("temperature", 0.2); // Giảm từ 0.3 -> 0.2 để ít creative hơn
            
            ArrayNode messages = requestJson.putArray("messages");
            
            // System message để enforce behavior
            ObjectNode systemMessage = messages.addObject();
            systemMessage.put("role", "system");
            systemMessage.put("content", 
                "You are a precise translator. " +
                "Translate only what is given. " +
                "Never add context or explanations.");
            
            // User message
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
            case "ja", "jpn" -> "Japanese";
            case "vi", "vie" -> "Vietnamese";
            case "en", "eng" -> "English";
            case "ko", "kor" -> "Korean";
            case "zh", "zho", "chi" -> "Chinese";
            default -> langCode;
        };
    }
}
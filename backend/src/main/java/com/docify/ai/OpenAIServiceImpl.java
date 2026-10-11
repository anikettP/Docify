package com.docify.ai;

import com.docify.document.GenerateRequest;
import com.docify.document.GeneratedDocumentResponse;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class OpenAIServiceImpl implements AIService {

    @Value("${docify.ai.api-key}")
    private String apiKey;

    @Value("${docify.ai.model}")
    private String model;

    @Value("${docify.ai.base-url}")
    private String baseUrl;

    private final PromptTemplateService promptTemplateService;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public OpenAIServiceImpl(PromptTemplateService promptTemplateService) {
        this.promptTemplateService = promptTemplateService;
        this.restTemplate = new RestTemplate();
        this.objectMapper = new ObjectMapper();
        this.objectMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        this.objectMapper.configure(DeserializationFeature.ACCEPT_SINGLE_VALUE_AS_ARRAY, true);
    }

    @Override
    public GeneratedDocumentResponse generateDocument(GenerateRequest request) {
        String prompt = promptTemplateService.buildPrompt(request);

        if (baseUrl.contains("generativelanguage.googleapis.com")) {
            return generateWithGemini(prompt);
        } else {
            return generateWithOpenAI(prompt);
        }
    }

    private GeneratedDocumentResponse generateWithGemini(String prompt) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> body = Map.of(
                "contents", List.of(
                        Map.of("parts", List.of(
                                Map.of("text", "You are a helpful assistant that outputs strictly in JSON.\n\n" + prompt)
                        ))
                ),
                "generationConfig", Map.of(
                        "responseMimeType", "application/json"
                )
        );

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        String url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;

        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(url, entity, Map.class);
            Map<String, Object> responseBody = response.getBody();
            List<Map<String, Object>> candidates = (List<Map<String, Object>>) responseBody.get("candidates");
            Map<String, Object> contentMap = (Map<String, Object>) candidates.get(0).get("content");
            List<Map<String, Object>> parts = (List<Map<String, Object>>) contentMap.get("parts");
            String content = (String) parts.get(0).get("text");

            return parseDocumentResponse(content);
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("Failed to generate document: " + e.getMessage(), e);
        }
    }

    private GeneratedDocumentResponse generateWithOpenAI(String prompt) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        Map<String, Object> body = Map.of(
                "model", model,
                "messages", List.of(
                        Map.of("role", "system", "content", "You are a helpful assistant that outputs strictly in JSON."),
                        Map.of("role", "user", "content", prompt)
                ),
                "response_format", Map.of("type", "json_object")
        );

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(
                    baseUrl + "/chat/completions",
                    entity,
                    Map.class
            );

            Map<String, Object> responseBody = response.getBody();
            List<Map<String, Object>> choices = (List<Map<String, Object>>) responseBody.get("choices");
            Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
            String content = (String) message.get("content");

            return parseDocumentResponse(content);
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("Failed to generate document from OpenAI provider", e);
        }
    }

    private GeneratedDocumentResponse parseDocumentResponse(String content) {
        if (content == null || content.isBlank()) {
            GeneratedDocumentResponse empty = new GeneratedDocumentResponse();
            empty.setTitle("Generated Document");
            return empty;
        }

        String cleaned = content.trim();
        if (cleaned.startsWith("```json")) {
            cleaned = cleaned.substring(7);
        } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.substring(3);
        }
        if (cleaned.endsWith("```")) {
            cleaned = cleaned.substring(0, cleaned.length() - 3);
        }
        cleaned = cleaned.trim();

        try {
            return objectMapper.readValue(cleaned, GeneratedDocumentResponse.class);
        } catch (Exception primaryEx) {
            System.err.println("Primary Jackson parsing note: " + primaryEx.getMessage() + ". Executing resilient JsonNode parsing.");
            try {
                JsonNode root = objectMapper.readTree(cleaned);
                GeneratedDocumentResponse doc = new GeneratedDocumentResponse();
                if (root.has("title")) doc.setTitle(root.get("title").asText(""));
                if (root.has("summary")) doc.setSummary(root.get("summary").asText(""));
                if (root.has("conclusion")) doc.setConclusion(root.get("conclusion").asText(""));

                List<GeneratedDocumentResponse.Section> sections = new ArrayList<>();
                if (root.has("sections") && root.get("sections").isArray()) {
                    for (JsonNode secNode : root.get("sections")) {
                        GeneratedDocumentResponse.Section sec = new GeneratedDocumentResponse.Section();
                        if (secNode.isTextual()) {
                            sec.setHeading(secNode.asText(""));
                        } else if (secNode.isObject()) {
                            if (secNode.has("heading")) sec.setHeading(secNode.get("heading").asText(""));
                            if (secNode.has("paragraphs") && secNode.get("paragraphs").isArray()) {
                                List<String> paras = new ArrayList<>();
                                for (JsonNode p : secNode.get("paragraphs")) {
                                    paras.add(p.asText(""));
                                }
                                sec.setParagraphs(paras);
                            }
                            if (secNode.has("bullets") && secNode.get("bullets").isArray()) {
                                List<String> bullets = new ArrayList<>();
                                for (JsonNode b : secNode.get("bullets")) {
                                    bullets.add(b.asText(""));
                                }
                                sec.setBullets(bullets);
                            }
                        }
                        sections.add(sec);
                    }
                }
                doc.setSections(sections);

                List<GeneratedDocumentResponse.Reference> references = new ArrayList<>();
                if (root.has("references") && root.get("references").isArray()) {
                    for (JsonNode refNode : root.get("references")) {
                        GeneratedDocumentResponse.Reference ref = new GeneratedDocumentResponse.Reference();
                        if (refNode.isTextual()) {
                            ref.setTitle(refNode.asText(""));
                        } else if (refNode.isObject()) {
                            if (refNode.has("title")) ref.setTitle(refNode.get("title").asText(""));
                            if (refNode.has("url")) ref.setUrl(refNode.get("url").asText(""));
                        }
                        references.add(ref);
                    }
                }
                doc.setReferences(references);
                return doc;
            } catch (Exception fallbackEx) {
                fallbackEx.printStackTrace();
                throw new RuntimeException("Failed to parse document response: " + fallbackEx.getMessage(), primaryEx);
            }
        }
    }

    @Override
    public String rewriteText(String operation, String selectedText, String instruction, String documentContext) {
        String prompt = promptTemplateService.buildRewritePrompt(operation, selectedText, instruction, documentContext);

        if (baseUrl.contains("generativelanguage.googleapis.com")) {
            return rewriteWithGemini(prompt);
        } else {
            return rewriteWithOpenAI(prompt);
        }
    }

    private String rewriteWithGemini(String prompt) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> body = Map.of(
                "contents", List.of(
                        Map.of("parts", List.of(
                                Map.of("text", prompt)
                        ))
                ),
                "generationConfig", Map.of(
                        "responseMimeType", "text/plain"
                )
        );

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        String url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;

        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(url, entity, Map.class);
            Map<String, Object> responseBody = response.getBody();
            List<Map<String, Object>> candidates = (List<Map<String, Object>>) responseBody.get("candidates");
            Map<String, Object> contentMap = (Map<String, Object>) candidates.get(0).get("content");
            List<Map<String, Object>> parts = (List<Map<String, Object>>) contentMap.get("parts");
            return (String) parts.get(0).get("text");
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("Failed to rewrite text with Gemini provider", e);
        }
    }

    private String rewriteWithOpenAI(String prompt) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        Map<String, Object> body = Map.of(
                "model", model,
                "messages", List.of(
                        Map.of("role", "system", "content", "You are a helpful text editing assistant."),
                        Map.of("role", "user", "content", prompt)
                )
        );

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(
                    baseUrl + "/chat/completions",
                    entity,
                    Map.class
            );

            Map<String, Object> responseBody = response.getBody();
            List<Map<String, Object>> choices = (List<Map<String, Object>>) responseBody.get("choices");
            Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
            return (String) message.get("content");
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("Failed to rewrite text with OpenAI provider", e);
        }
    }

    @Override
    public String chatWithDocument(String query, String documentTitle, String documentText) {
        String prompt = promptTemplateService.buildChatPrompt(query, documentTitle, documentText);
        if (baseUrl.contains("generativelanguage.googleapis.com")) {
            return rewriteWithGemini(prompt);
        } else {
            return rewriteWithOpenAI(prompt);
        }
    }
}

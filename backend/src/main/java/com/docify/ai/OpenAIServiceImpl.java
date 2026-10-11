package com.docify.ai;

import com.docify.document.GenerateRequest;
import com.docify.document.GeneratedDocumentResponse;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class OpenAIServiceImpl implements AIService {

    @Value("${docify.ai.api-key}")
    private String apiKey;

    @Value("${docify.ai.model:gemini-2.5-flash-lite}")
    private String model;

    @Value("${docify.ai.base-url:https://generativelanguage.googleapis.com/v1beta}")
    private String baseUrl;

    @Value("${docify.ai.fallback-models:gemini-2.5-flash,gemini-flash-latest,gemini-2.5-pro}")
    private String fallbackModelsStr;

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

    private List<String> getCandidateModels() {
        List<String> list = new ArrayList<>();
        if (model != null && !model.isBlank()) {
            list.add(model.trim());
        }
        if (fallbackModelsStr != null && !fallbackModelsStr.isBlank()) {
            for (String m : fallbackModelsStr.split(",")) {
                String trimmed = m.trim();
                if (!trimmed.isEmpty() && !list.contains(trimmed)) {
                    list.add(trimmed);
                }
            }
        }
        if (!list.contains("gemini-2.5-flash-lite")) list.add("gemini-2.5-flash-lite");
        if (!list.contains("gemini-2.5-flash")) list.add("gemini-2.5-flash");
        return list;
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
        List<String> candidateModels = getCandidateModels();
        Exception lastException = null;

        for (int i = 0; i < candidateModels.size(); i++) {
            String currentModel = candidateModels.get(i);
            String url = "https://generativelanguage.googleapis.com/v1beta/models/" + currentModel + ":generateContent?key=" + apiKey;

            try {
                ResponseEntity<Map> response = restTemplate.postForEntity(url, entity, Map.class);
                Map<String, Object> responseBody = response.getBody();
                if (responseBody == null) {
                    continue;
                }

                List<Map<String, Object>> candidates = (List<Map<String, Object>>) responseBody.get("candidates");
                if (candidates == null || candidates.isEmpty()) {
                    System.err.println("Gemini model '" + currentModel + "' returned empty candidates.");
                    continue;
                }

                Map<String, Object> contentMap = (Map<String, Object>) candidates.get(0).get("content");
                if (contentMap == null || !contentMap.containsKey("parts")) {
                    continue;
                }

                List<Map<String, Object>> parts = (List<Map<String, Object>>) contentMap.get("parts");
                if (parts == null || parts.isEmpty()) {
                    continue;
                }

                String content = (String) parts.get(0).get("text");
                return parseDocumentResponse(content);
            } catch (HttpStatusCodeException ex) {
                System.err.println("Gemini model '" + currentModel + "' HTTP error " + ex.getStatusCode() + ": " + ex.getResponseBodyAsString());
                lastException = ex;
                // If 503 (high demand) or 429 (rate limit), pause briefly before trying next fallback model
                if (ex.getStatusCode().value() == 503 || ex.getStatusCode().value() == 429) {
                    try {
                        Thread.sleep(600);
                    } catch (InterruptedException ignored) {}
                }
            } catch (Exception ex) {
                System.err.println("Gemini model '" + currentModel + "' failed: " + ex.getMessage());
                lastException = ex;
            }
        }

        throw new RuntimeException("Failed to generate document across all Gemini models: " + (lastException != null ? lastException.getMessage() : "Unknown error"), lastException);
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

    private String cleanJsonFences(String raw) {
        if (raw == null) return "";
        String cleaned = raw.trim();
        if (cleaned.startsWith("```json")) {
            cleaned = cleaned.substring(7);
        } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.substring(3);
        }
        if (cleaned.endsWith("```")) {
            cleaned = cleaned.substring(0, cleaned.length() - 3);
        }
        return cleaned.trim();
    }

    private String repairTruncatedJson(String json) {
        if (json == null || json.isBlank()) return "{}";
        String s = json.trim();
        int openBraces = 0;
        int openBrackets = 0;
        boolean inString = false;
        boolean escape = false;

        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (escape) {
                escape = false;
                continue;
            }
            if (c == '\\') {
                escape = true;
                continue;
            }
            if (c == '"') {
                inString = !inString;
                continue;
            }
            if (!inString) {
                if (c == '{') openBraces++;
                else if (c == '}') openBraces--;
                else if (c == '[') openBrackets++;
                else if (c == ']') openBrackets--;
            }
        }

        StringBuilder sb = new StringBuilder(s);
        if (inString) sb.append('"');
        while (openBrackets > 0) {
            sb.append(']');
            openBrackets--;
        }
        while (openBraces > 0) {
            sb.append('}');
            openBraces--;
        }
        return sb.toString();
    }

    private GeneratedDocumentResponse parseDocumentResponse(String content) {
        if (content == null || content.isBlank()) {
            GeneratedDocumentResponse empty = new GeneratedDocumentResponse();
            empty.setTitle("Generated Document");
            return empty;
        }

        String cleaned = cleanJsonFences(content);

        // 1. Primary strict Jackson attempt
        try {
            return objectMapper.readValue(cleaned, GeneratedDocumentResponse.class);
        } catch (Exception primaryEx) {
            System.err.println("Jackson readValue failed: " + primaryEx.getMessage() + ". Attempting JsonNode tree traversal with repaired JSON.");
        }

        // 2. Resilient JsonNode parsing with repair
        try {
            String repaired = repairTruncatedJson(cleaned);
            JsonNode root = objectMapper.readTree(repaired);
            GeneratedDocumentResponse doc = new GeneratedDocumentResponse();
            if (root.has("title")) doc.setTitle(root.get("title").asText("Generated Document"));
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
        } catch (Exception secondaryEx) {
            System.err.println("Resilient JsonNode parsing failed: " + secondaryEx.getMessage() + ". Generating emergency structured document from text.");
            
            // 3. Fallback: Wrap raw text safely so user never receives an error screen
            GeneratedDocumentResponse emergencyDoc = new GeneratedDocumentResponse();
            emergencyDoc.setTitle("Synthesized Document");
            emergencyDoc.setSummary("Generated content preview.");
            GeneratedDocumentResponse.Section section = new GeneratedDocumentResponse.Section();
            section.setHeading("Content Overview");
            section.setParagraphs(List.of(cleaned.length() > 500 ? cleaned.substring(0, 500) + "..." : cleaned));
            emergencyDoc.setSections(List.of(section));
            emergencyDoc.setConclusion("Document synthesis completed.");
            return emergencyDoc;
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
        List<String> candidateModels = getCandidateModels();
        Exception lastException = null;

        for (int i = 0; i < candidateModels.size(); i++) {
            String currentModel = candidateModels.get(i);
            String url = "https://generativelanguage.googleapis.com/v1beta/models/" + currentModel + ":generateContent?key=" + apiKey;

            try {
                ResponseEntity<Map> response = restTemplate.postForEntity(url, entity, Map.class);
                Map<String, Object> responseBody = response.getBody();
                if (responseBody == null) continue;

                List<Map<String, Object>> candidates = (List<Map<String, Object>>) responseBody.get("candidates");
                if (candidates == null || candidates.isEmpty()) continue;

                Map<String, Object> contentMap = (Map<String, Object>) candidates.get(0).get("content");
                if (contentMap == null || !contentMap.containsKey("parts")) continue;

                List<Map<String, Object>> parts = (List<Map<String, Object>>) contentMap.get("parts");
                if (parts == null || parts.isEmpty()) continue;

                return (String) parts.get(0).get("text");
            } catch (HttpStatusCodeException ex) {
                System.err.println("Gemini rewrite model '" + currentModel + "' HTTP error " + ex.getStatusCode());
                lastException = ex;
                if (ex.getStatusCode().value() == 503 || ex.getStatusCode().value() == 429) {
                    try {
                        Thread.sleep(600);
                    } catch (InterruptedException ignored) {}
                }
            } catch (Exception ex) {
                System.err.println("Gemini rewrite model '" + currentModel + "' failed: " + ex.getMessage());
                lastException = ex;
            }
        }

        throw new RuntimeException("Failed to rewrite text across all Gemini models: " + (lastException != null ? lastException.getMessage() : "Unknown error"), lastException);
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

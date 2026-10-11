package com.docify.config;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleException(Exception ex) {
        String message = ex.getMessage();
        if (message == null || message.isBlank()) {
            message = "An unexpected error occurred while processing your request.";
        }

        HttpStatus status = HttpStatus.INTERNAL_SERVER_ERROR;
        if (message.contains("503") || message.contains("experiencing high demand") || message.contains("UNAVAILABLE")) {
            status = HttpStatus.SERVICE_UNAVAILABLE;
            message = "Gemini AI service is currently experiencing high demand. Please try again in a few moments.";
        } else if (message.contains("429") || message.contains("RESOURCE_EXHAUSTED")) {
            status = HttpStatus.TOO_MANY_REQUESTS;
            message = "Gemini AI rate limit reached. Please wait a moment before trying again.";
        } else if (message.contains("API key not valid") || message.contains("API_KEY_INVALID")) {
            status = HttpStatus.UNAUTHORIZED;
            message = "Invalid Gemini API key configured on server. Please check your AI_API_KEY environment variable.";
        }

        return ResponseEntity.status(status).body(Map.of(
                "error", message,
                "status", status.value(),
                "details", ex.getMessage() != null ? ex.getMessage() : ""
        ));
    }
}

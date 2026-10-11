package com.docify.health;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/health")
public class HealthController {

    @Value("${docify.ai.model:gemini-2.5-flash}")
    private String model;

    @GetMapping
    public Map<String, Object> health() {
        return Map.of(
                "status", "UP",
                "version", "1.1.0",
                "lnaCompliant", true,
                "aiModel", model,
                "timestamp", System.currentTimeMillis()
        );
    }
}

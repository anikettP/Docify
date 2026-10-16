package com.docify.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Simple IP-based rate limiter to protect the free Gemini API quota.
 * Only applies to AI endpoints (/api/documents/generate, /ai/rewrite, /ai/chat).
 * Resets every 24 hours automatically.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class RateLimitFilter implements Filter {

    @Value("${docify.rate-limit.requests-per-day:20}")
    private int requestsPerDay;

    private static class Counter {
        final AtomicInteger count = new AtomicInteger(0);
        final Instant windowStart = Instant.now();
    }

    private final Map<String, Counter> ipCounters = new ConcurrentHashMap<>();

    private String getClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;

        String path = request.getRequestURI();

        // Only rate-limit AI generation endpoints, not health checks
        boolean isAiEndpoint = path.startsWith("/api/documents/generate")
                || path.startsWith("/api/documents/ai/");

        if (!isAiEndpoint || "OPTIONS".equalsIgnoreCase(request.getMethod())) {
            chain.doFilter(req, res);
            return;
        }

        String ip = getClientIp(request);

        // Evict expired windows (older than 24 hours) to prevent memory growth
        ipCounters.entrySet().removeIf(entry ->
                ChronoUnit.HOURS.between(entry.getValue().windowStart, Instant.now()) >= 24
        );

        Counter counter = ipCounters.computeIfAbsent(ip, k -> new Counter());

        // Reset counter if 24-hour window has passed
        if (ChronoUnit.HOURS.between(counter.windowStart, Instant.now()) >= 24) {
            ipCounters.put(ip, new Counter());
            counter = ipCounters.get(ip);
        }

        int currentCount = counter.count.incrementAndGet();

        response.setHeader("X-RateLimit-Limit", String.valueOf(requestsPerDay));
        response.setHeader("X-RateLimit-Remaining", String.valueOf(Math.max(0, requestsPerDay - currentCount)));

        if (currentCount > requestsPerDay) {
            response.setStatus(429);
            response.setContentType("application/json");
            response.getWriter().write(
                "{\"error\": \"Daily limit reached. Docify allows " + requestsPerDay + " free AI requests per day per user. Please try again tomorrow.\"}"
            );
            return;
        }

        chain.doFilter(req, res);
    }
}

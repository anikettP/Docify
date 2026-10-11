package com.docify.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Filter providing full compliance with Chromium's Local Network Access (LNA)
 * and Private Network Access (PNA) specifications.
 *
 * Ensures Chrome extension requests to localhost:8080 successfully pass
 * LNA preflight checks (OPTIONS) with Access-Control-Allow-Private-Network: true.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class LocalNetworkAccessFilter implements Filter {

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;

        String origin = request.getHeader("Origin");
        if (origin != null && !origin.isBlank()) {
            response.setHeader("Access-Control-Allow-Origin", origin);
        } else {
            response.setHeader("Access-Control-Allow-Origin", "*");
        }

        response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD");
        response.setHeader("Access-Control-Max-Age", "3600");
        response.setHeader("Access-Control-Allow-Headers",
                "Content-Type, Authorization, X-Requested-With, Accept, Origin, " +
                "Access-Control-Request-Private-Network, Access-Control-Request-Method, Access-Control-Request-Headers");
        response.setHeader("Access-Control-Allow-Credentials", "true");

        // Chrome Local Network Access (LNA / PNA) preflight check
        String pnaRequest = request.getHeader("Access-Control-Request-Private-Network");
        if ("true".equalsIgnoreCase(pnaRequest)) {
            response.setHeader("Access-Control-Allow-Private-Network", "true");
        }

        // Fast-path OPTIONS preflight requests
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            response.setStatus(HttpServletResponse.SC_NO_CONTENT);
            return;
        }

        chain.doFilter(req, res);
    }
}

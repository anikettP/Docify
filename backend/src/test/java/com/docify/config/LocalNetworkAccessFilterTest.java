package com.docify.config;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class LocalNetworkAccessFilterTest {

    private LocalNetworkAccessFilter filter;

    @BeforeEach
    void setUp() {
        filter = new LocalNetworkAccessFilter();
    }

    @Test
    void testPreflightWithLocalNetworkAccessHeader() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("OPTIONS", "/api/documents/generate");
        request.addHeader("Origin", "chrome-extension://abcdefghijklmnop");
        request.addHeader("Access-Control-Request-Private-Network", "true");

        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain filterChain = mock(FilterChain.class);

        filter.doFilter(request, response, filterChain);

        // Preflight should return 204 No Content immediately
        assertEquals(204, response.getStatus());
        assertEquals("true", response.getHeader("Access-Control-Allow-Private-Network"));
        assertEquals("chrome-extension://abcdefghijklmnop", response.getHeader("Access-Control-Allow-Origin"));
        assertTrue(response.getHeader("Access-Control-Allow-Methods").contains("POST"));
        verifyNoInteractions(filterChain);
    }

    @Test
    void testStandardPostRequestPassesThroughWithOrigin() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/documents/generate");
        request.addHeader("Origin", "http://localhost:3000");

        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain filterChain = mock(FilterChain.class);

        filter.doFilter(request, response, filterChain);

        // Request passes down the chain
        verify(filterChain).doFilter(request, response);
        assertEquals("http://localhost:3000", response.getHeader("Access-Control-Allow-Origin"));
        assertEquals("true", response.getHeader("Access-Control-Allow-Credentials"));
    }
}

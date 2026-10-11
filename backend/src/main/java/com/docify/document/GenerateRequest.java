package com.docify.document;

import lombok.Data;

@Data
public class GenerateRequest {
    private String documentType;
    private String title;
    private String sourceUrl;
    private String content;
    private String length;
    private String tone;
}

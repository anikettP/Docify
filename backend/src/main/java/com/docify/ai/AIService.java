package com.docify.ai;

import com.docify.document.GenerateRequest;
import com.docify.document.GeneratedDocumentResponse;

public interface AIService {
    GeneratedDocumentResponse generateDocument(GenerateRequest request);
    String rewriteText(String operation, String selectedText, String instruction, String documentContext);
    String chatWithDocument(String query, String documentTitle, String documentText);
}

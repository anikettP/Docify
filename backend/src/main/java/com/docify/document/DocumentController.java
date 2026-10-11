package com.docify.document;

import com.docify.ai.AIService;
import lombok.Data;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Autowired;

@Data
class RewriteRequest {
    private String operation;
    private String selectedText;
    private String instruction;
    private String documentContext;
}

@Data
class RewriteResponse {
    private String result;
    
    public RewriteResponse(String result) {
        this.result = result;
    }
}

@Data
class ChatRequest {
    private String query;
    private String documentTitle;
    private String documentText;
}

@Data
class ChatResponse {
    private String reply;

    public ChatResponse(String reply) {
        this.reply = reply;
    }
}

@RestController
@RequestMapping("/api/documents")
@CrossOrigin(origins = "*") // For MVP, allow all extension requests
public class DocumentController {

    private final AIService aiService;

    @Autowired
    public DocumentController(AIService aiService) {
        this.aiService = aiService;
    }

    @PostMapping("/generate")
    public GeneratedDocumentResponse generate(@RequestBody GenerateRequest request) {
        return aiService.generateDocument(request);
    }

    @PostMapping("/ai/rewrite")
    public RewriteResponse rewrite(@RequestBody RewriteRequest request) {
        String result = aiService.rewriteText(request.getOperation(), request.getSelectedText(), request.getInstruction(), request.getDocumentContext());
        return new RewriteResponse(result);
    }

    @PostMapping("/ai/chat")
    public ChatResponse chat(@RequestBody ChatRequest request) {
        String reply = aiService.chatWithDocument(request.getQuery(), request.getDocumentTitle(), request.getDocumentText());
        return new ChatResponse(reply);
    }
}

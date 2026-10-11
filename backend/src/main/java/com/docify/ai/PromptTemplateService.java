package com.docify.ai;

import com.docify.document.GenerateRequest;
import org.springframework.stereotype.Service;

@Service
public class PromptTemplateService {

    public String buildPrompt(GenerateRequest request) {
        return String.format(
            "You are an expert document assistant. Your task is to generate a structured '%s' based on the following web content.\n\n" +
            "Source Title: %s\n" +
            "Source URL: %s\n" +
            "Requested Length: %s\n" +
            "Requested Tone: %s\n\n" +
            "Content:\n%s\n\n" +
            "INSTRUCTIONS:\n" +
            "1. Do not invent facts, statistics, or citations.\n" +
            "2. Preserve important source information.\n" +
            "3. Use only supported information.\n" +
            "4. Return ONLY a valid JSON object matching the requested schema.\n" +
            "5. The JSON must contain: title (string), summary (string), sections (array of {heading: string, paragraphs: string[], bullets: string[]}), conclusion (string), references (array of {title: string, url: string}).\n",
            request.getDocumentType(),
            request.getTitle(),
            request.getSourceUrl(),
            request.getLength(),
            request.getTone(),
            request.getContent()
        );
    }

    public String buildRewritePrompt(String operation, String selectedText, String instruction, String documentContext) {
        String base = "You are Docify's professional editing assistant. You must modify the SELECTED TEXT based on the requested operation.\n\n" +
                "OPERATION: " + operation + "\n" +
                (instruction != null && !instruction.isEmpty() ? "CUSTOM INSTRUCTION: " + instruction + "\n" : "") +
                "DOCUMENT CONTEXT (for reference only): \n" + documentContext + "\n\n" +
                "SELECTED TEXT TO MODIFY:\n" + selectedText + "\n\n" +
                "RULES:\n" +
                "- Return ONLY the modified text.\n" +
                "- Do not include explanations or markdown formatting like ``` unless returning a code block.\n" +
                "- Preserve the core meaning but apply the requested style/operation.";
        return base;
    }

    public String buildChatPrompt(String query, String documentTitle, String documentText) {
        return "You are Docify's intelligent document assistant. Help the user understand, expand, refine, or query their document.\n\n" +
                "DOCUMENT TITLE: " + (documentTitle != null ? documentTitle : "Untitled Document") + "\n\n" +
                "DOCUMENT CONTENT:\n" + (documentText != null ? documentText : "") + "\n\n" +
                "USER INQUIRY / TASK:\n" + query + "\n\n" +
                "INSTRUCTIONS:\n" +
                "- Provide clear, concise, well-structured responses.\n" +
                "- If the user asks for a new section, draft, or additions, format them cleanly using standard Markdown so it can be easily inserted into the document.\n" +
                "- Cite claims based strictly on the document context.";
    }
}

package com.docify.document;

import lombok.Data;
import java.util.List;

@Data
public class GeneratedDocumentResponse {
    private String title;
    private String summary;
    private List<Section> sections;
    private String conclusion;
    private List<Reference> references;

    @Data
    public static class Section {
        private String heading;
        private List<String> paragraphs;
        private List<String> bullets;
    }

    @Data
    public static class Reference {
        private String title;
        private String url;
    }
}

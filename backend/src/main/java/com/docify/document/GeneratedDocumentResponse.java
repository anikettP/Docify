package com.docify.document;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class GeneratedDocumentResponse {
    private String title = "";
    private String summary = "";
    private List<Section> sections = new ArrayList<>();
    private String conclusion = "";
    private List<Reference> references = new ArrayList<>();

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Section {
        private String heading = "";
        private List<String> paragraphs = new ArrayList<>();
        private List<String> bullets = new ArrayList<>();

        // Allows Jackson to safely deserialize if LLM outputs string in sections array
        public Section(String heading) {
            this.heading = heading;
            this.paragraphs = new ArrayList<>();
            this.bullets = new ArrayList<>();
        }
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Reference {
        private String title = "";
        private String url = "";

        // Allows Jackson to safely deserialize if LLM outputs string in references array
        public Reference(String title) {
            this.title = title;
            this.url = "";
        }
    }
}

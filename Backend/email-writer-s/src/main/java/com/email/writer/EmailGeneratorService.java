package com.email.writer;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;

@Service
public class EmailGeneratorService {

    private final WebClient webClient;

    @Value("${groq.api.url}")
    private String groqApiUrl;

    @Value("${groq.api.key}")
    private String groqApiKey;

    @Value("${openai.api.url:https://api.openai.com/v1/chat/completions}")
    private String openaiApiUrl;

    @Value("${openai.api.key:}")
    private String openaiApiKey;

    @Value("${gemini.api.url:https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions}")
    private String geminiApiUrl;

    @Value("${gemini.api.key:}")
    private String geminiApiKey;

    @Value("${anthropic.api.url:https://api.anthropic.com/v1/messages}")
    private String anthropicApiUrl;

    @Value("${anthropic.api.key:}")
    private String anthropicApiKey;

    public EmailGeneratorService(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder.build();
    }

    public String generateEmailReply(EmailRequest emailRequest) {
        String provider = emailRequest.getProvider() != null ? emailRequest.getProvider().toLowerCase() : "groq";
        
        String apiUrl;
        String apiKey;
        String defaultModel;

        switch (provider) {
            case "openai":
                apiUrl = openaiApiUrl;
                apiKey = (emailRequest.getApiKey() != null && !emailRequest.getApiKey().trim().isEmpty())
                        ? emailRequest.getApiKey() : openaiApiKey;
                defaultModel = "gpt-4o-mini";
                break;
            case "gemini":
                apiUrl = geminiApiUrl;
                apiKey = (emailRequest.getApiKey() != null && !emailRequest.getApiKey().trim().isEmpty())
                        ? emailRequest.getApiKey() : geminiApiKey;
                defaultModel = "gemini-2.5-flash";
                break;
            case "claude":
            case "anthropic":
                apiUrl = anthropicApiUrl;
                apiKey = (emailRequest.getApiKey() != null && !emailRequest.getApiKey().trim().isEmpty())
                        ? emailRequest.getApiKey() : anthropicApiKey;
                defaultModel = "claude-3-5-sonnet-20241022";
                provider = "claude";
                break;
            case "groq":
            default:
                apiUrl = groqApiUrl;
                apiKey = (emailRequest.getApiKey() != null && !emailRequest.getApiKey().trim().isEmpty())
                        ? emailRequest.getApiKey() : groqApiKey;
                defaultModel = "llama-3.3-70b-versatile";
                provider = "groq"; // normalize
                break;
        }

        // Clean placeholder key so it acts as unconfigured
        if (apiKey != null && apiKey.trim().equals("your_groq_api_key_here")) {
            apiKey = null;
        }

        if (apiKey == null || apiKey.trim().isEmpty()) {
            // Fallback: search for first configured provider (ignoring placeholders)
            String cleanGroqKey = (groqApiKey != null && !groqApiKey.trim().equals("your_groq_api_key_here")) ? groqApiKey : null;
            if (cleanGroqKey != null && !cleanGroqKey.trim().isEmpty()) {
                apiUrl = groqApiUrl;
                apiKey = cleanGroqKey;
                defaultModel = "llama-3.3-70b-versatile";
                provider = "groq";
            } else if (openaiApiKey != null && !openaiApiKey.trim().isEmpty()) {
                apiUrl = openaiApiUrl;
                apiKey = openaiApiKey;
                defaultModel = "gpt-4o-mini";
                provider = "openai";
            } else if (geminiApiKey != null && !geminiApiKey.trim().isEmpty()) {
                apiUrl = geminiApiUrl;
                apiKey = geminiApiKey;
                defaultModel = "gemini-2.5-flash";
                provider = "gemini";
            } else if (anthropicApiKey != null && !anthropicApiKey.trim().isEmpty()) {
                apiUrl = anthropicApiUrl;
                apiKey = anthropicApiKey;
                defaultModel = "claude-3-5-sonnet-20241022";
                provider = "claude";
            } else {
                return generateLocalFallbackReply(emailRequest);
            }
        }

        String model = (emailRequest.getModel() != null && !emailRequest.getModel().trim().isEmpty()) 
                ? emailRequest.getModel() 
                : defaultModel;

        String prompt = buildPrompt(emailRequest);

        Map<String, Object> requestBody;
        if ("claude".equals(provider)) {
            requestBody = Map.of(
                    "model", model,
                    "max_tokens", 1024,
                    "messages", List.of(
                            Map.of("role", "user", "content", prompt)
                    )
            );
        } else {
            requestBody = Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "user", "content", prompt)
                    )
            );
        }

        try {
            WebClient.RequestBodySpec requestSpec = webClient.post()
                    .uri(apiUrl)
                    .header("Content-Type", "application/json");

            if ("claude".equals(provider)) {
                requestSpec = requestSpec.header("x-api-key", apiKey)
                        .header("anthropic-version", "2023-06-01");
            } else {
                requestSpec = requestSpec.header("Authorization", "Bearer " + apiKey);
            }

            String response = requestSpec.bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block(java.time.Duration.ofSeconds(15));
            return extractResponseContent(response, provider);
        } catch (WebClientResponseException e) {
            return provider.toUpperCase() + " API error [" + e.getStatusCode() + "]: " + e.getResponseBodyAsString();
        } catch (Exception e) {
            return "Unexpected error calling " + provider.toUpperCase() + " API: " + e.getMessage();
        }
    }

    /**
     * Checks which LLM providers have keys configured.
     */
    public Map<String, Boolean> getProviderConfigStatus() {
        boolean isGroqConfigured = groqApiKey != null && !groqApiKey.trim().isEmpty() && !groqApiKey.trim().equals("your_groq_api_key_here");
        return Map.of(
                "groq", isGroqConfigured,
                "openai", openaiApiKey != null && !openaiApiKey.trim().isEmpty(),
                "gemini", geminiApiKey != null && !geminiApiKey.trim().isEmpty(),
                "claude", anthropicApiKey != null && !anthropicApiKey.trim().isEmpty()
        );
    }

    private String extractResponseContent(String response, String provider) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode rootNode = mapper.readTree(response);
            if ("claude".equalsIgnoreCase(provider)) {
                return rootNode.path("content")
                        .get(0)
                        .path("text")
                        .asText();
            }
            return rootNode.path("choices")
                    .get(0)
                    .path("message")
                    .path("content")
                    .asText();
        } catch (Exception e) {
            return "Error processing API response: " + e.getMessage() + " | Raw response: " + response;
        }
    }

    private String buildPrompt(EmailRequest emailRequest) {
        StringBuilder prompt = new StringBuilder();
        if (emailRequest.isComposeMode()) {
            prompt.append("Write a complete email based on the following instructions. ");
            prompt.append("Respond ONLY with the email body text. Do not include any subject lines, conversational prefixes, intros, explanations, or outros. The output must be ready to insert directly into the composer. ");
        } else {
            prompt.append("Generate an appropriate email reply for the following email content. ");
            prompt.append("Respond ONLY with the direct email body text. Do not include any subject lines, conversational prefixes, intros, explanations, or outros. The reply must be ready to insert directly into the composer. ");
        }
        
        if (emailRequest.getTone() != null && !emailRequest.getTone().trim().isEmpty()) {
            prompt.append("Use a ").append(emailRequest.getTone()).append(" tone. ");
        }
        
        if (emailRequest.getLanguage() != null && !emailRequest.getLanguage().trim().isEmpty()) {
            prompt.append("Write the response strictly in ").append(emailRequest.getLanguage()).append(". ");
        }

        if (emailRequest.getCustomInstructions() != null && !emailRequest.getCustomInstructions().trim().isEmpty()) {
            prompt.append("\nSpecific User Instructions / Context: ")
                  .append(emailRequest.getCustomInstructions().trim())
                  .append("\n");
        }
        
        if (emailRequest.isComposeMode()) {
            prompt.append("\nInstructions:\n").append(emailRequest.getEmailContent());
        } else {
            prompt.append("\nOriginal email:\n").append(emailRequest.getEmailContent());
        }
        return prompt.toString();
    }

    /**
     * Generates a contextual email draft when no external LLM API keys are configured.
     */
    private String generateLocalFallbackReply(EmailRequest emailRequest) {
        String tone = emailRequest.getTone() != null ? emailRequest.getTone().toLowerCase() : "professional";
        String customPrompt = emailRequest.getCustomInstructions() != null ? emailRequest.getCustomInstructions().trim() : "";

        if (!customPrompt.isEmpty()) {
            return "Dear Recipient,\n\nThank you for reaching out. Regarding your request: " + customPrompt + "\n\nI have taken note of the instructions and will make sure everything is handled accordingly. Please feel free to let me know if you need any additional details.\n\nBest regards,\n[Your Name]";
        }

        switch (tone) {
            case "casual":
                return "Hi there,\n\nThanks for reaching out! I reviewed your message and everything looks good to me. Let me know when you're free to catch up or take the next steps.\n\nCheers,\n[Your Name]";
            case "friendly":
                return "Hello!\n\nIt was great hearing from you. Thanks so much for sharing these details! I am excited to move forward with this and will keep you posted on progress.\n\nWarm regards,\n[Your Name]";
            case "urgent":
                return "Hello,\n\nThank you for bringing this urgent matter to my attention. I am prioritizing this request immediately and will provide you with a full update shortly.\n\nBest regards,\n[Your Name]";
            case "empathetic":
                return "Dear Friend,\n\nThank you for sharing this with me. I completely understand your situation and appreciate you taking the time to explain. Please let me know how I can best support you.\n\nWarmly,\n[Your Name]";
            case "persuasive":
                return "Dear Recipient,\n\nThank you for your email. Based on our discussion, proceeding with this plan offers significant advantages and clear value. I strongly recommend taking the next step and am ready to support execution.\n\nBest regards,\n[Your Name]";
            case "professional":
            default:
                return "Dear Recipient,\n\nThank you for reaching out. I have reviewed your email and would be glad to assist with this matter. Please let me know if you require any additional information or if we should schedule a brief call to align on next steps.\n\nBest regards,\n[Your Name]";
        }
    }
}
package org.didanet.mymonday.monday;

import java.io.InputStream;
import java.net.URI;
import java.util.Map;
import java.util.function.Function;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/** Client minimale per l'API GraphQL di monday.com (https://developer.monday.com/api-reference). */
public class MondayClient {

    /** {@code fatal}: l'errore impedisce di proseguire con qualunque altra chiamata (token, interruzione). */
    public static class MondayApiException extends RuntimeException {
        private final boolean fatal;

        public MondayApiException(String message) {
            this(message, false);
        }

        public MondayApiException(String message, boolean fatal) {
            super(message);
            this.fatal = fatal;
        }

        public boolean isFatal() {
            return fatal;
        }
    }

    private static final Logger log = LoggerFactory.getLogger(MondayClient.class);
    private static final String API_URL = "https://api.monday.com/v2";
    private static final int MAX_ATTEMPTS = 6;

    private final RestClient http = RestClient.create();
    private final ObjectMapper mapper = JsonMapper.builder().build();
    private final String token;

    public MondayClient(String token) {
        this.token = token;
    }

    /** Esegue una query e restituisce il nodo {@code data}; ritenta su limiti di frequenza e complessità. */
    public JsonNode query(String query, Map<String, Object> variables) {
        String body = mapper.writeValueAsString(Map.of("query", query, "variables", variables));
        for (int attempt = 1;; attempt++) {
            try {
                String response = http.post().uri(API_URL)
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", token)
                    .body(body)
                    .retrieve()
                    .body(String.class);
                JsonNode root = mapper.readTree(response);
                JsonNode error = firstError(root);
                if (error == null) {
                    return root.path("data");
                }
                if (isThrottling(error) && attempt < MAX_ATTEMPTS) {
                    sleepSeconds(retryAfter(error));
                    continue;
                }
                throw new MondayApiException("Errore API monday: " + text(error.path("message"), error.toString()));
            } catch (RestClientResponseException e) {
                if (e.getStatusCode().isSameCodeAs(HttpStatus.UNAUTHORIZED)
                    || e.getStatusCode().isSameCodeAs(HttpStatus.FORBIDDEN)) {
                    throw new MondayApiException("Token monday non valido o senza permessi", true);
                }
                boolean retryable = e.getStatusCode().isSameCodeAs(HttpStatus.TOO_MANY_REQUESTS)
                    || e.getStatusCode().is5xxServerError();
                if (retryable && attempt < MAX_ATTEMPTS) {
                    sleepSeconds(15L * attempt);
                    continue;
                }
                throw new MondayApiException("Errore HTTP " + e.getStatusCode().value() + " da monday: "
                    + e.getResponseBodyAsString());
            }
        }
    }

    /** Scarica un file da un URL pubblico temporaneo (es. {@code public_url} degli asset). */
    public <T> T download(String publicUrl, Function<InputStream, T> consumer) {
        return http.get().uri(URI.create(publicUrl)).exchange((request, response) -> {
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new MondayApiException("Download non riuscito (HTTP " + response.getStatusCode().value() + ")");
            }
            return consumer.apply(response.getBody());
        });
    }

    public ObjectMapper mapper() {
        return mapper;
    }

    /** Valore testuale di un nodo scalare, oppure {@code fallback} se assente o nullo. */
    public static String text(JsonNode node, String fallback) {
        if (node == null || node.isMissingNode() || node.isNull() || !node.isValueNode()) {
            return fallback;
        }
        return node.asString();
    }

    public static String text(JsonNode node) {
        return text(node, null);
    }

    private static JsonNode firstError(JsonNode root) {
        JsonNode errors = root.path("errors");
        if (errors.isArray() && !errors.isEmpty()) {
            return errors.get(0);
        }
        if (root.has("error_code") || root.has("error_message")) {
            return root;
        }
        return null;
    }

    private static boolean isThrottling(JsonNode error) {
        String code = (text(error.path("extensions").path("code"), "") + " " + text(error.path("error_code"), "")
            + " " + text(error.path("message"), "")).toUpperCase();
        return code.contains("COMPLEXITY") || code.contains("RATE_LIMIT") || code.contains("RATELIMIT")
            || code.contains("BUDGET");
    }

    private static long retryAfter(JsonNode error) {
        for (JsonNode candidate : new JsonNode[] { error.path("extensions").path("retry_in_seconds"),
            error.path("extensions").path("complexity").path("reset_in_x_seconds"),
            error.path("error_data").path("retry_in_seconds") }) {
            if (candidate.isNumber()) {
                return Math.max(1, candidate.asLong());
            }
        }
        return 20;
    }

    private static void sleepSeconds(long seconds) {
        log.info("Limite API monday raggiunto, attendo {} s", seconds);
        try {
            Thread.sleep(seconds * 1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new MondayApiException("Import interrotto", true);
        }
    }
}

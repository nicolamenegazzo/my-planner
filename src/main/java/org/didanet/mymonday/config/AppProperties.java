package org.didanet.mymonday.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(Jwt jwt, Admin admin, Monday monday, Cors cors) {

    public record Jwt(String secret, Duration expiration) {
    }

    /** Utente amministratore creato al primo avvio se il database non contiene utenti. */
    public record Admin(String username, String password, String displayName) {
    }

    /** Origini ammesse per chiamate cross-origin (es. app Flutter avviata nel browser), pattern separati da virgola. */
    public record Cors(java.util.List<String> allowedOrigins) {
    }

    /** Token API usato dall'import quando l'utente non ne indica uno. */
    public record Monday(String token) {
    }
}

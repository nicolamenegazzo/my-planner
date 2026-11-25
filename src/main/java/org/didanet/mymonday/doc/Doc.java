package org.didanet.mymonday.doc;

import java.time.Instant;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Documento in Markdown; {@code folderId} nullo per i documenti fuori da cartelle. */
@Document("docs")
public record Doc(
    @Id String id,
    String title,
    String folderId,
    String content,
    String createdBy,
    Instant createdAt,
    String updatedBy,
    Instant updatedAt,
    @Indexed(sparse = true) String mondayObjectId) {

    /** Vista senza contenuto, per gli elenchi. */
    public record Summary(String id, String title, String folderId, Instant updatedAt, String updatedBy) {
    }

    public Summary summary() {
        return new Summary(id, title, folderId, updatedAt, updatedBy);
    }
}

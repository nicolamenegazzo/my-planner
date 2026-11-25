package org.didanet.mymonday.field;

import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Campo personalizzato dei task (es. "Type", "Epic", "Rif. Ticket" importati da monday.com).
 * I valori stanno in {@code Task.customFields} con chiave {@link #id()}: testo, numero, data ISO o nome dell'opzione.
 */
@Document("fields")
public record FieldDefinition(
    @Id String id,
    String name,
    FieldType type,
    List<Option> options,
    int position,
    boolean showInBoard) {

    public record Option(String name, String color) {
    }

    public List<Option> options() {
        return options == null ? List.of() : options;
    }
}

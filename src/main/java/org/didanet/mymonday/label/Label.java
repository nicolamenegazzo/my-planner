package org.didanet.mymonday.label;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Etichetta configurabile di stato o priorità, come le colonne "status" di monday.com.
 * {@code done} indica che i task con questo stato sono considerati chiusi.
 */
@Document("labels")
public record Label(
    @Id String id,
    LabelKind kind,
    String name,
    String color,
    boolean done,
    int position) {
}

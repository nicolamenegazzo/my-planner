package org.didanet.mymonday.doc;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Cartella di documenti (es. "Knowledge Base", "Note applicative"). */
@Document("doc_folders")
public record DocFolder(
    @Id String id,
    String name,
    int position,
    @Indexed(sparse = true) String mondayId) {
}

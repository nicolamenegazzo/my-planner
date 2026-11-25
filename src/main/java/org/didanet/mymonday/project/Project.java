package org.didanet.mymonday.project;

import java.time.Instant;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("projects")
public record Project(
    @Id String id,
    String name,
    String description,
    String color,
    boolean archived,
    Instant createdAt,
    @Indexed(sparse = true) String mondayBoardId) {
}

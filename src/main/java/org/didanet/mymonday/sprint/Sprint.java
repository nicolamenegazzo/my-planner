package org.didanet.mymonday.sprint;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("sprints")
public record Sprint(
    @Id String id,
    String name,
    String goal,
    LocalDate startDate,
    LocalDate endDate,
    SprintStatus status,
    Instant createdAt,
    List<String> mondayGroupKeys) {

    public Sprint withStatus(SprintStatus newStatus) {
        return new Sprint(id, name, goal, startDate, endDate, newStatus, createdAt, mondayGroupKeys);
    }

    /** Chiavi "boardId:groupId" dei gruppi monday.com confluiti in questo sprint. */
    public List<String> mondayGroupKeys() {
        return mondayGroupKeys == null ? List.of() : mondayGroupKeys;
    }
}

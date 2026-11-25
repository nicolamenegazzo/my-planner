package org.didanet.mymonday.schedule;

import java.time.LocalDateTime;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Blocco di tempo in cui un utente pianifica di lavorare su un task. */
@Document("timeslots")
public record TimeSlot(
    @Id String id,
    @Indexed String taskId,
    String userId,
    @Indexed LocalDateTime start,
    LocalDateTime end,
    String note) {
}

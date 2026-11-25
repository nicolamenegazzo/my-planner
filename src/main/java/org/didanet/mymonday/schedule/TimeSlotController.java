package org.didanet.mymonday.schedule;

import java.time.LocalDateTime;
import java.util.List;

import org.didanet.mymonday.task.TaskRepository;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@RestController
@RequestMapping("/api/slots")
public class TimeSlotController {

    /** {@code userId} nullo: lo slot viene assegnato all'utente corrente. */
    public record SlotRequest(@NotBlank String taskId, String userId, @NotNull LocalDateTime start,
        @NotNull LocalDateTime end, String note) {
    }

    private final TimeSlotRepository slots;
    private final TaskRepository tasks;
    private final MongoTemplate mongo;

    public TimeSlotController(TimeSlotRepository slots, TaskRepository tasks, MongoTemplate mongo) {
        this.slots = slots;
        this.tasks = tasks;
        this.mongo = mongo;
    }

    /** Slot che si sovrappongono all'intervallo [from, to). */
    @GetMapping
    public List<TimeSlot> list(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
        @RequestParam(required = false) String userId) {
        Query query = Query.query(Criteria.where("start").lt(to).and("end").gt(from));
        if (userId != null) {
            query.addCriteria(Criteria.where("userId").is(userId));
        }
        return mongo.find(query.with(Sort.by("start")), TimeSlot.class);
    }

    @GetMapping("/by-task/{taskId}")
    public List<TimeSlot> byTask(@PathVariable String taskId) {
        return slots.findByTaskIdOrderByStart(taskId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TimeSlot create(@Valid @RequestBody SlotRequest req, @AuthenticationPrincipal Jwt jwt) {
        validate(req);
        String userId = req.userId() != null ? req.userId() : jwt.getSubject();
        return slots.save(new TimeSlot(null, req.taskId(), userId, req.start(), req.end(), req.note()));
    }

    @PutMapping("/{id}")
    public TimeSlot update(@PathVariable String id, @Valid @RequestBody SlotRequest req) {
        TimeSlot existing = slots.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        validate(req);
        String userId = req.userId() != null ? req.userId() : existing.userId();
        return slots.save(new TimeSlot(id, req.taskId(), userId, req.start(), req.end(), req.note()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        slots.deleteById(id);
    }

    private void validate(SlotRequest req) {
        if (!req.end().isAfter(req.start())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La fine dello slot deve seguire l'inizio");
        }
        if (!tasks.existsById(req.taskId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Task inesistente");
        }
    }
}

package org.didanet.mymonday.sprint;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.didanet.mymonday.task.TaskService;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@RestController
@RequestMapping("/api/sprints")
public class SprintController {

    public record SprintRequest(@NotBlank String name, String goal, @NotNull LocalDate startDate,
        @NotNull LocalDate endDate) {
    }

    /** {@code moveToSprintId} nullo: i task non completati tornano nel backlog. */
    public record CloseSprintRequest(String moveToSprintId) {
    }

    private final SprintRepository sprints;
    private final TaskService taskService;

    public SprintController(SprintRepository sprints, TaskService taskService) {
        this.sprints = sprints;
        this.taskService = taskService;
    }

    @GetMapping
    public List<Sprint> list() {
        return sprints.findAll(Sort.by(Sort.Direction.DESC, "startDate"));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Sprint create(@Valid @RequestBody SprintRequest req) {
        validateDates(req);
        return sprints.save(new Sprint(null, req.name(), req.goal(), req.startDate(), req.endDate(),
            SprintStatus.PLANNED, Instant.now(), null));
    }

    @PutMapping("/{id}")
    public Sprint update(@PathVariable String id, @Valid @RequestBody SprintRequest req) {
        validateDates(req);
        Sprint existing = find(id);
        return sprints.save(new Sprint(id, req.name(), req.goal(), req.startDate(), req.endDate(), existing.status(),
            existing.createdAt(), existing.mondayGroupKeys()));
    }

    @PostMapping("/{id}/start")
    public Sprint start(@PathVariable String id) {
        Sprint sprint = find(id);
        if (sprint.status() != SprintStatus.PLANNED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Si possono avviare solo sprint pianificati");
        }
        if (sprints.existsByStatus(SprintStatus.ACTIVE)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "C'è già uno sprint attivo: chiudilo prima");
        }
        return sprints.save(sprint.withStatus(SprintStatus.ACTIVE));
    }

    @PostMapping("/{id}/close")
    public Sprint close(@PathVariable String id, @RequestBody CloseSprintRequest req) {
        Sprint sprint = find(id);
        if (sprint.status() != SprintStatus.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Lo sprint non è attivo");
        }
        String target = req.moveToSprintId();
        if (target != null) {
            Sprint next = find(target);
            if (next.status() == SprintStatus.CLOSED || next.id().equals(id)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sprint di destinazione non valido");
            }
        }
        taskService.moveUnfinished(id, target);
        return sprints.save(sprint.withStatus(SprintStatus.CLOSED));
    }

    /** Elimina lo sprint riportando i suoi task nel backlog. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        taskService.detachFromSprint(id);
        sprints.deleteById(id);
    }

    private Sprint find(String id) {
        return sprints.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private static void validateDates(SprintRequest req) {
        if (req.endDate().isBefore(req.startDate())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La data di fine precede quella di inizio");
        }
    }
}

package org.didanet.mymonday.label;

import java.util.List;

import org.didanet.mymonday.task.Task;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
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
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

@RestController
@RequestMapping("/api/labels")
public class LabelController {

    public record LabelRequest(@NotNull LabelKind kind, @NotBlank String name,
        @NotBlank @Pattern(regexp = "^#[0-9a-fA-F]{6}$") String color, boolean done) {
    }

    public record OrderRequest(@NotNull LabelKind kind, @NotEmpty List<String> ids) {
    }

    private final LabelRepository labels;
    private final LabelService labelService;
    private final MongoTemplate mongo;

    public LabelController(LabelRepository labels, LabelService labelService, MongoTemplate mongo) {
        this.labels = labels;
        this.labelService = labelService;
        this.mongo = mongo;
    }

    @GetMapping
    public List<Label> list() {
        return labels.findAll(Sort.by("kind", "position"));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    public Label create(@Valid @RequestBody LabelRequest req) {
        int position = labelService.list(req.kind()).stream().mapToInt(Label::position).max().orElse(-1) + 1;
        return labels.save(new Label(null, req.kind(), req.name().trim(), req.color(), req.done(), position));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public Label update(@PathVariable String id, @Valid @RequestBody LabelRequest req) {
        Label existing = find(id);
        return labels.save(new Label(id, existing.kind(), req.name().trim(), req.color(),
            existing.kind() == LabelKind.STATUS && req.done(), existing.position()));
    }

    /** Riordina le etichette di un tipo; l'ordine degli stati è quello delle colonne del kanban. */
    @PutMapping("/order")
    @PreAuthorize("hasRole('ADMIN')")
    public List<Label> reorder(@Valid @RequestBody OrderRequest req) {
        List<Label> current = labelService.list(req.kind());
        List<Label> updated = current.stream().map(l -> {
            int idx = req.ids().indexOf(l.id());
            return new Label(l.id(), l.kind(), l.name(), l.color(), l.done(), idx >= 0 ? idx : req.ids().size() + l.position());
        }).toList();
        labels.saveAll(updated);
        return labelService.list(req.kind());
    }

    /**
     * Elimina un'etichetta. Se è in uso serve {@code replaceWith}: i task vengono spostati su quell'etichetta
     * (per le priorità un valore vuoto toglie la priorità).
     */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable String id, @RequestParam(required = false) String replaceWith) {
        Label label = find(id);
        String field = label.kind() == LabelKind.STATUS ? "status" : "priority";
        Query usedBy = Query.query(new Criteria().orOperator(
            Criteria.where(field).is(id), Criteria.where("subtasks.status").is(id)));
        long used = mongo.count(usedBy, Task.class);
        String replacement = replaceWith == null || replaceWith.isBlank() ? null : replaceWith;

        if (label.kind() == LabelKind.STATUS && labelService.list(LabelKind.STATUS).size() == 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Deve restare almeno uno stato");
        }
        if (used > 0) {
            if (replaceWith == null || (replacement == null && label.kind() == LabelKind.STATUS)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Etichetta usata da " + used + " task: scegli con quale sostituirla");
            }
            if (replacement != null && !labelService.exists(label.kind(), replacement)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Etichetta sostitutiva non valida");
            }
            mongo.updateMulti(Query.query(Criteria.where(field).is(id)), Update.update(field, replacement), Task.class);
            if (label.kind() == LabelKind.STATUS) {
                mongo.updateMulti(Query.query(Criteria.where("subtasks.status").is(id)),
                    new Update().set("subtasks.$[s].status", replacement).filterArray(Criteria.where("s.status").is(id)),
                    Task.class);
            }
        }
        labels.deleteById(id);
    }

    private Label find(String id) {
        return labels.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}

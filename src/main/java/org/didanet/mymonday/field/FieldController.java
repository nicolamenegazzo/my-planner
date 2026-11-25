package org.didanet.mymonday.field;

import java.util.List;

import org.didanet.mymonday.task.Task;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@RestController
@RequestMapping("/api/fields")
public class FieldController {

    public record FieldRequest(@NotBlank String name, @NotNull FieldType type, List<FieldDefinition.Option> options,
        Integer position, boolean showInBoard) {
    }

    private final FieldRepository fields;
    private final FieldService fieldService;
    private final MongoTemplate mongo;

    public FieldController(FieldRepository fields, FieldService fieldService, MongoTemplate mongo) {
        this.fields = fields;
        this.fieldService = fieldService;
        this.mongo = mongo;
    }

    @GetMapping
    public List<FieldDefinition> list() {
        return fieldService.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    public FieldDefinition create(@Valid @RequestBody FieldRequest req) {
        int position = req.position() != null ? req.position()
            : fieldService.list().stream().mapToInt(FieldDefinition::position).max().orElse(-1) + 1;
        return fields.save(new FieldDefinition(null, req.name().trim(), req.type(), cleanOptions(req), position,
            req.showInBoard()));
    }

    /** Il tipo non è modificabile: cambierebbe il significato dei valori già salvati. */
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public FieldDefinition update(@PathVariable String id, @Valid @RequestBody FieldRequest req) {
        FieldDefinition existing = fields.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return fields.save(new FieldDefinition(id, req.name().trim(), existing.type(), cleanOptions(req),
            req.position() != null ? req.position() : existing.position(), req.showInBoard()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable String id) {
        mongo.updateMulti(Query.query(Criteria.where("customFields." + id).exists(true)),
            new Update().unset("customFields." + id), Task.class);
        fields.deleteById(id);
    }

    private static List<FieldDefinition.Option> cleanOptions(FieldRequest req) {
        if (req.type() != FieldType.LABEL || req.options() == null) {
            return List.of();
        }
        return req.options().stream().filter(o -> o.name() != null && !o.name().isBlank()).toList();
    }
}

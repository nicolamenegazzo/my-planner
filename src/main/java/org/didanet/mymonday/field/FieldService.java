package org.didanet.mymonday.field;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

@Service
public class FieldService {

    private final FieldRepository fields;

    public FieldService(FieldRepository fields) {
        this.fields = fields;
    }

    public List<FieldDefinition> list() {
        return fields.findAll(Sort.by("position"));
    }

    /** Campo con lo stesso nome e tipo, oppure uno nuovo in coda. */
    public FieldDefinition findOrCreate(String name, FieldType type, boolean showInBoard) {
        List<FieldDefinition> all = list();
        return all.stream()
            .filter(f -> f.type() == type && f.name().equalsIgnoreCase(name.trim()))
            .findFirst()
            .orElseGet(() -> fields.save(new FieldDefinition(null, name.trim(), type, List.of(),
                all.stream().mapToInt(FieldDefinition::position).max().orElse(-1) + 1, showInBoard)));
    }

    /** Aggiunge a un campo LABEL le opzioni mancanti (confronto senza distinzione di maiuscole). */
    public FieldDefinition addOptions(FieldDefinition field, Collection<FieldDefinition.Option> options) {
        List<FieldDefinition.Option> merged = new ArrayList<>(field.options());
        boolean changed = false;
        for (FieldDefinition.Option o : options) {
            if (o.name() == null || o.name().isBlank()) {
                continue;
            }
            if (merged.stream().noneMatch(m -> m.name().equalsIgnoreCase(o.name().trim()))) {
                merged.add(new FieldDefinition.Option(o.name().trim(), o.color()));
                changed = true;
            }
        }
        if (!changed) {
            return field;
        }
        return fields.save(new FieldDefinition(field.id(), field.name(), field.type(), merged, field.position(),
            field.showInBoard()));
    }
}

package org.didanet.mymonday.label;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

@Service
public class LabelService {

    /** Nomi che, in import, identificano uno stato "chiuso". */
    private static final Pattern DONE_NAMES = Pattern.compile(
        "^(done|fatto|completat[oa]|completed|chiuso|closed|rejected|annullat[oa]|cancell?ed|rilasciato|deployed)$");

    private final LabelRepository labels;

    public LabelService(LabelRepository labels) {
        this.labels = labels;
    }

    /** Etichette iniziali: gli id coincidono con i valori delle versioni precedenti, quindi i task esistenti restano validi. */
    public void seedDefaults() {
        if (labels.countByKind(LabelKind.STATUS) == 0) {
            labels.saveAll(List.of(
                new Label("TODO", LabelKind.STATUS, "Da fare", "#c4c4c4", false, 0),
                new Label("IN_PROGRESS", LabelKind.STATUS, "In corso", "#fdab3d", false, 1),
                new Label("STUCK", LabelKind.STATUS, "Bloccato", "#e2445c", false, 2),
                new Label("REVIEW", LabelKind.STATUS, "In revisione", "#579bfc", false, 3),
                new Label("DONE", LabelKind.STATUS, "Fatto", "#00c875", true, 4)));
        }
        if (labels.countByKind(LabelKind.PRIORITY) == 0) {
            labels.saveAll(List.of(
                new Label("CRITICAL", LabelKind.PRIORITY, "Critica", "#333333", false, 0),
                new Label("HIGH", LabelKind.PRIORITY, "Alta", "#401694", false, 1),
                new Label("MEDIUM", LabelKind.PRIORITY, "Media", "#5559df", false, 2),
                new Label("LOW", LabelKind.PRIORITY, "Bassa", "#579bfc", false, 3)));
        }
    }

    public List<Label> list(LabelKind kind) {
        return labels.findByKindOrderByPosition(kind);
    }

    public Set<String> doneStatusIds() {
        return list(LabelKind.STATUS).stream().filter(Label::done).map(Label::id).collect(Collectors.toSet());
    }

    public String defaultStatusId() {
        return list(LabelKind.STATUS).stream().findFirst().map(Label::id)
            .orElseThrow(() -> new IllegalStateException("Nessuna etichetta di stato configurata"));
    }

    public boolean exists(LabelKind kind, String id) {
        return id != null && labels.findById(id).filter(l -> l.kind() == kind).isPresent();
    }

    /** Cerca un'etichetta per nome (senza distinzione di maiuscole) e la crea in coda se manca. */
    public Label findOrCreate(LabelKind kind, String name, String color) {
        List<Label> existing = list(kind);
        Optional<Label> match = existing.stream().filter(l -> l.name().equalsIgnoreCase(name.trim())).findFirst();
        if (match.isPresent()) {
            return match.get();
        }
        boolean done = kind == LabelKind.STATUS && DONE_NAMES.matcher(name.trim().toLowerCase(Locale.ROOT)).matches();
        int position = existing.stream().mapToInt(Label::position).max().orElse(-1) + 1;
        return labels.save(new Label(null, kind, name.trim(), color != null ? color : "#c4c4c4", done, position));
    }
}

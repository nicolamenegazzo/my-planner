package org.didanet.mymonday.monday;

import java.net.URLConnection;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

import org.didanet.mymonday.doc.Doc;
import org.didanet.mymonday.doc.DocFolder;
import org.didanet.mymonday.doc.DocFolderRepository;
import org.didanet.mymonday.doc.DocRepository;
import org.didanet.mymonday.field.FieldDefinition;
import org.didanet.mymonday.field.FieldService;
import org.didanet.mymonday.field.FieldType;
import org.didanet.mymonday.file.FileStorage;
import org.didanet.mymonday.label.Label;
import org.didanet.mymonday.label.LabelKind;
import org.didanet.mymonday.label.LabelService;
import org.didanet.mymonday.project.Project;
import org.didanet.mymonday.project.ProjectRepository;
import org.didanet.mymonday.sprint.Sprint;
import org.didanet.mymonday.sprint.SprintRepository;
import org.didanet.mymonday.sprint.SprintStatus;
import org.didanet.mymonday.task.Task;
import org.didanet.mymonday.task.TaskRepository;
import org.didanet.mymonday.user.Role;
import org.didanet.mymonday.user.User;
import org.didanet.mymonday.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.JsonNode;

/**
 * Importa da monday.com board (come progetti, con gruppi → sprint, elementi → task, sottoelementi, aggiornamenti
 * e allegati) e documenti (come Markdown, mantenendo le cartelle). L'import è ripetibile: ogni oggetto conserva
 * l'id monday e viene aggiornato invece che duplicato; i dati creati solo in MyMonday non vengono toccati.
 */
@Service
public class MondayImportService {

    public record BoardInfo(String id, String name, int itemsCount, String folderId) {
    }

    public record FolderInfo(String id, String name) {
    }

    public record DocInfo(String id, String objectId, String name, String folderId) {
    }

    public record WorkspaceInfo(String id, String name, List<BoardInfo> boards, List<FolderInfo> folders,
        List<DocInfo> docs) {
    }

    public record Catalog(String account, List<WorkspaceInfo> workspaces) {
    }

    private static final Logger log = LoggerFactory.getLogger(MondayImportService.class);

    private static final String ITEM_FIELDS = """
        fragment ItemFields on Item {
          id name created_at updated_at group { id }
          column_values { id type text value }
          assets { id name public_url }
          subitems { id name created_at column_values { id type text value } }
          updates(limit: 100) {
            id text_body created_at creator_id
            assets { id name public_url }
            replies { id text_body created_at creator_id }
          }
        }
        """;
    private static final String FIRST_ITEMS_PAGE = ITEM_FIELDS + """
        query ($board: [ID!], $limit: Int!) {
          boards(ids: $board) { items_page(limit: $limit) { cursor items { ...ItemFields } } }
        }
        """;
    private static final String NEXT_ITEMS_PAGE = ITEM_FIELDS + """
        query ($cursor: String!, $limit: Int!) {
          next_items_page(cursor: $cursor, limit: $limit) { cursor items { ...ItemFields } }
        }
        """;
    private static final String BOARD_META = """
        query ($board: [ID!]) {
          boards(ids: $board) { id name description columns { id title type settings_str } groups { id title color } }
        }
        """;
    private static final String DOC_PAGE = """
        query ($ids: [ID!], $page: Int!) {
          docs(ids: $ids) {
            id object_id name doc_folder_id created_at created_by { id }
            blocks(limit: 100, page: $page) { id type content parent_block_id position }
          }
        }
        """;
    private static final int ITEMS_PAGE_SIZE = 25;
    private static final int BLOCKS_PAGE_SIZE = 100;
    private static final String GROUP_FIELD = "Gruppo monday";
    private static final List<String> PROJECT_COLORS = List.of("#579bfc", "#00c875", "#fdab3d", "#e2445c",
        "#a25ddc", "#037f4c", "#ff158a", "#bb3354", "#ff642e", "#66ccff", "#784bd1", "#cab641");
    private static final Set<String> SKIPPED_COLUMNS = Set.of("name", "subtasks", "item_id", "creation_log",
        "last_updated", "progress", "formula", "button", "doc", "direct_doc", "mirror", "auto_number", "color_picker",
        "file");
    private static final Pattern STATUS_TITLE = Pattern.compile("(?i)^(status|stato)$");
    private static final Pattern PRIORITY_TITLE = Pattern.compile("(?i)priorit");
    private static final Pattern HOURS_TITLE = Pattern.compile("(?i)(\\(h\\)|\\bore\\b|hours?\\b)");
    private static final Pattern ACTUAL_TITLE = Pattern.compile("(?i)(effettiv|actual|reale|spent|consuntiv)");
    private static final Pattern DUE_TITLE = Pattern.compile("(?i)(scadenza|due|deadline)");

    private final ProjectRepository projects;
    private final SprintRepository sprints;
    private final TaskRepository tasks;
    private final UserRepository users;
    private final DocRepository docs;
    private final DocFolderRepository folders;
    private final LabelService labels;
    private final FieldService fields;
    private final FileStorage files;
    private final PasswordEncoder passwordEncoder;
    private final Map<String, ImportJob> jobs = new ConcurrentHashMap<>();

    public MondayImportService(ProjectRepository projects, SprintRepository sprints, TaskRepository tasks,
        UserRepository users, DocRepository docs, DocFolderRepository folders, LabelService labels,
        FieldService fields, FileStorage files, PasswordEncoder passwordEncoder) {
        this.projects = projects;
        this.sprints = sprints;
        this.tasks = tasks;
        this.users = users;
        this.docs = docs;
        this.folders = folders;
        this.labels = labels;
        this.fields = fields;
        this.files = files;
        this.passwordEncoder = passwordEncoder;
    }

    // ---------------------------------------------------------------- catalogo

    /** Workspace, board di task, cartelle e documenti disponibili per l'import. */
    public Catalog catalog(String token) {
        MondayClient client = new MondayClient(token);
        JsonNode root = client.query("query { me { name email } workspaces(limit: 100) { id name } }", Map.of());
        List<WorkspaceInfo> workspaces = new ArrayList<>();
        for (JsonNode ws : root.path("workspaces")) {
            String wsId = MondayClient.text(ws.path("id"));
            List<String> wsIds = List.of(wsId);

            List<BoardInfo> boards = new ArrayList<>();
            for (int page = 1;; page++) {
                JsonNode result = client.query("""
                    query ($ws: [ID], $page: Int!) {
                      boards(workspace_ids: $ws, limit: 100, page: $page, state: active) {
                        id name type items_count board_folder_id
                      }
                    }""", Map.of("ws", wsIds, "page", page)).path("boards");
                for (JsonNode b : result) {
                    if ("board".equals(MondayClient.text(b.path("type")))) {
                        boards.add(new BoardInfo(MondayClient.text(b.path("id")), MondayClient.text(b.path("name")),
                            b.path("items_count").asInt(0), MondayClient.text(b.path("board_folder_id"))));
                    }
                }
                if (result.size() < 100) {
                    break;
                }
            }

            List<FolderInfo> wsFolders = new ArrayList<>();
            for (JsonNode f : client.query("query ($ws: [ID]) { folders(workspace_ids: $ws, limit: 100) { id name } }",
                Map.of("ws", wsIds)).path("folders")) {
                wsFolders.add(new FolderInfo(MondayClient.text(f.path("id")), MondayClient.text(f.path("name"))));
            }

            List<DocInfo> wsDocs = new ArrayList<>();
            for (int page = 1;; page++) {
                JsonNode result = client.query("""
                    query ($ws: [ID], $page: Int!) {
                      docs(workspace_ids: $ws, limit: 100, page: $page) { id object_id name doc_folder_id }
                    }""", Map.of("ws", wsIds, "page", page)).path("docs");
                for (JsonNode d : result) {
                    wsDocs.add(new DocInfo(MondayClient.text(d.path("id")), MondayClient.text(d.path("object_id")),
                        MondayClient.text(d.path("name")), MondayClient.text(d.path("doc_folder_id"))));
                }
                if (result.size() < 100) {
                    break;
                }
            }
            workspaces.add(new WorkspaceInfo(wsId, MondayClient.text(ws.path("name")), boards, wsFolders, wsDocs));
        }
        JsonNode me = root.path("me");
        return new Catalog(MondayClient.text(me.path("name"), "") + " <" + MondayClient.text(me.path("email"), "") + ">",
            workspaces);
    }

    // ---------------------------------------------------------------- job

    public synchronized ImportJob start(String token, List<String> boardIds, List<String> docIds, String userId) {
        if (jobs.values().stream().anyMatch(j -> j.status() == ImportJob.Status.RUNNING)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "C'è già un import in corso");
        }
        ImportJob job = new ImportJob();
        jobs.put(job.id(), job);
        MondayClient client = new MondayClient(token);
        Thread.ofVirtual().name("monday-import").start(() -> run(job, client, boardIds, docIds, userId));
        return job;
    }

    public Optional<ImportJob> job(String id) {
        return Optional.ofNullable(jobs.get(id));
    }

    private void run(ImportJob job, MondayClient client, List<String> boardIds, List<String> docIds, String userId) {
        Run run = new Run(job, client, userId);
        try {
            job.log("Avvio import: " + boardIds.size() + " board, " + docIds.size() + " documenti");
            importUsers(run);
            for (String boardId : boardIds) {
                try {
                    importBoard(run, boardId);
                } catch (RuntimeException e) {
                    rethrowIfFatal(e);
                    log.error("Import board {} fallito", boardId, e);
                    job.log("ERRORE board " + boardId + ": " + e.getMessage());
                    job.count("errori");
                }
            }
            for (String docId : docIds) {
                try {
                    importDoc(run, docId);
                } catch (RuntimeException e) {
                    rethrowIfFatal(e);
                    log.error("Import documento {} fallito", docId, e);
                    job.log("ERRORE documento " + docId + ": " + e.getMessage());
                    job.count("errori");
                }
            }
            job.log("Import completato");
            job.finish(ImportJob.Status.DONE);
        } catch (RuntimeException e) {
            log.error("Import monday interrotto", e);
            job.log("Import interrotto: " + e.getMessage());
            job.finish(ImportJob.Status.FAILED);
        }
    }

    private static void rethrowIfFatal(RuntimeException e) {
        if (e instanceof MondayClient.MondayApiException api && api.isFatal()) {
            throw api;
        }
    }

    /** Stato condiviso durante un'esecuzione: mappe id monday → id MyMonday e cache delle etichette. */
    private final class Run {
        final ImportJob job;
        final MondayClient client;
        final String importingUserId;
        String meId;
        final Map<String, String> userIds = new HashMap<>();
        final Map<String, Optional<String>> groupSprints = new HashMap<>();
        final Map<String, Label> labelCache = new HashMap<>();
        final Map<String, String> folderIds = new HashMap<>();

        Run(ImportJob job, MondayClient client, String importingUserId) {
            this.job = job;
            this.client = client;
            this.importingUserId = importingUserId;
        }

        Label label(LabelKind kind, String name, String color) {
            return labelCache.computeIfAbsent(kind + ":" + name.trim().toLowerCase(),
                k -> labels.findOrCreate(kind, name, color));
        }

        String userId(String mondayId) {
            if (mondayId == null) {
                return null;
            }
            return userIds.computeIfAbsent(mondayId, id -> resolveUser(this, id, "Utente monday " + id, null));
        }
    }

    // ---------------------------------------------------------------- utenti

    private void importUsers(Run run) {
        run.meId = MondayClient.text(run.client.query("query { me { id } }", Map.of()).path("me").path("id"));
        int count = 0;
        for (int page = 1;; page++) {
            JsonNode result = run.client.query(
                "query ($page: Int!) { users(kind: all, limit: 100, page: $page) { id name email } }",
                Map.of("page", page)).path("users");
            for (JsonNode u : result) {
                String id = MondayClient.text(u.path("id"));
                run.userIds.put(id, resolveUser(run, id, MondayClient.text(u.path("name"), "Utente monday " + id),
                    MondayClient.text(u.path("email"))));
                count++;
            }
            if (result.size() < 100) {
                break;
            }
        }
        run.job.log("Utenti monday associati: " + count);
    }

    /**
     * Associa un utente monday a un utente MyMonday: per id monday, poi per email, poi (per il proprietario del
     * token) all'utente che esegue l'import; altrimenti crea un utente disattivato, da abilitare a mano.
     */
    private String resolveUser(Run run, String mondayId, String name, String email) {
        Optional<User> found = users.findByMondayId(mondayId);
        if (found.isEmpty() && email != null) {
            found = users.findFirstByEmailIgnoreCase(email).filter(u -> u.mondayId() == null)
                .map(u -> users.save(u.withMondayId(mondayId)));
        }
        if (found.isEmpty() && mondayId.equals(run.meId)) {
            found = users.findById(run.importingUserId).filter(u -> u.mondayId() == null)
                .map(u -> users.save(u.withMondayId(mondayId)));
        }
        if (found.isPresent()) {
            return found.get().id();
        }
        String username = email != null ? email.toLowerCase() : "monday-" + mondayId;
        if (users.existsByUsername(username)) {
            username = username + "-" + mondayId;
        }
        User created = users.save(new User(null, username, name, email,
            passwordEncoder.encode(UUID.randomUUID().toString()), Set.of(Role.USER), false, Instant.now(), mondayId));
        run.job.count("utenti creati");
        return created.id();
    }

    // ---------------------------------------------------------------- board

    /** Come vengono usate le colonne di un board. */
    private static final class ColumnPlan {
        String status;
        String priority;
        String people;
        String timeline;
        String dueDate;
        String estimate;
        String actual;
        final Map<String, FieldDefinition> custom = new LinkedHashMap<>();
        final Map<String, String> customTypes = new HashMap<>();
    }

    private void importBoard(Run run, String boardId) {
        JsonNode board = run.client.query(BOARD_META, Map.of("board", List.of(boardId))).path("boards").path(0);
        if (board.isMissingNode()) {
            run.job.log("Board " + boardId + " non trovato o non accessibile");
            return;
        }
        String boardName = MondayClient.text(board.path("name"), "Board " + boardId);
        run.job.log("Board \"" + boardName + "\": lettura struttura");

        Project project = projects.findByMondayBoardId(boardId).orElseGet(() -> {
            run.job.count("progetti");
            return projects.save(new Project(null, boardName, MondayClient.text(board.path("description")),
                PROJECT_COLORS.get((int) (projects.count() % PROJECT_COLORS.size())), false, Instant.now(), boardId));
        });
        ColumnPlan plan = planColumns(run, board.path("columns"));

        Map<String, JsonNode> groups = new HashMap<>();
        List<FieldDefinition.Option> groupOptions = new ArrayList<>();
        for (JsonNode g : board.path("groups")) {
            groups.put(MondayClient.text(g.path("id")), g);
            groupOptions.add(new FieldDefinition.Option(MondayClient.text(g.path("title")),
                MondayClient.text(g.path("color"), "#c4c4c4")));
        }
        FieldDefinition groupField = fields.addOptions(fields.findOrCreate(GROUP_FIELD, FieldType.LABEL, false),
            groupOptions);

        int index = 0;
        JsonNode page = run.client.query(FIRST_ITEMS_PAGE, Map.of("board", List.of(boardId), "limit", ITEMS_PAGE_SIZE))
            .path("boards").path(0).path("items_page");
        while (true) {
            for (JsonNode item : page.path("items")) {
                upsertTask(run, boardId, item, project, plan, groups, groupField, index++);
            }
            run.job.log("Board \"" + boardName + "\": " + index + " elementi elaborati");
            String cursor = MondayClient.text(page.path("cursor"));
            if (cursor == null) {
                break;
            }
            page = run.client.query(NEXT_ITEMS_PAGE, Map.of("cursor", cursor, "limit", ITEMS_PAGE_SIZE))
                .path("next_items_page");
        }
    }

    private ColumnPlan planColumns(Run run, JsonNode columns) {
        ColumnPlan plan = new ColumnPlan();
        boolean hasTimeline = false;
        for (JsonNode c : columns) {
            hasTimeline |= "timeline".equals(MondayClient.text(c.path("type")));
        }
        for (JsonNode c : columns) {
            String id = MondayClient.text(c.path("id"));
            String title = MondayClient.text(c.path("title"), id);
            String type = MondayClient.text(c.path("type"), "");
            if (SKIPPED_COLUMNS.contains(type)) {
                continue;
            }
            JsonNode settings = run.client.mapper().readTree(MondayClient.text(c.path("settings_str"), "{}"));
            switch (type) {
                case "status" -> {
                    if (plan.status == null && STATUS_TITLE.matcher(title).find()) {
                        plan.status = id;
                        statusOptions(settings).forEach(o -> run.label(LabelKind.STATUS, o.name(), o.color()));
                    } else if (plan.priority == null && PRIORITY_TITLE.matcher(title).find()) {
                        plan.priority = id;
                        statusOptions(settings).forEach(o -> run.label(LabelKind.PRIORITY, o.name(), o.color()));
                    } else {
                        addCustom(plan, id, type, fields.addOptions(
                            fields.findOrCreate(title, FieldType.LABEL, true), statusOptions(settings)));
                    }
                }
                case "people" -> {
                    if (plan.people == null) {
                        plan.people = id;
                    } else {
                        addCustom(plan, id, type, fields.findOrCreate(title, FieldType.TEXT, false));
                    }
                }
                case "timeline" -> {
                    if (plan.timeline == null) {
                        plan.timeline = id;
                    } else {
                        addCustom(plan, id, type, fields.findOrCreate(title, FieldType.TEXT, false));
                    }
                }
                case "date" -> {
                    if (plan.dueDate == null && (DUE_TITLE.matcher(title).find() || !hasTimeline)) {
                        plan.dueDate = id;
                    } else {
                        addCustom(plan, id, type, fields.findOrCreate(title, FieldType.DATE, false));
                    }
                }
                case "numbers" -> {
                    boolean hours = HOURS_TITLE.matcher(title).find();
                    if (hours && ACTUAL_TITLE.matcher(title).find() && plan.actual == null) {
                        plan.actual = id;
                    } else if (hours && plan.estimate == null) {
                        plan.estimate = id;
                    } else {
                        addCustom(plan, id, type, fields.findOrCreate(title, FieldType.NUMBER, false));
                    }
                }
                default -> addCustom(plan, id, type, fields.findOrCreate(title, FieldType.TEXT,
                    type.equals("text") || type.equals("link")));
            }
        }
        return plan;
    }

    private static void addCustom(ColumnPlan plan, String columnId, String type, FieldDefinition field) {
        plan.custom.put(columnId, field);
        plan.customTypes.put(columnId, type);
    }

    /** Etichette di una colonna status, nell'ordine mostrato da monday, escluse quelle vuote. */
    private static List<FieldDefinition.Option> statusOptions(JsonNode settings) {
        JsonNode names = settings.path("labels");
        JsonNode colors = settings.path("labels_colors");
        JsonNode positions = settings.path("labels_positions_v2");
        List<Map.Entry<String, JsonNode>> entries = new ArrayList<>(names.properties());
        entries.sort(Comparator.comparingInt(e -> positions.path(e.getKey()).asInt(Integer.parseInt(e.getKey()))));
        List<FieldDefinition.Option> options = new ArrayList<>();
        for (Map.Entry<String, JsonNode> e : entries) {
            String name = MondayClient.text(e.getValue(), "");
            if (!name.isBlank()) {
                options.add(new FieldDefinition.Option(name, MondayClient.text(colors.path(e.getKey()).path("color"),
                    "#c4c4c4")));
            }
        }
        return options;
    }

    // ---------------------------------------------------------------- elementi

    private void upsertTask(Run run, String boardId, JsonNode item, Project project, ColumnPlan plan,
        Map<String, JsonNode> groups, FieldDefinition groupField, int index) {
        String mondayId = MondayClient.text(item.path("id"));
        Task task = tasks.findByMondayId(mondayId).orElseGet(Task::new);
        boolean created = task.getId() == null;
        if (created) {
            task.setCreatedAt(instant(item.path("created_at")));
        }
        Map<String, JsonNode> values = columnValues(item.path("column_values"));

        task.setMondayId(mondayId);
        task.setTitle(MondayClient.text(item.path("name"), "(senza titolo)"));
        task.setProjectId(project.id());
        task.setPosition(index * 1000d);

        String groupId = MondayClient.text(item.path("group").path("id"));
        JsonNode group = groups.get(groupId);
        task.setSprintId(group == null ? null : sprintFor(run, boardId, group, item, values, plan));

        String statusName = textOf(values.get(plan.status));
        task.setStatus(statusName == null ? labels.defaultStatusId()
            : run.label(LabelKind.STATUS, statusName, null).id());
        String priorityName = textOf(values.get(plan.priority));
        task.setPriority(priorityName == null ? null : run.label(LabelKind.PRIORITY, priorityName, null).id());

        task.setAssigneeIds(people(run, values.get(plan.people)));
        JsonNode timeline = valueOf(run, values.get(plan.timeline));
        task.setStartDate(date(timeline.path("from")));
        LocalDate due = date(valueOf(run, values.get(plan.dueDate)).path("date"));
        task.setDueDate(due != null ? due : date(timeline.path("to")));
        task.setEstimateHours(number(values.get(plan.estimate)));
        task.setActualHours(number(values.get(plan.actual)));

        Map<String, Object> custom = new LinkedHashMap<>(task.getCustomFields());
        plan.custom.forEach((columnId, field) -> {
            Object value = customValue(run, field, plan.customTypes.get(columnId), values.get(columnId));
            if (value == null) {
                custom.remove(field.id());
            } else {
                custom.put(field.id(), value);
            }
        });
        if (group != null) {
            custom.put(groupField.id(), MondayClient.text(group.path("title")));
        }
        task.setCustomFields(custom);

        task.setSubtasks(mergeSubtasks(run, task.getSubtasks(), item.path("subitems")));
        task.setComments(mergeComments(run, task.getComments(), item.path("updates")));
        task.setAttachments(mergeAttachments(run, task, item));
        Instant updated = instant(item.path("updated_at"));
        task.setUpdatedAt(updated != null ? updated : Instant.now());
        tasks.save(task);
        run.job.count(created ? "task creati" : "task aggiornati");
    }

    /** Sprint del gruppo: riusa quello già importato o con lo stesso nome; null per i gruppi tematici. */
    private String sprintFor(Run run, String boardId, JsonNode group, JsonNode sampleItem,
        Map<String, JsonNode> sampleValues, ColumnPlan plan) {
        String key = boardId + ":" + MondayClient.text(group.path("id"));
        return run.groupSprints.computeIfAbsent(key, k -> {
            Optional<Sprint> existing = sprints.findFirstByMondayGroupKeys(k);
            if (existing.isPresent()) {
                return Optional.of(existing.get().id());
            }
            String title = MondayClient.text(group.path("title"), "").trim();
            LocalDate sampleDate = date(valueOf(run, sampleValues.get(plan.timeline)).path("from"));
            Instant createdAt = instant(sampleItem.path("created_at"));
            int fallbackYear = sampleDate != null ? sampleDate.getYear()
                : createdAt != null ? createdAt.atZone(ZoneOffset.UTC).getYear() : LocalDate.now().getYear();
            Optional<SprintTitleParser.Period> period = SprintTitleParser.parse(title, fallbackYear);
            if (period.isEmpty()) {
                return Optional.empty();
            }
            Optional<Sprint> sameName = sprints.findFirstByNameIgnoreCase(title);
            if (sameName.isPresent()) {
                Sprint s = sameName.get();
                List<String> keys = new ArrayList<>(s.mondayGroupKeys());
                keys.add(k);
                sprints.save(new Sprint(s.id(), s.name(), s.goal(), s.startDate(), s.endDate(), s.status(),
                    s.createdAt(), keys));
                return Optional.of(s.id());
            }
            LocalDate today = LocalDate.now();
            SprintStatus status = period.get().end().isBefore(today) ? SprintStatus.CLOSED
                : period.get().start().isAfter(today) || sprints.existsByStatus(SprintStatus.ACTIVE)
                    ? SprintStatus.PLANNED : SprintStatus.ACTIVE;
            Sprint created = sprints.save(new Sprint(null, title, null, period.get().start(), period.get().end(),
                status, Instant.now(), List.of(k)));
            run.job.count("sprint");
            return Optional.of(created.id());
        }).orElse(null);
    }

    private List<Task.Subtask> mergeSubtasks(Run run, List<Task.Subtask> current, JsonNode subitems) {
        Map<String, Task.Subtask> byMondayId = new HashMap<>();
        List<Task.Subtask> local = new ArrayList<>();
        for (Task.Subtask s : current) {
            if (s.mondayId() != null) {
                byMondayId.put(s.mondayId(), s);
            } else {
                local.add(s);
            }
        }
        List<Task.Subtask> result = new ArrayList<>();
        for (JsonNode sub : subitems) {
            String mondayId = MondayClient.text(sub.path("id"));
            String statusId = null;
            boolean done = false;
            String assignee = null;
            LocalDate due = null;
            Double estimate = null;
            for (JsonNode cv : sub.path("column_values")) {
                switch (MondayClient.text(cv.path("type"), "")) {
                    case "status" -> {
                        String name = textOf(cv);
                        if (name != null && statusId == null) {
                            Label label = run.label(LabelKind.STATUS, name, null);
                            statusId = label.id();
                            done = label.done();
                        }
                    }
                    case "people" -> {
                        if (assignee == null) {
                            assignee = people(run, cv).stream().findFirst().orElse(null);
                        }
                    }
                    case "date" -> due = due != null ? due : date(valueOf(run, cv).path("date"));
                    case "numbers" -> estimate = estimate != null ? estimate : number(cv);
                    default -> {
                    }
                }
            }
            Task.Subtask previous = byMondayId.get(mondayId);
            result.add(new Task.Subtask(previous != null ? previous.id() : UUID.randomUUID().toString(),
                MondayClient.text(sub.path("name"), "(senza titolo)"), done, statusId, assignee, due, estimate,
                mondayId));
        }
        result.addAll(local);
        return result;
    }

    private List<Task.Comment> mergeComments(Run run, List<Task.Comment> current, JsonNode updates) {
        Map<String, Task.Comment> byMondayId = new HashMap<>();
        List<Task.Comment> result = new ArrayList<>();
        for (Task.Comment c : current) {
            if (c.mondayId() != null) {
                byMondayId.put(c.mondayId(), c);
            } else {
                result.add(c);
            }
        }
        for (JsonNode update : updates) {
            Task.Comment parent = comment(run, byMondayId, update, null);
            result.add(parent);
            for (JsonNode reply : update.path("replies")) {
                result.add(comment(run, byMondayId, reply, parent.id()));
            }
        }
        result.sort(Comparator.comparing(Task.Comment::createdAt, Comparator.nullsFirst(Comparator.naturalOrder())));
        return result;
    }

    private Task.Comment comment(Run run, Map<String, Task.Comment> existing, JsonNode node, String parentId) {
        String mondayId = MondayClient.text(node.path("id"));
        Task.Comment previous = existing.get(mondayId);
        return new Task.Comment(previous != null ? previous.id() : UUID.randomUUID().toString(),
            run.userId(MondayClient.text(node.path("creator_id"))), MondayClient.text(node.path("text_body"), ""),
            instant(node.path("created_at")), parentId, mondayId);
    }

    /** Scarica solo gli allegati non ancora importati (i link pubblici di monday scadono dopo un'ora). */
    private List<Task.Attachment> mergeAttachments(Run run, Task task, JsonNode item) {
        List<Task.Attachment> result = new ArrayList<>(task.getAttachments());
        Set<String> known = new HashSet<>();
        result.forEach(a -> {
            if (a.mondayAssetId() != null) {
                known.add(a.mondayAssetId());
            }
        });
        Map<String, String> commentIdByMondayId = new HashMap<>();
        task.getComments().forEach(c -> {
            if (c.mondayId() != null) {
                commentIdByMondayId.put(c.mondayId(), c.id());
            }
        });
        List<Map.Entry<JsonNode, String>> assets = new ArrayList<>();
        item.path("assets").forEach(a -> assets.add(Map.entry(a, "")));
        for (JsonNode update : item.path("updates")) {
            String commentId = commentIdByMondayId.getOrDefault(MondayClient.text(update.path("id")), "");
            update.path("assets").forEach(a -> assets.add(Map.entry(a, commentId)));
        }
        for (Map.Entry<JsonNode, String> entry : assets) {
            JsonNode asset = entry.getKey();
            String assetId = MondayClient.text(asset.path("id"));
            String url = MondayClient.text(asset.path("public_url"));
            if (assetId == null || url == null || !known.add(assetId)) {
                continue;
            }
            String name = MondayClient.text(asset.path("name"), "allegato-" + assetId);
            String contentType = Optional.ofNullable(URLConnection.guessContentTypeFromName(name))
                .orElse("application/octet-stream");
            try {
                FileStorage.StoredFile stored = run.client.download(url, in -> files.store(in, name, contentType));
                result.add(new Task.Attachment(stored.id(), name, stored.size(), contentType, Instant.now(),
                    run.importingUserId, assetId, entry.getValue().isEmpty() ? null : entry.getValue()));
                run.job.count("allegati");
            } catch (RuntimeException e) {
                run.job.log("Allegato \"" + name + "\" non scaricato: " + e.getMessage());
            }
        }
        return result;
    }

    private Object customValue(Run run, FieldDefinition field, String mondayType, JsonNode cv) {
        if (cv == null) {
            return null;
        }
        return switch (field.type()) {
            case NUMBER -> number(cv);
            case DATE -> {
                LocalDate d = date(valueOf(run, cv).path("date"));
                yield d == null ? null : d.toString();
            }
            case LABEL -> textOf(cv);
            case TEXT -> "checkbox".equals(mondayType)
                ? (valueOf(run, cv).path("checked").asBoolean(false) ? "Sì" : null)
                : textOf(cv);
        };
    }

    // ---------------------------------------------------------------- documenti

    private void importDoc(Run run, String docId) {
        JsonNode meta = null;
        List<JsonNode> blocks = new ArrayList<>();
        for (int page = 1;; page++) {
            JsonNode doc = run.client.query(DOC_PAGE, Map.of("ids", List.of(docId), "page", page)).path("docs").path(0);
            if (doc.isMissingNode()) {
                break;
            }
            if (meta == null) {
                meta = doc;
            }
            JsonNode pageBlocks = doc.path("blocks");
            pageBlocks.forEach(blocks::add);
            if (pageBlocks.size() < BLOCKS_PAGE_SIZE) {
                break;
            }
        }
        if (meta == null) {
            run.job.log("Documento " + docId + " non trovato o non accessibile");
            return;
        }
        String objectId = MondayClient.text(meta.path("object_id"), docId);
        String title = MondayClient.text(meta.path("name"), "Documento " + objectId);
        String folderId = folderFor(run, MondayClient.text(meta.path("doc_folder_id")));
        String markdown = new MondayDocConverter(run.client.mapper(), content -> imageUrl(run, content)).convert(blocks);

        Optional<Doc> existing = docs.findByMondayObjectId(objectId);
        String author = run.userId(MondayClient.text(meta.path("created_by").path("id")));
        Instant createdAt = instant(meta.path("created_at"));
        docs.save(new Doc(existing.map(Doc::id).orElse(null), title, folderId, markdown,
            existing.map(Doc::createdBy).orElse(author), existing.map(Doc::createdAt).orElse(createdAt),
            run.importingUserId, Instant.now(), objectId));
        run.job.count(existing.isPresent() ? "documenti aggiornati" : "documenti creati");
        run.job.log("Documento \"" + title + "\" importato");
    }

    private String folderFor(Run run, String mondayFolderId) {
        if (mondayFolderId == null) {
            return null;
        }
        return run.folderIds.computeIfAbsent(mondayFolderId, id -> folders.findByMondayId(id).map(DocFolder::id)
            .orElseGet(() -> {
                JsonNode folder = run.client.query("query ($ids: [ID!]) { folders(ids: $ids) { id name } }",
                    Map.of("ids", List.of(id))).path("folders").path(0);
                String name = MondayClient.text(folder.path("name"), "Cartella " + id);
                return folders.findFirstByNameIgnoreCase(name)
                    .map(f -> folders.save(new DocFolder(f.id(), f.name(), f.position(), id)))
                    .orElseGet(() -> folders.save(new DocFolder(null, name, (int) folders.count(), id)))
                    .id();
            }));
    }

    /** Scarica l'immagine di un blocco e restituisce l'URL interno; ricade sull'URL originale se presente. */
    private String imageUrl(Run run, JsonNode content) {
        String assetId = MondayClient.text(content.path("assetId"));
        if (assetId != null) {
            JsonNode asset = run.client.query("query ($ids: [ID!]!) { assets(ids: $ids) { id name public_url } }",
                Map.of("ids", List.of(assetId))).path("assets").path(0);
            String url = MondayClient.text(asset.path("public_url"));
            if (url != null) {
                String name = MondayClient.text(asset.path("name"), "immagine-" + assetId);
                String contentType = Optional.ofNullable(URLConnection.guessContentTypeFromName(name)).orElse("image/png");
                FileStorage.StoredFile stored = run.client.download(url, in -> files.store(in, name, contentType));
                run.job.count("immagini");
                return "/api/files/" + stored.id();
            }
        }
        for (String key : List.of("url", "publicUrl", "src")) {
            String url = MondayClient.text(content.path(key));
            if (url != null) {
                return url;
            }
        }
        return null;
    }

    // ---------------------------------------------------------------- utilità

    private static Map<String, JsonNode> columnValues(JsonNode columnValues) {
        Map<String, JsonNode> map = new HashMap<>();
        for (JsonNode cv : columnValues) {
            map.put(MondayClient.text(cv.path("id")), cv);
        }
        return map;
    }

    /** Testo visualizzato da monday per la colonna; null se vuoto. */
    private static String textOf(JsonNode cv) {
        if (cv == null) {
            return null;
        }
        String text = MondayClient.text(cv.path("text"));
        return text == null || text.isBlank() ? null : text.trim();
    }

    /** Valore JSON grezzo della colonna (es. {"from":..,"to":..} per una timeline). */
    private static JsonNode valueOf(Run run, JsonNode cv) {
        String raw = cv == null ? null : MondayClient.text(cv.path("value"));
        return raw == null ? run.client.mapper().missingNode() : run.client.mapper().readTree(raw);
    }

    private static List<String> people(Run run, JsonNode cv) {
        List<String> ids = new ArrayList<>();
        for (JsonNode p : valueOf(run, cv).path("personsAndTeams")) {
            if ("person".equals(MondayClient.text(p.path("kind")))) {
                String id = run.userId(MondayClient.text(p.path("id")));
                if (id != null && !ids.contains(id)) {
                    ids.add(id);
                }
            }
        }
        return ids;
    }

    private static Double number(JsonNode cv) {
        String text = textOf(cv);
        if (text == null) {
            return null;
        }
        try {
            return Double.parseDouble(text.replace(',', '.').replaceAll("[^0-9.\\-]", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static LocalDate date(JsonNode node) {
        String text = MondayClient.text(node);
        if (text == null || text.length() < 10) {
            return null;
        }
        try {
            return LocalDate.parse(text.substring(0, 10));
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static Instant instant(JsonNode node) {
        String text = MondayClient.text(node);
        if (text == null) {
            return null;
        }
        try {
            return text.length() == 10 ? LocalDate.parse(text).atStartOfDay(ZoneOffset.UTC).toInstant() : Instant.parse(text);
        } catch (RuntimeException e) {
            return null;
        }
    }
}

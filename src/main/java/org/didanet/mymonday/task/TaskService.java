package org.didanet.mymonday.task;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.didanet.mymonday.field.FieldDefinition;
import org.didanet.mymonday.field.FieldService;
import org.didanet.mymonday.file.FileStorage;
import org.didanet.mymonday.label.LabelKind;
import org.didanet.mymonday.label.LabelService;
import org.didanet.mymonday.project.ProjectRepository;
import org.didanet.mymonday.schedule.TimeSlotRepository;
import org.didanet.mymonday.sprint.SprintRepository;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TaskService {

    /** Filtri opzionali per la ricerca dei task; i valori nulli vengono ignorati. */
    public record TaskFilter(String projectId, String sprintId, boolean backlog, String assigneeId, boolean openOnly) {
    }

    private final TaskRepository tasks;
    private final ProjectRepository projects;
    private final SprintRepository sprints;
    private final TimeSlotRepository slots;
    private final LabelService labels;
    private final FieldService fields;
    private final FileStorage files;
    private final MongoTemplate mongo;

    public TaskService(TaskRepository tasks, ProjectRepository projects, SprintRepository sprints,
        TimeSlotRepository slots, LabelService labels, FieldService fields, FileStorage files, MongoTemplate mongo) {
        this.tasks = tasks;
        this.projects = projects;
        this.sprints = sprints;
        this.slots = slots;
        this.labels = labels;
        this.fields = fields;
        this.files = files;
        this.mongo = mongo;
    }

    public List<Task> find(TaskFilter filter) {
        Query query = new Query();
        if (filter.projectId() != null) {
            query.addCriteria(Criteria.where("projectId").is(filter.projectId()));
        }
        if (filter.backlog()) {
            query.addCriteria(Criteria.where("sprintId").is(null));
        } else if (filter.sprintId() != null) {
            query.addCriteria(Criteria.where("sprintId").is(filter.sprintId()));
        }
        if (filter.assigneeId() != null) {
            query.addCriteria(Criteria.where("assigneeIds").is(filter.assigneeId()));
        }
        if (filter.openOnly()) {
            query.addCriteria(Criteria.where("status").nin(labels.doneStatusIds()));
        }
        query.with(Sort.by("position", "createdAt"));
        return mongo.find(query, Task.class);
    }

    public Task get(String id) {
        return tasks.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    public Task create(TaskRequest req) {
        Task task = new Task();
        Instant now = Instant.now();
        task.setCreatedAt(now);
        task.setPosition(req.position() != null ? req.position() : now.toEpochMilli());
        apply(task, req);
        return tasks.save(task);
    }

    public Task update(String id, TaskRequest req) {
        Task task = get(id);
        if (req.position() != null) {
            task.setPosition(req.position());
        }
        apply(task, req);
        return tasks.save(task);
    }

    public Task addComment(String id, String authorId, String text, String parentId) {
        Task task = get(id);
        List<Task.Comment> comments = new ArrayList<>(task.getComments());
        comments.add(new Task.Comment(UUID.randomUUID().toString(), authorId, text, Instant.now(), parentId, null));
        task.setComments(comments);
        task.setUpdatedAt(Instant.now());
        return tasks.save(task);
    }

    public Task addAttachment(String id, MultipartFile upload, String userId) {
        Task task = get(id);
        String name = upload.getOriginalFilename() != null ? upload.getOriginalFilename() : "file";
        FileStorage.StoredFile stored;
        try {
            stored = files.store(upload.getInputStream(), name, upload.getContentType());
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Caricamento non riuscito");
        }
        List<Task.Attachment> attachments = new ArrayList<>(task.getAttachments());
        attachments.add(new Task.Attachment(stored.id(), name, stored.size(), upload.getContentType(), Instant.now(),
            userId, null, null));
        task.setAttachments(attachments);
        task.setUpdatedAt(Instant.now());
        return tasks.save(task);
    }

    public Task removeAttachment(String id, String fileId) {
        Task task = get(id);
        task.setAttachments(task.getAttachments().stream().filter(a -> !a.fileId().equals(fileId)).toList());
        files.delete(fileId);
        return tasks.save(task);
    }

    public void delete(String id) {
        tasks.findById(id).ifPresent(this::deleteWithDependencies);
    }

    public void deleteByProject(String projectId) {
        tasks.findByProjectId(projectId).forEach(this::deleteWithDependencies);
    }

    /** Sposta i task non completati di uno sprint in un altro sprint, o nel backlog se {@code targetSprintId} è nullo. */
    public void moveUnfinished(String sprintId, String targetSprintId) {
        Query query = Query.query(Criteria.where("sprintId").is(sprintId).and("status").nin(labels.doneStatusIds()));
        mongo.updateMulti(query, Update.update("sprintId", targetSprintId).set("updatedAt", Instant.now()), Task.class);
    }

    public void detachFromSprint(String sprintId) {
        mongo.updateMulti(Query.query(Criteria.where("sprintId").is(sprintId)),
            Update.update("sprintId", null).set("updatedAt", Instant.now()), Task.class);
    }

    private void deleteWithDependencies(Task task) {
        slots.deleteByTaskId(task.getId());
        task.getAttachments().forEach(a -> files.delete(a.fileId()));
        tasks.deleteById(task.getId());
    }

    private void apply(Task task, TaskRequest req) {
        if (!projects.existsById(req.projectId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Progetto inesistente");
        }
        String sprintId = blankToNull(req.sprintId());
        if (sprintId != null && !sprints.existsById(sprintId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sprint inesistente");
        }
        String status = blankToNull(req.status());
        if (status == null) {
            status = labels.defaultStatusId();
        } else if (!labels.exists(LabelKind.STATUS, status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stato inesistente");
        }
        String priority = blankToNull(req.priority());
        if (priority != null && !labels.exists(LabelKind.PRIORITY, priority)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Priorità inesistente");
        }
        task.setTitle(req.title().trim());
        task.setDescription(req.description());
        task.setStatus(status);
        task.setPriority(priority);
        task.setProjectId(req.projectId());
        task.setSprintId(sprintId);
        task.setAssigneeIds(req.assigneeIds() == null ? List.of()
            : req.assigneeIds().stream().filter(a -> a != null && !a.isBlank()).distinct().toList());
        task.setStartDate(req.startDate());
        task.setDueDate(req.dueDate());
        task.setEstimateHours(req.estimateHours());
        task.setActualHours(req.actualHours());
        task.setCustomFields(cleanCustomFields(req.customFields()));
        task.setSubtasks(normalize(req.subtasks()));
        task.setUpdatedAt(Instant.now());
    }

    /** Tiene solo i campi definiti e con un valore. */
    private Map<String, Object> cleanCustomFields(Map<String, Object> values) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (values == null) {
            return result;
        }
        Set<String> known = fields.list().stream().map(FieldDefinition::id).collect(java.util.stream.Collectors.toSet());
        values.forEach((k, v) -> {
            if (known.contains(k) && v != null && !(v instanceof String s && s.isBlank())) {
                result.put(k, v);
            }
        });
        return result;
    }

    private static List<Task.Subtask> normalize(List<Task.Subtask> subtasks) {
        if (subtasks == null) {
            return List.of();
        }
        return subtasks.stream()
            .filter(s -> s.title() != null && !s.title().isBlank())
            .map(s -> s.id() == null
                ? new Task.Subtask(UUID.randomUUID().toString(), s.title(), s.done(), blankToNull(s.status()),
                    blankToNull(s.assigneeId()), s.dueDate(), s.estimateHours(), s.mondayId())
                : s)
            .toList();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}

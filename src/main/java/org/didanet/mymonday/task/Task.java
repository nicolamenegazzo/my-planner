package org.didanet.mymonday.task;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Task (l'"elemento" di monday.com). {@code status} e {@code priority} sono id di {@code Label};
 * {@code customFields} ha come chiavi gli id dei {@code FieldDefinition}.
 */
@Document("tasks")
public class Task {

    public record Subtask(String id, String title, boolean done, String status, String assigneeId, LocalDate dueDate,
        Double estimateHours, String mondayId) {
    }

    /** {@code parentId} valorizzato per le risposte a un altro commento. */
    public record Comment(String id, String authorId, String text, Instant createdAt, String parentId,
        String mondayId) {
    }

    /** {@code commentId} valorizzato per i file allegati a un commento. */
    public record Attachment(String fileId, String name, long size, String contentType, Instant createdAt,
        String uploadedBy, String mondayAssetId, String commentId) {
    }

    @Id
    private String id;
    private String title;
    private String description;
    private String status;
    private String priority;
    @Indexed
    private String projectId;
    @Indexed
    private String sprintId;
    private List<String> assigneeIds = new ArrayList<>();
    private LocalDate startDate;
    private LocalDate dueDate;
    private Double estimateHours;
    private Double actualHours;
    private Map<String, Object> customFields = new LinkedHashMap<>();
    private List<Subtask> subtasks = new ArrayList<>();
    private List<Comment> comments = new ArrayList<>();
    private List<Attachment> attachments = new ArrayList<>();
    private double position;
    @Indexed(sparse = true)
    private String mondayId;
    private Instant createdAt;
    private Instant updatedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getPriority() {
        return priority;
    }

    public void setPriority(String priority) {
        this.priority = priority;
    }

    public String getProjectId() {
        return projectId;
    }

    public void setProjectId(String projectId) {
        this.projectId = projectId;
    }

    public String getSprintId() {
        return sprintId;
    }

    public void setSprintId(String sprintId) {
        this.sprintId = sprintId;
    }

    public List<String> getAssigneeIds() {
        return assigneeIds == null ? new ArrayList<>() : assigneeIds;
    }

    public void setAssigneeIds(List<String> assigneeIds) {
        this.assigneeIds = assigneeIds;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public void setStartDate(LocalDate startDate) {
        this.startDate = startDate;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public void setDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
    }

    public Double getEstimateHours() {
        return estimateHours;
    }

    public void setEstimateHours(Double estimateHours) {
        this.estimateHours = estimateHours;
    }

    public Double getActualHours() {
        return actualHours;
    }

    public void setActualHours(Double actualHours) {
        this.actualHours = actualHours;
    }

    public Map<String, Object> getCustomFields() {
        return customFields == null ? new LinkedHashMap<>() : customFields;
    }

    public void setCustomFields(Map<String, Object> customFields) {
        this.customFields = customFields;
    }

    public List<Subtask> getSubtasks() {
        return subtasks == null ? new ArrayList<>() : subtasks;
    }

    public void setSubtasks(List<Subtask> subtasks) {
        this.subtasks = subtasks;
    }

    public List<Comment> getComments() {
        return comments == null ? new ArrayList<>() : comments;
    }

    public void setComments(List<Comment> comments) {
        this.comments = comments;
    }

    public List<Attachment> getAttachments() {
        return attachments == null ? new ArrayList<>() : attachments;
    }

    public void setAttachments(List<Attachment> attachments) {
        this.attachments = attachments;
    }

    public double getPosition() {
        return position;
    }

    public void setPosition(double position) {
        this.position = position;
    }

    public String getMondayId() {
        return mondayId;
    }

    public void setMondayId(String mondayId) {
        this.mondayId = mondayId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}

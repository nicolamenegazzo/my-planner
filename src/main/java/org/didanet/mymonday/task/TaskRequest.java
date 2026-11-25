package org.didanet.mymonday.task;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;

public record TaskRequest(
    @NotBlank String title,
    String description,
    String status,
    String priority,
    @NotBlank String projectId,
    String sprintId,
    List<String> assigneeIds,
    LocalDate startDate,
    LocalDate dueDate,
    @PositiveOrZero Double estimateHours,
    @PositiveOrZero Double actualHours,
    Map<String, Object> customFields,
    List<Task.Subtask> subtasks,
    Double position) {
}

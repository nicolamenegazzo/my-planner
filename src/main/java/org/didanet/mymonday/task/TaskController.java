package org.didanet.mymonday.task;

import java.util.List;

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
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    public record CommentRequest(@NotBlank String text, String parentId) {
    }

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @GetMapping
    public List<Task> list(@RequestParam(required = false) String projectId,
        @RequestParam(required = false) String sprintId,
        @RequestParam(defaultValue = "false") boolean backlog,
        @RequestParam(required = false) String assigneeId,
        @RequestParam(defaultValue = "false") boolean openOnly) {
        return taskService.find(new TaskService.TaskFilter(projectId, sprintId, backlog, assigneeId, openOnly));
    }

    @GetMapping("/{id}")
    public Task get(@PathVariable String id) {
        return taskService.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Task create(@Valid @RequestBody TaskRequest req) {
        return taskService.create(req);
    }

    @PutMapping("/{id}")
    public Task update(@PathVariable String id, @Valid @RequestBody TaskRequest req) {
        return taskService.update(id, req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        taskService.delete(id);
    }

    @PostMapping("/{id}/comments")
    public Task addComment(@PathVariable String id, @Valid @RequestBody CommentRequest req,
        @AuthenticationPrincipal Jwt jwt) {
        return taskService.addComment(id, jwt.getSubject(), req.text(), req.parentId());
    }

    @PostMapping("/{id}/attachments")
    public Task addAttachment(@PathVariable String id, @RequestPart("file") MultipartFile file,
        @AuthenticationPrincipal Jwt jwt) {
        return taskService.addAttachment(id, file, jwt.getSubject());
    }

    @DeleteMapping("/{id}/attachments/{fileId}")
    public Task removeAttachment(@PathVariable String id, @PathVariable String fileId) {
        return taskService.removeAttachment(id, fileId);
    }
}

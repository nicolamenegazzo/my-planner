package org.didanet.mymonday.project;

import java.time.Instant;
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
import jakarta.validation.constraints.Pattern;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {

    public record ProjectRequest(@NotBlank String name, String description,
        @NotBlank @Pattern(regexp = "^#[0-9a-fA-F]{6}$") String color, boolean archived) {
    }

    private final ProjectRepository projects;
    private final TaskService taskService;

    public ProjectController(ProjectRepository projects, TaskService taskService) {
        this.projects = projects;
        this.taskService = taskService;
    }

    @GetMapping
    public List<Project> list() {
        return projects.findAll(Sort.by("name"));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Project create(@Valid @RequestBody ProjectRequest req) {
        return projects.save(new Project(null, req.name(), req.description(), req.color(), req.archived(), Instant.now(), null));
    }

    @PutMapping("/{id}")
    public Project update(@PathVariable String id, @Valid @RequestBody ProjectRequest req) {
        Project existing = projects.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return projects.save(new Project(id, req.name(), req.description(), req.color(), req.archived(),
            existing.createdAt(), existing.mondayBoardId()));
    }

    /** Elimina il progetto insieme ai suoi task e ai relativi slot di calendario. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        taskService.deleteByProject(id);
        projects.deleteById(id);
    }
}

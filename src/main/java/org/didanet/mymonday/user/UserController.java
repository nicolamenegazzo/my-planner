package org.didanet.mymonday.user;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import org.didanet.mymonday.task.Task;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
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
import jakarta.validation.constraints.NotEmpty;

@RestController
@RequestMapping("/api/users")
public class UserController {

    public record CreateUserRequest(@NotBlank String username, @NotBlank String displayName, String email,
        @NotBlank String password, @NotEmpty Set<Role> roles) {
    }

    public record UpdateUserRequest(@NotBlank String displayName, String email, @NotEmpty Set<Role> roles,
        boolean active, String password) {
    }

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final MongoTemplate mongo;

    public UserController(UserRepository users, PasswordEncoder passwordEncoder, MongoTemplate mongo) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.mongo = mongo;
    }

    /** Elenco visibile a tutti gli utenti autenticati: serve per assegnare i task. */
    @GetMapping
    public List<UserDto> list() {
        return users.findAll().stream().map(UserDto::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    public UserDto create(@Valid @RequestBody CreateUserRequest req) {
        String username = req.username().trim().toLowerCase();
        if (users.existsByUsername(username)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username già in uso");
        }
        User user = new User(null, username, req.displayName(), req.email(),
            passwordEncoder.encode(req.password()), req.roles(), true, Instant.now(), null);
        return UserDto.of(users.save(user));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public UserDto update(@PathVariable String id, @Valid @RequestBody UpdateUserRequest req,
        @AuthenticationPrincipal Jwt jwt) {
        User existing = users.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (id.equals(jwt.getSubject()) && (!req.active() || !req.roles().contains(Role.ADMIN))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Non puoi disattivare o togliere il ruolo amministratore a te stesso");
        }
        String hash = req.password() == null || req.password().isBlank()
            ? existing.passwordHash()
            : passwordEncoder.encode(req.password());
        User updated = new User(id, existing.username(), req.displayName(), req.email(), hash, req.roles(),
            req.active(), existing.createdAt(), existing.mondayId());
        return UserDto.of(users.save(updated));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable String id, @AuthenticationPrincipal Jwt jwt) {
        if (id.equals(jwt.getSubject())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Non puoi eliminare te stesso");
        }
        mongo.updateMulti(Query.query(Criteria.where("assigneeIds").is(id)), new Update().pull("assigneeIds", id), Task.class);
        mongo.updateMulti(Query.query(Criteria.where("subtasks.assigneeId").is(id)),
            new Update().set("subtasks.$[s].assigneeId", null).filterArray(Criteria.where("s.assigneeId").is(id)),
            Task.class);
        users.deleteById(id);
    }
}

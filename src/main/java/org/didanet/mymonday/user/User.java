package org.didanet.mymonday.user;

import java.time.Instant;
import java.util.Set;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("users")
public record User(
    @Id String id,
    @Indexed(unique = true) String username,
    String displayName,
    String email,
    String passwordHash,
    Set<Role> roles,
    boolean active,
    Instant createdAt,
    @Indexed(sparse = true) String mondayId) {

    public User withPasswordHash(String hash) {
        return new User(id, username, displayName, email, hash, roles, active, createdAt, mondayId);
    }

    public User withMondayId(String newMondayId) {
        return new User(id, username, displayName, email, passwordHash, roles, active, createdAt, newMondayId);
    }
}

package org.didanet.mymonday.user;

import java.util.Set;

/** Vista pubblica dell'utente, senza hash della password. */
public record UserDto(String id, String username, String displayName, String email, Set<Role> roles, boolean active) {

    public static UserDto of(User u) {
        return new UserDto(u.id(), u.username(), u.displayName(), u.email(), u.roles(), u.active());
    }
}

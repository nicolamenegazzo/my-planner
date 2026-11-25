package org.didanet.mymonday.user;

import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface UserRepository extends MongoRepository<User, String> {

    Optional<User> findByUsername(String username);

    boolean existsByUsername(String username);

    Optional<User> findByMondayId(String mondayId);

    Optional<User> findFirstByEmailIgnoreCase(String email);
}

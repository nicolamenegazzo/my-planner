package org.didanet.mymonday.sprint;

import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface SprintRepository extends MongoRepository<Sprint, String> {

    boolean existsByStatus(SprintStatus status);

    Optional<Sprint> findFirstByMondayGroupKeys(String key);

    Optional<Sprint> findFirstByNameIgnoreCase(String name);
}

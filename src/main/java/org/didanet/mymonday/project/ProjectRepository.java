package org.didanet.mymonday.project;

import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface ProjectRepository extends MongoRepository<Project, String> {

    Optional<Project> findByMondayBoardId(String mondayBoardId);
}

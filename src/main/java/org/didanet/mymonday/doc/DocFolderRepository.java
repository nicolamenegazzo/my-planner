package org.didanet.mymonday.doc;

import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface DocFolderRepository extends MongoRepository<DocFolder, String> {

    Optional<DocFolder> findByMondayId(String mondayId);

    Optional<DocFolder> findFirstByNameIgnoreCase(String name);
}

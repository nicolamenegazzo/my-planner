package org.didanet.mymonday.doc;

import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface DocRepository extends MongoRepository<Doc, String> {

    Optional<Doc> findByMondayObjectId(String mondayObjectId);
}

package org.didanet.mymonday.field;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface FieldRepository extends MongoRepository<FieldDefinition, String> {
}

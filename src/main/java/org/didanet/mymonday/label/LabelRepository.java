package org.didanet.mymonday.label;

import java.util.List;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface LabelRepository extends MongoRepository<Label, String> {

    List<Label> findByKindOrderByPosition(LabelKind kind);

    long countByKind(LabelKind kind);
}

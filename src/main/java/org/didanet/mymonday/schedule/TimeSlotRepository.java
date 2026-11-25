package org.didanet.mymonday.schedule;

import java.util.List;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface TimeSlotRepository extends MongoRepository<TimeSlot, String> {

    List<TimeSlot> findByTaskIdOrderByStart(String taskId);

    void deleteByTaskId(String taskId);
}

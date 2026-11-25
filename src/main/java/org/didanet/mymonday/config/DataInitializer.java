package org.didanet.mymonday.config;

import java.time.Instant;
import java.util.Set;

import org.bson.Document;
import org.didanet.mymonday.label.LabelService;
import org.didanet.mymonday.user.Role;
import org.didanet.mymonday.user.User;
import org.didanet.mymonday.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnBooleanProperty(name = "app.init-enabled", matchIfMissing = true)
public class DataInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final AppProperties props;
    private final LabelService labels;
    private final MongoTemplate mongo;

    public DataInitializer(UserRepository users, PasswordEncoder passwordEncoder, AppProperties props,
        LabelService labels, MongoTemplate mongo) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.props = props;
        this.labels = labels;
        this.mongo = mongo;
    }

    @Override
    public void run(ApplicationArguments args) {
        labels.seedDefaults();
        migrateSingleAssignee();
        if (users.count() > 0) {
            return;
        }
        AppProperties.Admin admin = props.admin();
        users.save(new User(null, admin.username(), admin.displayName(), null,
            passwordEncoder.encode(admin.password()), Set.of(Role.ADMIN, Role.USER), true, Instant.now(), null));
        log.warn("Creato utente amministratore '{}': cambia la password al primo accesso", admin.username());
    }

    /** I task creati prima del supporto a più persone hanno il campo singolo {@code assigneeId}. */
    private void migrateSingleAssignee() {
        Query legacy = Query.query(Criteria.where("assigneeId").exists(true));
        for (Document doc : mongo.find(legacy, Document.class, "tasks")) {
            Update update = new Update().unset("assigneeId");
            Object assignee = doc.get("assigneeId");
            if (assignee != null) {
                update.addToSet("assigneeIds", assignee);
            }
            mongo.updateFirst(Query.query(Criteria.where("_id").is(doc.get("_id"))), update, "tasks");
        }
    }
}

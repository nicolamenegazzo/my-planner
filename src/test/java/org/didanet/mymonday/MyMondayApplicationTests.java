package org.didanet.mymonday;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

// Senza utente iniziale né indici il contesto si avvia anche senza un MongoDB raggiungibile
@SpringBootTest(properties = { "app.init-enabled=false", "spring.data.mongodb.auto-index-creation=false" })
class MyMondayApplicationTests {

    @Test
    void contextLoads() {
    }

}

package org.didanet.mymonday;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class MyMondayApplication {

    public static void main(String[] args) {
        SpringApplication.run(MyMondayApplication.class, args);
    }

}

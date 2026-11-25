# Immagine dell'applicazione MyMonday (backend Spring Boot + frontend React nello stesso WAR).

# --- build: Maven compila backend e frontend (il frontend-maven-plugin scarica Node da solo) ---
FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /build

# prima solo il pom: le dipendenze restano in cache finché il pom non cambia
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q -DskipTests package

# --- runtime: solo JRE e WAR eseguibile ---
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system mymonday
COPY --from=build /build/target/my-monday-*.war /app/my-monday.war
USER mymonday
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/my-monday.war"]

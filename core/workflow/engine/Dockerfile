# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY core/workflow/engine/pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -Dmaven.wagon.http.retryHandler.count=5 dependency:go-offline
COPY core/workflow/engine/src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -Dmaven.wagon.http.retryHandler.count=5 -DskipTests package

FROM eclipse-temurin:21-jre
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /build/target/app.jar app.jar
ENV JAVA_OPTS="-Xms128m -Xmx384m"
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]

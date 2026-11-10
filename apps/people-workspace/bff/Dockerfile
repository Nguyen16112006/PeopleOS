# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

# Build context = thư mục gốc của repo (xem infrastructure/docker-compose.yml)
# ---------- Giai đoạn 1: biên dịch bằng Maven ----------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY apps/people-workspace/bff/pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -Dmaven.wagon.http.retryHandler.count=5 dependency:go-offline
COPY apps/people-workspace/bff/src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -Dmaven.wagon.http.retryHandler.count=5 -DskipTests package

# ---------- Giai đoạn 2: chạy bằng JRE ----------
FROM eclipse-temurin:21-jre
# Font DejaVu để PDF hiển thị đúng tiếng Việt; curl cho healthcheck (tự phục hồi)
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /build/target/app.jar app.jar
ENV JAVA_OPTS="-Xms128m -Xmx384m"
EXPOSE 8000
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]

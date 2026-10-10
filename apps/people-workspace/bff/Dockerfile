# Build context = thư mục gốc của repo (xem infrastructure/docker-compose.yml)
# ---------- Giai đoạn 1: biên dịch bằng Maven ----------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY apps/people-workspace/bff/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY apps/people-workspace/bff/src ./src
RUN mvn -q -B -DskipTests package

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

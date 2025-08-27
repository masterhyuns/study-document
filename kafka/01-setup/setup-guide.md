# 🚀 Kafka 로컬 환경 설치 가이드

## 📋 사전 요구사항

### 필수 소프트웨어
- **Docker Desktop**: [다운로드](https://www.docker.com/products/docker-desktop)
- **Node.js 18+**: [다운로드](https://nodejs.org/)
- **Git**: 버전 관리용

### 시스템 요구사항
- RAM: 최소 8GB (권장 16GB)
- 디스크: 10GB 이상 여유 공간
- CPU: 4코어 이상 권장

## 🎯 빠른 시작 (Quick Start)

### 1단계: Kafka 클러스터 시작
```bash
# kafka/01-setup 디렉토리로 이동
cd kafka/01-setup

# Docker Compose로 전체 스택 d1
docker-compose up -d

# 서비스 상태 확인
docker-compose ps
```

### 2단계: 설치 확인
```bash
# 로그 확인
docker-compose logs -f kafka-init

# 토픽 목록 확인
docker exec kafka-broker-1 kafka-topics --list --bootstrap-server localhost:9092
```

### 3단계: Kafka UI 접속
브라우저에서 http://localhost:8080 접속

## 📦 구성 요소 상세

### 🏗️ 아키텍처 다이어그램
```
┌─────────────────────────────────────────────────┐
│              Docker Network                      │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌────────────┐         ┌────────────┐         │
│  │ ZooKeeper  │◄────────┤  Kafka UI  │         │
│  │  (2181)    │         │   (8080)   │         │
│  └─────┬──────┘         └─────┬──────┘         │
│        │                       │                 │
│  ┌─────▼──────┬────────┬──────▼──────┐         │
│  │            │        │              │         │
│  │  Kafka 1   │ Kafka 2│   Kafka 3   │         │
│  │  (9092)    │ (9093) │   (9094)    │         │
│  │            │        │              │         │
│  └────────────┴────────┴──────────────┘         │
│        │                       │                 │
│  ┌─────▼──────┐         ┌─────▼──────┐         │
│  │   Schema   │         │   Kafka    │         │
│  │  Registry  │         │  Connect   │         │
│  │   (8081)   │         │   (8083)   │         │
│  └────────────┘         └─────────────┘         │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 📊 포트 매핑

| 서비스 | 내부 포트 | 외부 포트 | 용도 |
|--------|----------|----------|------|
| ZooKeeper | 2181 | 2181 | 클러스터 관리 |
| Kafka 1 | 29092 | 9092 | 브로커 1 |
| Kafka 2 | 29093 | 9093 | 브로커 2 |
| Kafka 3 | 29094 | 9094 | 브로커 3 |
| Kafka UI | 8080 | 8080 | 웹 관리 도구 |
| Schema Registry | 8081 | 8081 | 스키마 관리 |
| Kafka Connect | 8083 | 8083 | 커넥터 관리 |

## 🔧 상세 설정 가이드

### 1. 기본 설정 확인

#### Broker 설정 확인
```bash
# Broker 1 설정 확인
docker exec kafka-broker-1 kafka-configs \
  --bootstrap-server localhost:9092 \
  --describe \
  --entity-type brokers \
  --entity-name 1
```

#### 클러스터 메타데이터 확인
```bash
# 클러스터 ID 확인
docker exec kafka-broker-1 kafka-metadata-shell \
  --snapshot /var/kafka-logs/__cluster_metadata-0/00000000000000000000.log \
  --print-brokers
```

### 2. 토픽 관리

#### 토픽 생성
```bash
# 새 토픽 생성
docker exec kafka-broker-1 kafka-topics \
  --create \
  --topic test-topic \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 2
```

#### 토픽 상세 정보
```bash
# 토픽 설명
docker exec kafka-broker-1 kafka-topics \
  --describe \
  --topic order-events \
  --bootstrap-server localhost:9092
```

출력 예시:
```
Topic: order-events
TopicId: xxxxxxxxxxx
PartitionCount: 3
ReplicationFactor: 2
Configs: min.insync.replicas=1
  Partition: 0  Leader: 1  Replicas: 1,2  Isr: 1,2
  Partition: 1  Leader: 2  Replicas: 2,3  Isr: 2,3
  Partition: 2  Leader: 3  Replicas: 3,1  Isr: 3,1
```

#### 토픽 삭제
```bash
docker exec kafka-broker-1 kafka-topics \
  --delete \
  --topic test-topic \
  --bootstrap-server localhost:9092
```

### 3. 메시지 테스트

#### Console Producer로 메시지 보내기
```bash
# 메시지 전송
docker exec -it kafka-broker-1 kafka-console-producer \
  --topic order-events \
  --bootstrap-server localhost:9092

# 프롬프트가 나타나면 메시지 입력
> {"orderId": "1234", "amount": 100}
> {"orderId": "5678", "amount": 200}
> Ctrl+C to exit
```

#### Console Consumer로 메시지 받기
```bash
# 처음부터 메시지 읽기
docker exec -it kafka-broker-1 kafka-console-consumer \
  --topic order-events \
  --from-beginning \
  --bootstrap-server localhost:9092
```

### 4. Consumer Group 관리

#### Consumer Group 목록
```bash
docker exec kafka-broker-1 kafka-consumer-groups \
  --list \
  --bootstrap-server localhost:9092
```

#### Consumer Group 상태 확인
```bash
docker exec kafka-broker-1 kafka-consumer-groups \
  --describe \
  --group test-group \
  --bootstrap-server localhost:9092
```

## 🛠️ 환경 설정 파일

### .env 파일 생성 (선택사항)
```bash
# kafka/01-setup/.env
KAFKA_VERSION=7.5.0
KAFKA_HEAP_OPTS=-Xmx512M -Xms512M
KAFKA_LOG_LEVEL=INFO
```

### 커스텀 설정 적용
```bash
# docker-compose.override.yml 생성
cat > docker-compose.override.yml << EOF
version: '3.8'

services:
  kafka1:
    environment:
      KAFKA_LOG4J_ROOT_LOGLEVEL: DEBUG
      KAFKA_HEAP_OPTS: -Xmx1G -Xms1G
EOF
```

## 📈 모니터링

### 1. Kafka UI 사용법

#### 대시보드 주요 기능
- **Brokers**: 브로커 상태, 디스크 사용량
- **Topics**: 토픽 목록, 파티션 정보
- **Messages**: 실시간 메시지 조회
- **Consumer Groups**: 컨슈머 그룹 lag 모니터링

#### 토픽 메시지 조회
1. Topics 메뉴 클릭
2. 원하는 토픽 선택
3. Messages 탭에서 실시간 메시지 확인

### 2. JMX 메트릭 모니터링

```bash
# JMX 포트로 메트릭 확인
docker exec kafka-broker-1 jps -l

# JConsole 연결 (로컬에 Java 설치 필요)
jconsole localhost:9101
```

### 3. 로그 모니터링

```bash
# 특정 서비스 로그
docker-compose logs -f kafka1

# 전체 로그
docker-compose logs -f

# 에러만 필터링
docker-compose logs -f | grep ERROR
```

## 🚨 문제 해결

### 문제 1: 컨테이너가 시작되지 않음
```bash
# 상태 확인
docker-compose ps

# 로그 확인
docker-compose logs kafka1

# 해결: 리소스 정리 후 재시작
docker-compose down -v
docker-compose up -d
```

### 문제 2: 메모리 부족
```bash
# Docker Desktop 메모리 증가
# Settings > Resources > Memory: 8GB 이상

# Kafka 힙 메모리 조정
export KAFKA_HEAP_OPTS="-Xmx256M -Xms256M"
docker-compose up -d
```

### 문제 3: 포트 충돌
```bash
# 사용 중인 포트 확인
netstat -an | grep 9092

# 포트 변경 (docker-compose.yml 수정)
ports:
  - "19092:9092"  # 9092 → 19092
```

### 문제 4: 디스크 공간 부족
```bash
# Docker 볼륨 정리
docker system prune -a --volumes

# 특정 볼륨만 삭제
docker volume rm kafka_kafka1-data
```

## 🔄 유용한 명령어 모음

### 서비스 관리
```bash
# 시작
docker-compose up -d

# 중지
docker-compose stop

# 재시작
docker-compose restart

# 완전 삭제 (데이터 포함)
docker-compose down -v

# 특정 서비스만 재시작
docker-compose restart kafka1
```

### 데이터 관리
```bash
# 볼륨 목록
docker volume ls | grep kafka

# 볼륨 크기 확인
docker system df -v

# 로그 정리
docker exec kafka-broker-1 kafka-log-dirs \
  --describe \
  --bootstrap-server localhost:9092
```

## 📚 다음 단계

### 학습 경로
1. ✅ 환경 구축 완료
2. 👉 [Producer 실습](../02-producer/README.md)
3. 👉 [Consumer 실습](../03-consumer/README.md)
4. 👉 [스트림 처리](../04-streaming/README.md)

### 추가 학습 자료
- [Kafka 공식 문서](https://kafka.apache.org/documentation/)
- [Confluent 튜토리얼](https://docs.confluent.io/platform/current/tutorials/index.html)
- [Kafka UI 사용법](https://github.com/provectus/kafka-ui)

## 🎯 체크리스트

환경 구축이 완료되었는지 확인:

- [ ] Docker Desktop 실행 중
- [ ] `docker-compose up -d` 성공
- [ ] http://localhost:8080 접속 가능
- [ ] 토픽 목록에 `order-events` 확인
- [ ] Console Producer/Consumer 테스트 성공
- [ ] 메모리/디스크 공간 충분

---

💡 **팁**: 처음에는 단일 브로커로 시작하고, 익숙해지면 멀티 브로커로 확장하세요!
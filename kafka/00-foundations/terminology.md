# 📚 Kafka 핵심 용어 사전

## 🎯 필수 용어 (Must Know)

### **Apache Kafka**
- **영어**: Apache Kafka
- **한글**: 아파치 카프카
- **설명**: LinkedIn에서 개발한 분산 스트리밍 플랫폼
- **비유**: 📮 대용량 실시간 우편 시스템
- **예시**: `실시간으로 주문 데이터를 여러 시스템에 전달하는 중앙 허브`

### **Topic (토픽)**
- **영어**: Topic
- **한글**: 토픽, 주제
- **설명**: 메시지를 구분하는 논리적 카테고리
- **비유**: 📁 이메일의 폴더나 카테고리
- **예시**: `order-events, user-activities, system-logs`
```bash
# 토픽 생성 예시
kafka-topics.sh --create --topic order-events --partitions 3
```

### **Partition (파티션)**
- **영어**: Partition
- **한글**: 파티션, 분할
- **설명**: 토픽을 물리적으로 나눈 단위, 병렬 처리의 기본 단위
- **비유**: 📑 책의 챕터
- **예시**: `order-events 토픽을 3개 파티션으로 분할하여 병렬 처리`

### **Offset (오프셋)**
- **영어**: Offset
- **한글**: 오프셋, 위치
- **설명**: 파티션 내 각 메시지의 고유한 일련번호
- **비유**: 📍 책의 페이지 번호
- **예시**: `Partition 0의 Offset 12345 = 12,346번째 메시지`

### **Producer (프로듀서)**
- **영어**: Producer
- **한글**: 프로듀서, 생산자
- **설명**: Kafka에 메시지를 보내는 애플리케이션
- **비유**: 📤 편지를 보내는 발신자
- **예시코드**:
```java
producer.send(new ProducerRecord<>("order-events", orderId, orderData));
```

### **Consumer (컨슈머)**
- **영어**: Consumer  
- **한글**: 컨슈머, 소비자
- **설명**: Kafka에서 메시지를 읽는 애플리케이션
- **비유**: 📥 편지를 받는 수신자
- **예시코드**:
```java
ConsumerRecords<String, String> records = consumer.poll(100);
```

### **Broker (브로커)**
- **영어**: Broker
- **한글**: 브로커, 중개자
- **설명**: Kafka 서버 인스턴스
- **비유**: 🏢 우체국 지점
- **예시**: `3개의 브로커로 구성된 Kafka 클러스터`

## 📊 중급 용어 (Should Know)

### **Consumer Group (컨슈머 그룹)**
- **영어**: Consumer Group
- **한글**: 컨슈머 그룹
- **설명**: 같은 group.id를 가진 컨슈머들의 논리적 그룹
- **비유**: 👥 같은 업무를 나눠서 처리하는 팀
- **특징**: 
  - 각 파티션은 그룹 내 하나의 컨슈머만 읽음
  - 자동 로드 밸런싱
```yaml
consumer.group.id: "analytics-team"
```

### **Replication (복제)**
- **영어**: Replication
- **한글**: 복제, 복사
- **설명**: 데이터 안정성을 위한 파티션 복사본
- **비유**: 📋 중요 문서의 사본
- **설정**: `replication.factor=3` (3개의 복사본 유지)

### **Leader/Follower**
- **영어**: Leader/Follower Replica
- **한글**: 리더/팔로워 레플리카
- **설명**: 
  - Leader: 읽기/쓰기를 처리하는 주 복제본
  - Follower: Leader를 복제하는 보조 복제본
- **비유**: 👑 팀장과 팀원

### **ISR (In-Sync Replicas)**
- **영어**: In-Sync Replicas
- **한글**: 동기화된 복제본
- **설명**: Leader와 완전히 동기화된 Follower 집합
- **중요도**: ⭐⭐⭐⭐⭐ (데이터 안정성의 핵심)
```bash
# ISR 확인
kafka-topics.sh --describe --topic order-events
```

### **ZooKeeper**
- **영어**: Apache ZooKeeper
- **한글**: 주키퍼
- **설명**: Kafka 클러스터 메타데이터 관리 시스템
- **비유**: 📋 클러스터의 관리 대장
- **참고**: Kafka 3.x부터 KRaft로 대체 중

### **Controller (컨트롤러)**
- **영어**: Controller
- **한글**: 컨트롤러
- **설명**: 파티션 리더 선출, 클러스터 관리를 담당하는 브로커
- **비유**: 🎮 오케스트라 지휘자

## 🔧 고급 용어 (Good to Know)

### **Segment (세그먼트)**
- **영어**: Log Segment
- **한글**: 로그 세그먼트
- **설명**: 파티션 데이터를 저장하는 실제 파일 단위
- **구성**: `.log` (데이터), `.index` (오프셋 인덱스), `.timeindex` (시간 인덱스)
```
00000000000000000000.log    # 첫 번째 세그먼트
00000000000000001024.log    # 두 번째 세그먼트
```

### **Retention (보존)**
- **영어**: Retention Policy
- **한글**: 보존 정책
- **설명**: 메시지 보관 기간/크기 설정
- **종류**:
  - Time-based: `retention.ms=604800000` (7일)
  - Size-based: `retention.bytes=1073741824` (1GB)

### **Compaction (압축)**
- **영어**: Log Compaction
- **한글**: 로그 압축
- **설명**: 같은 키의 최신 값만 유지하는 정리 방식
- **사용처**: 상태 저장, 설정 관리

### **Acks (확인)**
- **영어**: Acknowledgments
- **한글**: 확인 응답
- **설명**: Producer의 메시지 전송 확인 수준
- **옵션**:
  - `acks=0`: 확인 없음 (가장 빠름)
  - `acks=1`: Leader 확인
  - `acks=all`: 모든 ISR 확인 (가장 안전)

### **Batch (배치)**
- **영어**: Batch Processing
- **한글**: 일괄 처리
- **설명**: 여러 메시지를 모아서 한 번에 처리
- **설정**:
```properties
batch.size=16384        # 배치 크기
linger.ms=10           # 대기 시간
```

## 🚀 실전 용어

### **Lag (지연)**
- **영어**: Consumer Lag
- **한글**: 컨슈머 지연
- **설명**: 최신 메시지와 컨슈머가 읽은 위치의 차이
- **모니터링**: `현재 오프셋 - 마지막 오프셋 = Lag`
```bash
# Lag 확인
kafka-consumer-groups.sh --describe --group analytics-team
```

### **Throughput (처리량)**
- **영어**: Throughput
- **한글**: 처리량
- **설명**: 초당 처리 가능한 메시지 수
- **측정**: Messages/sec, MB/sec

### **Latency (지연시간)**
- **영어**: Latency
- **한글**: 지연시간, 대기시간
- **설명**: 메시지 전송부터 수신까지의 시간
- **목표**: 일반적으로 < 10ms

### **Idempotence (멱등성)**
- **영어**: Idempotent Producer
- **한글**: 멱등성 프로듀서
- **설명**: 중복 전송을 방지하는 메커니즘
- **설정**: `enable.idempotence=true`

### **Transaction (트랜잭션)**
- **영어**: Kafka Transactions
- **한글**: 카프카 트랜잭션
- **설명**: 원자적 쓰기를 보장하는 기능
- **사용**:
```java
producer.beginTransaction();
// 여러 메시지 전송
producer.commitTransaction();
```

## 📈 성능 관련 용어

### **Zero-Copy**
- **영어**: Zero-Copy Transfer
- **한글**: 제로 카피 전송
- **설명**: CPU를 거치지 않고 데이터를 전송하는 최적화 기법
- **효과**: 네트워크 전송 성능 대폭 향상

### **Page Cache**
- **영어**: OS Page Cache
- **한글**: 페이지 캐시
- **설명**: OS의 파일 시스템 캐시 활용
- **장점**: 디스크 I/O 감소

### **Compression (압축)**
- **영어**: Message Compression
- **한글**: 메시지 압축
- **종류**:
  - `none`: 압축 없음
  - `gzip`: 높은 압축률
  - `snappy`: 빠른 압축/해제
  - `lz4`: 균형잡힌 성능
  - `zstd`: 최신, 효율적

## 🎓 Kafka Streams 용어

### **KStream**
- **설명**: 무한한 데이터 스트림 추상화
- **특징**: 레코드별 처리

### **KTable**
- **설명**: 변경 가능한 테이블 추상화
- **특징**: 최신 상태만 유지

### **GlobalKTable**
- **설명**: 모든 파티션의 데이터를 가진 테이블
- **사용**: 조인 연산에 유용

## 🔍 운영 용어

### **JMX (Java Management Extensions)**
- **설명**: Kafka 모니터링을 위한 Java 표준
- **용도**: 메트릭 수집, 모니터링

### **Rack Awareness**
- **한글**: 랙 인식
- **설명**: 물리적 위치를 고려한 복제본 배치
- **목적**: 장애 내구성 향상

### **Quotas (할당량)**
- **설명**: 클라이언트별 리소스 사용량 제한
- **종류**: 
  - Producer 할당량
  - Consumer 할당량

## 📝 용어 간 관계도

```
┌─────────────────────────────────────────┐
│              Kafka Cluster              │
│                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐│
│  │Broker 1 │  │Broker 2 │  │Broker 3 ││
│  └─────────┘  └─────────┘  └─────────┘│
│       ▲            ▲            ▲       │
│       └────────────┼────────────┘       │
│                    │                    │
│              ┌─────────┐                │
│              │  Topic  │                │
│              └────┬────┘                │
│         ┌─────────┼─────────┐          │
│         ▼         ▼         ▼          │
│    ┌────────┐┌────────┐┌────────┐     │
│    │Part. 0 ││Part. 1 ││Part. 2 │     │
│    └───┬────┘└────────┘└────────┘     │
│        │                                │
│    ┌───▼────┐                          │
│    │Offsets │ [0][1][2][3][4]...       │
│    └────────┘                          │
└─────────────────────────────────────────┘
         ▲                      ▼
    Producer              Consumer Group
```

## 🎯 용어 우선순위

### 입문자 필수 (Day 1)
1. Topic, Partition, Offset
2. Producer, Consumer
3. Broker

### 초급자 필수 (Week 1)
4. Consumer Group
5. Replication
6. Leader/Follower

### 중급자 필수 (Month 1)
7. ISR
8. Segment
9. Retention
10. Lag

### 고급자 (실전)
11. Idempotence
12. Transaction
13. Zero-Copy
14. Compaction

---

💡 **학습 팁**: 용어를 단순 암기하지 말고, 실습을 통해 각 개념이 어떻게 동작하는지 직접 확인하면서 이해하세요!
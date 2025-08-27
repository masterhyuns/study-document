# 🌊 Kafka Streams 학습 가이드

## 🎯 Kafka Streams란?

Kafka Streams는 Kafka에 저장된 데이터를 처리하고 분석하기 위한 **클라이언트 라이브러리**입니다.

### 핵심 특징
- **경량 라이브러리**: 별도 클러스터 불필요
- **Exactly-once 처리**: 정확히 한 번 처리 보장
- **Stateful 처리**: 상태 저장 및 관리
- **실시간 처리**: 밀리초 단위 지연

## 🏗️ Streams vs Traditional Processing

### 전통적인 배치 처리
```
Data Lake → Batch Job (매일 실행) → Report
            (몇 시간 소요)
```

### 스트림 처리
```
Kafka → Stream Processing → Real-time Output
        (밀리초 단위)
```

## 📊 핵심 개념

### 1. Stream과 Table

```
┌─────────────────────────────────────┐
│           KStream (무한 스트림)        │
│  시간 →                              │
│  [Event1][Event2][Event3][Event4]... │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│           KTable (상태 테이블)         │
│  Key    │    Latest Value           │
│  user1  │    { status: "active" }   │
│  user2  │    { status: "inactive" } │
└─────────────────────────────────────┘
```

#### KStream (레코드 스트림)
- **무한한 이벤트 시퀀스**
- INSERT만 가능 (추가만)
- 모든 레코드 유지

#### KTable (변경 로그 스트림)
- **최신 상태만 유지**
- UPDATE 가능
- 키별 최신 값만 저장

#### GlobalKTable
- **모든 파티션 데이터 복제**
- 조인 시 유용
- 브로드캐스트 조인

### 2. Topology (토폴로지)

```
Source Processor
      │
      ▼
Stream Processor 1 (Filter)
      │
      ▼
Stream Processor 2 (Map)
      │
      ├─────────────┐
      ▼             ▼
Sink Processor 1   Sink Processor 2
(Output Topic A)   (Output Topic B)
```

## 🔄 주요 Operations

### Stateless Operations (무상태)

```javascript
// Filter - 조건에 맞는 레코드만 선택
stream.filter((key, value) => value.amount > 100)

// Map - 레코드 변환
stream.map((key, value) => {
  return { key: key.toUpperCase(), value: value * 2 }
})

// FlatMap - 하나의 레코드를 여러 개로 분할
stream.flatMap((key, value) => {
  return value.items.map(item => [key, item])
})

// Branch - 스트림 분기
const branches = stream.branch(
  (key, value) => value.type === 'A',  // branch 0
  (key, value) => value.type === 'B',  // branch 1
  (key, value) => true                 // branch 2 (나머지)
)
```

### Stateful Operations (상태유지)

```javascript
// GroupBy - 키로 그룹화
stream.groupByKey()

// Aggregate - 집계
grouped.aggregate(
  () => 0,  // 초기값
  (key, value, aggregate) => aggregate + value.amount
)

// Count - 개수 세기
grouped.count()

// Reduce - 리듀스
grouped.reduce((aggValue, newValue) => aggValue + newValue)

// Join - 조인
stream1.join(
  stream2,
  (value1, value2) => ({ ...value1, ...value2 }),
  JoinWindows.of(Duration.ofMinutes(5))
)
```

## ⏰ Windowing (윈도우)

### 윈도우 타입

```
1. Tumbling Window (고정 윈도우)
   |--5분--|--5분--|--5분--|
   
2. Hopping Window (이동 윈도우)
   |--10분--|
      |--10분--|
         |--10분--|
   (5분마다 이동)
   
3. Sliding Window (슬라이딩 윈도우)
   연속적으로 이동
   
4. Session Window (세션 윈도우)
   |--활동--|gap|--활동--|gap|
   (비활동 기간으로 구분)
```

### 윈도우 예제

```javascript
// 5분 단위 Tumbling Window
stream
  .groupByKey()
  .windowedBy(TimeWindows.of(Duration.ofMinutes(5)))
  .count()

// 10분 윈도우, 5분마다 이동하는 Hopping Window  
stream
  .groupByKey()
  .windowedBy(TimeWindows
    .of(Duration.ofMinutes(10))
    .advanceBy(Duration.ofMinutes(5)))
  .aggregate(...)

// 30분 비활동 후 세션 종료
stream
  .groupByKey()
  .windowedBy(SessionWindows.with(Duration.ofMinutes(30)))
  .count()
```

## 💾 State Store

### Local State Store
```
┌─────────────────────────┐
│   Application Instance   │
│  ┌───────────────────┐  │
│  │  Stream Process   │  │
│  └─────────┬─────────┘  │
│            │            │
│  ┌─────────▼─────────┐  │
│  │   State Store     │  │
│  │  (RocksDB/Memory) │  │
│  └───────────────────┘  │
└─────────────────────────┘
```

### Changelog Topic
```
State Store ←→ Changelog Topic (Kafka)
            (자동 백업/복구)
```

## 🎯 실전 예제

### 1. 실시간 매출 집계

```javascript
const salesStream = builder.stream('sales-events')

// 시간별 매출 집계
const hourlySales = salesStream
  .groupByKey()
  .windowedBy(TimeWindows.of(Duration.ofHours(1)))
  .aggregate(
    () => ({ count: 0, total: 0 }),
    (key, value, agg) => ({
      count: agg.count + 1,
      total: agg.total + value.amount
    })
  )
  
hourlySales.toStream().to('hourly-sales-output')
```

### 2. 사용자 세션 분석

```javascript
const clickStream = builder.stream('user-clicks')

// 30분 세션 윈도우로 사용자 활동 추적
const userSessions = clickStream
  .groupBy((key, value) => value.userId)
  .windowedBy(SessionWindows.with(Duration.ofMinutes(30)))
  .aggregate(
    () => ({
      clicks: [],
      duration: 0,
      pages: new Set()
    }),
    (userId, click, session) => ({
      clicks: [...session.clicks, click],
      duration: click.timestamp - session.clicks[0]?.timestamp || 0,
      pages: session.pages.add(click.page)
    })
  )
```

### 3. 조인 예제

```javascript
// 주문과 결제 조인
const orders = builder.stream('orders')
const payments = builder.stream('payments')

const paidOrders = orders.join(
  payments,
  (order, payment) => ({
    orderId: order.id,
    amount: order.amount,
    paymentMethod: payment.method,
    paidAt: payment.timestamp
  }),
  JoinWindows.of(Duration.ofMinutes(10))
)
```

## 🚀 Kafka Streams Application

### 기본 구조

```javascript
import { KafkaStreams } from 'kafka-streams'

// 1. 설정
const config = {
  applicationId: 'my-stream-app',
  bootstrapServers: 'localhost:9092',
  defaultKeySerde: 'string',
  defaultValueSerde: 'json'
}

// 2. 토폴로지 정의
const builder = new StreamsBuilder()

const sourceStream = builder.stream('input-topic')

const processedStream = sourceStream
  .filter((key, value) => value.amount > 100)
  .mapValues(value => ({
    ...value,
    processed: true,
    timestamp: new Date()
  }))

processedStream.to('output-topic')

// 3. 실행
const topology = builder.build()
const streams = new KafkaStreams(topology, config)

await streams.start()

// 4. 종료 처리
process.on('SIGTERM', async () => {
  await streams.close()
})
```

## 📊 KSQL/ksqlDB

### KSQL이란?
- **SQL로 스트림 처리**
- Kafka Streams 위에 구축된 SQL 엔진
- 코드 없이 스트림 처리 가능

### KSQL vs Kafka Streams

| 특징 | KSQL | Kafka Streams |
|------|------|---------------|
| 언어 | SQL | Java/Scala |
| 배포 | 서버 클러스터 | 임베디드 라이브러리 |
| 유연성 | 제한적 | 완전한 제어 |
| 학습곡선 | 낮음 | 높음 |

### KSQL 예제

```sql
-- Stream 생성
CREATE STREAM orders (
  orderId VARCHAR,
  userId VARCHAR,
  amount DOUBLE,
  timestamp BIGINT
) WITH (
  KAFKA_TOPIC='orders',
  VALUE_FORMAT='JSON'
);

-- Table 생성
CREATE TABLE users (
  userId VARCHAR PRIMARY KEY,
  name VARCHAR,
  email VARCHAR
) WITH (
  KAFKA_TOPIC='users',
  VALUE_FORMAT='JSON'
);

-- 실시간 집계
CREATE TABLE order_totals AS
  SELECT 
    userId,
    COUNT(*) as order_count,
    SUM(amount) as total_amount
  FROM orders
  WINDOW TUMBLING (SIZE 1 HOUR)
  GROUP BY userId;

-- Stream-Table 조인
CREATE STREAM enriched_orders AS
  SELECT 
    o.orderId,
    o.amount,
    u.name as userName,
    u.email
  FROM orders o
  LEFT JOIN users u ON o.userId = u.userId;

-- 필터링
CREATE STREAM large_orders AS
  SELECT * FROM orders
  WHERE amount > 1000;
```

## 🎯 사용 사례

### 1. 실시간 대시보드
```
Kafka → Streams Processing → Time Series DB → Grafana
                          └→ WebSocket → React Dashboard
```

### 2. 이상 탐지
```
Sensor Data → Kafka → Stream Analytics → Alert System
                    └→ ML Model → Anomaly Detection
```

### 3. ETL 파이프라인
```
Source DB → CDC → Kafka → Stream Transform → Target DB
                        └→ Data Lake
```

## 📈 성능 최적화

### 1. 파티셔닝
```javascript
// Co-partitioning으로 조인 최적화
stream1.through('repartitioned-topic', 
  Produced.with(Serdes.String(), Serdes.JSON())
    .withStreamPartitioner((topic, key, value) => 
      Math.abs(key.hashCode()) % numPartitions
    )
)
```

### 2. State Store 튜닝
```javascript
// RocksDB 설정 최적화
const storeSupplier = Stores.persistentKeyValueStore('my-store')
  .withCachingEnabled()  // 캐싱 활성화
  .withLoggingEnabled()   // 변경 로그 활성화
```

### 3. 처리 보장
```javascript
// Exactly-once 처리
config.processingGuarantee = 'exactly_once_v2'
config.transactionalId = 'my-transactional-id'
```

## 🧪 테스트

### TopologyTestDriver
```javascript
// 토폴로지 테스트
const testDriver = new TopologyTestDriver(topology, config)

const inputTopic = testDriver.createInputTopic('input', 
  Serdes.String(), Serdes.JSON())
  
const outputTopic = testDriver.createOutputTopic('output',
  Serdes.String(), Serdes.JSON())

// 테스트 데이터 입력
inputTopic.pipeInput('key1', { value: 100 })

// 결과 검증
const output = outputTopic.readRecord()
expect(output.value).toEqual({ value: 100, processed: true })
```

## 🎓 학습 경로

1. **기본 Operations 익히기**
   - Filter, Map, GroupBy
   - 간단한 토폴로지 구성

2. **Stateful Processing**
   - Aggregation
   - Windowing
   - State Store 이해

3. **고급 기능**
   - Join operations
   - Custom processors
   - Error handling

4. **프로덕션 준비**
   - 모니터링
   - 성능 튜닝
   - 장애 복구

## 📚 실습 파일

- `kafka-streams/basic-stream.js` - 기본 스트림 처리
- `kafka-streams/windowing.js` - 윈도우 처리
- `kafka-streams/join-example.js` - 조인 예제
- `ksql/queries.sql` - KSQL 쿼리 모음

---

💡 **다음 단계**: Streams를 마스터했다면 [실전 패턴](../05-patterns/README.md)을 학습하세요!
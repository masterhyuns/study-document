# 📤 Kafka Producer 학습 가이드

## 🎯 Producer란?

Producer는 Kafka에 메시지를 **생산(전송)하는 클라이언트**입니다.

### 핵심 역할
- 데이터를 Kafka 토픽으로 전송
- 파티션 선택 및 라우팅
- 메시지 직렬화
- 전송 보장 수준 관리

## 🏗️ Producer 동작 원리

```
Producer Application
        │
        ▼
┌──────────────────┐
│ 1. ProducerRecord│ (메시지 생성)
│   - Topic        │
│   - Key          │
│   - Value        │
│   - Partition    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 2. Serializer    │ (직렬화)
│   - Key → bytes  │
│   - Value → bytes│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 3. Partitioner   │ (파티션 결정)
│   - Hash(key)    │
│   - Round-robin  │
│   - Custom logic │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 4. Record        │ (배치 버퍼)
│   Accumulator    │
│   - Batching     │
│   - Compression  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 5. Sender Thread │ (네트워크 전송)
│   - Async send   │
│   - Retry logic  │
└────────┬─────────┘
         │
         ▼
    Kafka Broker
```

## 🚀 빠른 시작

### 1. 의존성 설치
```bash
cd kafka/02-producer
npm install
```

### 2. 기본 예제 실행
```bash
# Docker Compose로 Kafka 실행 중이어야 함
npm run basic
```

## 📝 코드 예제

### 1️⃣ 기본 Producer 설정

```javascript
import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'my-app',
  brokers: ['localhost:9092']
});

const producer = kafka.producer();
```

### 2️⃣ 단순 메시지 전송

```javascript
// Producer 연결
await producer.connect();

// 메시지 전송
await producer.send({
  topic: 'user-events',
  messages: [
    { value: 'Hello Kafka!' }
  ]
});

// 연결 종료
await producer.disconnect();
```

### 3️⃣ 키를 포함한 메시지

```javascript
await producer.send({
  topic: 'user-events',
  messages: [
    {
      key: 'user-123',
      value: JSON.stringify({
        userId: '123',
        action: 'LOGIN',
        timestamp: new Date()
      })
    }
  ]
});
```

### 4️⃣ 배치 전송

```javascript
const messages = [];
for (let i = 0; i < 100; i++) {
  messages.push({
    key: `key-${i}`,
    value: `Message ${i}`
  });
}

await producer.send({
  topic: 'batch-topic',
  messages: messages
});
```

## ⚙️ Producer 설정 옵션

### 중요 설정 파라미터

| 설정 | 설명 | 기본값 | 권장값 |
|------|------|--------|--------|
| `acks` | 확인 수준 | 1 | -1 (all) |
| `retries` | 재시도 횟수 | 2 | 3-5 |
| `batch.size` | 배치 크기 | 16384 | 32768 |
| `linger.ms` | 배치 대기 시간 | 0 | 5-10 |
| `compression.type` | 압축 타입 | none | snappy/lz4 |
| `idempotent` | 멱등성 활성화 | false | true |

### Acks (확인 수준) 상세

```javascript
// acks = 0: 확인 없음 (Fire and Forget)
const producer = kafka.producer({ acks: 0 });
// 👍 가장 빠름
// 👎 메시지 유실 가능성

// acks = 1: 리더 확인
const producer = kafka.producer({ acks: 1 });
// 👍 적당한 속도와 안정성
// 👎 리더 장애 시 데이터 유실 가능

// acks = -1 (all): 모든 ISR 확인
const producer = kafka.producer({ acks: -1 });
// 👍 가장 안전
// 👎 가장 느림
```

## 🎯 파티션 전략

### 1. 기본 파티셔너 (DefaultPartitioner)
```javascript
// 키가 있으면 해시, 없으면 라운드로빈
const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner
});
```

### 2. 커스텀 파티셔너
```javascript
const customPartitioner = () => {
  return ({ topic, partitionMetadata, message }) => {
    // 사용자 ID 기반 파티셔닝
    const userId = message.key.toString();
    const numPartitions = partitionMetadata.length;
    const partition = hashCode(userId) % numPartitions;
    return partition;
  };
};

const producer = kafka.producer({
  createPartitioner: customPartitioner
});
```

### 3. 파티션 직접 지정
```javascript
await producer.send({
  topic: 'my-topic',
  messages: [
    {
      partition: 2,  // 파티션 2로 직접 전송
      value: 'Direct partition message'
    }
  ]
});
```

## 🔄 배치 처리 최적화

### 배치 설정 이해
```javascript
const producer = kafka.producer({
  // 배치 크기 (bytes)
  batch: {
    size: 32768,  // 32KB
  },
  
  // 대기 시간 (ms)
  // 배치가 가득 차지 않아도 이 시간 후 전송
  linger: 10
});
```

### 배치 효과
```
배치 없음:
[msg] → send() → Network (지연: 5ms)
[msg] → send() → Network (지연: 5ms)
[msg] → send() → Network (지연: 5ms)
총 지연: 15ms

배치 사용:
[msg][msg][msg] → send() → Network (지연: 6ms)
총 지연: 6ms + 대기시간
```

## 🛡️ 에러 처리

### 재시도 로직
```javascript
const producer = kafka.producer({
  retry: {
    retries: 5,
    initialRetryTime: 100,  // 첫 재시도 대기시간
    maxRetryTime: 30000,    // 최대 재시도 대기시간
    factor: 2,               // 지수 백오프 팩터
    multiplier: 1.5          // 재시도 시간 증가율
  }
});
```

### 에러 타입별 처리
```javascript
try {
  await producer.send({ topic, messages });
} catch (error) {
  if (error.name === 'KafkaJSNumberOfRetriesExceeded') {
    // 재시도 초과
    console.error('재시도 횟수 초과');
  } else if (error.name === 'KafkaJSProtocolError') {
    // 프로토콜 에러
    console.error('프로토콜 에러:', error.message);
  } else if (error.name === 'KafkaJSConnectionError') {
    // 연결 에러
    console.error('연결 실패');
  }
}
```

## 📊 성능 최적화

### 1. 압축 사용
```javascript
const producer = kafka.producer({
  compression: CompressionTypes.GZIP  // 또는 SNAPPY, LZ4, ZSTD
});
```

압축 비교:
| 타입 | 압축률 | CPU 사용량 | 속도 |
|------|--------|------------|------|
| None | 0% | 낮음 | 빠름 |
| GZIP | 높음 | 높음 | 느림 |
| Snappy | 중간 | 낮음 | 빠름 |
| LZ4 | 중간 | 낮음 | 매우 빠름 |
| ZSTD | 높음 | 중간 | 중간 |

### 2. 비동기 전송
```javascript
// Promise.all로 병렬 전송
const promises = topics.map(topic => 
  producer.send({ topic, messages })
);
await Promise.all(promises);
```

### 3. 멱등성 (Idempotence)
```javascript
const producer = kafka.producer({
  idempotent: true  // 중복 전송 방지
});
```

## 🔍 모니터링

### Producer 메트릭
```javascript
// 전송 성공/실패 카운터
let successCount = 0;
let errorCount = 0;

producer.on('producer.network.request', async ({ payload }) => {
  if (payload.apiName === 'Produce') {
    successCount++;
  }
});

producer.on('producer.network.request_error', async ({ error }) => {
  errorCount++;
  console.error('전송 실패:', error);
});

// 주기적으로 메트릭 출력
setInterval(() => {
  console.log(`성공: ${successCount}, 실패: ${errorCount}`);
}, 5000);
```

## 🧪 테스트 시나리오

### 시나리오 1: 대용량 처리
```bash
# 10만 개 메시지 전송 테스트
node advanced/performance-producer.js
```

### 시나리오 2: 장애 복구
```bash
# 브로커 1개 중지 후 테스트
docker-compose stop kafka2
node basic-producer.js
```

### 시나리오 3: 트랜잭션
```bash
# 트랜잭션 Producer 테스트
node advanced/transaction-producer.js
```

## 📚 고급 주제

### 1. Transactional Producer
```javascript
const producer = kafka.producer({
  transactionalId: 'my-transactional-id',
  idempotent: true
});

await producer.connect();

// 트랜잭션 시작
const transaction = await producer.transaction();

try {
  await transaction.send({ topic: 'topic1', messages });
  await transaction.send({ topic: 'topic2', messages });
  
  await transaction.commit();
} catch (error) {
  await transaction.abort();
  throw error;
}
```

### 2. Exactly Once Semantics
```javascript
// Producer 설정
const producer = kafka.producer({
  idempotent: true,
  transactionalId: 'exact-once-id',
  maxInFlightRequests: 5
});

// Consumer 설정
const consumer = kafka.consumer({
  groupId: 'exact-once-group',
  isolation: { level: 'read_committed' }
});
```

## 🎓 실습 과제

### 초급
1. ✅ 단일 메시지 전송
2. ✅ JSON 데이터 전송
3. ✅ 에러 처리 구현

### 중급
4. ⬜ 배치 전송 최적화
5. ⬜ 커스텀 파티셔너 구현
6. ⬜ 성능 벤치마크

### 고급
7. ⬜ 트랜잭션 구현
8. ⬜ Exactly-Once 보장
9. ⬜ 백프레셔 처리

## 🔗 관련 문서

- [Consumer 학습](../03-consumer/README.md)
- [스트림 처리](../04-streaming/README.md)
- [실전 패턴](../05-patterns/README.md)

## ❓ FAQ

**Q: 메시지 순서가 보장되나요?**
A: 같은 파티션 내에서만 순서가 보장됩니다. 같은 키를 사용하면 같은 파티션으로 전송됩니다.

**Q: 메시지 크기 제한은?**
A: 기본 1MB입니다. `message.max.bytes` 설정으로 변경 가능합니다.

**Q: Producer가 느린데 어떻게 최적화하나요?**
A: 배치 크기 증가, 압축 사용, 비동기 전송, 파티션 수 증가를 고려하세요.

---

💡 **다음 단계**: Producer를 충분히 이해했다면 [Consumer 학습](../03-consumer/README.md)으로 진행하세요!
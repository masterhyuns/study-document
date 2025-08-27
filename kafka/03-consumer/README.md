# 📥 Kafka Consumer 학습 가이드

## 🎯 Consumer란?

Consumer는 Kafka 토픽에서 메시지를 **소비(읽기)하는 클라이언트**입니다.

### 핵심 역할
- Kafka 토픽에서 메시지 읽기
- 오프셋 관리 및 추적
- Consumer Group을 통한 로드 밸런싱
- 메시지 처리 및 커밋

## 🏗️ Consumer 동작 원리

```
     Kafka Cluster
          │
          ▼
┌──────────────────┐
│  Topic/Partition │
│  [0][1][2][3]... │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 1. Fetch Request │ (메시지 요청)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 2. Deserializer  │ (역직렬화)
│   bytes → Object │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 3. Process       │ (비즈니스 로직)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 4. Commit Offset │ (오프셋 커밋)
└──────────────────┘
```

## 🚀 빠른 시작

### 1. 의존성 설치
```bash
cd kafka/03-consumer
npm install
```

### 2. 기본 예제 실행
```bash
# 기본 Consumer
npm run basic

# Consumer Group
npm run group
```

## 📝 코드 예제

### 1️⃣ 기본 Consumer 설정

```javascript
import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'my-app',
  brokers: ['localhost:9092']
});

const consumer = kafka.consumer({
  groupId: 'my-consumer-group'
});
```

### 2️⃣ 메시지 읽기

```javascript
// Consumer 연결
await consumer.connect();

// 토픽 구독
await consumer.subscribe({
  topics: ['user-events'],
  fromBeginning: true  // 처음부터 읽기
});

// 메시지 처리
await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    console.log({
      topic,
      partition,
      offset: message.offset,
      value: message.value.toString()
    });
  }
});
```

### 3️⃣ 배치 처리

```javascript
await consumer.run({
  eachBatch: async ({ 
    batch, 
    resolveOffset, 
    heartbeat, 
    commitOffsetsIfNecessary 
  }) => {
    for (const message of batch.messages) {
      // 메시지 처리
      await processMessage(message);
      
      // 오프셋 업데이트
      resolveOffset(message.offset);
      
      // 하트비트
      await heartbeat();
    }
    
    // 배치 완료 후 커밋
    await commitOffsetsIfNecessary();
  }
});
```

## 👥 Consumer Group

### Consumer Group이란?
```
        Topic (6 Partitions)
┌────┬────┬────┬────┬────┬────┐
│ P0 │ P1 │ P2 │ P3 │ P4 │ P5 │
└──┬─┴──┬─┴──┬─┴──┬─┴──┬─┴──┬─┘
   │    │    │    │    │    │
   ▼    ▼    ▼    ▼    ▼    ▼
Consumer Group: "analytics-group"
┌──────┬──────┬──────┐
│  C1  │  C2  │  C3  │
│ P0,P1│ P2,P3│ P4,P5│
└──────┴──────┴──────┘
```

### 특징
- **로드 밸런싱**: 파티션을 Consumer들에게 분배
- **장애 복구**: Consumer 실패 시 자동 재할당
- **순서 보장**: 파티션 내에서만 순서 보장
- **스케일링**: Consumer 추가/제거 시 자동 리밸런싱

### Group 설정 예제
```javascript
const consumer = kafka.consumer({
  groupId: 'analytics-group',
  sessionTimeout: 30000,      // 세션 타임아웃
  rebalanceTimeout: 60000,    // 리밸런싱 타임아웃
  heartbeatInterval: 3000,    // 하트비트 간격
  
  // 파티션 할당 전략
  partitionAssigners: [
    'RoundRobin',  // 라운드로빈
    'Range'        // 범위 할당
  ]
});
```

## ⚙️ Consumer 설정 옵션

### 중요 설정 파라미터

| 설정 | 설명 | 기본값 | 권장값 |
|------|------|--------|--------|
| `groupId` | Consumer 그룹 ID | 필수 | 용도별 구분 |
| `autoCommit` | 자동 오프셋 커밋 | true | false (수동 권장) |
| `sessionTimeout` | 세션 타임아웃 | 30000 | 30000-60000 |
| `maxWaitTimeInMs` | 최대 대기 시간 | 5000 | 1000-5000 |
| `minBytes` | 최소 fetch 크기 | 1 | 1024 |
| `maxBytes` | 최대 fetch 크기 | 1MB | 10MB |

## 🎯 오프셋 관리

### 오프셋이란?
```
Partition 0:
┌───┬───┬───┬───┬───┬───┬───┐
│ 0 │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │
└───┴───┴───┴─▲─┴───┴───┴───┘
              │
         Current Offset: 3
         (다음 읽을 메시지: 4)
```

### 자동 커밋
```javascript
const consumer = kafka.consumer({
  groupId: 'auto-commit-group',
  autoCommit: true,
  autoCommitInterval: 5000,  // 5초마다
  autoCommitThreshold: 100   // 또는 100개마다
});
```

### 수동 커밋
```javascript
const consumer = kafka.consumer({
  groupId: 'manual-commit-group',
  autoCommit: false
});

await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    try {
      await processMessage(message);
      
      // 성공 시 커밋
      await consumer.commitOffsets([{
        topic,
        partition,
        offset: (parseInt(message.offset) + 1).toString()
      }]);
    } catch (error) {
      // 실패 시 커밋하지 않음 (재처리)
    }
  }
});
```

### 오프셋 리셋
```javascript
// earliest: 처음부터
await consumer.subscribe({
  topics: ['my-topic'],
  fromBeginning: true
});

// latest: 최신부터 (기본값)
await consumer.subscribe({
  topics: ['my-topic'],
  fromBeginning: false
});
```

## 🔄 리밸런싱

### 리밸런싱 발생 조건
1. Consumer 추가/제거
2. 토픽 파티션 추가
3. Consumer 장애

### 리밸런싱 프로세스
```
1. 리밸런싱 트리거
       ↓
2. 모든 Consumer 일시 정지
       ↓
3. 파티션 재할당
       ↓
4. Consumer 재시작
```

### 리밸런싱 이벤트 처리
```javascript
consumer.on('consumer.rebalancing', () => {
  console.log('리밸런싱 시작');
  // 진행 중인 작업 정리
});

consumer.on('consumer.group_join', ({ duration }) => {
  console.log(`리밸런싱 완료: ${duration}ms`);
  // 작업 재개
});
```

## 🛡️ 에러 처리

### 재시도 전략
```javascript
const maxRetries = 3;
let retryCount = 0;

await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    try {
      await processMessage(message);
      retryCount = 0;
    } catch (error) {
      retryCount++;
      
      if (retryCount < maxRetries) {
        // 지수 백오프로 재시도
        await sleep(Math.pow(2, retryCount) * 1000);
        throw error; // Consumer가 재시도
      } else {
        // DLQ로 전송
        await sendToDeadLetterQueue(message);
        retryCount = 0;
      }
    }
  }
});
```

### Dead Letter Queue (DLQ)
```javascript
async function sendToDeadLetterQueue(message) {
  const producer = kafka.producer();
  await producer.connect();
  
  await producer.send({
    topic: 'dead-letter-queue',
    messages: [{
      key: message.key,
      value: message.value,
      headers: {
        ...message.headers,
        'original-topic': topic,
        'error-timestamp': new Date().toISOString()
      }
    }]
  });
  
  await producer.disconnect();
}
```

## 📊 Consumer Lag 모니터링

### Lag란?
```
Latest Offset: 1000
Current Offset: 850
Lag: 150 messages
```

### Lag 확인
```javascript
const admin = kafka.admin();
await admin.connect();

const offsets = await admin.fetchOffsets({
  groupId: 'my-group',
  topics: ['my-topic']
});

const topicOffsets = await admin.fetchTopicOffsets('my-topic');

// Lag 계산
for (const partition of offsets[0].partitions) {
  const latest = topicOffsets.find(
    p => p.partition === partition.partition
  ).high;
  const current = partition.offset;
  const lag = parseInt(latest) - parseInt(current);
  
  console.log(`Partition ${partition.partition}: Lag = ${lag}`);
}
```

## 🎯 성능 최적화

### 1. Fetch 크기 조정
```javascript
const consumer = kafka.consumer({
  minBytes: 10240,      // 10KB - 더 많은 데이터를 한 번에
  maxBytes: 10485760,   // 10MB
  maxWaitTimeInMs: 100  // 빠른 응답
});
```

### 2. 병렬 처리
```javascript
await consumer.run({
  partitionsConsumedConcurrently: 3,  // 3개 파티션 동시 처리
  eachMessage: async ({ message }) => {
    await processMessage(message);
  }
});
```

### 3. 배치 처리
```javascript
await consumer.run({
  eachBatchAutoResolve: false,
  eachBatch: async ({ batch, resolveOffset }) => {
    const promises = batch.messages.map(message =>
      processMessage(message)
    );
    
    await Promise.all(promises);
    
    // 배치 전체 성공 시 마지막 오프셋만 커밋
    const lastOffset = batch.messages[batch.messages.length - 1].offset;
    resolveOffset(lastOffset);
  }
});
```

## 🧪 테스트 시나리오

### 시나리오 1: Consumer Group 스케일링
```bash
# Consumer 3개로 시작
node consumer-group.js

# 다른 터미널에서 Consumer 추가
node basic-consumer.js
```

### 시나리오 2: 장애 복구
```bash
# Consumer 실행 중 강제 종료
# 다른 Consumer가 파티션을 인계받는지 확인
```

### 시나리오 3: Lag 처리
```bash
# 대량 메시지 생성 후 Consumer 처리 속도 관찰
```

## 📚 고급 주제

### 1. Exactly Once 처리
```javascript
// Idempotent 처리를 위한 ID 관리
const processedIds = new Set();

await consumer.run({
  eachMessage: async ({ message }) => {
    const messageId = message.headers['message-id']?.toString();
    
    if (processedIds.has(messageId)) {
      console.log('중복 메시지 스킵');
      return;
    }
    
    await processMessage(message);
    processedIds.add(messageId);
    
    // 주기적으로 Set 정리
    if (processedIds.size > 10000) {
      processedIds.clear();
    }
  }
});
```

### 2. 시간 기반 처리
```javascript
// 특정 시간 이후 메시지만 처리
const startTime = Date.now() - 3600000; // 1시간 전

await consumer.run({
  eachMessage: async ({ message }) => {
    const messageTime = parseInt(message.timestamp);
    
    if (messageTime < startTime) {
      return; // 오래된 메시지 스킵
    }
    
    await processMessage(message);
  }
});
```

## 🎓 실습 과제

### 초급
1. ✅ 토픽 구독 및 메시지 출력
2. ✅ Consumer Group 생성
3. ✅ 오프셋 확인

### 중급
4. ⬜ 수동 오프셋 커밋 구현
5. ⬜ Consumer Lag 모니터링
6. ⬜ 에러 처리 및 재시도

### 고급
7. ⬜ 리밸런싱 처리
8. ⬜ DLQ 구현
9. ⬜ Exactly Once 보장

## ❓ FAQ

**Q: Consumer Group ID는 어떻게 정하나요?**
A: 애플리케이션과 용도를 나타내는 의미있는 이름 사용 (예: `order-processing-service`)

**Q: 파티션 수보다 Consumer가 많으면?**
A: 초과된 Consumer는 idle 상태가 됩니다. 파티션 수 ≥ Consumer 수를 권장합니다.

**Q: Lag이 계속 증가하면?**
A: Consumer 추가, 처리 로직 최적화, 파티션 수 증가를 고려하세요.

---

💡 **다음 단계**: Consumer를 마스터했다면 [스트림 처리](../04-streaming/README.md)를 학습하세요!
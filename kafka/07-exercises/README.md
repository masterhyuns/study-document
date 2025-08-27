# 🎯 Kafka 실습 프로젝트

## 📚 실습 목록

### 1. 주문 처리 시스템 (Order Processing)
**파일**: `mini-projects/order-processing.js`  
**난이도**: ⭐⭐⭐

마이크로서비스 기반 이커머스 주문 처리 시스템입니다.

#### 구성 요소:
- **Order Service**: 주문 관리
- **Payment Service**: 결제 처리  
- **Inventory Service**: 재고 관리
- **Shipping Service**: 배송 처리
- **Analytics Service**: 실시간 통계

#### 학습 포인트:
- Event-driven 아키텍처
- Saga 패턴 구현
- 보상 트랜잭션
- 실시간 이벤트 처리

#### 실행 방법:
```bash
# 1. Kafka 클러스터 시작
cd ../01-setup
docker-compose up -d

# 2. 패키지 설치
cd ../07-exercises/mini-projects
npm install kafkajs express uuid

# 3. 시스템 실행
node order-processing.js

# 4. 테스트 주문 생성
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "CUST-001",
    "items": [
      {
        "productId": "ITEM-001",
        "name": "Laptop",
        "price": 1500,
        "quantity": 1
      }
    ]
  }'

# 5. 주문 상태 확인
curl http://localhost:3000/api/orders/{orderId}

# 6. 통계 확인
curl http://localhost:3000/api/analytics
```

---

### 2. 실시간 로그 수집기 (Log Aggregator)
**난이도**: ⭐⭐

여러 서비스의 로그를 수집하고 분석하는 시스템입니다.

#### 구현할 기능:
```javascript
// 로그 수집기 구조
class LogAggregator {
  // 1. 로그 수집
  collectLogs(source, logData) {
    // 구조화된 로그 생성
    const log = {
      timestamp: new Date(),
      source,
      level: logData.level,
      message: logData.message,
      metadata: logData.metadata
    }
    
    // Kafka로 전송
    await this.producer.send({
      topic: 'application-logs',
      messages: [{ value: JSON.stringify(log) }]
    })
  }
  
  // 2. 로그 필터링
  filterByLevel(level) {
    // ERROR, WARN, INFO 레벨별 필터
  }
  
  // 3. 로그 집계
  aggregateLogs() {
    // 시간대별, 서비스별 집계
  }
  
  // 4. 알림
  alertOnError() {
    // 에러 패턴 감지 시 알림
  }
}
```

#### 학습 포인트:
- 대용량 로그 처리
- 실시간 필터링
- 패턴 매칭
- 알림 시스템

---

### 3. 실시간 대시보드 (Real-time Analytics)
**난이도**: ⭐⭐⭐⭐

웹소켓을 통한 실시간 데이터 대시보드입니다.

#### 구현할 기능:
```javascript
// 실시간 분석 시스템
class RealTimeAnalytics {
  constructor() {
    this.metrics = {
      orders: { count: 0, revenue: 0 },
      users: { active: 0, new: 0 },
      performance: { avgResponseTime: 0, errorRate: 0 }
    }
  }
  
  // 1. 스트림 처리
  async processStream() {
    // Kafka Streams로 실시간 집계
    stream
      .groupByKey()
      .window(60000) // 1분 윈도우
      .aggregate(/* 집계 로직 */)
  }
  
  // 2. WebSocket 전송
  broadcastMetrics() {
    // 연결된 클라이언트에 실시간 전송
    this.wsClients.forEach(client => {
      client.send(JSON.stringify(this.metrics))
    })
  }
  
  // 3. 이상 탐지
  detectAnomalies() {
    // 통계적 이상치 탐지
    if (metric > threshold) {
      this.sendAlert()
    }
  }
}
```

#### 학습 포인트:
- Kafka Streams 활용
- WebSocket 연동
- 실시간 집계
- 이상 탐지 알고리즘

---

### 4. CDC (Change Data Capture) 파이프라인
**난이도**: ⭐⭐⭐⭐

데이터베이스 변경사항을 실시간으로 캡처하는 시스템입니다.

#### 구현 아이디어:
```javascript
// CDC 파이프라인
class CDCPipeline {
  // 1. 변경 감지
  captureChanges() {
    // DB 트리거 또는 폴링
  }
  
  // 2. 이벤트 발행
  publishChangeEvent(change) {
    await producer.send({
      topic: 'db-changes',
      messages: [{
        value: JSON.stringify({
          operation: change.op, // INSERT, UPDATE, DELETE
          table: change.table,
          before: change.before,
          after: change.after,
          timestamp: change.ts
        })
      }]
    })
  }
  
  // 3. 데이터 동기화
  syncToDataLake() {
    // 변경사항을 데이터 레이크에 적용
  }
  
  // 4. 캐시 무효화
  invalidateCache(change) {
    // 관련 캐시 항목 무효화
  }
}
```

---

### 5. IoT 데이터 수집 시스템
**난이도**: ⭐⭐⭐

IoT 센서 데이터를 수집하고 처리하는 시스템입니다.

#### 구현 아이디어:
```javascript
// IoT 데이터 처리
class IoTDataProcessor {
  // 1. 센서 데이터 수신
  receiveSensorData(deviceId, data) {
    // 데이터 검증 및 정규화
  }
  
  // 2. 시계열 저장
  storeTimeSeries(data) {
    // 시계열 DB에 저장
  }
  
  // 3. 실시간 알림
  checkThresholds(data) {
    // 임계값 초과 시 알림
  }
  
  // 4. 예측 분석
  predictMaintenance() {
    // ML 모델로 예방 정비 시점 예측
  }
}
```

---

## 🎓 학습 순서 권장사항

### 초급 (1-2주차)
1. **기본 Producer/Consumer 작성**
   - 단순 메시지 전송/수신
   - 에러 처리
   - 설정 최적화

### 중급 (3-4주차)  
2. **주문 처리 시스템 구현**
   - 이벤트 기반 설계
   - 여러 서비스 연동
   - 트랜잭션 패턴

### 고급 (5-6주차)
3. **실시간 분석 시스템**
   - Kafka Streams 사용
   - 복잡한 집계
   - 실시간 대시보드

### 전문가 (7-8주차)
4. **프로덕션 준비**
   - 모니터링 구현
   - 성능 최적화
   - 장애 복구 시나리오

## 📝 과제 체크리스트

### 기능 구현
- [ ] Event Sourcing 패턴 적용
- [ ] CQRS 패턴 구현
- [ ] Saga 패턴으로 분산 트랜잭션
- [ ] 멱등성 보장
- [ ] 에러 처리 및 재시도

### 성능 최적화
- [ ] 배치 처리 구현
- [ ] 압축 적용
- [ ] 파티션 전략 최적화
- [ ] Consumer Group 스케일링

### 모니터링
- [ ] 메트릭 수집
- [ ] 로그 집계
- [ ] 알림 설정
- [ ] 대시보드 구성

### 테스트
- [ ] 단위 테스트
- [ ] 통합 테스트
- [ ] 부하 테스트
- [ ] 장애 시나리오 테스트

## 🚀 실행 환경

### 필수 요구사항
- Docker & Docker Compose
- Node.js 18+
- Kafka 클러스터 (3 브로커)

### 패키지 설치
```bash
npm init -y
npm install kafkajs express uuid winston
npm install --save-dev jest
```

### 환경 변수
```env
KAFKA_BROKERS=localhost:9092,localhost:9093,localhost:9094
KAFKA_CLIENT_ID=exercise-app
KAFKA_GROUP_ID=exercise-group
LOG_LEVEL=info
NODE_ENV=development
```

## 📚 추가 학습 자료

### 공식 문서
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [KafkaJS Documentation](https://kafka.js.org/)

### 추천 도서
- "Kafka: The Definitive Guide"
- "Designing Data-Intensive Applications"

### 온라인 강좌
- Confluent Kafka Tutorials
- Udemy Kafka Courses

## 💡 팁과 트릭

### 디버깅
```javascript
// 상세 로깅 활성화
const kafka = new Kafka({
  logLevel: logLevel.DEBUG,
  logCreator: customLogCreator
})

// 이벤트 리스너 활용
consumer.on('consumer.fetch_start', () => {
  console.log('Fetching messages...')
})
```

### 성능 측정
```javascript
// 처리 시간 측정
const start = Date.now()
await processMessage(message)
const duration = Date.now() - start

// 메트릭 기록
metrics.recordProcessingTime(duration)
```

### 에러 복구
```javascript
// Dead Letter Queue
async function handleError(message, error) {
  await producer.send({
    topic: 'dead-letter-queue',
    messages: [{
      value: JSON.stringify({
        originalMessage: message,
        error: error.message,
        timestamp: new Date()
      })
    }]
  })
}
```

---

🎉 **축하합니다!** 이제 Kafka를 활용한 실전 프로젝트를 구현할 준비가 되었습니다!
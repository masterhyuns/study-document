# 📊 Kafka 모니터링 가이드

## 🎯 모니터링의 중요성

Kafka 클러스터의 **건강 상태, 성능, 리소스 사용량**을 실시간으로 추적하여 문제를 사전에 발견하고 해결합니다.

## 🏗️ 모니터링 스택

```
┌─────────────────────────────────────────────┐
│              Monitoring Stack               │
├─────────────────────────────────────────────┤
│                                             │
│  Kafka Cluster                              │
│    ↓ JMX Metrics                            │
│  JMX Exporter                               │
│    ↓ Prometheus Format                      │
│  Prometheus                                 │
│    ↓ Time Series Data                       │
│  Grafana                                    │
│    ↓ Visualization                          │
│  AlertManager                               │
│    ↓ Notifications                          │
│  Slack/Email/PagerDuty                      │
│                                             │
└─────────────────────────────────────────────┘
```

## 📈 핵심 메트릭

### 1. Broker 메트릭

| 메트릭 | 설명 | 임계값 | 알림 조건 |
|--------|------|--------|----------|
| **UnderReplicatedPartitions** | 복제 지연 파티션 수 | 0 | > 0 |
| **OfflinePartitionsCount** | 오프라인 파티션 수 | 0 | > 0 |
| **ActiveControllerCount** | 활성 컨트롤러 수 | 1 | ≠ 1 |
| **RequestHandlerAvgIdlePercent** | 요청 핸들러 유휴율 | > 30% | < 20% |
| **NetworkProcessorAvgIdlePercent** | 네트워크 프로세서 유휴율 | > 30% | < 20% |
| **LeaderElectionRate** | 리더 선출 빈도 | < 1/min | > 5/min |

### 2. Topic/Partition 메트릭

| 메트릭 | 설명 | 모니터링 포인트 |
|--------|------|-----------------|
| **MessagesInPerSec** | 초당 입력 메시지 | 급격한 증가/감소 |
| **BytesInPerSec** | 초당 입력 바이트 | 처리량 추세 |
| **BytesOutPerSec** | 초당 출력 바이트 | 소비 속도 |
| **LogEndOffset** | 파티션 끝 오프셋 | 증가 속도 |
| **LogStartOffset** | 파티션 시작 오프셋 | 보존 정책 |
| **Size** | 로그 크기 | 디스크 사용량 |

### 3. Consumer 메트릭

| 메트릭 | 설명 | 임계값 |
|--------|------|--------|
| **ConsumerLag** | 컨슈머 지연 | < 1000 |
| **ConsumerFetchRate** | Fetch 빈도 | 정상 범위 유지 |
| **CommitRate** | 커밋 빈도 | 0이 아님 |
| **RebalanceRate** | 리밸런싱 빈도 | < 1/hour |

### 4. JVM 메트릭

| 메트릭 | 설명 | 임계값 |
|--------|------|--------|
| **HeapMemoryUsage** | 힙 메모리 사용량 | < 85% |
| **GCTimePercent** | GC 시간 비율 | < 10% |
| **ThreadCount** | 스레드 수 | < 1000 |
| **FileDescriptorUsage** | 파일 디스크립터 | < 85% |

## 🔧 모니터링 구성

### 1. JMX 활성화

```bash
# kafka-server-start.sh 수정
export JMX_PORT=9999
export KAFKA_JMX_OPTS="-Dcom.sun.management.jmxremote \
  -Dcom.sun.management.jmxremote.authenticate=false \
  -Dcom.sun.management.jmxremote.ssl=false \
  -Djava.rmi.server.hostname=localhost \
  -Dcom.sun.management.jmxremote.port=$JMX_PORT"
```

### 2. Prometheus JMX Exporter 설정

```yaml
# jmx-exporter-config.yml
lowercaseOutputName: true
lowercaseOutputLabelNames: true
whitelistObjectNames:
  - kafka.server:type=BrokerTopicMetrics,*
  - kafka.server:type=ReplicaManager,*
  - kafka.controller:type=KafkaController,*
  - kafka.server:type=Produce,*
  - kafka.server:type=Fetch,*
  - kafka.network:type=RequestMetrics,*
  - kafka.server:type=KafkaRequestHandlerPool,*
  - kafka.server:type=SessionExpireListener,*
  - kafka.log:type=LogManager,*

rules:
  # Broker 메트릭
  - pattern: kafka.server<type=BrokerTopicMetrics, name=(.+), topic=(.+)><>Count
    name: kafka_broker_topic_metrics_$1_total
    labels:
      topic: "$2"
    type: COUNTER
    
  # Consumer Lag
  - pattern: kafka.consumer<type=consumer-fetch-manager-metrics, client-id=(.+)><>records-lag-max
    name: kafka_consumer_lag_max
    labels:
      client_id: "$1"
    type: GAUGE
```

### 3. Prometheus 설정

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'kafka'
    static_configs:
      - targets:
        - 'localhost:7071'  # JMX Exporter
        - 'localhost:7072'
        - 'localhost:7073'
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        regex: '([^:]+):.*'
        
  - job_name: 'kafka-lag-exporter'
    static_configs:
      - targets: ['localhost:9090']
```

### 4. Grafana Dashboard 설정

```json
{
  "dashboard": {
    "title": "Kafka Cluster Monitoring",
    "panels": [
      {
        "title": "Messages In Per Second",
        "targets": [
          {
            "expr": "sum(rate(kafka_broker_topic_metrics_messages_in_total[5m])) by (topic)"
          }
        ]
      },
      {
        "title": "Consumer Lag",
        "targets": [
          {
            "expr": "kafka_consumer_lag_max"
          }
        ]
      },
      {
        "title": "Under Replicated Partitions",
        "targets": [
          {
            "expr": "kafka_server_replica_manager_underreplicatedpartitions"
          }
        ]
      }
    ]
  }
}
```

## 🚨 알림 규칙

### AlertManager Rules

```yaml
# alert-rules.yml
groups:
  - name: kafka_alerts
    interval: 30s
    rules:
      # 파티션 오프라인
      - alert: KafkaOfflinePartitions
        expr: kafka_controller_offline_partitions_count > 0
        for: 1m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "Kafka has offline partitions"
          description: "{{ $value }} partitions are offline"
      
      # 언더 레플리케이션
      - alert: KafkaUnderReplicatedPartitions
        expr: kafka_server_replica_manager_underreplicatedpartitions > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Kafka has under-replicated partitions"
          description: "{{ $value }} partitions are under-replicated"
      
      # 컨슈머 렉
      - alert: KafkaConsumerLag
        expr: kafka_consumer_lag_max > 10000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High consumer lag detected"
          description: "Consumer {{ $labels.client_id }} has lag of {{ $value }}"
      
      # 브로커 다운
      - alert: KafkaBrokerDown
        expr: up{job="kafka"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Kafka broker is down"
          description: "Broker {{ $labels.instance }} is down"
      
      # 디스크 사용량
      - alert: KafkaDiskUsageHigh
        expr: kafka_log_size_bytes / kafka_log_segment_bytes > 0.85
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High disk usage"
          description: "Disk usage is above 85%"
```

## 📊 커스텀 메트릭

### Application 메트릭

```javascript
// Kafka Client 메트릭 수집
import { Registry, Counter, Histogram, Gauge } from 'prom-client'

const registry = new Registry()

// 카운터: 전송된 메시지 수
const messagesProduced = new Counter({
  name: 'kafka_messages_produced_total',
  help: 'Total number of messages produced',
  labelNames: ['topic'],
  registers: [registry]
})

// 히스토그램: 메시지 처리 시간
const messageProcessingTime = new Histogram({
  name: 'kafka_message_processing_duration_seconds',
  help: 'Message processing duration',
  labelNames: ['topic', 'consumer_group'],
  buckets: [0.001, 0.01, 0.1, 0.5, 1, 5],
  registers: [registry]
})

// 게이지: 현재 컨슈머 렉
const consumerLag = new Gauge({
  name: 'kafka_consumer_lag_current',
  help: 'Current consumer lag',
  labelNames: ['topic', 'partition', 'consumer_group'],
  registers: [registry]
})

// Producer 메트릭
producer.on('producer.network.request', ({ payload }) => {
  if (payload.apiName === 'Produce') {
    messagesProduced.inc({ topic: payload.topic })
  }
})

// Consumer 메트릭
consumer.on('consumer.fetch', ({ numberOfMessages, topic }) => {
  const endTimer = messageProcessingTime.startTimer({ 
    topic, 
    consumer_group: groupId 
  })
  
  // 처리 후
  endTimer()
})

// Lag 모니터링
async function updateConsumerLag() {
  const admin = kafka.admin()
  const offsets = await admin.fetchOffsets({ groupId, topics })
  
  for (const topic of offsets) {
    for (const partition of topic.partitions) {
      const lag = calculateLag(partition)
      consumerLag.set(
        { topic: topic.topic, partition: partition.partition, consumer_group: groupId },
        lag
      )
    }
  }
}

// Express 엔드포인트로 메트릭 노출
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType)
  res.end(await registry.metrics())
})
```

## 🔍 로그 분석

### 구조화된 로깅

```javascript
import winston from 'winston'

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'kafka.log' })
  ]
})

// 구조화된 로그
logger.info('Message produced', {
  topic: 'orders',
  partition: 0,
  offset: 12345,
  key: 'order-123',
  timestamp: new Date().toISOString(),
  producerId: 'producer-1'
})

// 에러 로깅
logger.error('Failed to process message', {
  error: error.message,
  topic: 'orders',
  partition: 0,
  offset: 12345,
  consumer_group: 'order-processor',
  retry_count: 3
})
```

### ELK Stack 연동

```yaml
# logstash.conf
input {
  file {
    path => "/var/log/kafka/*.log"
    codec => json
  }
}

filter {
  if [topic] {
    mutate {
      add_field => { "kafka_topic" => "%{topic}" }
    }
  }
  
  date {
    match => [ "timestamp", "ISO8601" ]
  }
}

output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "kafka-logs-%{+YYYY.MM.dd}"
  }
}
```

## 📱 대시보드 예제

### 실시간 모니터링 대시보드

```
┌────────────────────────────────────────────────┐
│            Kafka Cluster Dashboard             │
├────────────────────────────────────────────────┤
│                                                │
│ Cluster Health: 🟢 Healthy                     │
│ Brokers: 3/3 Online                           │
│ Topics: 15 | Partitions: 45 | ISR: 100%       │
│                                                │
│ ┌──────────────┐ ┌──────────────┐             │
│ │Messages/sec  │ │ Bytes/sec    │             │
│ │   📈 15.2K   │ │  📊 2.3 MB   │             │
│ └──────────────┘ └──────────────┘             │
│                                                │
│ Consumer Lag by Group:                        │
│ ├─ analytics-group: 234 msgs                  │
│ ├─ payment-processor: 12 msgs                 │
│ └─ inventory-sync: 0 msgs                     │
│                                                │
│ Top Topics by Volume:                         │
│ 1. user-events     45% ████████▌             │
│ 2. order-events    30% ██████                │
│ 3. system-logs     25% █████                 │
│                                                │
│ Alerts: ⚠️ 2 Warnings                         │
│ • High consumer lag in analytics-group        │
│ • Disk usage at 78% on broker-2              │
└────────────────────────────────────────────────┘
```

## 🛠️ 트러블슈팅 가이드

### 일반적인 문제와 해결방법

| 증상 | 가능한 원인 | 해결 방법 |
|------|------------|----------|
| **High Consumer Lag** | 처리 속도 < 생산 속도 | Consumer 스케일 아웃, 처리 로직 최적화 |
| **Under Replicated Partitions** | 브로커 과부하/네트워크 이슈 | 리소스 증설, 네트워크 확인 |
| **Frequent Rebalancing** | Consumer 타임아웃 | session.timeout.ms 증가 |
| **High Memory Usage** | 큰 배치 크기 | batch.size 감소, 힙 메모리 증가 |
| **Slow Producer** | 네트워크 지연, acks=-1 | acks=1로 변경, 압축 사용 |

## 🎯 모니터링 체크리스트

### 일일 점검
- [ ] 클러스터 건강 상태
- [ ] Consumer Lag 확인
- [ ] 디스크 사용량
- [ ] 에러 로그 검토

### 주간 점검
- [ ] 성능 추세 분석
- [ ] 리소스 사용 패턴
- [ ] 알림 규칙 검토
- [ ] 백업 상태 확인

### 월간 점검
- [ ] 용량 계획
- [ ] 파티션 재균형
- [ ] 보존 정책 검토
- [ ] 모니터링 도구 업데이트

---

💡 **다음 단계**: [실습 프로젝트](../07-exercises/README.md)에서 실제 모니터링을 구현해보세요!
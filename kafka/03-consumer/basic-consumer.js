/**
 * Kafka Basic Consumer 예제
 * 카프카에서 메시지를 소비하는 기본적인 방법을 학습합니다
 */

import { Kafka, logLevel } from 'kafkajs';

// Kafka 클라이언트 설정
const kafka = new Kafka({
  clientId: 'basic-consumer-app',
  brokers: ['localhost:9092', 'localhost:9093', 'localhost:9094'],
  logLevel: logLevel.INFO,
  retry: {
    retries: 5,
    initialRetryTime: 100,
    maxRetryTime: 30000
  }
});

// Consumer 인스턴스 생성
const consumer = kafka.consumer({
  groupId: 'basic-consumer-group',
  
  // 세션 타임아웃 (Consumer가 죽었다고 판단하는 시간)
  sessionTimeout: 30000,
  
  // 리밸런싱 타임아웃
  rebalanceTimeout: 60000,
  
  // 하트비트 간격
  heartbeatInterval: 3000,
  
  // 메타데이터 갱신 주기
  metadataMaxAge: 300000,
  
  // 자동 커밋 설정
  autoCommit: true,
  autoCommitInterval: 5000,
  autoCommitThreshold: 100,
  
  // 파티션 할당 전략
  partitionAssigners: ['RoundRobin'],
  
  // 최대 대기 시간
  maxWaitTimeInMs: 5000,
  
  // 한 번에 가져올 최소/최대 바이트
  minBytes: 1,
  maxBytes: 1048576, // 1MB
  
  // 재시도 설정
  retry: {
    retries: 5
  }
});

/**
 * 기본 메시지 소비
 */
async function basicConsume() {
  console.log('📥 기본 Consumer 시작...');
  
  // 토픽 구독
  await consumer.subscribe({
    topics: ['user-activities', 'order-events'],
    fromBeginning: false // true면 처음부터, false면 최신부터
  });
  
  // 메시지 처리
  await consumer.run({
    // 각 메시지마다 호출되는 핸들러
    eachMessage: async ({ topic, partition, message, heartbeat, pause }) => {
      console.log('📨 메시지 수신:', {
        topic,
        partition,
        offset: message.offset,
        key: message.key?.toString(),
        value: message.value?.toString(),
        headers: message.headers,
        timestamp: message.timestamp
      });
      
      try {
        // 메시지 처리 로직
        const data = JSON.parse(message.value.toString());
        await processMessage(data);
        
        // 주기적으로 하트비트 전송 (장시간 처리 시)
        await heartbeat();
      } catch (error) {
        console.error('❌ 메시지 처리 실패:', error);
        // 에러 발생 시 처리 방법 결정
        // throw error; // 재시도
        // return; // 스킵
      }
    }
  });
}

/**
 * 배치 메시지 처리
 */
async function batchConsume() {
  console.log('📦 배치 Consumer 시작...');
  
  const batchConsumer = kafka.consumer({
    groupId: 'batch-consumer-group'
  });
  
  await batchConsumer.connect();
  await batchConsumer.subscribe({
    topics: ['order-events'],
    fromBeginning: false
  });
  
  await batchConsumer.run({
    // 배치 단위로 메시지 처리
    eachBatch: async ({
      batch,
      resolveOffset,
      heartbeat,
      commitOffsetsIfNecessary,
      uncommittedOffsets,
      isRunning,
      isStale
    }) => {
      console.log(`📦 배치 수신: ${batch.messages.length}개 메시지`);
      
      for (const message of batch.messages) {
        if (!isRunning() || isStale()) break;
        
        try {
          // 메시지 처리
          const data = JSON.parse(message.value.toString());
          await processMessage(data);
          
          // 오프셋 업데이트
          resolveOffset(message.offset);
          
          // 주기적으로 하트비트와 오프셋 커밋
          await heartbeat();
        } catch (error) {
          console.error('❌ 배치 메시지 처리 실패:', error);
        }
      }
      
      // 배치 처리 완료 후 오프셋 커밋
      await commitOffsetsIfNecessary();
    }
  });
}

/**
 * 수동 오프셋 관리
 */
async function manualOffsetManagement() {
  console.log('🎯 수동 오프셋 관리 Consumer...');
  
  const manualConsumer = kafka.consumer({
    groupId: 'manual-offset-group',
    autoCommit: false // 자동 커밋 비활성화
  });
  
  await manualConsumer.connect();
  await manualConsumer.subscribe({
    topics: ['system-logs'],
    fromBeginning: false
  });
  
  await manualConsumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      console.log('📨 메시지 처리 중...');
      
      try {
        // 메시지 처리
        await processMessage(JSON.parse(message.value.toString()));
        
        // 성공 시 수동으로 오프셋 커밋
        await manualConsumer.commitOffsets([{
          topic,
          partition,
          offset: (parseInt(message.offset) + 1).toString()
        }]);
        
        console.log('✅ 오프셋 커밋 완료:', message.offset);
      } catch (error) {
        console.error('❌ 처리 실패, 오프셋 커밋하지 않음');
        // 오프셋을 커밋하지 않으면 재시작 시 이 메시지부터 다시 처리
      }
    }
  });
}

/**
 * Consumer Group 예제
 */
async function consumerGroupExample() {
  console.log('👥 Consumer Group 예제...');
  
  // 같은 그룹 ID로 여러 Consumer 생성
  const consumers = [];
  const groupId = 'load-balanced-group';
  const consumerCount = 3;
  
  for (let i = 0; i < consumerCount; i++) {
    const consumer = kafka.consumer({
      groupId,
      // Consumer 인스턴스 구분을 위한 ID
      memberId: `consumer-${i}`
    });
    
    await consumer.connect();
    await consumer.subscribe({
      topics: ['order-events'],
      fromBeginning: false
    });
    
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        console.log(`Consumer ${i} - 파티션 ${partition}: ${message.value.toString()}`);
        // 각 Consumer가 다른 파티션을 처리
      }
    });
    
    consumers.push(consumer);
  }
  
  // 그룹 메타데이터 확인
  const admin = kafka.admin();
  await admin.connect();
  
  const groupDescription = await admin.describeGroups([groupId]);
  console.log('📊 Consumer Group 상태:', groupDescription.groups[0]);
  
  await admin.disconnect();
}

/**
 * 오프셋 리셋 예제
 */
async function offsetReset() {
  console.log('🔄 오프셋 리셋 예제...');
  
  const admin = kafka.admin();
  await admin.connect();
  
  // 특정 토픽의 오프셋을 처음으로 리셋
  await admin.resetOffsets({
    groupId: 'reset-test-group',
    topic: 'user-activities',
    earliest: true // 또는 latest: true
  });
  
  // 특정 오프셋으로 리셋
  await admin.setOffsets({
    groupId: 'reset-test-group',
    topic: 'user-activities',
    partitions: [
      { partition: 0, offset: '100' },
      { partition: 1, offset: '200' }
    ]
  });
  
  console.log('✅ 오프셋 리셋 완료');
  await admin.disconnect();
}

/**
 * Consumer Lag 모니터링
 */
async function monitorConsumerLag() {
  console.log('📊 Consumer Lag 모니터링...');
  
  const admin = kafka.admin();
  await admin.connect();
  
  // Consumer Group의 오프셋 정보 가져오기
  const groupId = 'basic-consumer-group';
  const topicOffsets = await admin.fetchOffsets({
    groupId,
    topics: ['order-events', 'user-activities']
  });
  
  for (const topic of topicOffsets) {
    console.log(`\n📈 Topic: ${topic.topic}`);
    
    for (const partition of topic.partitions) {
      // 최신 오프셋 가져오기
      const topicMetadata = await admin.fetchTopicOffsets(topic.topic);
      const latestOffset = topicMetadata.find(
        p => p.partition === partition.partition
      )?.high;
      
      const currentOffset = parseInt(partition.offset);
      const latest = parseInt(latestOffset || '0');
      const lag = latest - currentOffset;
      
      console.log(`  파티션 ${partition.partition}:`);
      console.log(`    현재 오프셋: ${currentOffset}`);
      console.log(`    최신 오프셋: ${latest}`);
      console.log(`    Lag: ${lag} 메시지`);
    }
  }
  
  await admin.disconnect();
}

/**
 * 에러 처리 및 재시도 전략
 */
async function errorHandlingConsumer() {
  console.log('🛡️ 에러 처리 Consumer...');
  
  const consumer = kafka.consumer({
    groupId: 'error-handling-group',
    retry: {
      retries: 3,
      restartOnFailure: async (error) => {
        console.error('🔄 Consumer 재시작 중...', error.message);
        return true;
      }
    }
  });
  
  await consumer.connect();
  await consumer.subscribe({
    topics: ['system-logs'],
    fromBeginning: false
  });
  
  // 재시도 횟수 추적
  const retryCount = new Map();
  
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const messageId = `${partition}-${message.offset}`;
      const currentRetries = retryCount.get(messageId) || 0;
      
      try {
        // 의도적으로 일부 메시지에서 에러 발생
        if (Math.random() < 0.3) {
          throw new Error('처리 실패 시뮬레이션');
        }
        
        console.log('✅ 메시지 처리 성공');
        retryCount.delete(messageId);
      } catch (error) {
        console.error(`❌ 처리 실패 (시도: ${currentRetries + 1}/3)`);
        
        if (currentRetries < 2) {
          // 재시도
          retryCount.set(messageId, currentRetries + 1);
          await new Promise(resolve => setTimeout(resolve, 1000 * (currentRetries + 1)));
          throw error; // Consumer가 재시도하도록
        } else {
          // 최대 재시도 초과 - DLQ로 전송 또는 로깅
          console.error('💀 최대 재시도 초과, DLQ로 전송');
          await sendToDeadLetterQueue(message);
          retryCount.delete(messageId);
        }
      }
    }
  });
}

/**
 * 메시지 처리 함수
 */
async function processMessage(data) {
  // 실제 비즈니스 로직
  console.log('🔄 처리 중:', data);
  
  // 시뮬레이션을 위한 지연
  await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Dead Letter Queue로 전송
 */
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
        'original-topic': message.topic,
        'failed-at': new Date().toISOString()
      }
    }]
  });
  
  await producer.disconnect();
}

/**
 * Consumer 이벤트 리스너
 */
function setupEventListeners(consumer) {
  consumer.on('consumer.connect', () => {
    console.log('🔌 Consumer 연결됨');
  });
  
  consumer.on('consumer.disconnect', () => {
    console.log('🔌 Consumer 연결 해제됨');
  });
  
  consumer.on('consumer.stop', () => {
    console.log('⏹️ Consumer 중지됨');
  });
  
  consumer.on('consumer.crash', ({ error, restart }) => {
    console.error('💥 Consumer 크래시:', error);
    restart(); // 자동 재시작
  });
  
  consumer.on('consumer.rebalancing', () => {
    console.log('⚖️ 리밸런싱 시작...');
  });
  
  consumer.on('consumer.group_join', ({ duration, groupId }) => {
    console.log(`✅ 그룹 ${groupId}에 참가 (${duration}ms)`);
  });
}

/**
 * 메인 실행 함수
 */
async function main() {
  try {
    console.log('✨ Kafka Consumer 학습 예제 시작\n');
    
    // Consumer 연결
    await consumer.connect();
    
    // 이벤트 리스너 설정
    setupEventListeners(consumer);
    
    // 기본 Consumer 실행
    await basicConsume();
    
    // Consumer Lag 모니터링 (별도 실행)
    setInterval(async () => {
      try {
        await monitorConsumerLag();
      } catch (error) {
        console.error('모니터링 에러:', error);
      }
    }, 30000); // 30초마다
    
  } catch (error) {
    console.error('❌ Consumer 실행 중 에러:', error);
  }
}

// 프로그램 실행
main().catch(console.error);

// 우아한 종료 처리
process.on('SIGINT', async () => {
  console.log('\n🛑 종료 신호 받음, Consumer 정리 중...');
  try {
    await consumer.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('종료 중 에러:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 종료 신호 받음, Consumer 정리 중...');
  try {
    await consumer.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('종료 중 에러:', error);
    process.exit(1);
  }
});
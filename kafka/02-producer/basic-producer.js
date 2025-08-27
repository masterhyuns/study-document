/**
 * Kafka Basic Producer 예제
 * 카프카에 메시지를 전송하는 기본적인 방법을 학습합니다
 */

import { Kafka, Partitioners, CompressionTypes } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';

// Kafka 클라이언트 설정
const kafka = new Kafka({
  clientId: 'basic-producer-app',
  brokers: ['localhost:9092', 'localhost:9093', 'localhost:9094'],
  connectionTimeout: 3000,
  requestTimeout: 25000,
  retry: {
    retries: 5,
    initialRetryTime: 100,
    maxRetryTime: 30000
  }
});

// Producer 인스턴스 생성
const producer = kafka.producer({
  // 파티션 선택 전략
  createPartitioner: Partitioners.DefaultPartitioner,
  
  // 전송 설정
  allowAutoTopicCreation: false,
  transactionTimeout: 30000,
  
  // 압축 설정
  compression: CompressionTypes.GZIP,
  
  // 확인 레벨 (0: 확인 없음, 1: 리더 확인, -1/all: 모든 ISR 확인)
  acks: -1,
  
  // 멱등성 (중복 방지)
  idempotent: true,
  
  // 재시도 설정
  maxInFlightRequests: 5,
  retry: {
    retries: 3,
    initialRetryTime: 100
  }
});

/**
 * 단일 메시지 전송
 */
async function sendSingleMessage() {
  console.log('📤 단일 메시지 전송 시작...');
  
  const message = {
    key: `user-${uuidv4()}`,
    value: JSON.stringify({
      eventType: 'USER_CREATED',
      userId: uuidv4(),
      username: 'john_doe',
      email: 'john@example.com',
      timestamp: new Date().toISOString()
    }),
    headers: {
      'correlation-id': uuidv4(),
      'source': 'basic-producer'
    },
    timestamp: Date.now().toString()
  };
  
  try {
    const result = await producer.send({
      topic: 'user-activities',
      messages: [message]
    });
    
    console.log('✅ 메시지 전송 성공:', {
      topic: result[0].topicName,
      partition: result[0].partition,
      offset: result[0].baseOffset,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 메시지 전송 실패:', error);
  }
}

/**
 * 배치 메시지 전송
 */
async function sendBatchMessages() {
  console.log('📦 배치 메시지 전송 시작...');
  
  const messages = [];
  const batchSize = 10;
  
  // 배치 메시지 생성
  for (let i = 0; i < batchSize; i++) {
    const orderId = uuidv4();
    messages.push({
      key: `order-${orderId}`,
      value: JSON.stringify({
        orderId,
        userId: uuidv4(),
        productId: `PROD-${Math.floor(Math.random() * 1000)}`,
        quantity: Math.floor(Math.random() * 5) + 1,
        price: (Math.random() * 1000).toFixed(2),
        orderStatus: 'PENDING',
        createdAt: new Date().toISOString()
      }),
      partition: i % 3, // 파티션 직접 지정 (선택사항)
      headers: {
        'batch-id': uuidv4(),
        'batch-index': i.toString()
      }
    });
  }
  
  try {
    const results = await producer.send({
      topic: 'order-events',
      messages,
      compression: CompressionTypes.GZIP
    });
    
    console.log(`✅ ${batchSize}개 메시지 전송 성공`);
    results.forEach((result, index) => {
      console.log(`  - 메시지 ${index + 1}: 파티션 ${result.partition}, 오프셋 ${result.baseOffset}`);
    });
  } catch (error) {
    console.error('❌ 배치 메시지 전송 실패:', error);
  }
}

/**
 * 키 기반 파티셔닝 예제
 */
async function sendWithKeyPartitioning() {
  console.log('🔑 키 기반 파티셔닝 메시지 전송...');
  
  const userId = 'USER-12345';
  const events = [
    { action: 'LOGIN', timestamp: new Date().toISOString() },
    { action: 'VIEW_PRODUCT', productId: 'PROD-001', timestamp: new Date().toISOString() },
    { action: 'ADD_TO_CART', productId: 'PROD-001', timestamp: new Date().toISOString() },
    { action: 'CHECKOUT', orderId: uuidv4(), timestamp: new Date().toISOString() }
  ];
  
  try {
    // 같은 키를 사용하면 모두 같은 파티션으로 전송됨
    for (const event of events) {
      const result = await producer.send({
        topic: 'user-activities',
        messages: [{
          key: userId, // 동일한 키 사용
          value: JSON.stringify({
            userId,
            ...event
          })
        }]
      });
      
      console.log(`✅ ${event.action} 이벤트 전송: 파티션 ${result[0].partition}`);
    }
    
    console.log('💡 모든 메시지가 같은 파티션으로 전송되어 순서가 보장됩니다.');
  } catch (error) {
    console.error('❌ 키 기반 파티셔닝 실패:', error);
  }
}

/**
 * 에러 처리 예제
 */
async function sendWithErrorHandling() {
  console.log('🛡️ 에러 처리가 포함된 메시지 전송...');
  
  const maxRetries = 3;
  let retryCount = 0;
  
  async function attemptSend() {
    try {
      const result = await producer.send({
        topic: 'system-logs',
        messages: [{
          value: JSON.stringify({
            level: 'ERROR',
            service: 'payment-service',
            message: 'Payment processing failed',
            error: 'Gateway timeout',
            timestamp: new Date().toISOString()
          })
        }],
        timeout: 5000
      });
      
      console.log('✅ 로그 메시지 전송 성공');
      return result;
    } catch (error) {
      retryCount++;
      
      if (error.name === 'KafkaJSNumberOfRetriesExceeded' || retryCount >= maxRetries) {
        console.error(`❌ 최대 재시도 횟수 초과 (${retryCount}/${maxRetries})`);
        throw error;
      }
      
      console.log(`⚠️ 전송 실패, 재시도 중... (${retryCount}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      return attemptSend();
    }
  }
  
  try {
    await attemptSend();
  } catch (error) {
    console.error('❌ 최종 전송 실패:', error.message);
    // 실패한 메시지를 DLQ(Dead Letter Queue)나 로컬 파일에 저장
  }
}

/**
 * Producer 이벤트 리스너 설정
 */
function setupEventListeners() {
  producer.on('producer.connect', () => {
    console.log('🔌 Producer가 Kafka 클러스터에 연결되었습니다.');
  });
  
  producer.on('producer.disconnect', () => {
    console.log('🔌 Producer가 Kafka 클러스터에서 연결 해제되었습니다.');
  });
  
  producer.on('producer.network.request', ({ payload }) => {
    // console.log('📡 네트워크 요청:', payload.apiName);
  });
  
  producer.on('producer.network.request_error', ({ error }) => {
    console.error('⚠️ 네트워크 요청 에러:', error);
  });
}

/**
 * 성능 메트릭 출력
 */
async function printMetrics() {
  const startTime = Date.now();
  const messageCount = 100;
  const messages = [];
  
  console.log('📊 성능 테스트 시작...');
  
  for (let i = 0; i < messageCount; i++) {
    messages.push({
      value: JSON.stringify({
        id: i,
        timestamp: new Date().toISOString(),
        data: 'x'.repeat(1000) // 1KB 메시지
      })
    });
  }
  
  try {
    await producer.send({
      topic: 'system-logs',
      messages
    });
    
    const elapsed = Date.now() - startTime;
    const throughput = (messageCount / elapsed) * 1000;
    
    console.log('📈 성능 메트릭:');
    console.log(`  - 전송 메시지 수: ${messageCount}`);
    console.log(`  - 소요 시간: ${elapsed}ms`);
    console.log(`  - 처리량: ${throughput.toFixed(2)} messages/sec`);
    console.log(`  - 평균 지연시간: ${(elapsed / messageCount).toFixed(2)}ms/message`);
  } catch (error) {
    console.error('❌ 성능 테스트 실패:', error);
  }
}

/**
 * 메인 실행 함수
 */
async function main() {
  try {
    // Producer 연결
    await producer.connect();
    console.log('✨ Kafka Producer 학습 예제 시작\n');
    
    // 이벤트 리스너 설정
    setupEventListeners();
    
    // 예제 실행
    console.log('========== 예제 1: 단일 메시지 ==========');
    await sendSingleMessage();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\n========== 예제 2: 배치 메시지 ==========');
    await sendBatchMessages();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\n========== 예제 3: 키 기반 파티셔닝 ==========');
    await sendWithKeyPartitioning();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\n========== 예제 4: 에러 처리 ==========');
    await sendWithErrorHandling();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\n========== 예제 5: 성능 메트릭 ==========');
    await printMetrics();
    
  } catch (error) {
    console.error('❌ Producer 실행 중 에러:', error);
  } finally {
    // Producer 종료
    await producer.disconnect();
    console.log('\n👋 Producer 연결 종료');
  }
}

// 프로그램 실행
main().catch(console.error);

// 우아한 종료 처리
process.on('SIGINT', async () => {
  console.log('\n🛑 종료 신호 받음, Producer 정리 중...');
  await producer.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 종료 신호 받음, Producer 정리 중...');
  await producer.disconnect();
  process.exit(0);
});
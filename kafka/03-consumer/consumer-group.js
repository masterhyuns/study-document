/**
 * Kafka Consumer Group 예제
 * Consumer Group의 동작 방식과 로드 밸런싱을 학습합니다
 */

import { Kafka } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';

const kafka = new Kafka({
  clientId: 'consumer-group-demo',
  brokers: ['localhost:9092', 'localhost:9093', 'localhost:9094']
});

/**
 * Consumer Group 시뮬레이션
 * 여러 Consumer가 하나의 그룹으로 동작하는 예제
 */
class ConsumerGroupSimulator {
  constructor(groupId, consumerCount = 3) {
    this.groupId = groupId;
    this.consumerCount = consumerCount;
    this.consumers = [];
    this.producer = kafka.producer();
    this.admin = kafka.admin();
  }
  
  /**
   * Consumer 인스턴스 생성 및 시작
   */
  async createConsumer(consumerId) {
    const consumer = kafka.consumer({
      groupId: this.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxWaitTimeInMs: 5000
    });
    
    await consumer.connect();
    console.log(`✅ Consumer ${consumerId} 연결됨`);
    
    // 토픽 구독
    await consumer.subscribe({
      topics: ['order-events'],
      fromBeginning: false
    });
    
    // 메시지 처리 시작
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const value = JSON.parse(message.value.toString());
        
        console.log(`📨 Consumer ${consumerId}가 처리:`, {
          partition,
          offset: message.offset,
          orderId: value.orderId,
          timestamp: new Date().toISOString()
        });
        
        // 처리 시뮬레이션
        await this.simulateProcessing(consumerId, value);
      }
    });
    
    // 이벤트 리스너 설정
    this.setupConsumerEvents(consumer, consumerId);
    
    return consumer;
  }
  
  /**
   * Consumer 이벤트 리스너
   */
  setupConsumerEvents(consumer, consumerId) {
    consumer.on('consumer.group_join', ({ duration, groupId, isLeader, leaderId, memberId }) => {
      console.log(`🤝 Consumer ${consumerId} 그룹 참가:`, {
        groupId,
        isLeader,
        leaderId,
        memberId,
        duration: `${duration}ms`
      });
    });
    
    consumer.on('consumer.rebalancing', ({ groupId, memberId }) => {
      console.log(`⚖️ Consumer ${consumerId} 리밸런싱 시작:`, {
        groupId,
        memberId
      });
    });
    
    consumer.on('consumer.fetch_start', ({ numberOfBatches, totalMessages }) => {
      if (totalMessages > 0) {
        console.log(`📥 Consumer ${consumerId} Fetch 시작:`, {
          batches: numberOfBatches,
          messages: totalMessages
        });
      }
    });
  }
  
  /**
   * 메시지 처리 시뮬레이션
   */
  async simulateProcessing(consumerId, data) {
    // 처리 시간 랜덤 설정 (실제 처리 시뮬레이션)
    const processingTime = Math.random() * 1000 + 500; // 0.5 ~ 1.5초
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    console.log(`✅ Consumer ${consumerId} 처리 완료:`, {
      orderId: data.orderId,
      processingTime: `${processingTime.toFixed(0)}ms`
    });
  }
  
  /**
   * Consumer Group 시작
   */
  async start() {
    console.log(`\n🚀 Consumer Group '${this.groupId}' 시작`);
    console.log(`   Consumer 수: ${this.consumerCount}개\n`);
    
    // Admin 연결
    await this.admin.connect();
    
    // Producer 연결
    await this.producer.connect();
    
    // 토픽 정보 확인
    await this.checkTopicInfo();
    
    // Consumer들 시작
    for (let i = 0; i < this.consumerCount; i++) {
      const consumer = await this.createConsumer(i + 1);
      this.consumers.push(consumer);
      
      // Consumer를 순차적으로 시작 (리밸런싱 관찰용)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n✨ 모든 Consumer가 시작되었습니다.\n');
    
    // 그룹 상태 모니터링 시작
    this.startMonitoring();
    
    // 테스트 메시지 생성 시작
    await new Promise(resolve => setTimeout(resolve, 3000));
    this.startProducingMessages();
  }
  
  /**
   * 토픽 정보 확인
   */
  async checkTopicInfo() {
    const metadata = await this.admin.fetchTopicMetadata({ topics: ['order-events'] });
    const topic = metadata.topics[0];
    
    console.log('📊 토픽 정보:');
    console.log(`   이름: ${topic.name}`);
    console.log(`   파티션 수: ${topic.partitions.length}`);
    console.log(`   파티션 분포:`);
    
    topic.partitions.forEach(partition => {
      console.log(`     - 파티션 ${partition.partitionId}: 리더 브로커 ${partition.leader}`);
    });
    console.log('');
  }
  
  /**
   * Consumer Group 상태 모니터링
   */
  async startMonitoring() {
    setInterval(async () => {
      try {
        // 그룹 상태 확인
        const groupDescription = await this.admin.describeGroups([this.groupId]);
        const group = groupDescription.groups[0];
        
        console.log('\n📈 Consumer Group 상태:');
        console.log(`   그룹 ID: ${group.groupId}`);
        console.log(`   상태: ${group.state}`);
        console.log(`   프로토콜: ${group.protocol}`);
        console.log(`   멤버 수: ${group.members.length}`);
        
        // 파티션 할당 정보
        if (group.members.length > 0) {
          console.log('   파티션 할당:');
          group.members.forEach((member, index) => {
            const assignment = member.memberAssignment;
            if (assignment) {
              const partitions = this.parseAssignment(assignment);
              console.log(`     - Consumer ${index + 1}: 파티션 ${partitions.join(', ')}`);
            }
          });
        }
        
        // Consumer Lag 확인
        await this.checkConsumerLag();
        
      } catch (error) {
        console.error('모니터링 에러:', error.message);
      }
    }, 10000); // 10초마다
  }
  
  /**
   * 멤버 할당 정보 파싱
   */
  parseAssignment(assignment) {
    try {
      // assignment 버퍼에서 파티션 정보 추출
      // 실제 구현은 Kafka 프로토콜에 따라 복잡할 수 있음
      return ['0', '1', '2']; // 예시
    } catch {
      return [];
    }
  }
  
  /**
   * Consumer Lag 확인
   */
  async checkConsumerLag() {
    try {
      const topicOffsets = await this.admin.fetchOffsets({
        groupId: this.groupId,
        topics: ['order-events']
      });
      
      let totalLag = 0;
      
      for (const topic of topicOffsets) {
        const topicMetadata = await this.admin.fetchTopicOffsets(topic.topic);
        
        for (const partition of topic.partitions) {
          const latestOffset = topicMetadata.find(
            p => p.partition === partition.partition
          )?.high;
          
          const currentOffset = parseInt(partition.offset);
          const latest = parseInt(latestOffset || '0');
          const lag = latest - currentOffset;
          totalLag += lag;
        }
      }
      
      console.log(`   총 Lag: ${totalLag} 메시지\n`);
    } catch (error) {
      // Lag 확인 실패 시 무시
    }
  }
  
  /**
   * 테스트 메시지 생성
   */
  async startProducingMessages() {
    console.log('📤 테스트 메시지 생성 시작...\n');
    
    let messageCount = 0;
    
    setInterval(async () => {
      const messages = [];
      const batchSize = 10;
      
      for (let i = 0; i < batchSize; i++) {
        messages.push({
          key: `order-${messageCount++}`,
          value: JSON.stringify({
            orderId: uuidv4(),
            userId: `user-${Math.floor(Math.random() * 100)}`,
            amount: (Math.random() * 1000).toFixed(2),
            timestamp: new Date().toISOString()
          })
        });
      }
      
      await this.producer.send({
        topic: 'order-events',
        messages
      });
      
      console.log(`📮 ${batchSize}개 메시지 전송됨 (총 ${messageCount}개)`);
    }, 3000); // 3초마다
  }
  
  /**
   * Consumer 추가 (동적 스케일링)
   */
  async addConsumer() {
    const newConsumerId = this.consumers.length + 1;
    console.log(`\n🆕 새 Consumer ${newConsumerId} 추가 중...`);
    
    const consumer = await this.createConsumer(newConsumerId);
    this.consumers.push(consumer);
    
    console.log(`✅ Consumer ${newConsumerId} 추가 완료 (리밸런싱 발생)\n`);
  }
  
  /**
   * Consumer 제거 (동적 스케일링)
   */
  async removeConsumer() {
    if (this.consumers.length > 0) {
      const consumer = this.consumers.pop();
      const consumerId = this.consumers.length + 1;
      
      console.log(`\n🗑️ Consumer ${consumerId} 제거 중...`);
      await consumer.disconnect();
      console.log(`✅ Consumer ${consumerId} 제거 완료 (리밸런싱 발생)\n`);
    }
  }
  
  /**
   * 정리
   */
  async cleanup() {
    console.log('\n🧹 정리 중...');
    
    // 모든 Consumer 종료
    for (const consumer of this.consumers) {
      await consumer.disconnect();
    }
    
    // Producer와 Admin 종료
    await this.producer.disconnect();
    await this.admin.disconnect();
    
    console.log('✅ 정리 완료');
  }
}

/**
 * 리밸런싱 시나리오 시뮬레이션
 */
async function demonstrateRebalancing() {
  const simulator = new ConsumerGroupSimulator('rebalancing-demo-group', 2);
  
  try {
    // Consumer Group 시작
    await simulator.start();
    
    // 10초 후 Consumer 추가 (스케일 아웃)
    setTimeout(async () => {
      console.log('\n📢 === 스케일 아웃 시뮬레이션 ===');
      await simulator.addConsumer();
    }, 10000);
    
    // 20초 후 Consumer 제거 (스케일 인)
    setTimeout(async () => {
      console.log('\n📢 === 스케일 인 시뮬레이션 ===');
      await simulator.removeConsumer();
    }, 20000);
    
    // 30초 후 또 다른 Consumer 추가
    setTimeout(async () => {
      console.log('\n📢 === 추가 스케일 아웃 ===');
      await simulator.addConsumer();
      await simulator.addConsumer();
    }, 30000);
    
  } catch (error) {
    console.error('❌ 에러:', error);
  }
}

// 메인 실행
console.log('🎯 Kafka Consumer Group 데모\n');
console.log('이 예제는 Consumer Group의 동작을 보여줍니다:');
console.log('- 파티션 자동 할당');
console.log('- 리밸런싱');
console.log('- 동적 스케일링\n');

demonstrateRebalancing().catch(console.error);

// 우아한 종료
process.on('SIGINT', async () => {
  console.log('\n🛑 종료 신호 받음...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 종료 신호 받음...');
  process.exit(0);
});
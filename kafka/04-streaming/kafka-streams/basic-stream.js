/**
 * Kafka Streams 기본 예제
 * 스트림 처리의 기본 개념을 학습합니다
 */

import { KafkaStreams } from 'kafka-streams'
import { v4 as uuidv4 } from 'uuid'

// Kafka Streams 설정
const config = {
  noptions: {
    'metadata.broker.list': 'localhost:9092',
    'group.id': 'kafka-streams-basic',
    'client.id': 'kafka-streams-basic-client',
    'enable.auto.commit': false,
    'socket.keepalive.enable': true,
    
    // Exactly-once 처리
    'processing.guarantee': 'exactly_once',
    'transactional.id': 'stream-processing-tx'
  },
  tconf: {
    'request.required.acks': -1,
    'produce.type': 'sync'
  }
}

// KafkaStreams 인스턴스 생성
const kafkaStreams = new KafkaStreams(config)
const stream = kafkaStreams.getKStream('order-events')

/**
 * 1. 기본 Stateless Operations
 */
function basicOperations() {
  console.log('🚀 기본 스트림 처리 시작...\n')
  
  // Filter: 금액이 100 이상인 주문만 선택
  const filteredStream = stream
    .filter((message) => {
      const order = JSON.parse(message.value)
      return order.amount >= 100
    })
    .mapJSONConvenience()  // JSON 파싱 헬퍼
    .tap((record) => {
      console.log('✅ Filtered Order:', {
        orderId: record.value.orderId,
        amount: record.value.amount
      })
    })
  
  // Map: 데이터 변환
  const transformedStream = filteredStream
    .map((record) => {
      const order = record.value
      return {
        key: order.userId,
        value: {
          ...order,
          processedAt: new Date().toISOString(),
          category: order.amount > 1000 ? 'HIGH_VALUE' : 'NORMAL',
          tax: order.amount * 0.1,
          total: order.amount * 1.1
        }
      }
    })
    .tap((record) => {
      console.log('🔄 Transformed:', {
        userId: record.key,
        category: record.value.category,
        total: record.value.total
      })
    })
  
  // Branch: 스트림 분기
  const [highValueOrders, normalOrders] = transformedStream
    .branch([
      (record) => record.value.category === 'HIGH_VALUE',
      (record) => record.value.category === 'NORMAL'
    ])
  
  // 각 브랜치를 다른 토픽으로 전송
  highValueOrders
    .to('high-value-orders', 'auto', {
      produceType: 'send'
    })
  
  normalOrders
    .to('normal-orders', 'auto', {
      produceType: 'send'
    })
  
  return transformedStream
}

/**
 * 2. Stateful Operations - Aggregation
 */
function aggregationExample() {
  console.log('\n📊 집계 처리 시작...\n')
  
  // 사용자별 주문 집계
  const userAggregation = stream
    .mapJSONConvenience()
    .groupByKey()
    .window(60 * 1000, 10 * 1000)  // 60초 윈도우, 10초마다 이동
    .aggregate(
      // 초기값
      () => ({
        userId: null,
        orderCount: 0,
        totalAmount: 0,
        avgAmount: 0,
        lastOrderTime: null
      }),
      // 집계 함수
      (oldVal, record) => {
        const newCount = oldVal.orderCount + 1
        const newTotal = oldVal.totalAmount + record.value.amount
        
        return {
          userId: record.key,
          orderCount: newCount,
          totalAmount: newTotal,
          avgAmount: newTotal / newCount,
          lastOrderTime: new Date().toISOString()
        }
      },
      // State store 이름
      'user-order-aggregation'
    )
  
  userAggregation
    .tap((record) => {
      console.log('📈 User Aggregation:', {
        userId: record.key,
        stats: record.value
      })
    })
    .to('user-order-stats', 'auto')
}

/**
 * 3. FlatMap 예제 - 주문 항목 분리
 */
function flatMapExample() {
  console.log('\n📦 FlatMap 처리...\n')
  
  stream
    .mapJSONConvenience()
    .flatMap((record) => {
      const order = record.value
      
      // 주문에 items 배열이 있다고 가정
      if (!order.items || !Array.isArray(order.items)) {
        return [[record.key, record.value]]
      }
      
      // 각 아이템을 별도 레코드로 분리
      return order.items.map(item => ({
        key: `${order.orderId}-${item.productId}`,
        value: {
          orderId: order.orderId,
          userId: order.userId,
          productId: item.productId,
          productName: item.name,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.quantity * item.price,
          orderTime: order.timestamp
        }
      }))
    })
    .tap((record) => {
      console.log('📝 Order Item:', record.value)
    })
    .to('order-items', 'auto')
}

/**
 * 4. Peek - 디버깅용 중간 확인
 */
function peekExample() {
  console.log('\n🔍 Peek을 사용한 디버깅...\n')
  
  stream
    .mapJSONConvenience()
    .peek((record) => {
      console.log('🔍 [PEEK] 원본 레코드:', {
        key: record.key,
        value: record.value,
        partition: record.partition,
        offset: record.offset
      })
    })
    .filter((record) => record.value.amount > 500)
    .peek((record) => {
      console.log('🔍 [PEEK] 필터링 후:', record.value.orderId)
    })
    .mapValues((value) => ({
      ...value,
      filtered: true
    }))
    .peek((record) => {
      console.log('🔍 [PEEK] 변환 후:', record.value)
    })
}

/**
 * 5. Merge - 여러 스트림 병합
 */
function mergeStreams() {
  console.log('\n🔀 스트림 병합...\n')
  
  const stream1 = kafkaStreams.getKStream('online-orders')
  const stream2 = kafkaStreams.getKStream('offline-orders')
  const stream3 = kafkaStreams.getKStream('mobile-orders')
  
  // 모든 주문 스트림 병합
  stream1
    .merge(stream2)
    .merge(stream3)
    .mapJSONConvenience()
    .tap((record) => {
      console.log('🔀 Merged Order:', {
        source: record.value.source,
        orderId: record.value.orderId
      })
    })
    .to('all-orders', 'auto')
}

/**
 * 6. Error Handling
 */
function errorHandling() {
  console.log('\n⚠️ 에러 처리...\n')
  
  stream
    .mapJSONConvenience()
    .map((record) => {
      try {
        // 데이터 검증
        if (!record.value.orderId) {
          throw new Error('Order ID is missing')
        }
        if (record.value.amount < 0) {
          throw new Error('Invalid amount')
        }
        
        return {
          ...record,
          value: {
            ...record.value,
            validated: true
          }
        }
      } catch (error) {
        // 에러 레코드를 DLQ로 전송
        console.error('❌ Validation Error:', error.message)
        
        // 에러 정보와 함께 별도 토픽으로
        return {
          key: record.key,
          value: {
            originalRecord: record.value,
            error: error.message,
            timestamp: new Date().toISOString()
          },
          topic: 'order-errors'  // DLQ 토픽
        }
      }
    })
    .to((record) => record.topic || 'processed-orders', 'auto')
}

/**
 * 7. Custom Processing
 */
class OrderProcessor {
  constructor() {
    this.processedCount = 0
    this.errorCount = 0
  }
  
  process(record) {
    try {
      // 커스텀 비즈니스 로직
      const order = record.value
      
      // 검증
      this.validate(order)
      
      // 변환
      const enriched = this.enrich(order)
      
      // 메트릭 업데이트
      this.processedCount++
      
      // 주기적으로 상태 출력
      if (this.processedCount % 100 === 0) {
        console.log(`📊 Processed: ${this.processedCount}, Errors: ${this.errorCount}`)
      }
      
      return {
        ...record,
        value: enriched
      }
    } catch (error) {
      this.errorCount++
      throw error
    }
  }
  
  validate(order) {
    if (!order.userId || !order.orderId) {
      throw new Error('Required fields missing')
    }
    if (order.amount <= 0) {
      throw new Error('Invalid amount')
    }
  }
  
  enrich(order) {
    return {
      ...order,
      processedBy: 'OrderProcessor',
      processedAt: new Date().toISOString(),
      estimatedDelivery: this.calculateDeliveryDate(order),
      discount: this.calculateDiscount(order)
    }
  }
  
  calculateDeliveryDate(order) {
    const days = order.expressShipping ? 2 : 5
    const deliveryDate = new Date()
    deliveryDate.setDate(deliveryDate.getDate() + days)
    return deliveryDate.toISOString()
  }
  
  calculateDiscount(order) {
    if (order.amount > 1000) return order.amount * 0.1
    if (order.amount > 500) return order.amount * 0.05
    return 0
  }
}

/**
 * 메인 실행 함수
 */
async function main() {
  try {
    console.log('✨ Kafka Streams 예제 시작\n')
    console.log('========================================\n')
    
    // 1. 기본 Operations
    const processedStream = basicOperations()
    
    // 2. Aggregation
    aggregationExample()
    
    // 3. FlatMap
    flatMapExample()
    
    // 4. Peek (디버깅)
    peekExample()
    
    // 5. 스트림 병합
    // mergeStreams()
    
    // 6. 에러 처리
    errorHandling()
    
    // 7. Custom Processor 사용
    const processor = new OrderProcessor()
    stream
      .mapJSONConvenience()
      .map((record) => processor.process(record))
      .to('enriched-orders', 'auto')
    
    // 스트림 시작
    await processedStream.start()
    
    console.log('\n✅ Kafka Streams가 시작되었습니다.')
    console.log('📊 처리 중... (Ctrl+C로 종료)\n')
    
    // 메트릭 출력
    setInterval(() => {
      const stats = kafkaStreams.getStats()
      console.log('📈 Stream Stats:', stats)
    }, 30000)  // 30초마다
    
  } catch (error) {
    console.error('❌ 에러 발생:', error)
  }
}

// 프로그램 실행
main().catch(console.error)

// 우아한 종료
process.on('SIGINT', async () => {
  console.log('\n🛑 종료 신호 받음, 스트림 정리 중...')
  await kafkaStreams.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n🛑 종료 신호 받음, 스트림 정리 중...')
  await kafkaStreams.close()
  process.exit(0)
})
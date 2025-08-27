/**
 * Kafka Transactional Producer 예제
 * Exactly-Once 보장을 위한 트랜잭션 처리
 */

import { Kafka, CompressionTypes } from 'kafkajs'
import { v4 as uuidv4 } from 'uuid'

// Kafka 클라이언트 설정
const kafka = new Kafka({
  clientId: 'transactional-producer',
  brokers: ['localhost:9092', 'localhost:9093', 'localhost:9094'],
  retry: {
    retries: 5,
    initialRetryTime: 100
  }
})

// Transactional Producer 생성
const producer = kafka.producer({
  transactionalId: 'my-transactional-id',  // 트랜잭션 ID (필수)
  idempotent: true,                         // 멱등성 활성화 (필수)
  maxInFlightRequests: 1,                   // 순서 보장
  compression: CompressionTypes.GZIP
})

/**
 * 1. 기본 트랜잭션 예제
 */
async function basicTransaction() {
  console.log('🔄 기본 트랜잭션 시작...\n')
  
  const transaction = await producer.transaction()
  
  try {
    // 트랜잭션 내에서 여러 메시지 전송
    await transaction.send({
      topic: 'orders',
      messages: [
        {
          key: 'order-1',
          value: JSON.stringify({
            orderId: uuidv4(),
            amount: 1000,
            status: 'PENDING'
          })
        }
      ]
    })
    
    await transaction.send({
      topic: 'payments',
      messages: [
        {
          key: 'payment-1',
          value: JSON.stringify({
            paymentId: uuidv4(),
            orderId: 'order-1',
            amount: 1000,
            method: 'CREDIT_CARD'
          })
        }
      ]
    })
    
    await transaction.send({
      topic: 'inventory',
      messages: [
        {
          key: 'inv-update-1',
          value: JSON.stringify({
            productId: 'PROD-001',
            quantity: -1,
            reason: 'SALE'
          })
        }
      ]
    })
    
    // 모든 메시지 커밋
    await transaction.commit()
    console.log('✅ 트랜잭션 커밋 성공')
    
  } catch (error) {
    console.error('❌ 트랜잭션 실패:', error)
    
    // 트랜잭션 롤백
    await transaction.abort()
    console.log('🔙 트랜잭션 롤백됨')
    
    throw error
  }
}

/**
 * 2. Read-Process-Write 패턴
 * Consumer와 Producer를 트랜잭션으로 묶기
 */
async function readProcessWritePattern() {
  console.log('\n📖 Read-Process-Write 트랜잭션...\n')
  
  const consumer = kafka.consumer({
    groupId: 'transactional-group',
    // READ_COMMITTED: 커밋된 트랜잭션만 읽기
    isolationLevel: 'READ_COMMITTED'
  })
  
  await consumer.connect()
  await consumer.subscribe({ 
    topics: ['input-events'], 
    fromBeginning: false 
  })
  
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const transaction = await producer.transaction()
      
      try {
        // 1. 메시지 처리
        const inputData = JSON.parse(message.value.toString())
        console.log('📥 Input:', inputData)
        
        const processedData = {
          ...inputData,
          processed: true,
          processedAt: new Date().toISOString(),
          processingId: uuidv4()
        }
        
        // 2. 처리된 결과를 다른 토픽으로 전송
        await transaction.send({
          topic: 'processed-events',
          messages: [{
            key: message.key,
            value: JSON.stringify(processedData)
          }]
        })
        
        // 3. 오프셋 커밋도 트랜잭션에 포함
        await transaction.sendOffsets({
          consumerGroupId: 'transactional-group',
          topics: [{
            topic,
            partitions: [{
              partition,
              offset: (parseInt(message.offset) + 1).toString()
            }]
          }]
        })
        
        // 4. 트랜잭션 커밋
        await transaction.commit()
        console.log('✅ 메시지 처리 및 오프셋 커밋 완료')
        
      } catch (error) {
        console.error('❌ 처리 실패:', error)
        await transaction.abort()
        
        // Dead Letter Queue로 전송
        await sendToDeadLetterQueue(message, error)
      }
    }
  })
}

/**
 * 3. 멀티 토픽 트랜잭션
 */
async function multiTopicTransaction() {
  console.log('\n🎯 멀티 토픽 트랜잭션...\n')
  
  const transaction = await producer.transaction()
  
  try {
    const orderId = uuidv4()
    const userId = uuidv4()
    
    // 여러 토픽에 원자적으로 메시지 전송
    const topics = [
      {
        topic: 'user-events',
        messages: [{
          key: userId,
          value: JSON.stringify({
            eventType: 'USER_ORDER_PLACED',
            userId,
            orderId,
            timestamp: new Date().toISOString()
          })
        }]
      },
      {
        topic: 'order-events',
        messages: [{
          key: orderId,
          value: JSON.stringify({
            eventType: 'ORDER_CREATED',
            orderId,
            userId,
            items: ['item1', 'item2'],
            total: 150.00
          })
        }]
      },
      {
        topic: 'notification-events',
        messages: [{
          key: userId,
          value: JSON.stringify({
            type: 'EMAIL',
            to: 'user@example.com',
            subject: 'Order Confirmation',
            orderId
          })
        }]
      },
      {
        topic: 'audit-log',
        messages: [{
          key: `audit-${Date.now()}`,
          value: JSON.stringify({
            action: 'ORDER_PLACED',
            userId,
            orderId,
            timestamp: new Date().toISOString(),
            metadata: {
              ip: '192.168.1.1',
              userAgent: 'Mozilla/5.0'
            }
          })
        }]
      }
    ]
    
    // 모든 토픽에 전송
    for (const topicData of topics) {
      await transaction.send(topicData)
      console.log(`📤 Sent to ${topicData.topic}`)
    }
    
    // 원자적 커밋
    await transaction.commit()
    console.log('✅ 멀티 토픽 트랜잭션 성공')
    
  } catch (error) {
    console.error('❌ 멀티 토픽 트랜잭션 실패:', error)
    await transaction.abort()
  }
}

/**
 * 4. 조건부 트랜잭션
 */
async function conditionalTransaction(order) {
  console.log('\n🔀 조건부 트랜잭션...\n')
  
  const transaction = await producer.transaction()
  
  try {
    // 주문 검증
    if (!order.items || order.items.length === 0) {
      throw new Error('주문 항목이 없습니다')
    }
    
    // 주문 금액 계산
    const totalAmount = order.items.reduce((sum, item) => 
      sum + (item.price * item.quantity), 0
    )
    
    // 조건 1: 최소 주문 금액 체크
    if (totalAmount < 10) {
      throw new Error('최소 주문 금액 미달')
    }
    
    // 주문 처리
    await transaction.send({
      topic: 'valid-orders',
      messages: [{
        key: order.orderId,
        value: JSON.stringify({
          ...order,
          totalAmount,
          validatedAt: new Date().toISOString()
        })
      }]
    })
    
    // 조건 2: 고액 주문 특별 처리
    if (totalAmount > 1000) {
      await transaction.send({
        topic: 'high-value-orders',
        messages: [{
          key: order.orderId,
          value: JSON.stringify({
            orderId: order.orderId,
            customerId: order.customerId,
            amount: totalAmount,
            priority: 'HIGH'
          })
        }]
      })
      console.log('💎 고액 주문으로 분류됨')
    }
    
    // 조건 3: VIP 고객 처리
    if (order.customerTier === 'VIP') {
      await transaction.send({
        topic: 'vip-notifications',
        messages: [{
          key: order.customerId,
          value: JSON.stringify({
            type: 'VIP_ORDER',
            customerId: order.customerId,
            orderId: order.orderId,
            benefits: ['FREE_SHIPPING', 'PRIORITY_HANDLING']
          })
        }]
      })
      console.log('⭐ VIP 고객 혜택 적용')
    }
    
    await transaction.commit()
    console.log('✅ 조건부 트랜잭션 완료')
    
  } catch (error) {
    console.error('❌ 조건부 트랜잭션 실패:', error.message)
    await transaction.abort()
    
    // 실패한 주문을 별도 토픽으로
    await producer.send({
      topic: 'failed-orders',
      messages: [{
        key: order.orderId,
        value: JSON.stringify({
          order,
          error: error.message,
          failedAt: new Date().toISOString()
        })
      }]
    })
  }
}

/**
 * 5. 배치 트랜잭션
 */
async function batchTransaction(records) {
  console.log('\n📦 배치 트랜잭션 처리...\n')
  
  const batchSize = 100
  const batches = []
  
  // 레코드를 배치로 분할
  for (let i = 0; i < records.length; i += batchSize) {
    batches.push(records.slice(i, i + batchSize))
  }
  
  console.log(`📊 총 ${batches.length}개 배치 처리 시작`)
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    const transaction = await producer.transaction()
    
    try {
      // 배치 내 모든 레코드 처리
      const messages = batch.map(record => ({
        key: record.id,
        value: JSON.stringify({
          ...record,
          batchId: `batch-${batchIndex}`,
          processedAt: new Date().toISOString()
        }),
        headers: {
          'batch-id': `${batchIndex}`,
          'batch-size': `${batch.length}`,
          'total-batches': `${batches.length}`
        }
      }))
      
      await transaction.send({
        topic: 'batch-processed',
        messages
      })
      
      // 배치 메타데이터 저장
      await transaction.send({
        topic: 'batch-metadata',
        messages: [{
          key: `batch-${batchIndex}`,
          value: JSON.stringify({
            batchId: batchIndex,
            recordCount: batch.length,
            startId: batch[0].id,
            endId: batch[batch.length - 1].id,
            processedAt: new Date().toISOString()
          })
        }]
      })
      
      await transaction.commit()
      console.log(`✅ 배치 ${batchIndex + 1}/${batches.length} 완료`)
      
    } catch (error) {
      console.error(`❌ 배치 ${batchIndex} 실패:`, error)
      await transaction.abort()
      
      // 실패한 배치를 재시도 큐로
      await producer.send({
        topic: 'batch-retry',
        messages: [{
          key: `batch-${batchIndex}`,
          value: JSON.stringify({
            batchId: batchIndex,
            records: batch,
            error: error.message,
            retryCount: 0
          })
        }]
      })
    }
  }
}

/**
 * 6. Saga 패턴 트랜잭션
 */
async function sagaTransaction(order) {
  console.log('\n🎭 Saga 패턴 트랜잭션...\n')
  
  const steps = []
  const transaction = await producer.transaction()
  
  try {
    // Step 1: 주문 생성
    await transaction.send({
      topic: 'saga-orders',
      messages: [{
        key: order.orderId,
        value: JSON.stringify({
          ...order,
          sagaStep: 'ORDER_CREATED',
          sagaId: uuidv4()
        })
      }]
    })
    steps.push('ORDER_CREATED')
    console.log('✅ Step 1: 주문 생성')
    
    // Step 2: 결제 처리
    await transaction.send({
      topic: 'saga-payments',
      messages: [{
        key: order.orderId,
        value: JSON.stringify({
          orderId: order.orderId,
          amount: order.amount,
          sagaStep: 'PAYMENT_PROCESSED'
        })
      }]
    })
    steps.push('PAYMENT_PROCESSED')
    console.log('✅ Step 2: 결제 처리')
    
    // Step 3: 재고 확인
    await transaction.send({
      topic: 'saga-inventory',
      messages: [{
        key: order.orderId,
        value: JSON.stringify({
          orderId: order.orderId,
          items: order.items,
          sagaStep: 'INVENTORY_RESERVED'
        })
      }]
    })
    steps.push('INVENTORY_RESERVED')
    console.log('✅ Step 3: 재고 예약')
    
    // Step 4: 배송 준비
    await transaction.send({
      topic: 'saga-shipping',
      messages: [{
        key: order.orderId,
        value: JSON.stringify({
          orderId: order.orderId,
          address: order.shippingAddress,
          sagaStep: 'SHIPPING_PREPARED'
        })
      }]
    })
    steps.push('SHIPPING_PREPARED')
    console.log('✅ Step 4: 배송 준비')
    
    // 모든 단계 성공 - 커밋
    await transaction.commit()
    console.log('✅ Saga 트랜잭션 완료')
    
  } catch (error) {
    console.error('❌ Saga 트랜잭션 실패:', error)
    await transaction.abort()
    
    // 보상 트랜잭션 시작
    console.log('🔄 보상 트랜잭션 시작...')
    await compensateSaga(order, steps)
  }
}

/**
 * Saga 보상 트랜잭션
 */
async function compensateSaga(order, completedSteps) {
  const compensationTransaction = await producer.transaction()
  
  try {
    // 완료된 단계를 역순으로 보상
    for (let i = completedSteps.length - 1; i >= 0; i--) {
      const step = completedSteps[i]
      
      switch(step) {
        case 'SHIPPING_PREPARED':
          await compensationTransaction.send({
            topic: 'saga-compensations',
            messages: [{
              key: order.orderId,
              value: JSON.stringify({
                orderId: order.orderId,
                compensationType: 'CANCEL_SHIPPING',
                timestamp: new Date().toISOString()
              })
            }]
          })
          console.log('↩️ 배송 취소')
          break
          
        case 'INVENTORY_RESERVED':
          await compensationTransaction.send({
            topic: 'saga-compensations',
            messages: [{
              key: order.orderId,
              value: JSON.stringify({
                orderId: order.orderId,
                compensationType: 'RELEASE_INVENTORY',
                items: order.items
              })
            }]
          })
          console.log('↩️ 재고 복구')
          break
          
        case 'PAYMENT_PROCESSED':
          await compensationTransaction.send({
            topic: 'saga-compensations',
            messages: [{
              key: order.orderId,
              value: JSON.stringify({
                orderId: order.orderId,
                compensationType: 'REFUND_PAYMENT',
                amount: order.amount
              })
            }]
          })
          console.log('↩️ 결제 환불')
          break
          
        case 'ORDER_CREATED':
          await compensationTransaction.send({
            topic: 'saga-compensations',
            messages: [{
              key: order.orderId,
              value: JSON.stringify({
                orderId: order.orderId,
                compensationType: 'CANCEL_ORDER'
              })
            }]
          })
          console.log('↩️ 주문 취소')
          break
      }
    }
    
    await compensationTransaction.commit()
    console.log('✅ 보상 트랜잭션 완료')
    
  } catch (error) {
    console.error('❌ 보상 트랜잭션 실패:', error)
    await compensationTransaction.abort()
    
    // 보상 실패 시 수동 개입 필요
    await alertAdministrator(order, error)
  }
}

/**
 * Dead Letter Queue 처리
 */
async function sendToDeadLetterQueue(message, error) {
  await producer.send({
    topic: 'dead-letter-queue',
    messages: [{
      key: message.key,
      value: JSON.stringify({
        originalMessage: message.value.toString(),
        error: error.message,
        errorStack: error.stack,
        timestamp: new Date().toISOString(),
        retryCount: 0
      })
    }]
  })
}

/**
 * 관리자 알림
 */
async function alertAdministrator(order, error) {
  await producer.send({
    topic: 'admin-alerts',
    messages: [{
      key: 'critical-error',
      value: JSON.stringify({
        alertType: 'COMPENSATION_FAILED',
        orderId: order.orderId,
        error: error.message,
        timestamp: new Date().toISOString(),
        requiresManualIntervention: true
      })
    }]
  })
}

/**
 * 메인 실행 함수
 */
async function main() {
  try {
    await producer.connect()
    console.log('✨ Transactional Producer 예제 시작\n')
    
    // 1. 기본 트랜잭션
    await basicTransaction()
    
    // 2. 멀티 토픽 트랜잭션
    await multiTopicTransaction()
    
    // 3. 조건부 트랜잭션
    await conditionalTransaction({
      orderId: uuidv4(),
      customerId: uuidv4(),
      customerTier: 'VIP',
      items: [
        { productId: 'PROD-1', price: 500, quantity: 3 },
        { productId: 'PROD-2', price: 200, quantity: 1 }
      ]
    })
    
    // 4. 배치 트랜잭션
    const testRecords = Array.from({ length: 250 }, (_, i) => ({
      id: `record-${i}`,
      data: `Data ${i}`
    }))
    await batchTransaction(testRecords)
    
    // 5. Saga 트랜잭션
    await sagaTransaction({
      orderId: uuidv4(),
      amount: 1500,
      items: ['item1', 'item2'],
      shippingAddress: '123 Main St'
    })
    
    console.log('\n✅ 모든 트랜잭션 예제 완료')
    
  } catch (error) {
    console.error('❌ 실행 중 에러:', error)
  } finally {
    await producer.disconnect()
  }
}

// 프로그램 실행
main().catch(console.error)

// 우아한 종료
process.on('SIGINT', async () => {
  console.log('\n🛑 종료 중...')
  await producer.disconnect()
  process.exit(0)
})
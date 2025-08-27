# 🎯 Saga Pattern (분산 트랜잭션)

## 📖 Saga Pattern이란?

Saga는 **마이크로서비스 환경에서 분산 트랜잭션을 관리**하는 패턴입니다.  
긴 트랜잭션을 여러 개의 로컬 트랜잭션으로 나누고, 실패 시 보상 트랜잭션으로 롤백합니다.

### 분산 트랜잭션의 문제

```
기존 2PC (Two-Phase Commit):
┌──────┐  Prepare  ┌──────┐
│  TM  │──────────▶│ DB1  │
│      │◀──────────│      │
│      │  Ready    └──────┘
│      │  Prepare  ┌──────┐
│      │──────────▶│ DB2  │
│      │◀──────────│      │
└──────┘  Ready    └──────┘
    │
    └─ Commit All or Rollback All

문제점:
- 동기식 블로킹
- 단일 실패 지점
- 성능 저하
- 확장성 제한
```

## 🏗️ Saga 패턴 종류

### 1. Choreography (안무) 방식

```
┌─────────┐ Event ┌─────────┐ Event ┌─────────┐
│Service A│──────▶│Service B│──────▶│Service C│
└─────────┘       └─────────┘       └─────────┘
     ▲                                    │
     └────────────────────────────────────┘
              Compensation Event
```

### 2. Orchestration (오케스트레이션) 방식

```
           ┌──────────────┐
           │Saga Manager  │
           └──────┬───────┘
        ┌─────────┼─────────┐
        ▼         ▼         ▼
   ┌────────┐┌────────┐┌────────┐
   │Service ││Service ││Service │
   │   A    ││   B    ││   C    │
   └────────┘└────────┘└────────┘
```

## 💻 구현 예제 - 주문 처리 Saga

### 시나리오: 온라인 쇼핑몰 주문 처리

```
1. 주문 생성 (Order Service)
2. 결제 처리 (Payment Service)
3. 재고 차감 (Inventory Service)
4. 배송 준비 (Shipping Service)

실패 시 역순으로 보상:
4. 배송 취소
3. 재고 복구
2. 결제 취소
1. 주문 취소
```

### 1. Choreography 방식 구현

```javascript
// Order Service
class OrderService {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'order-service',
      brokers: ['localhost:9092']
    })
    this.producer = this.kafka.producer()
    this.consumer = this.kafka.consumer({ groupId: 'order-group' })
  }
  
  async createOrder(orderData) {
    try {
      // 1. 주문 생성
      const order = {
        orderId: uuidv4(),
        userId: orderData.userId,
        items: orderData.items,
        totalAmount: orderData.totalAmount,
        status: 'PENDING',
        createdAt: new Date()
      }
      
      await this.saveOrder(order)
      
      // 2. 주문 생성 이벤트 발행
      await this.publishEvent({
        type: 'ORDER_CREATED',
        orderId: order.orderId,
        userId: order.userId,
        amount: order.totalAmount,
        items: order.items
      })
      
      return order
    } catch (error) {
      console.error('Order creation failed:', error)
      throw error
    }
  }
  
  async startEventListener() {
    await this.consumer.subscribe({
      topics: ['payment-events', 'inventory-events', 'shipping-events']
    })
    
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const event = JSON.parse(message.value)
        await this.handleEvent(event)
      }
    })
  }
  
  async handleEvent(event) {
    switch(event.type) {
      case 'PAYMENT_COMPLETED':
        await this.handlePaymentCompleted(event)
        break
      case 'PAYMENT_FAILED':
        await this.handlePaymentFailed(event)
        break
      case 'INVENTORY_RESERVED':
        await this.handleInventoryReserved(event)
        break
      case 'INVENTORY_INSUFFICIENT':
        await this.handleInventoryInsufficient(event)
        break
      case 'SHIPPING_PREPARED':
        await this.handleShippingPrepared(event)
        break
      case 'SHIPPING_FAILED':
        await this.handleShippingFailed(event)
        break
    }
  }
  
  async handlePaymentFailed(event) {
    // 보상 트랜잭션: 주문 취소
    await this.updateOrderStatus(event.orderId, 'CANCELLED')
    
    await this.publishEvent({
      type: 'ORDER_CANCELLED',
      orderId: event.orderId,
      reason: 'Payment failed'
    })
  }
  
  async publishEvent(event) {
    await this.producer.send({
      topic: 'order-events',
      messages: [{
        key: event.orderId,
        value: JSON.stringify(event)
      }]
    })
  }
}

// Payment Service
class PaymentService {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'payment-service',
      brokers: ['localhost:9092']
    })
    this.producer = this.kafka.producer()
    this.consumer = this.kafka.consumer({ groupId: 'payment-group' })
  }
  
  async startEventListener() {
    await this.consumer.subscribe({
      topics: ['order-events', 'inventory-events']
    })
    
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const event = JSON.parse(message.value)
        await this.handleEvent(event)
      }
    })
  }
  
  async handleEvent(event) {
    switch(event.type) {
      case 'ORDER_CREATED':
        await this.processPayment(event)
        break
      case 'INVENTORY_INSUFFICIENT':
        await this.refundPayment(event)
        break
      case 'SHIPPING_FAILED':
        await this.refundPayment(event)
        break
    }
  }
  
  async processPayment(orderEvent) {
    try {
      // 결제 처리 로직
      const payment = {
        paymentId: uuidv4(),
        orderId: orderEvent.orderId,
        amount: orderEvent.amount,
        status: 'PROCESSING'
      }
      
      // 외부 결제 게이트웨이 호출
      const result = await this.callPaymentGateway(payment)
      
      if (result.success) {
        payment.status = 'COMPLETED'
        await this.savePayment(payment)
        
        await this.publishEvent({
          type: 'PAYMENT_COMPLETED',
          orderId: orderEvent.orderId,
          paymentId: payment.paymentId,
          amount: payment.amount
        })
      } else {
        throw new Error('Payment failed')
      }
    } catch (error) {
      console.error('Payment failed:', error)
      
      await this.publishEvent({
        type: 'PAYMENT_FAILED',
        orderId: orderEvent.orderId,
        reason: error.message
      })
    }
  }
  
  async refundPayment(event) {
    // 보상 트랜잭션: 결제 취소
    const payment = await this.findPaymentByOrderId(event.orderId)
    if (payment && payment.status === 'COMPLETED') {
      await this.callRefundGateway(payment)
      
      await this.updatePaymentStatus(payment.paymentId, 'REFUNDED')
      
      await this.publishEvent({
        type: 'PAYMENT_REFUNDED',
        orderId: event.orderId,
        paymentId: payment.paymentId,
        amount: payment.amount
      })
    }
  }
}

// Inventory Service
class InventoryService {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'inventory-service',
      brokers: ['localhost:9092']
    })
  }
  
  async handleEvent(event) {
    switch(event.type) {
      case 'PAYMENT_COMPLETED':
        await this.reserveInventory(event)
        break
      case 'SHIPPING_FAILED':
        await this.releaseInventory(event)
        break
      case 'ORDER_CANCELLED':
        await this.releaseInventory(event)
        break
    }
  }
  
  async reserveInventory(event) {
    try {
      const reservations = []
      
      for (const item of event.items) {
        const stock = await this.checkStock(item.productId)
        
        if (stock < item.quantity) {
          // 재고 부족 - 이미 예약된 것들 롤백
          for (const reservation of reservations) {
            await this.releaseStock(reservation.productId, reservation.quantity)
          }
          
          throw new Error(`Insufficient stock for ${item.productId}`)
        }
        
        await this.decrementStock(item.productId, item.quantity)
        reservations.push(item)
      }
      
      await this.publishEvent({
        type: 'INVENTORY_RESERVED',
        orderId: event.orderId,
        items: reservations
      })
    } catch (error) {
      await this.publishEvent({
        type: 'INVENTORY_INSUFFICIENT',
        orderId: event.orderId,
        reason: error.message
      })
    }
  }
  
  async releaseInventory(event) {
    // 보상 트랜잭션: 재고 복구
    for (const item of event.items) {
      await this.incrementStock(item.productId, item.quantity)
    }
    
    await this.publishEvent({
      type: 'INVENTORY_RELEASED',
      orderId: event.orderId
    })
  }
}
```

### 2. Orchestration 방식 구현

```javascript
// Saga Orchestrator
class OrderSagaOrchestrator {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'saga-orchestrator',
      brokers: ['localhost:9092']
    })
    this.producer = this.kafka.producer()
    this.consumer = this.kafka.consumer({ groupId: 'saga-group' })
    
    // Saga 상태 저장소
    this.sagaStore = new Map()
  }
  
  async startSaga(orderData) {
    const sagaId = uuidv4()
    const saga = {
      sagaId,
      orderId: orderData.orderId,
      status: 'STARTED',
      steps: [],
      currentStep: 0,
      data: orderData
    }
    
    this.sagaStore.set(sagaId, saga)
    
    // Saga 실행
    await this.executeNextStep(saga)
    
    return sagaId
  }
  
  async executeNextStep(saga) {
    const steps = [
      { name: 'CREATE_ORDER', service: 'order-service', command: 'CreateOrder' },
      { name: 'PROCESS_PAYMENT', service: 'payment-service', command: 'ProcessPayment' },
      { name: 'RESERVE_INVENTORY', service: 'inventory-service', command: 'ReserveInventory' },
      { name: 'PREPARE_SHIPPING', service: 'shipping-service', command: 'PrepareShipping' }
    ]
    
    if (saga.currentStep >= steps.length) {
      // Saga 완료
      saga.status = 'COMPLETED'
      await this.publishEvent({
        type: 'SAGA_COMPLETED',
        sagaId: saga.sagaId,
        orderId: saga.orderId
      })
      return
    }
    
    const currentStep = steps[saga.currentStep]
    
    // 커맨드 전송
    await this.sendCommand({
      sagaId: saga.sagaId,
      step: currentStep.name,
      service: currentStep.service,
      command: currentStep.command,
      data: saga.data
    })
    
    // 타임아웃 설정
    this.setStepTimeout(saga.sagaId, currentStep.name, 30000)
  }
  
  async handleReply(reply) {
    const saga = this.sagaStore.get(reply.sagaId)
    if (!saga) return
    
    if (reply.status === 'SUCCESS') {
      // 성공 - 다음 단계 진행
      saga.steps.push({
        name: reply.step,
        status: 'COMPLETED',
        result: reply.result
      })
      saga.currentStep++
      
      await this.executeNextStep(saga)
    } else {
      // 실패 - 보상 트랜잭션 시작
      saga.status = 'COMPENSATING'
      await this.startCompensation(saga)
    }
  }
  
  async startCompensation(saga) {
    console.log(`🔄 Starting compensation for saga ${saga.sagaId}`)
    
    // 완료된 단계들을 역순으로 보상
    const compensationSteps = [
      { step: 'PREPARE_SHIPPING', command: 'CancelShipping' },
      { step: 'RESERVE_INVENTORY', command: 'ReleaseInventory' },
      { step: 'PROCESS_PAYMENT', command: 'RefundPayment' },
      { step: 'CREATE_ORDER', command: 'CancelOrder' }
    ]
    
    for (const step of saga.steps.reverse()) {
      const compensation = compensationSteps.find(c => c.step === step.name)
      if (compensation) {
        await this.sendCompensationCommand({
          sagaId: saga.sagaId,
          step: compensation.step,
          command: compensation.command,
          data: step.result
        })
        
        // 보상 완료 대기
        await this.waitForCompensation(saga.sagaId, compensation.step)
      }
    }
    
    saga.status = 'COMPENSATED'
    await this.publishEvent({
      type: 'SAGA_COMPENSATED',
      sagaId: saga.sagaId,
      orderId: saga.orderId
    })
  }
  
  async sendCommand(command) {
    await this.producer.send({
      topic: `${command.service}-commands`,
      messages: [{
        key: command.sagaId,
        value: JSON.stringify(command)
      }]
    })
  }
  
  async sendCompensationCommand(command) {
    await this.producer.send({
      topic: 'compensation-commands',
      messages: [{
        key: command.sagaId,
        value: JSON.stringify(command)
      }]
    })
  }
  
  setStepTimeout(sagaId, step, timeout) {
    setTimeout(async () => {
      const saga = this.sagaStore.get(sagaId)
      if (saga && saga.status === 'STARTED') {
        console.error(`⏰ Timeout for step ${step}`)
        saga.status = 'TIMEOUT'
        await this.startCompensation(saga)
      }
    }, timeout)
  }
}

// Saga Step Handler (각 서비스에서 구현)
class SagaStepHandler {
  constructor(serviceName) {
    this.serviceName = serviceName
    this.kafka = new Kafka({
      clientId: serviceName,
      brokers: ['localhost:9092']
    })
  }
  
  async start() {
    const consumer = this.kafka.consumer({ 
      groupId: `${this.serviceName}-saga-group` 
    })
    
    await consumer.subscribe({
      topics: [`${this.serviceName}-commands`, 'compensation-commands']
    })
    
    await consumer.run({
      eachMessage: async ({ message }) => {
        const command = JSON.parse(message.value)
        await this.handleCommand(command)
      }
    })
  }
  
  async handleCommand(command) {
    console.log(`📥 ${this.serviceName} received command:`, command.command)
    
    try {
      let result
      
      // 서비스별 커맨드 처리
      switch(command.command) {
        case 'CreateOrder':
          result = await this.createOrder(command.data)
          break
        case 'ProcessPayment':
          result = await this.processPayment(command.data)
          break
        case 'ReserveInventory':
          result = await this.reserveInventory(command.data)
          break
        case 'PrepareShipping':
          result = await this.prepareShipping(command.data)
          break
        // 보상 커맨드
        case 'CancelOrder':
          result = await this.cancelOrder(command.data)
          break
        case 'RefundPayment':
          result = await this.refundPayment(command.data)
          break
        case 'ReleaseInventory':
          result = await this.releaseInventory(command.data)
          break
        case 'CancelShipping':
          result = await this.cancelShipping(command.data)
          break
      }
      
      // 성공 응답
      await this.sendReply({
        sagaId: command.sagaId,
        step: command.step,
        status: 'SUCCESS',
        result: result
      })
    } catch (error) {
      // 실패 응답
      await this.sendReply({
        sagaId: command.sagaId,
        step: command.step,
        status: 'FAILED',
        error: error.message
      })
    }
  }
  
  async sendReply(reply) {
    const producer = this.kafka.producer()
    await producer.connect()
    
    await producer.send({
      topic: 'saga-replies',
      messages: [{
        key: reply.sagaId,
        value: JSON.stringify(reply)
      }]
    })
    
    await producer.disconnect()
  }
}
```

### 3. Saga 상태 관리

```javascript
// Saga State Machine
class SagaStateMachine {
  constructor(sagaId) {
    this.sagaId = sagaId
    this.state = 'INITIAL'
    this.transitions = {
      INITIAL: {
        START: 'EXECUTING'
      },
      EXECUTING: {
        SUCCESS: 'EXECUTING',
        COMPLETE: 'COMPLETED',
        FAIL: 'COMPENSATING',
        TIMEOUT: 'COMPENSATING'
      },
      COMPENSATING: {
        COMPENSATE_SUCCESS: 'COMPENSATING',
        COMPENSATE_COMPLETE: 'COMPENSATED',
        COMPENSATE_FAIL: 'FAILED'
      },
      COMPLETED: {},
      COMPENSATED: {},
      FAILED: {}
    }
  }
  
  transition(event) {
    const currentTransitions = this.transitions[this.state]
    const nextState = currentTransitions[event]
    
    if (!nextState) {
      throw new Error(`Invalid transition: ${this.state} -> ${event}`)
    }
    
    console.log(`🔄 Saga ${this.sagaId}: ${this.state} -> ${nextState}`)
    this.state = nextState
    
    return nextState
  }
  
  isTerminal() {
    return ['COMPLETED', 'COMPENSATED', 'FAILED'].includes(this.state)
  }
  
  canCompensate() {
    return this.state === 'COMPENSATING'
  }
}

// Saga Log Store (Event Sourcing)
class SagaLogStore {
  constructor() {
    this.logs = new Map()
  }
  
  async append(sagaId, event) {
    if (!this.logs.has(sagaId)) {
      this.logs.set(sagaId, [])
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      event: event,
      sequence: this.logs.get(sagaId).length
    }
    
    this.logs.get(sagaId).push(logEntry)
    
    // Kafka에 영구 저장
    await this.persistToKafka(sagaId, logEntry)
  }
  
  async persistToKafka(sagaId, logEntry) {
    const producer = kafka.producer()
    await producer.send({
      topic: 'saga-logs',
      messages: [{
        key: sagaId,
        value: JSON.stringify(logEntry)
      }]
    })
  }
  
  async recover(sagaId) {
    // Kafka에서 로그 복원
    const logs = await this.loadFromKafka(sagaId)
    const saga = this.replayLogs(logs)
    return saga
  }
  
  replayLogs(logs) {
    const saga = new SagaStateMachine(logs[0].sagaId)
    
    for (const log of logs) {
      // 이벤트 재실행으로 상태 복원
      saga.transition(log.event.type)
    }
    
    return saga
  }
}
```

## 📊 장단점

### 장점 ✅
- **느슨한 결합**: 서비스 간 독립성 유지
- **부분 실패 처리**: 실패한 부분만 롤백
- **확장성**: 서비스별 독립적 확장
- **가시성**: 트랜잭션 상태 추적 가능

### 단점 ❌
- **복잡성**: 구현 및 디버깅 어려움
- **최종 일관성**: 즉시 일관성 보장 안됨
- **보상 로직**: 모든 작업에 보상 로직 필요
- **테스트 어려움**: 분산 시나리오 테스트 복잡

## 🔍 Best Practices

1. **멱등성 보장**: 재시도 시 중복 처리 방지
2. **타임아웃 설정**: 각 단계별 타임아웃 필수
3. **로깅**: 모든 단계 상세 로깅
4. **모니터링**: Saga 상태 실시간 모니터링
5. **보상 설계**: 실패 시나리오별 보상 전략
6. **테스트**: 실패 시나리오 충분한 테스트

---

💡 **관련 패턴**: [Event Sourcing](./event-sourcing.md), [CQRS](./cqrs.md)
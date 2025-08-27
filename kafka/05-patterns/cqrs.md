# 🎯 CQRS (Command Query Responsibility Segregation) 패턴

## 📖 CQRS란?

CQRS는 **명령(Command)과 조회(Query)의 책임을 분리**하는 아키텍처 패턴입니다.  
데이터를 변경하는 모델과 데이터를 읽는 모델을 분리하여 각각 최적화합니다.

### 전통적 방식 vs CQRS

```
전통적 방식:
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ Read/Write
       ▼
┌─────────────┐
│  Single     │
│  Model      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Database   │
└─────────────┘

CQRS:
┌─────────────┐
│   Client    │
└──┬──────┬───┘
   │      │
Command  Query
   │      │
   ▼      ▼
┌──────┐ ┌──────┐
│Write │ │Read  │
│Model │ │Model │
└──┬───┘ └───┬──┘
   │         │
   ▼         ▼
┌──────┐ ┌──────┐
│Write │ │Read  │
│ DB   │ │ DB   │
└──────┘ └──────┘
```

## 🏗️ Kafka를 활용한 CQRS 아키텍처

```
┌───────────────────────────────────────────────────────┐
│                     Command Side                       │
├───────────────────────────────────────────────────────┤
│  API Gateway → Command Handler → Domain Model         │
│                        │                               │
│                        ▼                               │
│                   Event Store                          │
│                   (Kafka Topic)                        │
└────────────────────────┬──────────────────────────────┘
                         │ Events
                         ▼
           ┌─────────────────────────────┐
           │      Kafka Topics           │
           │  - order-events             │
           │  - user-events              │
           │  - payment-events           │
           └─────────┬───────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
┌───────────┐ ┌───────────┐ ┌───────────┐
│Projection │ │Projection │ │Projection │
│Handler 1  │ │Handler 2  │ │Handler 3  │
└─────┬─────┘ └─────┬─────┘ └─────┬─────┘
      │             │             │
      ▼             ▼             ▼
┌───────────┐ ┌───────────┐ ┌───────────┐
│Read DB 1  │ │Read DB 2  │ │Read DB 3  │
│(MongoDB)  │ │(Elastic)  │ │(Redis)    │
└───────────┘ └───────────┘ └───────────┘
                Query Side
```

## 💻 구현 예제

### 1. Command Side 구현

```javascript
// Command 정의
class CreateOrderCommand {
  constructor(userId, items, shippingAddress) {
    this.commandId = uuidv4()
    this.commandType = 'CREATE_ORDER'
    this.userId = userId
    this.items = items
    this.shippingAddress = shippingAddress
    this.timestamp = new Date().toISOString()
  }
  
  validate() {
    if (!this.userId) throw new Error('UserId is required')
    if (!this.items || this.items.length === 0) {
      throw new Error('Order must have items')
    }
    if (!this.shippingAddress) {
      throw new Error('Shipping address is required')
    }
  }
}

// Command Handler
class OrderCommandHandler {
  constructor(eventStore, orderRepository) {
    this.eventStore = eventStore
    this.orderRepository = orderRepository
  }
  
  async handle(command) {
    // 1. Command 유효성 검증
    command.validate()
    
    // 2. 비즈니스 로직 실행
    const order = new Order()
    order.create(
      command.userId,
      command.items,
      command.shippingAddress
    )
    
    // 3. 도메인 이벤트 생성
    const events = order.getUncommittedEvents()
    
    // 4. 이벤트 저장 (Kafka)
    await this.publishEvents(events)
    
    // 5. Write Model 업데이트
    await this.orderRepository.save(order)
    
    return {
      success: true,
      orderId: order.id,
      events: events
    }
  }
  
  async publishEvents(events) {
    const messages = events.map(event => ({
      key: event.aggregateId,
      value: JSON.stringify(event),
      headers: {
        eventType: event.type,
        aggregateId: event.aggregateId,
        version: event.version.toString()
      }
    }))
    
    await this.producer.send({
      topic: 'order-events',
      messages
    })
  }
}

// Domain Model (Write Model)
class Order {
  constructor() {
    this.id = null
    this.userId = null
    this.items = []
    this.status = 'PENDING'
    this.totalAmount = 0
    this.events = []
  }
  
  create(userId, items, shippingAddress) {
    this.id = uuidv4()
    this.userId = userId
    this.items = items
    this.totalAmount = this.calculateTotal(items)
    this.shippingAddress = shippingAddress
    this.status = 'CREATED'
    
    // 이벤트 발생
    this.addEvent(new OrderCreatedEvent({
      orderId: this.id,
      userId: userId,
      items: items,
      totalAmount: this.totalAmount,
      shippingAddress: shippingAddress
    }))
  }
  
  approve() {
    if (this.status !== 'CREATED') {
      throw new Error('Order cannot be approved')
    }
    
    this.status = 'APPROVED'
    this.addEvent(new OrderApprovedEvent({
      orderId: this.id
    }))
  }
  
  ship() {
    if (this.status !== 'APPROVED') {
      throw new Error('Order must be approved before shipping')
    }
    
    this.status = 'SHIPPED'
    this.shippedAt = new Date()
    
    this.addEvent(new OrderShippedEvent({
      orderId: this.id,
      shippedAt: this.shippedAt
    }))
  }
  
  addEvent(event) {
    this.events.push(event)
  }
  
  getUncommittedEvents() {
    return this.events
  }
  
  markEventsAsCommitted() {
    this.events = []
  }
  
  calculateTotal(items) {
    return items.reduce((sum, item) => 
      sum + (item.price * item.quantity), 0
    )
  }
}
```

### 2. Query Side 구현

```javascript
// Read Model 정의
class OrderReadModel {
  constructor() {
    this.orders = new Map()  // 실제로는 MongoDB, PostgreSQL 등
    this.ordersByUser = new Map()
    this.ordersByStatus = new Map()
  }
  
  async save(orderView) {
    this.orders.set(orderView.orderId, orderView)
    
    // User별 인덱싱
    if (!this.ordersByUser.has(orderView.userId)) {
      this.ordersByUser.set(orderView.userId, [])
    }
    this.ordersByUser.get(orderView.userId).push(orderView)
    
    // Status별 인덱싱
    if (!this.ordersByStatus.has(orderView.status)) {
      this.ordersByStatus.set(orderView.status, [])
    }
    this.ordersByStatus.get(orderView.status).push(orderView)
  }
  
  async findById(orderId) {
    return this.orders.get(orderId)
  }
  
  async findByUserId(userId, options = {}) {
    const orders = this.ordersByUser.get(userId) || []
    
    // 페이징
    const { page = 1, limit = 10 } = options
    const start = (page - 1) * limit
    const end = start + limit
    
    return {
      orders: orders.slice(start, end),
      total: orders.length,
      page,
      limit
    }
  }
  
  async findByStatus(status) {
    return this.ordersByStatus.get(status) || []
  }
  
  async getStatistics() {
    const stats = {
      total: this.orders.size,
      byStatus: {},
      revenue: 0
    }
    
    for (const [status, orders] of this.ordersByStatus) {
      stats.byStatus[status] = orders.length
      stats.revenue += orders.reduce((sum, o) => sum + o.totalAmount, 0)
    }
    
    return stats
  }
}

// Projection Handler (Event Consumer)
class OrderProjectionHandler {
  constructor(readModel) {
    this.readModel = readModel
    this.kafka = new Kafka({
      clientId: 'order-projection',
      brokers: ['localhost:9092']
    })
    this.consumer = this.kafka.consumer({ 
      groupId: 'order-projection-group' 
    })
  }
  
  async start() {
    await this.consumer.connect()
    await this.consumer.subscribe({
      topics: ['order-events', 'payment-events', 'shipping-events'],
      fromBeginning: true
    })
    
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const event = JSON.parse(message.value)
        await this.handleEvent(event)
      }
    })
  }
  
  async handleEvent(event) {
    console.log(`📥 Processing event: ${event.type}`)
    
    switch(event.type) {
      case 'ORDER_CREATED':
        await this.handleOrderCreated(event)
        break
      case 'ORDER_APPROVED':
        await this.handleOrderApproved(event)
        break
      case 'ORDER_SHIPPED':
        await this.handleOrderShipped(event)
        break
      case 'PAYMENT_COMPLETED':
        await this.handlePaymentCompleted(event)
        break
    }
  }
  
  async handleOrderCreated(event) {
    const orderView = {
      orderId: event.data.orderId,
      userId: event.data.userId,
      items: event.data.items,
      totalAmount: event.data.totalAmount,
      shippingAddress: event.data.shippingAddress,
      status: 'CREATED',
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      
      // Read Model 특화 필드
      itemCount: event.data.items.length,
      formattedTotal: `₩${event.data.totalAmount.toLocaleString()}`,
      estimatedDelivery: this.calculateDeliveryDate(event.data.shippingAddress)
    }
    
    await this.readModel.save(orderView)
  }
  
  async handleOrderApproved(event) {
    const order = await this.readModel.findById(event.data.orderId)
    if (order) {
      order.status = 'APPROVED'
      order.approvedAt = event.timestamp
      order.updatedAt = event.timestamp
      await this.readModel.save(order)
    }
  }
  
  async handleOrderShipped(event) {
    const order = await this.readModel.findById(event.data.orderId)
    if (order) {
      order.status = 'SHIPPED'
      order.shippedAt = event.data.shippedAt
      order.trackingNumber = event.data.trackingNumber
      order.updatedAt = event.timestamp
      await this.readModel.save(order)
    }
  }
  
  async handlePaymentCompleted(event) {
    const order = await this.readModel.findById(event.data.orderId)
    if (order) {
      order.paymentStatus = 'PAID'
      order.paymentMethod = event.data.method
      order.paidAt = event.timestamp
      await this.readModel.save(order)
    }
  }
  
  calculateDeliveryDate(address) {
    // 주소 기반 예상 배송일 계산
    const days = address.express ? 2 : 5
    const deliveryDate = new Date()
    deliveryDate.setDate(deliveryDate.getDate() + days)
    return deliveryDate.toISOString()
  }
}
```

### 3. Query Service 구현

```javascript
class OrderQueryService {
  constructor(readModel) {
    this.readModel = readModel
  }
  
  /**
   * 주문 상세 조회
   */
  async getOrderDetails(orderId) {
    const order = await this.readModel.findById(orderId)
    if (!order) {
      throw new Error('Order not found')
    }
    
    // 추가 정보 조합 (다른 Read Model에서)
    const enrichedOrder = {
      ...order,
      customer: await this.getCustomerInfo(order.userId),
      itemDetails: await this.getItemDetails(order.items),
      shippingStatus: await this.getShippingStatus(order.orderId)
    }
    
    return enrichedOrder
  }
  
  /**
   * 사용자 주문 목록
   */
  async getUserOrders(userId, filters = {}) {
    const { status, dateFrom, dateTo, page = 1, limit = 20 } = filters
    
    let orders = await this.readModel.findByUserId(userId, { page, limit })
    
    // 필터링
    if (status) {
      orders = orders.filter(o => o.status === status)
    }
    if (dateFrom) {
      orders = orders.filter(o => new Date(o.createdAt) >= new Date(dateFrom))
    }
    if (dateTo) {
      orders = orders.filter(o => new Date(o.createdAt) <= new Date(dateTo))
    }
    
    return orders
  }
  
  /**
   * 대시보드 통계
   */
  async getDashboardStats(period = 'today') {
    const stats = await this.readModel.getStatistics()
    
    // 기간별 집계
    const periodStats = await this.aggregateByPeriod(period)
    
    return {
      ...stats,
      period: periodStats,
      trends: await this.calculateTrends(period)
    }
  }
  
  /**
   * 검색
   */
  async searchOrders(query) {
    // Elasticsearch 활용 예제
    const searchResults = await this.elasticClient.search({
      index: 'orders',
      body: {
        query: {
          multi_match: {
            query: query,
            fields: ['orderId', 'userId', 'items.name', 'shippingAddress']
          }
        }
      }
    })
    
    return searchResults.hits.hits.map(hit => hit._source)
  }
  
  /**
   * 실시간 주문 스트림
   */
  async *streamOrders(filters = {}) {
    const consumer = kafka.consumer({ groupId: 'query-stream' })
    await consumer.subscribe({ topic: 'order-events' })
    
    await consumer.run({
      eachMessage: async ({ message }) => {
        const event = JSON.parse(message.value)
        if (this.matchesFilter(event, filters)) {
          yield event
        }
      }
    })
  }
}
```

### 4. API Layer

```javascript
import express from 'express'

const app = express()

// Command Controller
class OrderCommandController {
  constructor(commandHandler) {
    this.commandHandler = commandHandler
  }
  
  async createOrder(req, res) {
    try {
      const command = new CreateOrderCommand(
        req.user.id,
        req.body.items,
        req.body.shippingAddress
      )
      
      const result = await this.commandHandler.handle(command)
      
      res.status(201).json({
        success: true,
        orderId: result.orderId,
        message: 'Order created successfully'
      })
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      })
    }
  }
  
  async approveOrder(req, res) {
    const command = new ApproveOrderCommand(req.params.orderId)
    const result = await this.commandHandler.handle(command)
    res.json(result)
  }
}

// Query Controller
class OrderQueryController {
  constructor(queryService) {
    this.queryService = queryService
  }
  
  async getOrder(req, res) {
    const order = await this.queryService.getOrderDetails(req.params.orderId)
    res.json(order)
  }
  
  async listOrders(req, res) {
    const orders = await this.queryService.getUserOrders(
      req.user.id,
      req.query
    )
    res.json(orders)
  }
  
  async getDashboard(req, res) {
    const stats = await this.queryService.getDashboardStats(req.query.period)
    res.json(stats)
  }
  
  async searchOrders(req, res) {
    const results = await this.queryService.searchOrders(req.query.q)
    res.json(results)
  }
}

// Routes
app.post('/api/orders', (req, res) => commandController.createOrder(req, res))
app.post('/api/orders/:orderId/approve', (req, res) => commandController.approveOrder(req, res))

app.get('/api/orders/:orderId', (req, res) => queryController.getOrder(req, res))
app.get('/api/orders', (req, res) => queryController.listOrders(req, res))
app.get('/api/dashboard', (req, res) => queryController.getDashboard(req, res))
app.get('/api/search', (req, res) => queryController.searchOrders(req, res))
```

### 5. 동기화 전략

```javascript
class SyncManager {
  constructor() {
    this.syncInProgress = false
    this.lastSyncOffset = 0
  }
  
  /**
   * 전체 재구축
   */
  async rebuild() {
    console.log('🔄 Starting full rebuild...')
    
    // 1. Read Model 초기화
    await this.readModel.clear()
    
    // 2. 모든 이벤트 재처리
    const consumer = kafka.consumer({ 
      groupId: `rebuild-${Date.now()}` 
    })
    
    await consumer.subscribe({
      topic: 'order-events',
      fromBeginning: true
    })
    
    await consumer.run({
      eachBatch: async ({ batch }) => {
        for (const message of batch.messages) {
          const event = JSON.parse(message.value)
          await this.projectionHandler.handleEvent(event)
        }
        
        console.log(`Processed ${batch.messages.length} events`)
      }
    })
  }
  
  /**
   * 증분 동기화
   */
  async incrementalSync() {
    const consumer = kafka.consumer({ 
      groupId: 'incremental-sync' 
    })
    
    await consumer.seek({ 
      topic: 'order-events', 
      partition: 0, 
      offset: this.lastSyncOffset 
    })
    
    await consumer.run({
      eachMessage: async ({ message }) => {
        const event = JSON.parse(message.value)
        await this.handleSyncEvent(event)
        this.lastSyncOffset = parseInt(message.offset)
      }
    })
  }
  
  /**
   * 일관성 체크
   */
  async checkConsistency() {
    const writeModelCount = await this.writeDb.count()
    const readModelCount = await this.readModel.count()
    
    if (writeModelCount !== readModelCount) {
      console.warn(`⚠️ Inconsistency detected: Write=${writeModelCount}, Read=${readModelCount}`)
      await this.rebuild()
    }
  }
}
```

## 📊 장단점

### 장점 ✅
- **성능 최적화**: Read/Write 각각 최적화 가능
- **확장성**: Read/Write 독립적 스케일링
- **유연성**: 다양한 Read Model 구성 가능
- **단순화**: 복잡한 조인 없이 미리 계산된 뷰
- **이벤트 소싱과 자연스러운 통합**

### 단점 ❌
- **복잡성**: 아키텍처 복잡도 증가
- **최종 일관성**: 즉시 일관성 보장 어려움
- **데이터 중복**: 여러 Read Model에 데이터 복제
- **동기화 문제**: Write/Read 모델 간 동기화

## 🔍 Best Practices

1. **명확한 경계**: Command와 Query 명확히 구분
2. **이벤트 중심**: 동기화는 이벤트를 통해서만
3. **Read Model 최적화**: 쿼리에 맞춘 비정규화
4. **캐싱 전략**: Read Model에 적극적 캐싱
5. **모니터링**: 동기화 지연 모니터링 필수
6. **테스트**: Command와 Query 독립적 테스트

## 🎯 사용 사례

- **전자상거래**: 주문 처리와 상품 카탈로그 분리
- **뱅킹**: 거래 처리와 잔액 조회 분리  
- **소셜 미디어**: 게시물 작성과 타임라인 조회 분리
- **IoT**: 센서 데이터 수집과 분석 대시보드 분리

---

💡 **관련 패턴**: [Event Sourcing](./event-sourcing.md), [Saga Pattern](./saga-pattern.md)
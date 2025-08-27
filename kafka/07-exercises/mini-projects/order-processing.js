/**
 * 실습 프로젝트: 주문 처리 시스템
 * 
 * 시나리오:
 * 1. 주문 접수 → 결제 처리 → 재고 확인 → 배송 준비
 * 2. 실시간 주문 상태 추적
 * 3. 주문 통계 대시보드
 */

import { Kafka } from 'kafkajs'
import { v4 as uuidv4 } from 'uuid'
import express from 'express'

// ========================================
// 1. Kafka 설정
// ========================================

const kafka = new Kafka({
  clientId: 'order-processing-system',
  brokers: ['localhost:9092', 'localhost:9093', 'localhost:9094'],
  retry: {
    retries: 5,
    initialRetryTime: 100
  }
})

// ========================================
// 2. Order Service (주문 서비스)
// ========================================

class OrderService {
  constructor() {
    this.producer = kafka.producer({
      idempotent: true,
      maxInFlightRequests: 5
    })
    
    this.consumer = kafka.consumer({
      groupId: 'order-service-group'
    })
    
    this.orders = new Map()
  }
  
  async start() {
    await this.producer.connect()
    await this.consumer.connect()
    
    await this.consumer.subscribe({
      topics: ['payment-events', 'inventory-events', 'shipping-events'],
      fromBeginning: false
    })
    
    console.log('📦 Order Service started')
    await this.startEventConsumer()
  }
  
  /**
   * 주문 생성
   */
  async createOrder(orderRequest) {
    const order = {
      orderId: uuidv4(),
      customerId: orderRequest.customerId,
      items: orderRequest.items,
      totalAmount: this.calculateTotal(orderRequest.items),
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      events: []
    }
    
    // 주문 저장
    this.orders.set(order.orderId, order)
    
    // 주문 생성 이벤트 발행
    const event = {
      eventType: 'ORDER_CREATED',
      orderId: order.orderId,
      customerId: order.customerId,
      items: order.items,
      totalAmount: order.totalAmount,
      timestamp: new Date().toISOString()
    }
    
    await this.publishEvent('order-events', event)
    
    console.log(`✅ Order created: ${order.orderId}`)
    return order
  }
  
  /**
   * 이벤트 컨슈머
   */
  async startEventConsumer() {
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const event = JSON.parse(message.value.toString())
        console.log(`📥 [OrderService] Received event from ${topic}:`, event.eventType)
        
        switch(event.eventType) {
          case 'PAYMENT_SUCCESS':
            await this.handlePaymentSuccess(event)
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
          case 'SHIPPING_INITIATED':
            await this.handleShippingInitiated(event)
            break
        }
      }
    })
  }
  
  async handlePaymentSuccess(event) {
    const order = this.orders.get(event.orderId)
    if (order) {
      order.status = 'PAYMENT_COMPLETED'
      order.events.push(event)
      console.log(`💳 Payment completed for order ${event.orderId}`)
    }
  }
  
  async handlePaymentFailed(event) {
    const order = this.orders.get(event.orderId)
    if (order) {
      order.status = 'PAYMENT_FAILED'
      order.events.push(event)
      
      // 주문 취소 이벤트
      await this.publishEvent('order-events', {
        eventType: 'ORDER_CANCELLED',
        orderId: event.orderId,
        reason: 'Payment failed',
        timestamp: new Date().toISOString()
      })
      
      console.log(`❌ Order cancelled due to payment failure: ${event.orderId}`)
    }
  }
  
  async handleInventoryReserved(event) {
    const order = this.orders.get(event.orderId)
    if (order) {
      order.status = 'INVENTORY_RESERVED'
      order.events.push(event)
      console.log(`📦 Inventory reserved for order ${event.orderId}`)
    }
  }
  
  async handleInventoryInsufficient(event) {
    const order = this.orders.get(event.orderId)
    if (order) {
      order.status = 'INVENTORY_INSUFFICIENT'
      order.events.push(event)
      
      // 결제 환불 요청
      await this.publishEvent('order-events', {
        eventType: 'REFUND_REQUESTED',
        orderId: event.orderId,
        amount: order.totalAmount,
        reason: 'Inventory insufficient',
        timestamp: new Date().toISOString()
      })
      
      console.log(`❌ Order cancelled due to insufficient inventory: ${event.orderId}`)
    }
  }
  
  async handleShippingInitiated(event) {
    const order = this.orders.get(event.orderId)
    if (order) {
      order.status = 'SHIPPED'
      order.shippingInfo = event.shippingInfo
      order.events.push(event)
      console.log(`🚚 Order shipped: ${event.orderId}`)
    }
  }
  
  calculateTotal(items) {
    return items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  }
  
  async publishEvent(topic, event) {
    await this.producer.send({
      topic,
      messages: [{
        key: event.orderId || uuidv4(),
        value: JSON.stringify(event),
        headers: {
          eventType: event.eventType,
          timestamp: new Date().toISOString()
        }
      }]
    })
  }
  
  getOrder(orderId) {
    return this.orders.get(orderId)
  }
  
  getAllOrders() {
    return Array.from(this.orders.values())
  }
}

// ========================================
// 3. Payment Service (결제 서비스)
// ========================================

class PaymentService {
  constructor() {
    this.producer = kafka.producer()
    this.consumer = kafka.consumer({
      groupId: 'payment-service-group'
    })
    
    this.payments = new Map()
  }
  
  async start() {
    await this.producer.connect()
    await this.consumer.connect()
    
    await this.consumer.subscribe({
      topics: ['order-events'],
      fromBeginning: false
    })
    
    console.log('💳 Payment Service started')
    await this.startEventConsumer()
  }
  
  async startEventConsumer() {
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const event = JSON.parse(message.value.toString())
        console.log(`📥 [PaymentService] Received event:`, event.eventType)
        
        switch(event.eventType) {
          case 'ORDER_CREATED':
            await this.processPayment(event)
            break
          case 'REFUND_REQUESTED':
            await this.processRefund(event)
            break
        }
      }
    })
  }
  
  async processPayment(orderEvent) {
    const payment = {
      paymentId: uuidv4(),
      orderId: orderEvent.orderId,
      amount: orderEvent.totalAmount,
      status: 'PROCESSING',
      timestamp: new Date().toISOString()
    }
    
    this.payments.set(payment.paymentId, payment)
    
    // 결제 처리 시뮬레이션 (90% 성공률)
    const success = Math.random() > 0.1
    
    await new Promise(resolve => setTimeout(resolve, 1000)) // 1초 대기
    
    if (success) {
      payment.status = 'COMPLETED'
      
      await this.publishEvent('payment-events', {
        eventType: 'PAYMENT_SUCCESS',
        orderId: orderEvent.orderId,
        paymentId: payment.paymentId,
        amount: payment.amount,
        timestamp: new Date().toISOString()
      })
      
      console.log(`✅ Payment successful for order ${orderEvent.orderId}`)
    } else {
      payment.status = 'FAILED'
      
      await this.publishEvent('payment-events', {
        eventType: 'PAYMENT_FAILED',
        orderId: orderEvent.orderId,
        paymentId: payment.paymentId,
        reason: 'Card declined',
        timestamp: new Date().toISOString()
      })
      
      console.log(`❌ Payment failed for order ${orderEvent.orderId}`)
    }
  }
  
  async processRefund(event) {
    const payment = Array.from(this.payments.values())
      .find(p => p.orderId === event.orderId && p.status === 'COMPLETED')
    
    if (payment) {
      payment.status = 'REFUNDED'
      
      await this.publishEvent('payment-events', {
        eventType: 'PAYMENT_REFUNDED',
        orderId: event.orderId,
        paymentId: payment.paymentId,
        amount: payment.amount,
        timestamp: new Date().toISOString()
      })
      
      console.log(`💰 Refund processed for order ${event.orderId}`)
    }
  }
  
  async publishEvent(topic, event) {
    await this.producer.send({
      topic,
      messages: [{
        key: event.orderId,
        value: JSON.stringify(event)
      }]
    })
  }
}

// ========================================
// 4. Inventory Service (재고 서비스)
// ========================================

class InventoryService {
  constructor() {
    this.producer = kafka.producer()
    this.consumer = kafka.consumer({
      groupId: 'inventory-service-group'
    })
    
    // 초기 재고 설정
    this.inventory = new Map([
      ['ITEM-001', { name: 'Laptop', stock: 50 }],
      ['ITEM-002', { name: 'Mouse', stock: 200 }],
      ['ITEM-003', { name: 'Keyboard', stock: 150 }],
      ['ITEM-004', { name: 'Monitor', stock: 30 }],
      ['ITEM-005', { name: 'Headphone', stock: 100 }]
    ])
    
    this.reservations = new Map()
  }
  
  async start() {
    await this.producer.connect()
    await this.consumer.connect()
    
    await this.consumer.subscribe({
      topics: ['payment-events', 'order-events'],
      fromBeginning: false
    })
    
    console.log('📦 Inventory Service started')
    this.printInventory()
    await this.startEventConsumer()
  }
  
  async startEventConsumer() {
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const event = JSON.parse(message.value.toString())
        console.log(`📥 [InventoryService] Received event:`, event.eventType)
        
        switch(event.eventType) {
          case 'PAYMENT_SUCCESS':
            await this.reserveInventory(event)
            break
          case 'ORDER_CANCELLED':
          case 'PAYMENT_REFUNDED':
            await this.releaseInventory(event)
            break
        }
      }
    })
  }
  
  async reserveInventory(event) {
    // 실제 주문 정보를 가져와야 하지만, 간단히 시뮬레이션
    const items = [
      { productId: 'ITEM-001', quantity: 1 },
      { productId: 'ITEM-002', quantity: 2 }
    ]
    
    const reservation = {
      orderId: event.orderId,
      items: [],
      timestamp: new Date().toISOString()
    }
    
    let allAvailable = true
    
    // 재고 확인
    for (const item of items) {
      const product = this.inventory.get(item.productId)
      if (!product || product.stock < item.quantity) {
        allAvailable = false
        break
      }
    }
    
    if (allAvailable) {
      // 재고 차감
      for (const item of items) {
        const product = this.inventory.get(item.productId)
        product.stock -= item.quantity
        reservation.items.push(item)
      }
      
      this.reservations.set(event.orderId, reservation)
      
      await this.publishEvent('inventory-events', {
        eventType: 'INVENTORY_RESERVED',
        orderId: event.orderId,
        items: reservation.items,
        timestamp: new Date().toISOString()
      })
      
      console.log(`✅ Inventory reserved for order ${event.orderId}`)
      this.printInventory()
    } else {
      await this.publishEvent('inventory-events', {
        eventType: 'INVENTORY_INSUFFICIENT',
        orderId: event.orderId,
        timestamp: new Date().toISOString()
      })
      
      console.log(`❌ Insufficient inventory for order ${event.orderId}`)
    }
  }
  
  async releaseInventory(event) {
    const reservation = this.reservations.get(event.orderId)
    
    if (reservation) {
      // 재고 복구
      for (const item of reservation.items) {
        const product = this.inventory.get(item.productId)
        if (product) {
          product.stock += item.quantity
        }
      }
      
      this.reservations.delete(event.orderId)
      
      console.log(`📦 Inventory released for order ${event.orderId}`)
      this.printInventory()
    }
  }
  
  printInventory() {
    console.log('\n📊 Current Inventory:')
    for (const [id, product] of this.inventory) {
      console.log(`  ${id}: ${product.name} - Stock: ${product.stock}`)
    }
    console.log('')
  }
  
  async publishEvent(topic, event) {
    await this.producer.send({
      topic,
      messages: [{
        key: event.orderId,
        value: JSON.stringify(event)
      }]
    })
  }
}

// ========================================
// 5. Shipping Service (배송 서비스)
// ========================================

class ShippingService {
  constructor() {
    this.producer = kafka.producer()
    this.consumer = kafka.consumer({
      groupId: 'shipping-service-group'
    })
    
    this.shipments = new Map()
  }
  
  async start() {
    await this.producer.connect()
    await this.consumer.connect()
    
    await this.consumer.subscribe({
      topics: ['inventory-events'],
      fromBeginning: false
    })
    
    console.log('🚚 Shipping Service started')
    await this.startEventConsumer()
  }
  
  async startEventConsumer() {
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const event = JSON.parse(message.value.toString())
        console.log(`📥 [ShippingService] Received event:`, event.eventType)
        
        if (event.eventType === 'INVENTORY_RESERVED') {
          await this.initiateShipping(event)
        }
      }
    })
  }
  
  async initiateShipping(event) {
    const shipment = {
      shipmentId: uuidv4(),
      orderId: event.orderId,
      trackingNumber: `TRK-${Date.now()}`,
      status: 'PREPARING',
      estimatedDelivery: this.calculateDeliveryDate(),
      timestamp: new Date().toISOString()
    }
    
    this.shipments.set(shipment.shipmentId, shipment)
    
    // 배송 준비 시뮬레이션
    await new Promise(resolve => setTimeout(resolve, 500))
    
    shipment.status = 'SHIPPED'
    
    await this.publishEvent('shipping-events', {
      eventType: 'SHIPPING_INITIATED',
      orderId: event.orderId,
      shipmentId: shipment.shipmentId,
      shippingInfo: {
        trackingNumber: shipment.trackingNumber,
        estimatedDelivery: shipment.estimatedDelivery
      },
      timestamp: new Date().toISOString()
    })
    
    console.log(`✅ Shipping initiated for order ${event.orderId}`)
    console.log(`  📦 Tracking: ${shipment.trackingNumber}`)
    console.log(`  📅 Delivery: ${shipment.estimatedDelivery}`)
  }
  
  calculateDeliveryDate() {
    const date = new Date()
    date.setDate(date.getDate() + 3) // 3일 후
    return date.toISOString().split('T')[0]
  }
  
  async publishEvent(topic, event) {
    await this.producer.send({
      topic,
      messages: [{
        key: event.orderId,
        value: JSON.stringify(event)
      }]
    })
  }
}

// ========================================
// 6. Analytics Service (분석 서비스)
// ========================================

class AnalyticsService {
  constructor() {
    this.consumer = kafka.consumer({
      groupId: 'analytics-service-group'
    })
    
    this.stats = {
      totalOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      totalRevenue: 0,
      averageOrderValue: 0,
      ordersByStatus: {}
    }
  }
  
  async start() {
    await this.consumer.connect()
    
    await this.consumer.subscribe({
      topics: ['order-events', 'payment-events', 'shipping-events'],
      fromBeginning: true
    })
    
    console.log('📊 Analytics Service started')
    await this.startEventConsumer()
    
    // 주기적으로 통계 출력
    setInterval(() => this.printStats(), 10000)
  }
  
  async startEventConsumer() {
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const event = JSON.parse(message.value.toString())
        
        switch(event.eventType) {
          case 'ORDER_CREATED':
            this.stats.totalOrders++
            this.stats.totalRevenue += event.totalAmount || 0
            break
          case 'ORDER_CANCELLED':
            this.stats.cancelledOrders++
            break
          case 'SHIPPING_INITIATED':
            this.stats.completedOrders++
            break
        }
        
        this.updateAverageOrderValue()
      }
    })
  }
  
  updateAverageOrderValue() {
    if (this.stats.totalOrders > 0) {
      this.stats.averageOrderValue = this.stats.totalRevenue / this.stats.totalOrders
    }
  }
  
  printStats() {
    console.log('\n📊 === Order Processing Statistics ===')
    console.log(`Total Orders: ${this.stats.totalOrders}`)
    console.log(`Completed: ${this.stats.completedOrders}`)
    console.log(`Cancelled: ${this.stats.cancelledOrders}`)
    console.log(`Success Rate: ${((this.stats.completedOrders / this.stats.totalOrders) * 100).toFixed(2)}%`)
    console.log(`Total Revenue: $${this.stats.totalRevenue.toFixed(2)}`)
    console.log(`Average Order Value: $${this.stats.averageOrderValue.toFixed(2)}`)
    console.log('=====================================\n')
  }
  
  getStats() {
    return this.stats
  }
}

// ========================================
// 7. REST API
// ========================================

class OrderAPI {
  constructor(orderService, analyticsService) {
    this.orderService = orderService
    this.analyticsService = analyticsService
    this.app = express()
    this.app.use(express.json())
    
    this.setupRoutes()
  }
  
  setupRoutes() {
    // 주문 생성
    this.app.post('/api/orders', async (req, res) => {
      try {
        const order = await this.orderService.createOrder(req.body)
        res.status(201).json({
          success: true,
          order
        })
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        })
      }
    })
    
    // 주문 조회
    this.app.get('/api/orders/:orderId', (req, res) => {
      const order = this.orderService.getOrder(req.params.orderId)
      
      if (order) {
        res.json({ success: true, order })
      } else {
        res.status(404).json({
          success: false,
          error: 'Order not found'
        })
      }
    })
    
    // 모든 주문 조회
    this.app.get('/api/orders', (req, res) => {
      const orders = this.orderService.getAllOrders()
      res.json({
        success: true,
        count: orders.length,
        orders
      })
    })
    
    // 통계 조회
    this.app.get('/api/analytics', (req, res) => {
      const stats = this.analyticsService.getStats()
      res.json({
        success: true,
        stats
      })
    })
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy' })
    })
  }
  
  start(port = 3000) {
    this.app.listen(port, () => {
      console.log(`🌐 REST API started on http://localhost:${port}`)
      console.log(`  POST /api/orders - Create order`)
      console.log(`  GET  /api/orders/:orderId - Get order`)
      console.log(`  GET  /api/orders - List orders`)
      console.log(`  GET  /api/analytics - Get statistics`)
    })
  }
}

// ========================================
// 8. 메인 실행
// ========================================

async function main() {
  console.log('🚀 Starting Order Processing System...\n')
  
  // 서비스 초기화
  const orderService = new OrderService()
  const paymentService = new PaymentService()
  const inventoryService = new InventoryService()
  const shippingService = new ShippingService()
  const analyticsService = new AnalyticsService()
  
  // 서비스 시작
  await orderService.start()
  await paymentService.start()
  await inventoryService.start()
  await shippingService.start()
  await analyticsService.start()
  
  // REST API 시작
  const api = new OrderAPI(orderService, analyticsService)
  api.start(3000)
  
  console.log('\n✅ All services started successfully!\n')
  console.log('📝 Create a test order:')
  console.log('curl -X POST http://localhost:3000/api/orders \\')
  console.log('  -H "Content-Type: application/json" \\')
  console.log('  -d \'{"customerId":"CUST-001","items":[{"productId":"ITEM-001","name":"Laptop","price":1500,"quantity":1}]}\'')
  
  // 테스트 주문 생성 (5초 후)
  setTimeout(async () => {
    console.log('\n🧪 Creating test orders...\n')
    
    for (let i = 0; i < 5; i++) {
      await orderService.createOrder({
        customerId: `CUST-${String(i + 1).padStart(3, '0')}`,
        items: [
          {
            productId: 'ITEM-001',
            name: 'Laptop',
            price: 1500,
            quantity: 1
          },
          {
            productId: 'ITEM-002',
            name: 'Mouse',
            price: 30,
            quantity: 2
          }
        ]
      })
      
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }, 5000)
}

// 프로그램 실행
main().catch(console.error)

// 우아한 종료
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down services...')
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down services...')
  process.exit(0)
})
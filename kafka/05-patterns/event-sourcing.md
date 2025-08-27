# 🎯 Event Sourcing 패턴

## 📖 Event Sourcing이란?

Event Sourcing은 애플리케이션의 **모든 상태 변경을 이벤트의 시퀀스로 저장**하는 패턴입니다.  
현재 상태를 저장하는 대신, 상태에 이르기까지의 모든 이벤트를 저장합니다.

### 전통적 방식 vs Event Sourcing

```
전통적 CRUD:
User { id: 1, name: "Kim", email: "kim@example.com", balance: 1000 }
→ UPDATE users SET balance = 1500 WHERE id = 1
→ 이전 상태는 손실됨

Event Sourcing:
Event 1: UserCreated { id: 1, name: "Kim" }
Event 2: EmailUpdated { id: 1, email: "kim@example.com" }
Event 3: BalanceDeposited { id: 1, amount: 500 }
→ 모든 변경 이력 보존
```

## 🏗️ 아키텍처

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Command    │────▶│   Domain     │────▶│    Event     │
│   Handler    │     │   Model      │     │    Store     │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                     │
                            ▼                     ▼
                     ┌──────────────┐     ┌──────────────┐
                     │    Event     │◀────│    Kafka     │
                     │   Processor  │     │   Topics     │
                     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  Read Model  │
                     │  (Projection) │
                     └──────────────┘
```

## 💻 구현 예제

### 1. 이벤트 정의

```javascript
// 이벤트 타입 정의
const EventTypes = {
  ACCOUNT_CREATED: 'ACCOUNT_CREATED',
  MONEY_DEPOSITED: 'MONEY_DEPOSITED',
  MONEY_WITHDRAWN: 'MONEY_WITHDRAWN',
  TRANSFER_INITIATED: 'TRANSFER_INITIATED',
  ACCOUNT_CLOSED: 'ACCOUNT_CLOSED'
}

// 이벤트 스키마
class AccountEvent {
  constructor(type, aggregateId, data, metadata = {}) {
    this.eventId = uuidv4()
    this.eventType = type
    this.aggregateId = aggregateId
    this.data = data
    this.metadata = {
      ...metadata,
      timestamp: new Date().toISOString(),
      version: 1
    }
  }
}

// 구체적인 이벤트들
class AccountCreated extends AccountEvent {
  constructor(accountId, owner, initialBalance = 0) {
    super(EventTypes.ACCOUNT_CREATED, accountId, {
      owner,
      initialBalance,
      currency: 'KRW',
      status: 'ACTIVE'
    })
  }
}

class MoneyDeposited extends AccountEvent {
  constructor(accountId, amount, source) {
    super(EventTypes.MONEY_DEPOSITED, accountId, {
      amount,
      source,
      transactionId: uuidv4()
    })
  }
}
```

### 2. Event Store 구현

```javascript
import { Kafka } from 'kafkajs'

class EventStore {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'event-store',
      brokers: ['localhost:9092']
    })
    this.producer = this.kafka.producer()
    this.consumer = this.kafka.consumer({ groupId: 'event-store-group' })
  }
  
  async connect() {
    await this.producer.connect()
    await this.consumer.connect()
  }
  
  /**
   * 이벤트 저장
   */
  async append(streamName, events) {
    const messages = events.map(event => ({
      key: event.aggregateId,
      value: JSON.stringify(event),
      headers: {
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        timestamp: event.metadata.timestamp
      }
    }))
    
    await this.producer.send({
      topic: `event-stream-${streamName}`,
      messages,
      acks: -1  // 모든 replica 확인
    })
    
    console.log(`✅ ${events.length} events appended to ${streamName}`)
  }
  
  /**
   * 특정 Aggregate의 모든 이벤트 조회
   */
  async getEvents(streamName, aggregateId, fromVersion = 0) {
    const events = []
    
    await this.consumer.subscribe({
      topic: `event-stream-${streamName}`,
      fromBeginning: true
    })
    
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const event = JSON.parse(message.value)
        if (event.aggregateId === aggregateId && 
            event.metadata.version >= fromVersion) {
          events.push(event)
        }
      }
    })
    
    return events.sort((a, b) => 
      a.metadata.version - b.metadata.version
    )
  }
  
  /**
   * 스냅샷 저장
   */
  async saveSnapshot(aggregateId, snapshot, version) {
    await this.producer.send({
      topic: 'snapshots',
      messages: [{
        key: aggregateId,
        value: JSON.stringify({
          aggregateId,
          snapshot,
          version,
          timestamp: new Date().toISOString()
        })
      }]
    })
  }
  
  /**
   * 스냅샷 조회
   */
  async getSnapshot(aggregateId) {
    // 최신 스냅샷 조회 로직
    // Compacted topic 사용하여 최신 값만 유지
  }
}
```

### 3. Aggregate 구현

```javascript
class BankAccount {
  constructor(id) {
    this.id = id
    this.balance = 0
    this.owner = null
    this.status = 'INACTIVE'
    this.version = 0
    this.uncommittedEvents = []
  }
  
  /**
   * 이벤트 적용 (Event Sourcing의 핵심)
   */
  apply(event) {
    switch(event.eventType) {
      case EventTypes.ACCOUNT_CREATED:
        this.owner = event.data.owner
        this.balance = event.data.initialBalance
        this.status = 'ACTIVE'
        break
        
      case EventTypes.MONEY_DEPOSITED:
        this.balance += event.data.amount
        break
        
      case EventTypes.MONEY_WITHDRAWN:
        this.balance -= event.data.amount
        break
        
      case EventTypes.ACCOUNT_CLOSED:
        this.status = 'CLOSED'
        break
    }
    
    this.version++
  }
  
  /**
   * 비즈니스 로직 - 계좌 생성
   */
  create(owner, initialBalance = 0) {
    if (this.status === 'ACTIVE') {
      throw new Error('Account already created')
    }
    
    const event = new AccountCreated(this.id, owner, initialBalance)
    this.apply(event)
    this.uncommittedEvents.push(event)
  }
  
  /**
   * 비즈니스 로직 - 입금
   */
  deposit(amount, source) {
    if (this.status !== 'ACTIVE') {
      throw new Error('Account is not active')
    }
    if (amount <= 0) {
      throw new Error('Amount must be positive')
    }
    
    const event = new MoneyDeposited(this.id, amount, source)
    this.apply(event)
    this.uncommittedEvents.push(event)
  }
  
  /**
   * 비즈니스 로직 - 출금
   */
  withdraw(amount, purpose) {
    if (this.status !== 'ACTIVE') {
      throw new Error('Account is not active')
    }
    if (amount <= 0) {
      throw new Error('Amount must be positive')
    }
    if (this.balance < amount) {
      throw new Error('Insufficient balance')
    }
    
    const event = new MoneyWithdrawn(this.id, amount, purpose)
    this.apply(event)
    this.uncommittedEvents.push(event)
  }
  
  /**
   * 이벤트 스트림으로부터 상태 복원
   */
  static async loadFromHistory(id, events) {
    const account = new BankAccount(id)
    
    for (const event of events) {
      account.apply(event)
    }
    
    return account
  }
  
  /**
   * 스냅샷으로부터 복원
   */
  static fromSnapshot(snapshot) {
    const account = new BankAccount(snapshot.id)
    account.balance = snapshot.balance
    account.owner = snapshot.owner
    account.status = snapshot.status
    account.version = snapshot.version
    return account
  }
  
  /**
   * 스냅샷 생성
   */
  toSnapshot() {
    return {
      id: this.id,
      balance: this.balance,
      owner: this.owner,
      status: this.status,
      version: this.version
    }
  }
}
```

### 4. Repository 패턴

```javascript
class AccountRepository {
  constructor(eventStore) {
    this.eventStore = eventStore
    this.snapshotFrequency = 10  // 10개 이벤트마다 스냅샷
  }
  
  /**
   * Aggregate 조회
   */
  async getById(accountId) {
    // 1. 스냅샷 확인
    const snapshot = await this.eventStore.getSnapshot(accountId)
    
    let account
    let fromVersion = 0
    
    if (snapshot) {
      // 스냅샷으로부터 복원
      account = BankAccount.fromSnapshot(snapshot.snapshot)
      fromVersion = snapshot.version + 1
    } else {
      // 새 인스턴스 생성
      account = new BankAccount(accountId)
    }
    
    // 2. 스냅샷 이후 이벤트 적용
    const events = await this.eventStore.getEvents(
      'accounts', 
      accountId, 
      fromVersion
    )
    
    for (const event of events) {
      account.apply(event)
    }
    
    return account
  }
  
  /**
   * Aggregate 저장
   */
  async save(account) {
    if (account.uncommittedEvents.length === 0) {
      return
    }
    
    // 1. 이벤트 저장
    await this.eventStore.append('accounts', account.uncommittedEvents)
    
    // 2. 스냅샷 생성 (필요시)
    if (account.version % this.snapshotFrequency === 0) {
      await this.eventStore.saveSnapshot(
        account.id,
        account.toSnapshot(),
        account.version
      )
    }
    
    // 3. 커밋된 이벤트 초기화
    account.uncommittedEvents = []
  }
}
```

### 5. Projection (Read Model) 구현

```javascript
class AccountProjection {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'account-projection',
      brokers: ['localhost:9092']
    })
    this.consumer = this.kafka.consumer({ 
      groupId: 'projection-group' 
    })
    
    // Read Model 저장소 (예: MongoDB, PostgreSQL)
    this.readStore = new Map()  // 간단한 예제용
  }
  
  async start() {
    await this.consumer.connect()
    await this.consumer.subscribe({
      topic: 'event-stream-accounts',
      fromBeginning: true
    })
    
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const event = JSON.parse(message.value)
        await this.handleEvent(event)
      }
    })
  }
  
  async handleEvent(event) {
    switch(event.eventType) {
      case EventTypes.ACCOUNT_CREATED:
        await this.onAccountCreated(event)
        break
      case EventTypes.MONEY_DEPOSITED:
        await this.onMoneyDeposited(event)
        break
      case EventTypes.MONEY_WITHDRAWN:
        await this.onMoneyWithdrawn(event)
        break
    }
  }
  
  async onAccountCreated(event) {
    const view = {
      accountId: event.aggregateId,
      owner: event.data.owner,
      balance: event.data.initialBalance,
      status: event.data.status,
      createdAt: event.metadata.timestamp,
      lastUpdated: event.metadata.timestamp,
      transactionCount: 0
    }
    
    this.readStore.set(event.aggregateId, view)
    
    // 실제로는 DB에 저장
    // await db.accounts.insert(view)
  }
  
  async onMoneyDeposited(event) {
    const view = this.readStore.get(event.aggregateId)
    if (view) {
      view.balance += event.data.amount
      view.lastUpdated = event.metadata.timestamp
      view.transactionCount++
      
      // 거래 내역 저장
      await this.saveTransaction({
        accountId: event.aggregateId,
        type: 'DEPOSIT',
        amount: event.data.amount,
        timestamp: event.metadata.timestamp
      })
    }
  }
  
  async onMoneyWithdrawn(event) {
    const view = this.readStore.get(event.aggregateId)
    if (view) {
      view.balance -= event.data.amount
      view.lastUpdated = event.metadata.timestamp
      view.transactionCount++
      
      await this.saveTransaction({
        accountId: event.aggregateId,
        type: 'WITHDRAWAL',
        amount: event.data.amount,
        timestamp: event.metadata.timestamp
      })
    }
  }
  
  async saveTransaction(transaction) {
    // 거래 내역 저장 로직
  }
  
  // Query Methods
  async getAccountView(accountId) {
    return this.readStore.get(accountId)
  }
  
  async getTopAccounts(limit = 10) {
    const accounts = Array.from(this.readStore.values())
    return accounts
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit)
  }
}
```

### 6. Command Handler

```javascript
class AccountCommandHandler {
  constructor(repository, eventBus) {
    this.repository = repository
    this.eventBus = eventBus
  }
  
  async handle(command) {
    switch(command.type) {
      case 'CREATE_ACCOUNT':
        return await this.createAccount(command)
      case 'DEPOSIT_MONEY':
        return await this.depositMoney(command)
      case 'WITHDRAW_MONEY':
        return await this.withdrawMoney(command)
      case 'TRANSFER_MONEY':
        return await this.transferMoney(command)
    }
  }
  
  async createAccount(command) {
    const account = new BankAccount(command.accountId)
    account.create(command.owner, command.initialBalance)
    
    await this.repository.save(account)
    await this.eventBus.publish(account.uncommittedEvents)
    
    return { success: true, accountId: account.id }
  }
  
  async depositMoney(command) {
    const account = await this.repository.getById(command.accountId)
    account.deposit(command.amount, command.source)
    
    await this.repository.save(account)
    await this.eventBus.publish(account.uncommittedEvents)
    
    return { 
      success: true, 
      newBalance: account.balance 
    }
  }
  
  async transferMoney(command) {
    // Saga 패턴으로 구현 (별도 문서 참조)
    const fromAccount = await this.repository.getById(command.from)
    const toAccount = await this.repository.getById(command.to)
    
    // 트랜잭션 시작
    const transferId = uuidv4()
    
    try {
      fromAccount.withdraw(command.amount, `Transfer to ${command.to}`)
      toAccount.deposit(command.amount, `Transfer from ${command.from}`)
      
      await this.repository.save(fromAccount)
      await this.repository.save(toAccount)
      
      return { success: true, transferId }
    } catch (error) {
      // 보상 트랜잭션
      console.error('Transfer failed:', error)
      throw error
    }
  }
}
```

## 🎯 실제 사용 예제

```javascript
async function main() {
  // 1. 초기화
  const eventStore = new EventStore()
  await eventStore.connect()
  
  const repository = new AccountRepository(eventStore)
  const projection = new AccountProjection()
  await projection.start()
  
  const commandHandler = new AccountCommandHandler(repository, eventStore)
  
  // 2. 계좌 생성
  await commandHandler.handle({
    type: 'CREATE_ACCOUNT',
    accountId: 'ACC-001',
    owner: 'Kim',
    initialBalance: 1000
  })
  
  // 3. 입금
  await commandHandler.handle({
    type: 'DEPOSIT_MONEY',
    accountId: 'ACC-001',
    amount: 500,
    source: 'ATM'
  })
  
  // 4. Read Model 조회
  const accountView = await projection.getAccountView('ACC-001')
  console.log('Account View:', accountView)
  
  // 5. Event Replay (시간여행)
  const events = await eventStore.getEvents('accounts', 'ACC-001')
  console.log('Event History:', events)
  
  // 특정 시점의 상태 복원
  const accountAtV3 = await BankAccount.loadFromHistory(
    'ACC-001',
    events.slice(0, 3)
  )
  console.log('Account at version 3:', accountAtV3.balance)
}
```

## 📊 장단점

### 장점 ✅
- **완전한 감사 로그**: 모든 변경 이력 보존
- **시간 여행**: 과거 특정 시점 상태 복원 가능
- **이벤트 리플레이**: 버그 수정 후 재처리
- **복잡한 도메인 모델링**: 비즈니스 이벤트 중심 설계
- **CQRS와 자연스러운 통합**: Read/Write 모델 분리

### 단점 ❌
- **복잡성 증가**: 구현 및 이해 어려움
- **저장 공간**: 모든 이벤트 저장으로 용량 증가
- **최종 일관성**: 즉시 일관성 보장 어려움
- **스키마 진화**: 이벤트 구조 변경 어려움

## 🔍 Best Practices

1. **이벤트 이름**: 과거형 동사 사용 (OrderPlaced, PaymentReceived)
2. **이벤트 크기**: 작고 집중된 이벤트 선호
3. **스냅샷**: 긴 이벤트 체인에는 스냅샷 필수
4. **버전 관리**: 이벤트 스키마 버전 관리
5. **Idempotency**: 이벤트 처리는 멱등성 보장
6. **Compaction**: 오래된 이벤트 압축/아카이빙

---

💡 **관련 패턴**: [CQRS](./cqrs.md), [Saga Pattern](./saga-pattern.md)
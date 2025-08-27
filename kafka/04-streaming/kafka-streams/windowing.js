/**
 * Kafka Streams Windowing 예제
 * 시간 기반 윈도우 처리를 학습합니다
 */

import { KafkaStreams } from 'kafka-streams'

const config = {
  noptions: {
    'metadata.broker.list': 'localhost:9092',
    'group.id': 'kafka-streams-windowing',
    'client.id': 'kafka-streams-windowing-client',
    'enable.auto.commit': false
  }
}

const kafkaStreams = new KafkaStreams(config)

/**
 * 1. Tumbling Window (고정 윈도우)
 * 겹치지 않는 고정 크기 윈도우
 */
function tumblingWindowExample() {
  console.log('📊 Tumbling Window 예제\n')
  console.log('5분 단위로 주문 집계\n')
  
  const stream = kafkaStreams.getKStream('order-events')
  
  stream
    .mapJSONConvenience()
    .groupByKey()
    // 5분 단위 Tumbling Window
    .window(5 * 60 * 1000)  // 5분 = 300,000ms
    .aggregate(
      () => ({
        count: 0,
        totalAmount: 0,
        minAmount: Number.MAX_VALUE,
        maxAmount: 0,
        startTime: null,
        endTime: null
      }),
      (oldVal, record) => {
        const amount = record.value.amount
        return {
          count: oldVal.count + 1,
          totalAmount: oldVal.totalAmount + amount,
          minAmount: Math.min(oldVal.minAmount, amount),
          maxAmount: Math.max(oldVal.maxAmount, amount),
          startTime: oldVal.startTime || new Date().toISOString(),
          endTime: new Date().toISOString()
        }
      },
      'tumbling-window-store'
    )
    .tap((record) => {
      console.log('📈 [Tumbling Window] 5분 집계:', {
        window: record.window,
        userId: record.key,
        stats: {
          count: record.value.count,
          total: record.value.totalAmount.toFixed(2),
          avg: (record.value.totalAmount / record.value.count).toFixed(2),
          min: record.value.minAmount,
          max: record.value.maxAmount
        }
      })
    })
    .to('tumbling-window-results', 'auto')
    
  return stream
}

/**
 * 2. Hopping Window (이동 윈도우)
 * 겹치는 고정 크기 윈도우
 */
function hoppingWindowExample() {
  console.log('\n📊 Hopping Window 예제\n')
  console.log('10분 윈도우, 5분마다 이동\n')
  
  const stream = kafkaStreams.getKStream('user-activities')
  
  stream
    .mapJSONConvenience()
    .groupBy((record) => record.value.userId)
    // 10분 윈도우, 5분마다 이동
    .window(10 * 60 * 1000, 5 * 60 * 1000)
    .aggregate(
      () => ({
        userId: null,
        activities: [],
        uniquePages: new Set(),
        totalDuration: 0
      }),
      (oldVal, record) => {
        const activity = record.value
        const activities = [...oldVal.activities, activity]
        const uniquePages = new Set([...oldVal.uniquePages, activity.page])
        
        return {
          userId: activity.userId,
          activities: activities,
          uniquePages: uniquePages,
          totalDuration: oldVal.totalDuration + (activity.duration || 0),
          avgDuration: oldVal.totalDuration / activities.length
        }
      },
      'hopping-window-store'
    )
    .tap((record) => {
      console.log('📈 [Hopping Window] 10분 활동 요약:', {
        window: {
          start: new Date(record.window.start).toLocaleTimeString(),
          end: new Date(record.window.end).toLocaleTimeString()
        },
        userId: record.key,
        stats: {
          activityCount: record.value.activities.length,
          uniquePages: record.value.uniquePages.size,
          totalDuration: `${record.value.totalDuration}초`,
          avgDuration: `${record.value.avgDuration?.toFixed(2)}초`
        }
      })
    })
    .to('hopping-window-results', 'auto')
    
  return stream
}

/**
 * 3. Session Window (세션 윈도우)
 * 비활동 기간으로 구분되는 동적 크기 윈도우
 */
function sessionWindowExample() {
  console.log('\n📊 Session Window 예제\n')
  console.log('30분 비활동 시 세션 종료\n')
  
  const stream = kafkaStreams.getKStream('user-clicks')
  
  stream
    .mapJSONConvenience()
    .groupBy((record) => record.value.sessionId || record.value.userId)
    // 30분 비활동 시 세션 종료
    .session(30 * 60 * 1000)  // 30분 gap
    .aggregate(
      () => ({
        sessionId: null,
        userId: null,
        clicks: [],
        pages: [],
        startTime: null,
        endTime: null,
        duration: 0
      }),
      (oldVal, record) => {
        const click = record.value
        const clicks = [...oldVal.clicks, click]
        const pages = [...oldVal.pages, click.page]
        const startTime = oldVal.startTime || click.timestamp
        const endTime = click.timestamp
        
        return {
          sessionId: oldVal.sessionId || `session-${Date.now()}`,
          userId: click.userId,
          clicks: clicks,
          pages: pages,
          uniquePages: new Set(pages).size,
          startTime: startTime,
          endTime: endTime,
          duration: new Date(endTime) - new Date(startTime)
        }
      },
      'session-window-store'
    )
    .tap((record) => {
      const duration = record.value.duration / 1000 / 60  // 분 단위
      console.log('📈 [Session Window] 사용자 세션:', {
        sessionId: record.value.sessionId,
        userId: record.key,
        stats: {
          clicks: record.value.clicks.length,
          uniquePages: record.value.uniquePages,
          duration: `${duration.toFixed(2)}분`,
          avgClicksPerMinute: (record.value.clicks.length / duration).toFixed(2)
        },
        time: {
          start: new Date(record.value.startTime).toLocaleTimeString(),
          end: new Date(record.value.endTime).toLocaleTimeString()
        }
      })
    })
    .to('session-window-results', 'auto')
    
  return stream
}

/**
 * 4. 실시간 판매 대시보드용 윈도우
 */
function realTimeSalesDashboard() {
  console.log('\n📊 실시간 판매 대시보드\n')
  
  const salesStream = kafkaStreams.getKStream('sales-events')
  
  // 1분, 5분, 15분 윈도우 동시 처리
  const windows = [
    { name: '1분', duration: 1 * 60 * 1000 },
    { name: '5분', duration: 5 * 60 * 1000 },
    { name: '15분', duration: 15 * 60 * 1000 }
  ]
  
  windows.forEach(({ name, duration }) => {
    salesStream
      .mapJSONConvenience()
      .groupBy(() => 'global')  // 전체 집계
      .window(duration)
      .aggregate(
        () => ({
          window: name,
          sales: [],
          categories: {},
          topProducts: {}
        }),
        (oldVal, record) => {
          const sale = record.value
          const sales = [...oldVal.sales, sale]
          
          // 카테고리별 집계
          const categories = { ...oldVal.categories }
          categories[sale.category] = (categories[sale.category] || 0) + sale.amount
          
          // 상품별 집계
          const topProducts = { ...oldVal.topProducts }
          topProducts[sale.productId] = (topProducts[sale.productId] || 0) + 1
          
          return {
            window: name,
            sales: sales,
            totalAmount: sales.reduce((sum, s) => sum + s.amount, 0),
            orderCount: sales.length,
            avgOrderValue: sales.reduce((sum, s) => sum + s.amount, 0) / sales.length,
            categories: categories,
            topProducts: Object.entries(topProducts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([productId, count]) => ({ productId, count }))
          }
        },
        `dashboard-${name}-store`
      )
      .tap((record) => {
        console.log(`📊 [${name} 실시간 집계]`, {
          매출: record.value.totalAmount?.toFixed(2),
          주문수: record.value.orderCount,
          평균주문금액: record.value.avgOrderValue?.toFixed(2),
          인기상품: record.value.topProducts?.slice(0, 3)
        })
      })
      .to(`dashboard-${name.replace('분', 'min')}`, 'auto')
  })
}

/**
 * 5. 이상 탐지용 슬라이딩 윈도우
 */
function anomalyDetectionWindow() {
  console.log('\n🚨 이상 탐지 윈도우\n')
  
  const transactionStream = kafkaStreams.getKStream('transactions')
  
  transactionStream
    .mapJSONConvenience()
    .groupBy((record) => record.value.userId)
    // 슬라이딩 윈도우: 1시간 윈도우, 10분마다 체크
    .window(60 * 60 * 1000, 10 * 60 * 1000)
    .aggregate(
      () => ({
        transactions: [],
        normalPattern: {
          avgAmount: 0,
          avgInterval: 0,
          typicalLocations: []
        },
        anomalies: []
      }),
      (oldVal, record) => {
        const tx = record.value
        const transactions = [...oldVal.transactions, tx]
        
        // 패턴 분석
        const amounts = transactions.map(t => t.amount)
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
        const stdDev = Math.sqrt(
          amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / amounts.length
        )
        
        // 이상 탐지
        const anomalies = []
        
        // 금액 이상
        if (tx.amount > avgAmount + (2 * stdDev)) {
          anomalies.push({
            type: 'UNUSUAL_AMOUNT',
            value: tx.amount,
            threshold: avgAmount + (2 * stdDev)
          })
        }
        
        // 빈도 이상 (1시간에 10건 이상)
        if (transactions.length > 10) {
          anomalies.push({
            type: 'HIGH_FREQUENCY',
            count: transactions.length,
            threshold: 10
          })
        }
        
        // 시간대 이상 (새벽 거래)
        const hour = new Date(tx.timestamp).getHours()
        if (hour >= 2 && hour <= 5) {
          anomalies.push({
            type: 'UNUSUAL_TIME',
            time: tx.timestamp
          })
        }
        
        return {
          userId: tx.userId,
          transactions: transactions,
          stats: {
            count: transactions.length,
            totalAmount: amounts.reduce((a, b) => a + b, 0),
            avgAmount: avgAmount,
            stdDev: stdDev
          },
          anomalies: anomalies,
          riskScore: anomalies.length * 30  // 간단한 리스크 점수
        }
      },
      'anomaly-detection-store'
    )
    .filter((record) => record.value.anomalies.length > 0)
    .tap((record) => {
      console.log('🚨 [이상 탐지] 의심 거래 발견:', {
        userId: record.key,
        riskScore: record.value.riskScore,
        anomalies: record.value.anomalies,
        recentTransactions: record.value.transactions.length
      })
    })
    .to('fraud-alerts', 'auto')
}

/**
 * 6. 시계열 집계 (다중 윈도우)
 */
function timeSeriesAggregation() {
  console.log('\n📈 시계열 집계\n')
  
  const metricsStream = kafkaStreams.getKStream('system-metrics')
  
  // 여러 시간 단위로 집계
  const timeWindows = [
    { name: '1m', ms: 60 * 1000 },
    { name: '5m', ms: 5 * 60 * 1000 },
    { name: '1h', ms: 60 * 60 * 1000 },
    { name: '1d', ms: 24 * 60 * 60 * 1000 }
  ]
  
  metricsStream
    .mapJSONConvenience()
    .groupBy((record) => record.value.metricName)
    .multiWindow(timeWindows.map(w => w.ms))
    .aggregate(
      () => ({
        values: [],
        min: Number.MAX_VALUE,
        max: Number.MIN_VALUE,
        sum: 0,
        count: 0
      }),
      (oldVal, record, windowSize) => {
        const value = record.value.value
        const values = [...oldVal.values, value]
        
        return {
          metricName: record.value.metricName,
          window: timeWindows.find(w => w.ms === windowSize)?.name,
          values: values,
          min: Math.min(oldVal.min, value),
          max: Math.max(oldVal.max, value),
          sum: oldVal.sum + value,
          count: oldVal.count + 1,
          avg: (oldVal.sum + value) / (oldVal.count + 1),
          p95: calculatePercentile(values, 0.95),
          p99: calculatePercentile(values, 0.99)
        }
      },
      'time-series-store'
    )
    .tap((record) => {
      console.log(`📈 [시계열 ${record.value.window}]`, {
        metric: record.key,
        avg: record.value.avg?.toFixed(2),
        min: record.value.min,
        max: record.value.max,
        p95: record.value.p95?.toFixed(2),
        p99: record.value.p99?.toFixed(2)
      })
    })
}

/**
 * 백분위 계산 헬퍼
 */
function calculatePercentile(values, percentile) {
  if (values.length === 0) return 0
  
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil(sorted.length * percentile) - 1
  return sorted[index]
}

/**
 * 메인 실행 함수
 */
async function main() {
  try {
    console.log('✨ Kafka Streams Windowing 예제\n')
    console.log('========================================\n')
    
    // 1. Tumbling Window
    const tumblingStream = tumblingWindowExample()
    
    // 2. Hopping Window
    hoppingWindowExample()
    
    // 3. Session Window
    sessionWindowExample()
    
    // 4. 실시간 대시보드
    realTimeSalesDashboard()
    
    // 5. 이상 탐지
    anomalyDetectionWindow()
    
    // 6. 시계열 집계
    timeSeriesAggregation()
    
    // 스트림 시작
    await tumblingStream.start()
    
    console.log('\n✅ Windowing 스트림이 시작되었습니다.')
    console.log('⏰ 윈도우 처리 중... (Ctrl+C로 종료)\n')
    
    // 윈도우 상태 모니터링
    setInterval(() => {
      console.log('\n📊 === 윈도우 상태 ===')
      console.log('활성 윈도우:', kafkaStreams.getWindows())
      console.log('State Store 크기:', kafkaStreams.getStateStoreSize())
      console.log('====================\n')
    }, 60000)  // 1분마다
    
  } catch (error) {
    console.error('❌ 에러 발생:', error)
  }
}

// 프로그램 실행
main().catch(console.error)

// 우아한 종료
process.on('SIGINT', async () => {
  console.log('\n🛑 종료 신호 받음, 윈도우 정리 중...')
  await kafkaStreams.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n🛑 종료 신호 받음, 윈도우 정리 중...')
  await kafkaStreams.close()
  process.exit(0)
})
/**
 * 실시간 분석 시스템
 * Elasticsearch를 활용한 실시간 데이터 분석 및 대시보드
 */

const express = require('express');
const WebSocket = require('ws');
const { Client } = require('@elastic/elasticsearch');
const Bull = require('bull');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Elasticsearch 클라이언트
const esClient = new Client({
  node: process.env.ES_NODE || 'http://localhost:9200'
});

// Redis Queue for background jobs
const analyticsQueue = new Bull('analytics', {
  redis: {
    port: process.env.REDIS_PORT || 6379,
    host: process.env.REDIS_HOST || 'localhost'
  }
});

// 미들웨어
app.use(express.json());
app.use(express.static('public'));

// 분석 서비스
const AnalyticsService = require('./services/analytics-service');
const analyticsService = new AnalyticsService(esClient);

/**
 * 실시간 메트릭 API
 */
app.get('/api/metrics/realtime', async (req, res) => {
  try {
    const metrics = await analyticsService.getRealtimeMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 시계열 데이터 API
 */
app.get('/api/metrics/timeseries', async (req, res) => {
  try {
    const { metric, interval = '1m', range = '1h' } = req.query;
    const data = await analyticsService.getTimeSeriesData(metric, interval, range);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 집계 데이터 API
 */
app.get('/api/metrics/aggregate', async (req, res) => {
  try {
    const { field, type = 'terms', size = 10 } = req.query;
    const data = await analyticsService.getAggregateData(field, type, size);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 이벤트 수집 API
 */
app.post('/api/events', async (req, res) => {
  try {
    const event = {
      ...req.body,
      timestamp: new Date().toISOString(),
      source_ip: req.ip
    };

    // 큐에 이벤트 추가
    await analyticsQueue.add('process-event', event);

    res.json({ success: true, event_id: event.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 대시보드 데이터 API
 */
app.get('/api/dashboard/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const data = await analyticsService.getDashboardData(type);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// HTTP 서버 시작
const server = app.listen(port, () => {
  console.log(`📊 Real-time Analytics Server running on port ${port}`);
});

// WebSocket 서버 설정
const wss = new WebSocket.Server({ server });

// WebSocket 연결 처리
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  // 실시간 메트릭 스트리밍
  const interval = setInterval(async () => {
    try {
      const metrics = await analyticsService.getRealtimeMetrics();
      ws.send(JSON.stringify({
        type: 'metrics',
        data: metrics,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('WebSocket error:', error);
    }
  }, 1000); // 1초마다 업데이트

  // 연결 종료 시 정리
  ws.on('close', () => {
    clearInterval(interval);
    console.log('WebSocket connection closed');
  });

  // 클라이언트 메시지 처리
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'subscribe':
          // 특정 메트릭 구독
          await handleSubscription(ws, data.metric);
          break;
        
        case 'query':
          // 커스텀 쿼리 실행
          const result = await analyticsService.executeCustomQuery(data.query);
          ws.send(JSON.stringify({
            type: 'query_result',
            data: result
          }));
          break;
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });
});

/**
 * 메트릭 구독 처리
 */
async function handleSubscription(ws, metric) {
  const subscription = setInterval(async () => {
    try {
      const data = await analyticsService.getMetric(metric);
      ws.send(JSON.stringify({
        type: 'metric_update',
        metric: metric,
        data: data
      }));
    } catch (error) {
      console.error(`Subscription error for ${metric}:`, error);
    }
  }, 5000); // 5초마다 업데이트

  ws.on('close', () => {
    clearInterval(subscription);
  });
}

// Queue 프로세서
analyticsQueue.process('process-event', async (job) => {
  const event = job.data;
  
  // Elasticsearch에 이벤트 저장
  await esClient.index({
    index: `events-${new Date().toISOString().slice(0, 10)}`,
    body: event
  });

  // 실시간 집계 업데이트
  await analyticsService.updateAggregations(event);

  return { processed: true };
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // WebSocket 연결 종료
  wss.clients.forEach((ws) => {
    ws.close();
  });

  // Queue 종료
  await analyticsQueue.close();

  // HTTP 서버 종료
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
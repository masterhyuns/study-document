/**
 * 로그 수집 및 분석 시스템
 * Elasticsearch를 활용한 중앙화된 로그 관리
 */

const express = require('express');
const { Client } = require('@elastic/elasticsearch');
const winston = require('winston');
const ElasticsearchTransport = require('winston-elasticsearch');
const schedule = require('node-schedule');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3002;

// Elasticsearch 클라이언트
const esClient = new Client({
  node: process.env.ES_NODE || 'http://localhost:9200'
});

// Winston 로거 설정
const esTransportOpts = {
  level: 'info',
  client: esClient,
  index: 'application-logs'
};

const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    new ElasticsearchTransport.ElasticsearchTransport(esTransportOpts)
  ]
});

// 미들웨어
app.use(express.json());
app.use(express.text());

// 로그 수집 서비스
const LogService = require('./services/log-service');
const logService = new LogService(esClient);

/**
 * 로그 수집 엔드포인트
 */
app.post('/logs', async (req, res) => {
  try {
    const log = {
      ...req.body,
      '@timestamp': new Date().toISOString(),
      source_ip: req.ip,
      user_agent: req.get('user-agent')
    };

    await logService.ingestLog(log);
    res.json({ success: true });
  } catch (error) {
    logger.error('Log ingestion error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 벌크 로그 수집
 */
app.post('/logs/bulk', async (req, res) => {
  try {
    const logs = req.body;
    const result = await logService.bulkIngest(logs);
    res.json({ 
      success: true, 
      processed: result.items.length,
      errors: result.errors 
    });
  } catch (error) {
    logger.error('Bulk ingestion error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 로그 검색 API
 */
app.get('/logs/search', async (req, res) => {
  try {
    const { 
      query, 
      level, 
      service, 
      from = 0, 
      size = 100,
      start_time,
      end_time 
    } = req.query;

    const results = await logService.searchLogs({
      query,
      level,
      service,
      from,
      size,
      start_time,
      end_time
    });

    res.json(results);
  } catch (error) {
    logger.error('Log search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 에러 로그 분석
 */
app.get('/logs/errors', async (req, res) => {
  try {
    const { timeRange = '1h' } = req.query;
    const errors = await logService.analyzeErrors(timeRange);
    res.json(errors);
  } catch (error) {
    logger.error('Error analysis failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 로그 패턴 분석
 */
app.get('/logs/patterns', async (req, res) => {
  try {
    const { field = 'message', size = 10 } = req.query;
    const patterns = await logService.findPatterns(field, size);
    res.json(patterns);
  } catch (error) {
    logger.error('Pattern analysis failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 로그 통계
 */
app.get('/logs/stats', async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;
    const stats = await logService.getStatistics(timeRange);
    res.json(stats);
  } catch (error) {
    logger.error('Statistics generation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 이상 탐지
 */
app.get('/logs/anomalies', async (req, res) => {
  try {
    const anomalies = await logService.detectAnomalies();
    res.json(anomalies);
  } catch (error) {
    logger.error('Anomaly detection failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 로그 보관 정책 적용
 */
app.post('/logs/retention', async (req, res) => {
  try {
    const { days = 30 } = req.body;
    const result = await logService.applyRetentionPolicy(days);
    res.json(result);
  } catch (error) {
    logger.error('Retention policy application failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// 예약 작업: 일일 로그 요약
schedule.scheduleJob('0 0 * * *', async () => {
  try {
    logger.info('Starting daily log summary generation');
    const summary = await logService.generateDailySummary();
    
    // 요약을 별도 인덱스에 저장
    await esClient.index({
      index: 'log-summaries',
      body: {
        date: new Date().toISOString().slice(0, 10),
        summary: summary,
        generated_at: new Date().toISOString()
      }
    });

    logger.info('Daily log summary completed', summary);
  } catch (error) {
    logger.error('Daily summary generation failed:', error);
  }
});

// 예약 작업: 오래된 로그 정리
schedule.scheduleJob('0 2 * * *', async () => {
  try {
    logger.info('Starting old logs cleanup');
    const result = await logService.cleanupOldLogs(30); // 30일 이상된 로그 삭제
    logger.info('Old logs cleanup completed', result);
  } catch (error) {
    logger.error('Logs cleanup failed:', error);
  }
});

// 로그 스트리밍 (Server-Sent Events)
app.get('/logs/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const interval = setInterval(async () => {
    try {
      const recentLogs = await logService.getRecentLogs(10);
      res.write(`data: ${JSON.stringify(recentLogs)}\n\n`);
    } catch (error) {
      logger.error('Log streaming error:', error);
    }
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// 서버 시작
app.listen(port, async () => {
  console.log(`📝 Log Aggregator Server running on port ${port}`);
  
  // 인덱스 초기화
  try {
    await logService.initializeIndices();
    console.log('✅ Log indices initialized');
  } catch (error) {
    console.error('Failed to initialize indices:', error);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  
  // 스케줄 작업 취소
  schedule.gracefulShutdown();
  
  // 서버 종료
  process.exit(0);
});
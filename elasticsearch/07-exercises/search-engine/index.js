/**
 * 검색 엔진 메인 서버
 * Elasticsearch를 활용한 전문 검색 서비스
 */

const express = require('express');
const cors = require('cors');
const { Client } = require('@elastic/elasticsearch');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Elasticsearch 클라이언트
const esClient = new Client({
  node: process.env.ES_NODE || 'http://localhost:9200',
  auth: {
    username: process.env.ES_USER || 'elastic',
    password: process.env.ES_PASSWORD || 'changeme'
  }
});

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 검색 서비스
const SearchService = require('./services/search-service');
const searchService = new SearchService(esClient);

/**
 * 헬스 체크
 */
app.get('/health', async (req, res) => {
  try {
    const health = await esClient.cluster.health();
    res.json({
      status: 'healthy',
      elasticsearch: health.status
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * 검색 API
 */
app.post('/search', async (req, res) => {
  try {
    const results = await searchService.search(req.body);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error.message
    });
  }
});

/**
 * 자동완성 API
 */
app.get('/autocomplete', async (req, res) => {
  try {
    const { q } = req.query;
    const suggestions = await searchService.autocomplete(q);
    res.json(suggestions);
  } catch (error) {
    console.error('Autocomplete error:', error);
    res.status(500).json({
      error: 'Autocomplete failed',
      message: error.message
    });
  }
});

/**
 * 추천 API
 */
app.get('/recommendations/:id', async (req, res) => {
  try {
    const recommendations = await searchService.getRecommendations(req.params.id);
    res.json(recommendations);
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({
      error: 'Recommendations failed',
      message: error.message
    });
  }
});

/**
 * 인기 검색어 API
 */
app.get('/trending', async (req, res) => {
  try {
    const trending = await searchService.getTrendingSearches();
    res.json(trending);
  } catch (error) {
    console.error('Trending error:', error);
    res.status(500).json({
      error: 'Failed to get trending searches',
      message: error.message
    });
  }
});

/**
 * 검색 분석 API
 */
app.get('/analytics', async (req, res) => {
  try {
    const analytics = await searchService.getSearchAnalytics();
    res.json(analytics);
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      error: 'Failed to get analytics',
      message: error.message
    });
  }
});

// 서버 시작
app.listen(port, () => {
  console.log(`🚀 Search Engine Server running on port ${port}`);
  console.log(`📊 Elasticsearch: ${process.env.ES_NODE || 'http://localhost:9200'}`);
});